import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaService } from './src/prisma/prisma.service';
import { Twilio } from 'twilio';

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

    const client = new Twilio(accountSid, authToken);

    let toPhone = order.customer?.phone;
    if (!toPhone) {
        console.log('Please specify a phone number to test with (customer has no phone in DB):');
        return;
    }

    // Ensure we use plain E.164 phone numbers for standard SMS
    const fromClean = fromNumber.replace('whatsapp:', '');
    const toClean = toPhone.replace('whatsapp:', '');

    console.log(`Sending SMS from ${fromClean} to ${toClean}...`);

    try {
        const message = await client.messages.create({
            body: `Hi ${order.customer?.name || 'Customer'}! Your order ${order.orderNumber} is confirmed and being processed.`,
            from: fromClean,
            to: toClean,
        });
        console.log('Sent successfully! Message SID:', message.sid);
    } catch (err) {
        console.error('Error sending SMS:', err.message);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
