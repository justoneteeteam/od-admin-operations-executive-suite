// Script: Replicate exactly what orders.service.ts findOne() does
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

async function main() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({
        adapter,
        log: ['error', 'warn'],
    });

    await prisma.$connect();

    // Step 1: Find the order ID for #1548
    const orderLookup = await prisma.order.findUnique({
        where: { orderNumber: '#1548' },
        select: { id: true },
    });
    
    if (!orderLookup) {
        console.log('ORDER #1548 NOT FOUND');
        await prisma.$disconnect();
        return;
    }
    
    console.log('Order ID:', orderLookup.id);
    
    // Step 2: Use EXACTLY the same findOne() query as orders.service.ts
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderLookup.id },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true,
                    },
                },
                fulfillmentCenter: true,
                trackingHistory: {
                    orderBy: {
                        statusDate: 'desc'
                    }
                },
                customerResponses: {
                    orderBy: {
                        sentAt: 'desc'
                    }
                },
                callLogs: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            },
        });

        console.log('\n=== findOne() RESULT ===');
        console.log('trackingHistory:', order.trackingHistory?.length, 'items');
        console.log('customerResponses:', order.customerResponses?.length, 'items');
        console.log('callLogs:', order.callLogs?.length, 'items');

        if (order.customerResponses?.length > 0) {
            console.log('\nFirst customerResponse:', JSON.stringify(order.customerResponses[0], null, 2));
        }
        if (order.callLogs?.length > 0) {
            console.log('\nFirst callLog:', JSON.stringify(order.callLogs[0], null, 2));
        }

        // Step 3: Test JSON serialization (what NestJS does before sending response)
        try {
            const json = JSON.stringify(order);
            const parsed = JSON.parse(json);
            console.log('\n=== JSON SERIALIZATION TEST ===');
            console.log('JSON size:', json.length, 'bytes');
            console.log('parsed.trackingHistory:', parsed.trackingHistory?.length);
            console.log('parsed.customerResponses:', parsed.customerResponses?.length);
            console.log('parsed.callLogs:', parsed.callLogs?.length);
            
            // Check if the fields exist in the parsed object
            console.log('\nKeys in parsed order:', Object.keys(parsed).filter(k => ['trackingHistory', 'customerResponses', 'callLogs'].includes(k)));
        } catch (jsonErr) {
            console.error('\n!!! JSON SERIALIZATION FAILED !!!', jsonErr.message);
        }

    } catch (queryErr) {
        console.error('\n!!! PRISMA QUERY FAILED !!!', queryErr.message);
        console.error(queryErr);
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
