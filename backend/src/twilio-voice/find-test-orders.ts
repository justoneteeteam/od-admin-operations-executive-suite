import * as dotenv from 'dotenv';
import { join } from 'path';

// Load env BEFORE importing NestJS modules
dotenv.config({ path: join(__dirname, '../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);

    const orders = await prisma.order.findMany({
        where: {
            confirmationStatus: { notIn: ['Confirmed', 'Declined', 'Call Center'] },
            orderStatus: { notIn: ['Cancelled', 'Delivered', 'Returned'] },
        },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    console.log(`\n=== Found ${orders.length} eligible orders ===\n`);

    for (const order of orders) {
        const callCount = await prisma.callLog.count({ where: { orderId: order.id } });
        console.log(
            `#${order.orderNumber} | ${order.customer?.name || 'N/A'} | Phone: ${order.customer?.phone || 'N/A'} | ${order.shippingCountry || 'N/A'} | Status: ${order.orderStatus} | Confirm: ${order.confirmationStatus || 'Pending'} | Calls: ${callCount}`
        );
    }

    await app.close();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
