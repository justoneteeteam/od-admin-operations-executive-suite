import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TwilioVoiceService } from './src/twilio-voice/twilio-voice.service';
import { PrismaService } from './src/prisma/prisma.service';

async function main() {
    console.log('=== LIVE TEST: Pre-Call SMS + Confirmation Call ===');
    console.log('Target: Order #1515');

    const app = await NestFactory.createApplicationContext(AppModule);
    const twilioService = app.get(TwilioVoiceService);
    const prisma = app.get(PrismaService);

    const order = await prisma.order.findFirst({
        where: { orderNumber: { contains: '1515' } },
        include: { customer: true }
    });

    if (!order) {
        console.log('❌ Order #1515 not found!');
        process.exit(1);
    }

    console.log(`\nOrder ID: ${order.id}`);
    console.log(`Customer: ${order.customer.name}`);
    console.log(`Phone: ${order.shippingPhone || order.customer.phone}`);
    console.log(`Country: ${order.shippingCountry}\n`);

    console.log('Step 1: Initiating confirmation call (this will send SMS first, wait 8s, then dial)...');
    
    // Using the short script to get a quick Yes/No response!
    const callSid = await twilioService.initiateConfirmationCall(order.id, 'short');
    
    if (callSid) {
        console.log(`\n✅ Call initiated! SID: ${callSid}`);
        console.log(`\nPlease wait 10-20 seconds for the call to finish and the user to respond.`);
        console.log(`Once the call is done, check your dashboard or run test-check-logs.ts again to see the result!\n`);
    } else {
        console.log(`\n❌ Call failed to initiate.`);
    }

    await app.close();
    process.exit(0);
}

main().catch(console.error);
