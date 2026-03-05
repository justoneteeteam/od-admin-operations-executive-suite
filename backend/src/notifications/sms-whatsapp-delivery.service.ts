import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Twilio } from 'twilio';

@Injectable()
export class SmsWhatsappDeliveryService {
    private client: Twilio;
    private readonly logger = new Logger(SmsWhatsappDeliveryService.name);

    constructor(@Inject(PrismaService) private prisma: PrismaService) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            this.logger.warn('Twilio credentials not found');
            return;
        }

        this.client = new Twilio(accountSid, authToken);
    }

    async sendTemplateMessage(
        to: string,
        templateName: string,
        variables: string[],
        context: { orderId?: string; customerId?: string }
    ) {
        try {
            // 1. Get Template
            const template = await this.prisma.notificationTemplate.findUnique({
                where: { templateName },
            });

            if (!template) {
                throw new Error(`Template ${templateName} not found`);
            }

            // 2. Replace Variables
            let body = template.bodyTemplate;
            variables.forEach((val, index) => {
                body = body.replace(`{{${index + 1}}}`, val);
            });

            // 3. Send via Twilio
            // For SMS, we strictly prioritize TWILIO_PHONE_NUMBER.
            const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || '+12765311327';
            if (!from) throw new Error('TWILIO_PHONE_NUMBER not configured');

            // Ensure we use plain E.164 phone numbers for standard SMS
            const fromClean = from.replace('whatsapp:', '');
            const toClean = to.replace('whatsapp:', '');

            if (!this.client) {
                this.logger.warn('Twilio client not initialized, skipping send');
                return { success: false, sid: 'SKIPPED_NO_CREDS' };
            }

            // Fix SMS length to 1 segment by converting to pure GSM-7 (removing diacritics/accents)
            // e.g., García -> Garcia. This prevents UCS2 encoding which drops the limit from 160 to 70 chars.
            const gsm7Body = body.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            const message = await this.client.messages.create({
                body: gsm7Body,
                from: fromClean,
                to: toClean,
                statusCallback: `${process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : 'http://localhost:3000')}/api/notifications/callbacks/twilio`,
            });

            // 4. Log to CustomerResponse
            await this.prisma.customerResponse.create({
                data: {
                    orderId: context.orderId || '00000000-0000-0000-0000-000000000000',
                    customerId: context.customerId,
                    notificationType: 'sms',
                    messageContent: body,
                    messageTemplate: templateName,
                    sentAt: new Date(),
                    externalMessageId: message.sid,
                    externalStatus: message.status,
                    status: 'sent',
                },
            });

            this.logger.log(`Message sent to ${to}: ${message.sid}`);
            return { success: true, sid: message.sid };
        } catch (error) {
            this.logger.error(`Failed to send WhatsApp: ${error.message}`, error.stack);
            throw error;
        }
    }

    async handleStatusCallback(payload: any) {
        const { MessageSid, MessageStatus } = payload;
        this.logger.log(`Update status for ${MessageSid}: ${MessageStatus}`);

        if (MessageSid && MessageStatus) {
            await this.prisma.customerResponse.updateMany({
                where: { externalMessageId: MessageSid },
                data: {
                    externalStatus: MessageStatus,
                    status: MessageStatus, // sent, delivered, read
                    ...(MessageStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
                    ...(MessageStatus === 'read' ? { readAt: new Date() } : {}),
                },
            });
        }
    }
}
