import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaService } from './src/prisma/prisma.service';
import { WhatsappService } from './src/notifications/whatsapp.service';

const prisma = new PrismaService();

async function main() {
    const orderNumber = 'ORD-1771313837085';
    console.log(`Looking up order: ${orderNumber}`);

    const order = await prisma.order.findFirst({
        where: { orderNumber },
        include: { customer: true }
    });

    if (!order) {
        console.error('Order not found!');
        return;
    }

    console.log('Order found:', order.orderNumber);
    console.log('Customer Phone:', order.customer?.phone);
    console.log('Alternatively tracking number:', order.trackingNumber);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
        console.error('Twilio credentials completely missing from .env');
        console.log('TWILIO_ACCOUNT_SID:', accountSid ? 'Set' : 'Missing');
        console.log('TWILIO_AUTH_TOKEN:', authToken ? 'Set' : 'Missing');
        console.log('TWILIO_PHONE_NUMBER/TWILIO_WHATSAPP_NUMBER:', fromNumber ? 'Set' : 'Missing');
        return;
    }

    const whatsappService = new WhatsappService(prisma);
    const templateName = 'sms_in_transit_es';

    console.log(`Sending SMS using template '${templateName}' from ${fromNumber} to ${order.customer.phone}...`);

    try {
        const result = await whatsappService.sendTemplateMessage(
            order.customer.phone,
            templateName,
            [order.customer.name || 'Customer', order.orderNumber],
            { orderId: order.id, customerId: order.customerId }
        );
        console.log('Result:', result);
    } catch (err) {
        console.error('Error sending SMS via Service:', err.message);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
