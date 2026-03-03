import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import { WhatsappPersonalService } from '../notifications/whatsapp.personal.service';

@Injectable()
export class TrackingService {
    private readonly logger = new Logger(TrackingService.name);

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(WhatsappService) private readonly whatsappService: WhatsappService,
        @Inject(WhatsappPersonalService) private readonly whatsappPersonalService: WhatsappPersonalService,
    ) { }

    async handleWebhook(payload: any) {
        this.logger.log('Received Webhook Payload', JSON.stringify(payload));
        require('fs').appendFileSync('/tmp/webhook.log', `Webhook Hit! Payload: ${JSON.stringify(payload)}\n`);

        const event = payload.event;

        if (event === 'TRACKING_UPDATED' && payload.data) {
            // Webhook pushes single object in data usually, or sometimes arrays
            const items = Array.isArray(payload.data) ? payload.data : [payload.data];
            require('fs').appendFileSync('/tmp/webhook.log', `Items count: ${items.length}\n`);

            for (const item of items) {
                // Ignore if it's missing the tracking number
                if (item && item.number) {
                    require('fs').appendFileSync('/tmp/webhook.log', `Processing item: ${item.number}\n`);
                    await this.processTrackingItem(item);
                }
            }
        }
    }

    private async processTrackingItem(item: any) {
        const trackingNumber = item.number;
        const subStatus = item.track_info?.latest_status?.sub_status; // "InTransit_Arrival"

        this.logger.log(`Processing ${trackingNumber}, Status: ${subStatus}`);
        require('fs').appendFileSync('/tmp/webhook.log', `processTrackingItem started for ${trackingNumber}, subStatus: ${subStatus}\n`);

        // 1. Find Order by Tracking Number
        const order = await this.prisma.order.findFirst({
            where: { trackingNumber: trackingNumber },
            include: { customer: true },
        });

        if (!order) {
            this.logger.warn(`Order not found for tracking number: ${trackingNumber}`);
            require('fs').appendFileSync('/tmp/webhook.log', `Order NOT FOUND for ${trackingNumber}\n`);
            return;
        }
        require('fs').appendFileSync('/tmp/webhook.log', `Order FOUND for ${trackingNumber}: ID ${order.id}\n`);

        // Save Tracking History Log
        const carrierName = item.track_info?.latest_provider?.provider?.name || item.track_info?.provider?.provider?.name || item.track_info?.latest_provider?.provider?.alias || null;
        const carrierCode = item.track_info?.latest_provider?.provider?.key?.toString() || item.track_info?.provider?.provider?.key?.toString() || null;
        const mainStatus = item.track_info?.latest_status?.status || 'Unknown';
        const description = item.track_info?.latest_event?.description || null;
        const location = item.track_info?.latest_event?.location || null;
        const timeUtcStr = item.track_info?.latest_event?.time_utc;
        const statusDate = timeUtcStr ? new Date(timeUtcStr) : new Date();

        await this.prisma.trackingHistory.create({
            data: {
                orderId: order.id,
                trackingNumber: trackingNumber,
                carrierCode: carrierCode,
                carrierName: carrierName,
                status: mainStatus,
                substatus: subStatus || null,
                description: description,
                location: location,
                statusDate: statusDate,
                rawData: item as any
            }
        });

        // Update Courier if missing on the Order
        if (!order.courier && carrierName) {
            await this.prisma.order.update({
                where: { id: order.id },
                data: { courier: carrierName }
            });
        }

        if (subStatus === 'InTransit_Arrival') {
            if (!order.customer) {
                this.logger.warn(`Customer not found for order: ${order.orderNumber}`);
                return;
            }

            // 2. Prepare Variables for SMS Template
            // Variables: 1=CustomerName, 2=OrderNumber
            const customerName = order.customer.name;
            const safeName = customerName || 'Customer';

            // 3. Determine Template based on Country for SMS
            const smsTemplateName = this.getTemplateForCountry(order.shippingCountry);

            // 4. Update Order Status
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'In Transit',
                    orderStatus: 'In Transit',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'In Transit'`);

            // 5a. Send IMMEDIATE Twilio SMS
            try {
                await this.whatsappService.sendTemplateMessage(
                    order.customer.phone,
                    smsTemplateName,
                    [safeName, order.orderNumber],
                    { orderId: order.id, customerId: order.customerId }
                );
                this.logger.log(`[SMS] In Transit sent immediately for Order ${order.orderNumber} (${smsTemplateName})`);
            } catch (e) {
                this.logger.error(`Failed to send SMS for Order ${order.orderNumber}: ${e.message}`, e.stack);
            }

            // 5b. Schedule 1 HOUR DELAY Personal WhatsApp
            const delayMs = 60 * 60 * 1000; // 1 hour
            this.logger.log(`[WhatsApp] Scheduling Personal WhatsApp for Order ${order.orderNumber} in 1 hour.`);

            setTimeout(async () => {
                try {
                    const waTemplateName = this.getWhatsappTemplateForCountry(order.shippingCountry);
                    const storeName = order.storeName || 'Our Store';
                    const codAmount = order.totalAmount ? order.totalAmount.toString() : '0.00';

                    // Format items list
                    const orderItems = await this.prisma.orderItem.findMany({
                        where: { orderId: order.id },
                        include: { product: true }
                    });
                    const itemsText = orderItems.map(item => `${item.quantity}x ${item.product.name}`).join(', ');

                    await this.whatsappPersonalService.sendTemplateMessage(
                        order.customer.phone,
                        waTemplateName,
                        [safeName, storeName, codAmount, itemsText],
                        { orderId: order.id, customerId: order.customerId }
                    );
                    this.logger.log(`[WhatsApp] Delayed message sent successfully for Order ${order.orderNumber}`);
                } catch (e) {
                    this.logger.error(`[WhatsApp] Delayed send failed for Order ${order.orderNumber}: ${e.message}`);
                }
            }, delayMs);

        } else if (subStatus && subStatus.startsWith('Delivered')) {
            // Package was delivered - update order to Delivered
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Delivered',
                    orderStatus: 'Delivered',
                    deliveredDate: statusDate,
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Delivered' (17Track sub_status: ${subStatus})`);
        } else if (mainStatus === 'Returned') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Returned',
                    orderStatus: 'Returned',
                    returnInitiatedDate: statusDate,
                    returnReason: description || 'Returned to sender by carrier',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Returned'`);
        } else if (mainStatus === 'Undelivered' || mainStatus === 'DeliveryFailure') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Undelivered',
                    orderStatus: 'Exception', // Flag as exception internally
                    notes: order.notes ? `${order.notes}\n[Tracking] Undelivered: ${description}` : `[Tracking] Undelivered: ${description}`
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Undelivered'`);
        } else if (mainStatus === 'Exception') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Exception',
                    orderStatus: 'Exception',
                    notes: order.notes ? `${order.notes}\n[Tracking] Exception: ${description}` : `[Tracking] Exception: ${description}`
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Exception'`);
        }
    }

    private getTemplateForCountry(country: string): string {
        if (!country) return 'sms_in_transit_en';

        const normalizedCountry = country.toLowerCase().trim();

        if (normalizedCountry === 'italy' || normalizedCountry === 'italia') {
            return 'sms_in_transit_it';
        }

        if (normalizedCountry === 'spain' || normalizedCountry === 'españa' || normalizedCountry === 'espana') {
            return 'sms_in_transit_es';
        }

        return 'sms_in_transit_en'; // Default to English
    }

    private getWhatsappTemplateForCountry(country: string): string {
        if (!country) return 'wa_arrival_en';

        const normalizedCountry = country.toLowerCase().trim();

        if (normalizedCountry === 'italy' || normalizedCountry === 'italia') {
            return 'wa_arrival_it';
        }

        if (normalizedCountry === 'spain' || normalizedCountry === 'españa' || normalizedCountry === 'espana') {
            return 'wa_arrival_es';
        }

        return 'wa_arrival_en'; // Default to English
    }

    // Register tracking number with 17Track (Phase 2)
    async registerTracking(trackingNumber: string, carrierCode?: string) {
        this.logger.log(`Registering tracking: ${trackingNumber} (${carrierCode || 'auto-detect'})`);

        try {
            const apiKey = process.env.TRACK17_API_KEY;
            if (!apiKey) {
                this.logger.warn('TRACK17_API_KEY is not set in environment variables. Cannot register tracking.');
                return;
            }

            // Note: Use dynamic import or require for axios if it's not imported at the top level, 
            // but we can just import it at the top of the file since we installed it.
            const axios = require('axios'); // CommonJS require to avoid top-level import issues strictly here, or we can use fetch since it's Node 18+

            const payload: any = { number: trackingNumber };
            if (carrierCode) {
                payload.carrier = carrierCode;
            }

            const response = await axios.post(
                'https://api.17track.net/track/v2.2/register',
                [payload], // 17track expects an array of objects
                {
                    headers: {
                        '17token': apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;
            if (data.code === 0 && data.data?.accepted?.length > 0) {
                this.logger.log(`Successfully registered tracking number ${trackingNumber} with 17Track.`);
            } else if (data.data?.rejected?.length > 0) {
                this.logger.warn(`17Track rejected tracking number ${trackingNumber}: ${JSON.stringify(data.data.rejected)}`);
            } else {
                this.logger.warn(`Unexpected response from 17Track register API: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            this.logger.error(`Failed to register tracking number ${trackingNumber} with 17Track: ${error.message}`, error.stack);
        }
    }
}
