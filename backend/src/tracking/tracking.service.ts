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

        if (subStatus === 'InTransit_Arrival') {
            // 1. Find Order by Tracking Number
            const order = await this.prisma.order.findFirst({
                where: { trackingNumber: trackingNumber },
                include: { customer: true },
            });

            if (!order) {
                this.logger.warn(`Order not found for tracking number: ${trackingNumber}`);
                return;
            }

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
