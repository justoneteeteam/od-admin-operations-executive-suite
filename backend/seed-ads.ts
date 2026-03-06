import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Fetching first product to use as SKU...");
    const product = await prisma.product.findFirst();
    if (!product) {
        console.log("No products found to use for seed. Need an existing product first.");
        return;
    }
    const sku = product.sku;

    console.log(`Using SKU: ${sku}`);

    // 1. Create exchange rates
    const d1 = new Date(); d1.setHours(0, 0, 0, 0);
    const d2 = new Date(); d2.setDate(d2.getDate() - 2); d2.setHours(0, 0, 0, 0);

    await prisma.exchangeRate.upsert({
        where: { date: d1 },
        update: { vndToEur: 0.000037 },
        create: { date: d1, vndToEur: 0.000037 },
    });
    await prisma.exchangeRate.upsert({
        where: { date: d2 },
        update: { vndToEur: 0.000038 },
        create: { date: d2, vndToEur: 0.000038 },
    });

    // 2. Create Campaigns
    await prisma.adsCampaign.createMany({
        data: [
            {
                date: d1,
                campaign: `Mock-${Date.now()}-A`,
                country: 'IT',
                platform: 'TikTok',
                sku,
                stage: 'Test',
                pic: 'Alice',
                spendVnd: 5000000,
                source: 'manual',
            },
            {
                date: d2,
                campaign: `Mock-${Date.now()}-B`,
                country: 'DE',
                platform: 'Facebook',
                sku,
                stage: 'Scale',
                pic: 'Bob',
                spendVnd: 15000000,
                source: 'upload',
            }
        ]
    });

    console.log("✅ Mock data fully inserted. Dashboard will now show Spend and Campaigns!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
