import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RiskScoringService } from './risk-scoring.service';
import { PrismaService } from '../prisma/prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const riskScoringService = app.get(RiskScoringService);
    const prisma = app.get(PrismaService);

    console.log('--- Starting Risk Scoring Tests ---');

    try {
        // We will search for any Order and attempt to evaluate it
        const order = await prisma.order.findFirst({
            include: {
                customer: true
            }
        });

        if (!order) {
            console.log('No orders found to test risk scoring.');
            return;
        }

        console.log(`Testing with Order ID: ${order.id}`);
        const assessment = await riskScoringService.assessOrder(order.id);

        console.log('\n--- Risk Assessment Result ---');
        console.log(`Total Score: ${assessment.totalScore}`);
        console.log(`Risk Level:  ${assessment.riskLevel}`);
        console.log(`Action:      ${assessment.action}`);
        console.log('Factors:     ', assessment.factors);

    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        await app.close();
    }
}

bootstrap();
