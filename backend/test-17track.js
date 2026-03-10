const axios = require('axios');
require('dotenv').config();

const TRACKING_NUMBERS = [
    '32300028101601101334058',
    '32300028101602001335572',
];

async function testGetTrackInfoFull() {
    console.log('=== Full gettrackinfo response to debug processTrackingItem ===\n');
    try {
        const response = await axios.post(
            'https://api.17track.net/track/v2.2/gettrackinfo',
            TRACKING_NUMBERS.map(n => ({ number: n })),
            {
                headers: {
                    '17token': process.env.TRACK17_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const { accepted, rejected } = response.data?.data || {};

        if (accepted?.length) {
            accepted.forEach(item => {
                console.log(`\n========== ${item.number} ==========`);
                console.log(`Has track_info: ${!!item.track_info}`);

                if (item.track_info) {
                    // This is what processTrackingItem reads
                    console.log(`\n--- Fields used by processTrackingItem ---`);
                    console.log(`latest_status.status: ${item.track_info?.latest_status?.status || 'MISSING'}`);
                    console.log(`latest_status.sub_status: ${item.track_info?.latest_status?.sub_status || 'MISSING'}`);
                    console.log(`latest_event.description: ${item.track_info?.latest_event?.description || 'MISSING'}`);
                    console.log(`latest_event.location: ${item.track_info?.latest_event?.location || 'MISSING'}`);
                    console.log(`latest_event.time_utc: ${item.track_info?.latest_event?.time_utc || 'MISSING'}`);
                    console.log(`latest_provider.provider.name: ${item.track_info?.latest_provider?.provider?.name || 'MISSING'}`);
                    console.log(`latest_provider.provider.key: ${item.track_info?.latest_provider?.provider?.key || 'MISSING'}`);
                    console.log(`provider.provider.name: ${item.track_info?.provider?.provider?.name || 'MISSING'}`);
                    console.log(`provider.provider.key: ${item.track_info?.provider?.provider?.key || 'MISSING'}`);
                }
            });
        }

        if (rejected?.length) {
            console.log('\n❌ Rejected:');
            rejected.forEach(r => console.log(`   ${r.number} → ${JSON.stringify(r.error)}`));
        }
    } catch (e) {
        console.error('Error:', e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
    }
}

// Test the DB lookup — check if orders exist with these tracking numbers
async function testDBLookup() {
    console.log('\n\n=== DB Check: Do orders exist for these tracking numbers? ===\n');

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
        for (const trackingNumber of TRACKING_NUMBERS) {
            const order = await prisma.order.findFirst({
                where: { trackingNumber },
                select: { id: true, orderNumber: true, trackingNumber: true, orderStatus: true, shippingStatus: true, courier: true }
            });

            if (order) {
                console.log(`✅ ${trackingNumber} → Order ${order.orderNumber} (status: ${order.orderStatus}, shipping: ${order.shippingStatus || 'null'}, courier: ${order.courier || 'null'})`);
            } else {
                console.log(`❌ ${trackingNumber} → NO ORDER FOUND IN DB`);
            }
        }

        // Also check tracking history
        console.log('\n--- Tracking History entries ---');
        for (const trackingNumber of TRACKING_NUMBERS) {
            const entries = await prisma.trackingHistory.findMany({
                where: { trackingNumber },
                select: { id: true, status: true, substatus: true, description: true, statusDate: true },
                orderBy: { statusDate: 'desc' },
                take: 5
            });
            console.log(`\n${trackingNumber} → ${entries.length} history entries:`);
            entries.forEach(e => console.log(`  [${e.statusDate?.toISOString()}] ${e.status} (${e.substatus || 'n/a'}) - ${e.description || 'no description'}`));
        }
    } catch (e) {
        console.error('DB Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    await testGetTrackInfoFull();
    await testDBLookup();
}

main().catch(console.error);
