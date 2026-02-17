
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
    console.log('Verifying Filters...');

    // 1. ALL TIME
    console.log('\n--- ALL TIME ---');
    const allTime = await getTopProducts({});
    console.table(allTime);

    // 2. LAST 7 DAYS
    console.log('\n--- LAST 7 DAYS ---');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    const last7Days = await getTopProducts({
        createdAt: {
            gte: startDate,
            lte: endDate,
        }
    });
    console.table(last7Days);

    // 3. Compare
    const allTimeRev = allTime.reduce((sum, p) => sum + Number(p._sum.subtotal), 0);
    const last7Rev = last7Days.reduce((sum, p) => sum + Number(p._sum.subtotal), 0);

    console.log(`\nAll Time Revenue (Top 5): ${allTimeRev}`);
    console.log(`Last 7 Days Revenue (Top 5): ${last7Rev}`);

    if (last7Rev < allTimeRev && last7Rev > 0) {
        console.log('✅ PASS: 7 Days revenue is less than All Time and greater than 0.');
    } else if (last7Rev === 0) {
        console.log('⚠️ WARNING: 7 Days revenue is 0. Check seed data distribution.');
    } else {
        console.log('❌ FAIL: 7 Days revenue is not less than All Time?');
    }
}

async function getTopProducts(where: any) {
    return await prisma.orderItem.groupBy({
        by: ['sku', 'productName'],
        _sum: {
            quantity: true,
            subtotal: true,
        },
        where: where,
        orderBy: {
            _sum: { subtotal: 'desc' },
        },
        take: 5,
    });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
