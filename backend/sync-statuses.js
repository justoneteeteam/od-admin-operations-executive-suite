require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAllTracking() {
    console.log('Starting retroactive tracking sync with Postgres...');
    const API_KEY = process.env.TRACK17_API_KEY;

    if (!API_KEY) {
        console.error('Missing TRACK17_API_KEY');
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();

        // Find all orders that have a tracking number but aren't in a final state
        const res = await client.query(`
            SELECT id, "order_number", "tracking_number", "courier", "status", "shipping_status" 
            FROM orders 
            WHERE "tracking_number" IS NOT NULL 
            AND "status" NOT IN ('Delivered', 'Cancelled', 'Exception', 'Expired')
        `);

        // Fix for when carrierCode is mapped to courier
        const resRetry = await client.query(`
            SELECT id, "order_number", "tracking_number", "courier", "status", "shipping_status" 
            FROM orders 
            WHERE "tracking_number" IS NOT NULL 
            AND "status" NOT IN ('Delivered', 'Cancelled', 'Exception', 'Expired', 'Return', 'Cancel')
        `);

        const orders = resRetry.rows.map(o => ({
            id: o.id,
            orderNumber: o.order_number,
            trackingNumber: o.tracking_number,
            carrierCode: o.courier,
            orderStatus: o.status,
            shippingStatus: o.shipping_status
        }));

        console.log(`Found ${orders.length} active orders with tracking numbers. Fetching latest statuses from 17Track...`);

        // We can query max 40 at a time per 17track API docs
        const batchSize = 40;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            const trackingNumbers = batch.map(o => ({ number: o.trackingNumber, carrier: o.carrierCode || undefined }));

            try {
                console.log(`Processing batch ${i / batchSize + 1}...`);
                const response = await axios.post(
                    'https://api.17track.net/track/v2.2/gettrackinfo',
                    trackingNumbers,
                    {
                        headers: {
                            '17token': API_KEY,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.data.code === 0 && response.data.data?.accepted) {
                    for (const trackResult of response.data.data.accepted) {
                        const number = trackResult.number;
                        const mainStatus = trackResult.track_info?.latest_status?.status;

                        if (!mainStatus) continue;

                        // Find the related order in DB
                        const order = batch.find(o => o.trackingNumber === number);
                        if (!order) continue;

                        // Map standard 17track statuses to our new hybrid conventions
                        // Since new system stores "PickUp" natively instead of "Out for Delivery"
                        let mappedStatus = mainStatus;
                        // For backwards compatibility mapping old custom statuses during transition
                        if (mainStatus === 'Transit') mappedStatus = 'InTransit';

                        // Only update if it actually changed to prevent noise
                        if (order.orderStatus !== mappedStatus) {
                            console.log(`Updating Order ${order.orderNumber} (${number}) from ${order.orderStatus} -> ${mappedStatus}`);

                            await client.query(`
                                UPDATE orders 
                                SET "status" = $1, "shipping_status" = $2 
                                WHERE id = $3
                            `, [mappedStatus, mappedStatus, order.id]);
                        }
                    }
                } else {
                    console.warn(`Unexpected API response:`, response.data);
                }

                // Rate limiting precaution
                await delay(500);

            } catch (e) {
                console.error(`Error processing batch:`, e.message);
            }
        }

        // Handle orders with old mapping
        console.log('\nCleaning up any remaining old statuses in the DB...');
        await client.query(`UPDATE orders SET "status" = 'InTransit', "shipping_status" = 'InTransit' WHERE "status" = 'In Transit'`);
        await client.query(`UPDATE orders SET "status" = 'InTransit', "shipping_status" = 'InTransit' WHERE "status" = 'Shipped'`);
        await client.query(`UPDATE orders SET "status" = 'Exception', "shipping_status" = 'Exception' WHERE "status" = 'Return'`);
        await client.query(`UPDATE orders SET "status" = 'Cancelled', "shipping_status" = 'Cancelled' WHERE "status" = 'Cancel'`);
        await client.query(`UPDATE orders SET "status" = 'PickUp', "shipping_status" = 'PickUp' WHERE "status" = 'Out for Delivery'`);


        console.log('Retroactive sync complete!');
    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        await client.end();
    }
}

syncAllTracking();
