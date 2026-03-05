import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RiskScoringService } from './risk-scoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddressVerifyService } from '../address-verify/address-verify.service';
import * as dotenv from 'dotenv';
import { join } from 'path';

async function bootstrap() {
    // 1. Load the actual production/development env file so Prisma can connect
    dotenv.config({ path: join(__dirname, '../../.env') });

    // 2. Override Loqate settings explicitly for this run
    process.env.LOQATE_ENABLED = 'true';
    process.env.LOQATE_API_KEY = 'CM72-ZJ79-JF79-GK64';

    console.log('--- Starting Live Loqate Test ---');
    console.log(`DATABASE_URL Set: ${!!process.env.DATABASE_URL}`);
    console.log(`LOQATE_ENABLED: ${process.env.LOQATE_ENABLED}`);

    const app = await NestFactory.createApplicationContext(AppModule);
    const riskScoringService = app.get(RiskScoringService);
    const addressVerifyService = app.get(AddressVerifyService);
    const prisma = app.get(PrismaService);

    try {
        const order = await prisma.order.findFirst({
            where: {
                orderStatus: { not: 'Cancelled' }
            },
            orderBy: {
                orderDate: 'desc'
            },
            include: {
                customer: true,
                items: true
            }
        });

        if (!order) {
            console.log('No eligible orders found for testing.');
            return;
        }

        console.log(`\nSelected Order ID: ${order.id}`);
        console.log(`Order Number: ${order.orderNumber}`);
        console.log(`Customer: ${order.customer?.name} (Status: ${order.customer?.status})`);

        const fullAddress = [
            order.shippingAddressLine1,
            order.shippingCity,
            order.shippingProvince,
            order.shippingPostalCode,
            order.shippingCountry
        ].filter(Boolean).join(', ');

        console.log(`\nAddress to Verify: "${fullAddress}"`);

        console.log('\n--- 1. Direct Loqate API Call ---');
        const verifyAddress = [
            order.shippingAddressLine1,
            order.shippingCity,
            order.shippingProvince,
            order.shippingPostalCode
        ].filter(Boolean).join(', ');

        const loqateResult = await addressVerifyService.verify(
            verifyAddress,
            order.shippingCountry || '',
            false
        );

        console.log(JSON.stringify(loqateResult, null, 2));

        console.log('\n--- 2. Full Risk Assessment Pipeline ---');
        const assessment = await riskScoringService.assessOrder(order.id);

        console.log(`\nFinal Score: ${assessment.totalScore}`);
        console.log(`Risk Level:  ${assessment.riskLevel}`);
        console.log(`Action:      ${assessment.action}`);
        console.log('\nFactors Breakdown:');
        console.log(JSON.stringify(assessment.factors, null, 2));

    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        await app.close();
    }
}

bootstrap();
