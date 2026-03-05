import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
    console.log('Cleaning up failed logs for Order #1528...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);

    const order = await prisma.order.findFirst({
        where: { orderNumber: { contains: '1528' } },
    });

    if (order) {
        await prisma.callLog.deleteMany({
            where: { orderId: order.id }
        });
        await prisma.customerResponse.deleteMany({
            where: { orderId: order.id }
        });
        await prisma.order.update({
            where: { id: order.id },
            data: {
                confirmationStatus: 'Pending',
                orderStatus: 'Pending'
            }
        });
        console.log('Cleanup complete. Status reset to Pending.');
    } else {
        console.log('Order not found.');
    }

    await app.close();
    process.exit(0);
}

main().catch(console.error);
