
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars. Expected to run from 'backend' dir, so .env is in current dir.
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not found in .env');
    process.exit(1);
}

// Initialize Prisma with Adapter (matching prisma.service.ts)
const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Starting Inventory Logic Test (JS) ---');

    // 1. Find a Fulfillment Center
    const fc = await prisma.fulfillmentCenter.findFirst();
    if (!fc) {
        console.error('No Fulfillment Center found. Aborting.');
        return;
    }
    console.log(`Step 1: Using Fulfillment Center: "${fc.name}"`);

    // 2. "Erase the warehouse" - Simulation
    const testWarehouseName = "Backend Test Warehouse";
    const existing = await prisma.warehouse.findFirst({
        where: { name: testWarehouseName }
    });

    if (existing) {
        console.log(`Step 2: Found existing "${testWarehouseName}". Deleting it...`);
        try {
            await prisma.inventoryLevel.deleteMany({ where: { warehouseId: existing.id } });
            await prisma.inventoryTransaction.deleteMany({ where: { warehouseId: existing.id } });
            await prisma.warehouse.delete({ where: { id: existing.id } });
            console.log('   -> Deleted successfully.');
        } catch (e) {
            console.error('   -> Could not delete:', e.message);
        }
    } else {
        console.log(`Step 2: "${testWarehouseName}" not found. Skipping delete.`);
    }

    // 3. Create new warehouse
    console.log(`Step 3: Creating new "${testWarehouseName}"...`);
    const newWarehouse = await prisma.warehouse.create({
        data: {
            name: testWarehouseName,
            location: 'Test Zone',
            fulfillmentCenterId: fc.id
        }
    });
    console.log(`   -> Created Warehouse ID: ${newWarehouse.id}`);

    // 4. Check inventory
    console.log(`Step 4: Checking inventory levels for this new warehouse...`);
    const levels = await prisma.inventoryLevel.findMany({
        where: { warehouseId: newWarehouse.id },
        include: { product: true }
    });

    if (levels.length === 0) {
        console.log('   -> RESULT: No inventory records found.');
        console.log('   -> CONCLUSION: When a warehouse is created, products are NOT automatically linked with 0 stock. It starts empty.');
    } else {
        console.log(`   -> RESULT: Found ${levels.length} inventory records.`);
        levels.forEach(l => console.log(`      - ${l.product.name || 'Product'}: ${l.currentQuantity}`));
    }

    console.log('--- Test Complete ---');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end(); // close pool
    });
