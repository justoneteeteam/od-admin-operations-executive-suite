
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('Verifying Data...');

    // 1. Check Orders
    const orders = await prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, createdAt: true, orderStatus: true, totalAmount: true }
    });
    console.log('--- Last 5 Orders ---');
    console.table(orders.map(o => ({ ...o, createdAt: o.createdAt?.toISOString() })));

    // 2. Check ProfitCalculation
    const profits = await prisma.profitCalculation.findMany({
        take: 5,
        include: { order: { select: { createdAt: true, orderNumber: true } } }
    });
    console.log('--- Sample Profit Calculations ---');
    console.table(profits.map(p => ({
        id: p.id,
        revenue: p.revenue,
        orderNumber: p.order?.orderNumber,
        orderDate: p.order?.createdAt?.toISOString()
    })));

    // 3. Test Aggregate Query
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    console.log(`Testing Aggregate Query from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const profitStats = await prisma.profitCalculation.aggregate({
        _sum: {
            revenue: true,
            grossProfit: true,
            netProfit: true,
        },
        where: {
            order: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        },
    });

    console.log('--- Aggregate Result ---');
    console.log(profitStats);

    // 4. Test Count Query
    const orderCount = await prisma.order.count({
        where: {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        }
    });
    console.log(`Total Orders in Last 30 Days: ${orderCount}`);
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
