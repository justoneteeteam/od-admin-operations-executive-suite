import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

async function recover() {
    console.log('Starting dead letter recovery for missed tracking...');
    const prisma = new PrismaClient();

    // Find orders with no webhook-delivered tracking history
    // (raw_data IS NULL means no webhook ever hit it)
    const missedOrders = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT o.id, o.tracking_number
        FROM orders o
        LEFT JOIN tracking_history th 
            ON th.order_id = o.id AND th.raw_data IS NOT NULL
        WHERE o.tracking_number IS NOT NULL
          AND o.shipping_status NOT IN ('Delivered', 'Returned', 'Expired')
          AND th.id IS NULL
    `;

    console.log(`Found ${missedOrders.length} orders with no webhook data`);

    if (missedOrders.length === 0) {
        console.log('No missed orders to recover.');
        await prisma.$disconnect();
        return;
    }

    const API_KEY = process.env.TRACK17_API_KEY;
    if (!API_KEY) {
        console.error('Missing TRACK17_API_KEY environment variable. Aborting.');
        await prisma.$disconnect();
        return;
    }

    for (let i = 0; i < missedOrders.length; i += 40) {
        const batch = missedOrders.slice(i, i + 40);
        console.log(`Processing batch ${Math.floor(i / 40) + 1}...`);

        try {
            const response = await axios.post(
                'https://api.17track.net/track/v2.2/gettrackinfo',
                batch.map(o => ({ number: o.tracking_number })),
                { headers: { '17token': API_KEY, 'Content-Type': 'application/json' } }
            );

            const accepted = response.data?.data?.accepted;
            if (accepted && accepted.length) {
                console.log(JSON.stringify(accepted.map((a: any) => ({
                    number: a.number,
                    status: a.track_info?.latest_status?.status,
                    substatus: a.track_info?.latest_status?.sub_status,
                    eventsCount: a.track_info?.tracking?.providers?.[0]?.events?.length || 0
                })), null, 2));

                // We are just logging here because inserting them correctly 
                // requires the full TrackingService logic which integrates with app contexts, 
                // notifications, etc. 
                // To actually inject these back, you could write a small HTTP request 
                // directed at your own backend webhook endpoint to fake the push 
                // or just let the new 2-hour cron job pick it up automatically now!
                // Since the cron job is implemented, the cron job will actually pick these up 
                // on its very first run because they are active!
                console.log(`(NOTE: The newly implemented TrackingPollService cron job will automatically ingest these during its next run)`);
            }
        } catch (err: any) {
            console.error(`Failed to fetch 17track batch: ${err.message}`);
        }

        if (i + 40 < missedOrders.length) {
            await new Promise(r => setTimeout(r, 1000)); // Sleep between batches
        }
    }

    console.log('Recovery script finished.');
    await prisma.$disconnect();
}

recover().catch(console.error);
