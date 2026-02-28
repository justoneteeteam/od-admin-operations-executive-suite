import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../notifications/whatsapp.service';

@Injectable()
export class TrackingService {
    private readonly logger = new Logger(TrackingService.name);

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(WhatsappService) private readonly whatsappService: WhatsappService,
    ) { }

    async handleWebhook(payload: any) {
        this.logger.log('Received Webhook Payload', JSON.stringify(payload));

        const event = payload.event;
        // 17Track structure: { event: "TRACKING_UPDATED", data: { accepted: [...] } }

        if (event === 'TRACKING_UPDATED' && payload.data?.accepted) {
            for (const item of payload.data.accepted) {
                await this.processTrackingItem(item);
            }
        }
    }

    private async processTrackingItem(item: any) {
        const trackingNumber = item.number;
        const subStatus = item.track_info?.latest_status?.sub_status; // "InTransit_Arrival"

        this.logger.log(`Processing ${trackingNumber}, Status: ${subStatus}`);

        // 1. Find Order by Tracking Number
        const order = await this.prisma.order.findFirst({
            where: { trackingNumber: trackingNumber },
            include: { customer: true },
        });

        if (!order) {
            this.logger.warn(`Order not found for tracking number: ${trackingNumber}`);
            return;
        }

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

            // 2. Prepare Variables for Template
            // Variables: 1=CustomerName, 2=OrderNumber, 3=TrackingURL, 4=StoreName
            const customerName = order.customer.name;
            const safeName = customerName || 'Customer';
            const storeName = order.storeName || 'Our Store'; // Fallback if storeName is missing
            const trackingUrl = `https://t.17track.net/en#nums=${trackingNumber}`;

            // 3. Determine Template based on Country
            const templateName = this.getTemplateForCountry(order.shippingCountry);

            // 4. Update Order Status
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'In Transit',
                    orderStatus: 'In Transit',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'In Transit'`);

            // 5. Send WhatsApp
            try {
                await this.whatsappService.sendTemplateMessage(
                    order.customer.phone,
                    templateName,
                    [safeName, order.orderNumber, trackingUrl, storeName],
                    { orderId: order.id, customerId: order.customerId }
                );
                this.logger.log(`In Transit Notification sent for Order ${order.orderNumber} using template ${templateName}`);
            } catch (e) {
                this.logger.error(`Failed to send WhatsApp for Order ${order.orderNumber}: ${e.message}`, e.stack);
            }

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
        if (!country) return 'order_in_transit';

        const normalizedCountry = country.toLowerCase().trim();

        if (normalizedCountry === 'italy' || normalizedCountry === 'italia') {
            return 'italian_order_in_transit';
        }

        if (normalizedCountry === 'spain' || normalizedCountry === 'españa' || normalizedCountry === 'espana') {
            return 'spanish_order_in_transit';
        }

        return 'order_in_transit'; // Default to English
    }

    // Placeholder for Phase 2
    async registerTracking(trackingNumber: string, carrierCode: string) {
        this.logger.log(`Registering tracking: ${trackingNumber} (${carrierCode})`);
        // Implementation pending Phase 2 (axios call to 17Track)
    }
}
