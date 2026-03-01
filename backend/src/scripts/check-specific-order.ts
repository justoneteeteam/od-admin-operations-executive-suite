import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
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
        console.log(`Order ${orderNumber} NOT FOUND in the database.`);
        return;
    }

    console.log(`Order Found: ${order.id}`);
    console.log(`Tracking Number: ${order.trackingNumber}`);
    console.log(`Tracking History Count: ${order.trackingHistory.length}`);
    if (order.trackingHistory.length > 0) {
        console.log('Sample Tracking History:', order.trackingHistory[0]);
    }

    console.log(`Customer Responses Count: ${order.customerResponses.length}`);
    if (order.customerResponses.length > 0) {
        console.log('Sample Customer Response:', order.customerResponses[0]);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
