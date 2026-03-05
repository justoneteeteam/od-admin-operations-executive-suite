import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function check() {
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { orderNumber: { contains: '1524' } },
                { orderNumber: { contains: '1525' } }
            ]
        },
        select: {
            orderNumber: true,
            trackingNumber: true,
            shippingStatus: true
        }
    });
    console.log(JSON.stringify(orders, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
