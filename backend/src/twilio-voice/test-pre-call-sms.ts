import * as dotenv from 'dotenv';
import { join } from 'path';

// Load env BEFORE importing NestJS
dotenv.config({ path: join(__dirname, '../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
    console.log('=== LIVE TEST: Pre-Call SMS + Confirmation Call ===');
    console.log('Target: Order #1526 (Rubén Molina López, Spain)');
    console.log('');

    const app = await NestFactory.createApplicationContext(AppModule);
    const twilioVoiceService = app.get(TwilioVoiceService);
    const prisma = app.get(PrismaService);

    // Find the order that has a NO-SKU product
    const order = await prisma.order.findFirst({
        where: {
            items: { some: { sku: { startsWith: 'NO-SKU-' } } },
            confirmationStatus: { in: ['Pending', 'No Answer', 'Call Center'] }
        },
        include: { customer: true, items: true },
        orderBy: { createdAt: 'desc' },
    });

    if (!order) {
        console.error('Order #1528 not found!');
        await app.close();
        process.exit(1);
    }

    console.log(`Order ID: ${order.id}`);
    console.log(`Customer: ${order.customer?.name}`);
    console.log(`Phone: ${order.customer?.phone}`);
    console.log(`Country: ${order.shippingCountry}`);
    console.log('');

    console.log('Step 1: Initiating confirmation call (this will send SMS first, wait 8s, then dial)...');
    console.log('');

    try {
        const callSid = await twilioVoiceService.initiateConfirmationCall(order.id, 'short');
        console.log(`\n✅ Call initiated! SID: ${callSid}`);
    } catch (error: any) {
        console.error(`\n❌ Call failed: ${error.message}`);
    }

    // Check what was logged
    console.log('\n--- Checking database records ---');

    const callLogs = await prisma.callLog.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
    });
    console.log(`\nCall Logs (${callLogs.length}):`);
    for (const log of callLogs) {
        console.log(`  SID: ${log.callSid} | Status: ${log.callStatus} | Attempt: ${log.attemptNumber} | Script: ${log.scriptType}`);
    }

    const smsLogs = await prisma.customerResponse.findMany({
        where: { orderId: order.id },
        orderBy: { sentAt: 'desc' },
        take: 3,
    });
    console.log(`\nSMS/Message Logs (${smsLogs.length}):`);
    for (const sms of smsLogs) {
        console.log(`  Type: ${sms.notificationType} | Template: ${sms.messageTemplate} | Status: ${sms.status} | SID: ${sms.externalMessageId}`);
        console.log(`  Body: "${sms.messageContent}"`);
    }

    await app.close();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
