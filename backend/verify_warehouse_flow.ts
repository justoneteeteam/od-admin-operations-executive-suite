import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: undefined // Local dev usually doesn't need SSL, or use { rejectUnauthorized: false } if cloud
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
    adapter,
});

async function main() {
    console.log('--- Starting Verification ---');

    // 1. Get a Fulfillment Center (or create one if none)
    let fc = await prisma.fulfillmentCenter.findFirst({
        include: { warehouses: true }
    });

    if (!fc) {
        console.log('Creating Test FC...');
        fc = await prisma.fulfillmentCenter.create({
            data: {
                name: 'Test FC ' + Date.now(),
                code: 'TFC-' + Date.now(),
                country: 'Test Country',
                city: 'Test City',
                addressLine1: '123 Test St',
                personInCharge: 'Tester',
                warehouses: {
                    create: [{ name: 'Test Warehouse A', location: 'Section A' }]
                }
            },
            include: { warehouses: true }
        });
    } else if (fc.warehouses.length === 0) {
        console.log('Adding warehouse to existing FC...');
        await prisma.warehouse.create({
            data: {
                name: 'Test Warehouse B',
                fulfillmentCenterId: fc.id
            }
        });
        // Refetch
        fc = await prisma.fulfillmentCenter.findUnique({
            where: { id: fc.id },
            include: { warehouses: true }
        });
    }

    if (!fc || !fc.warehouses || fc.warehouses.length === 0) {
        throw new Error("Failed to setup FC with Warehouse");
    }

    const warehouse = fc.warehouses[0];
    console.log(`Using FC: ${fc.name}, Warehouse: ${warehouse.name} (${warehouse.id})`);

    // 2. Get a Supplier
    let supplier = await prisma.supplier.findFirst();
    if (!supplier) {
        console.log('Creating Test Supplier...');
        supplier = await prisma.supplier.create({
            data: { name: 'Test Supplier', contactPerson: 'John', country: 'US' }
        });
    }

    // 3. Create a Purchase with Warehouse
    console.log('Creating Purchase with Warehouse...');
    const purchase = await prisma.purchase.create({
        data: {
            purchaseOrderNumber: 'PO-TEST-' + Date.now(),
            supplierId: supplier.id,
            fulfillmentCenterId: fc.id,
            warehouseId: warehouse.id,
            totalAmount: 100,
            subtotal: 100,
            purchaseStatus: 'Draft',
        },
        include: { warehouse: true }
    });

    console.log('Purchase Created:', purchase.id);
    console.log('Linked Warehouse:', purchase.warehouse ? purchase.warehouse.name : 'NONE');

    if (purchase.warehouseId === warehouse.id) {
        console.log('✅ SUCCESS: Purchase is linked to the correct warehouse.');
    } else {
        console.error('❌ FAILURE: Purchase warehouseId mismatch.');
        process.exit(1);
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
