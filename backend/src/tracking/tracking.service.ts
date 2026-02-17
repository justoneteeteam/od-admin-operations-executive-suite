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
            // Template: "Hello {{1}}, your order {{2}} is now In Transit! 🚚 Track it here: {{3}}"
            // Variables: Customer Name, Order Number, Tracking URL (or just number)

            const customerName = order.customer.name;
            const safeName = customerName || 'Customer';

            const trackingUrl = `https://t.17track.net/en#nums=${trackingNumber}`;

            // 3. Update Order Status
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'In Transit',
                    orderStatus: 'In Transit',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'In Transit'`);

            // 4. Send WhatsApp
            try {
                await this.whatsappService.sendTemplateMessage(
                    order.customer.phone,
                    'order_in_transit',
                    [safeName, order.orderNumber, trackingUrl],
                    { orderId: order.id, customerId: order.customerId }
                );
                this.logger.log(`In Transit Notification sent for Order ${order.orderNumber}`);
            } catch (e) {
                this.logger.error(`Failed to send WhatsApp for Order ${order.orderNumber}: ${e.message}`, e.stack);
            }
        }
    }

    // Placeholder for Phase 2
    async registerTracking(trackingNumber: string, carrierCode: string) {
        this.logger.log(`Registering tracking: ${trackingNumber} (${carrierCode})`);
        // Implementation pending Phase 2 (axios call to 17Track)
    }
}
