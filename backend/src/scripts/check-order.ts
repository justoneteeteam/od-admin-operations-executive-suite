import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);

    const orderNumber = 'ORD-TEST-1772167523404';

    const order = await prisma.order.findFirst({
        where: { orderNumber },
        include: {
            trackingHistory: true,
            customerResponses: true,
            customer: true
        }
    });

    if (!order) {
        console.log(`ORDER_NOT_FOUND: ${orderNumber}`);
    } else {
        console.log(`ORDER_FOUND: id=${order.id}, tracking=${order.trackingNumber}`);
        console.log(`TRACKING_HISTORY_COUNT: ${order.trackingHistory?.length || 0}`);
        if (order.trackingHistory?.length > 0) {
            console.log('LATEST_TRACKING:', JSON.stringify(order.trackingHistory[0], null, 2));
        }

        console.log(`CUSTOMER_RESPONSES_COUNT: ${order.customerResponses?.length || 0}`);
        if (order.customerResponses?.length > 0) {
            console.log('LATEST_RESPONSE:', JSON.stringify(order.customerResponses[0], null, 2));
        }
    }

    await app.close();
}

bootstrap().catch(console.error);
