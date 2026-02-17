
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🌱 Seeding Analytics Data...');

    // 1. Ensure Admin User
    const adminEmail = 'admin@example.com';
    const hashedPassword = await bcrypt.hash('password123', 10);
    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            fullName: 'Admin User',
            passwordHash: hashedPassword,
            role: 'ADMIN',
        },
    });

    // 2. Create foundational entities
    // Use 'StoreSettings' as the store entity.
    const store = await prisma.storeSettings.create({
        data: {
            storeName: 'Urban Trends Analytics',
            storeUrl: `https://analytics-${Date.now()}.com`,
            currency: 'AED',
        }
    });

    const fc = await prisma.fulfillmentCenter.create({
        data: {
            name: 'DXB Analytics Hub',
            country: 'United Arab Emirates',
            city: 'Dubai',
            addressLine1: 'Dubai South Logistics District',
            personInCharge: 'Omar Al-Futtaim',
            code: `DXB-ANLY-${Date.now()}`
        }
    });

    // 3. Create Products with varied costs/prices
    const products = [
        { name: 'Smart Watch S9', sku: `SW9-BLK-${Date.now()}`, price: 299, cost: 80, cat: 'Electronics' },
        { name: 'Noise Cancel Ear', sku: `WNC-HE-${Date.now()}`, price: 199, cost: 45, cat: 'Audio' },
        { name: 'Gaming Mouse V2', sku: `GMS-RGB-${Date.now()}`, price: 89, cost: 25, cat: 'Smartech' },
        { name: 'Espresso Maker', sku: `PEM-TRA-${Date.now()}`, price: 450, cost: 120, cat: 'Home' },
        { name: 'Travel Bag Pro', sku: `TRV-BG-${Date.now()}`, price: 120, cost: 35, cat: 'Lifestyle' },
    ];

    const createdProducts = await Promise.all(products.map(p => prisma.product.create({
        data: {
            name: p.name,
            sku: p.sku,
            unitCost: p.cost,
            sellingPrice: p.price,
            category: p.cat,
            stockLevel: 100,
            fulfillmentCenterId: fc.id,
        }
    })));

    // 4. Create dummy customer
    const customer = await prisma.customer.create({
        data: {
            name: 'Analytics Tester',
            email: `analytics-${Date.now()}@test.com`,
            phone: `+97150${Math.floor(Math.random() * 1000000)}`,
            country: 'United Arab Emirates',
            city: 'Dubai',
            addressLine1: 'Test Address'
        }
    });

    // 5. Generate Orders
    const countries = ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Oman'];
    const statuses = ['Delivered', 'Delivered', 'Delivered', 'Returned', 'Processing']; // Weighted towards delivered

    console.log('Creating 20 orders...');

    for (let i = 0; i < 20; i++) {
        const country = countries[Math.floor(Math.random() * countries.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const product = createdProducts[Math.floor(Math.random() * createdProducts.length)];
        const quantity = Math.floor(Math.random() * 3) + 1; // 1-3

        const subtotal = quantity * Number(product.sellingPrice);
        const shipping = 20;
        const total = subtotal + shipping;

        // Random date within last 30 days
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 30));

        const order = await prisma.order.create({
            data: {
                orderNumber: `ORD-${Date.now()}-${i}`,
                customerId: customer.id,
                storeId: store.id,
                storeName: store.storeName,
                fulfillmentCenterId: fc.id,
                shippingCountry: country,
                shippingCity: 'City',
                shippingAddressLine1: 'Address',
                orderStatus: status,
                subtotal,
                totalAmount: total,
                shippingFee: shipping,
                createdAt: date,
                orderDate: date,
                items: {
                    create: {
                        productId: product.id,
                        productName: product.name,
                        sku: product.sku,
                        quantity,
                        unitPrice: product.sellingPrice,
                        subtotal,
                        returnQuantity: status === 'Returned' ? quantity : 0,
                        createdAt: date,
                    }
                }
            },
            include: { items: true }
        });

        // If Delivered, create ProfitCalculation
        if (status === 'Delivered') {
            const cost = Number(product.unitCost) * quantity;
            const gross = subtotal - cost;
            const net = gross - shipping;

            await prisma.profitCalculation.create({
                data: {
                    orderId: order.id,
                    revenue: subtotal,
                    productCost: cost,
                    shippingCost: shipping,
                    fulfillmentCost: 5,
                    totalCosts: cost + shipping + 5,
                    grossProfit: gross,
                    netProfit: net - 5,
                    profitMargin: subtotal > 0 ? ((net - 5) / subtotal) * 100 : 0,
                    roiPercent: (cost + shipping + 5) > 0 ? ((net - 5) / (cost + shipping + 5)) * 100 : 0,
                }
            });
        }
    }

    console.log('✅ Seeding completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
