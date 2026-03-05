const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

async function checkAll() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    // Get all orders that have a tracking number
    const res = await client.query('SELECT order_number, tracking_number FROM orders WHERE tracking_number IS NOT NULL AND tracking_number != \'\'');
    const orders = res.rows;
    console.log(`Found ${orders.length} orders with tracking numbers.`);
    
    if (orders.length === 0) {
        await client.end();
        return;
    }

    const trackingNumbers = orders.map(o => o.tracking_number);
    
    // 17Track API has a limit of 40 numbers per request
    const batchSize = 40;
    
    let acceptedCount = 0;
    let registeredCount = 0;
    let notRegisteredCount = 0;
    let errorCount = 0;
    
    const notRegisteredOrders = [];

    for (let i = 0; i < trackingNumbers.length; i += batchSize) {
        const batch = trackingNumbers.slice(i, i + batchSize);
        console.log(`Checking batch ${i/batchSize + 1} (${batch.length} numbers)...`);
        
        try {
            const response = await axios.post(
                'https://api.17track.net/track/v2.2/register',
                batch.map(n => ({ number: n })),
                {
                    headers: {
                        '17token': process.env.TRACK17_API_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            const data = response.data.data;
            
            if (data.accepted) {
                acceptedCount += data.accepted.length;
            }
            
            if (data.rejected) {
                for (const rejection of data.rejected) {
                    if (rejection.error.code === -18019901) {
                        // "has been registered"
                        registeredCount++;
                    } else if (rejection.error.code === -18019902) {
                         // This is usually from gettrackinfo, but just in case
                         notRegisteredCount++;
                    } else {
                        errorCount++;
                        console.log(`Other rejection for ${rejection.number}: ${rejection.error.message}`);
                    }
                }
            }
            
        } catch (e) {
            console.error(`Batch error: ${e.message}`);
        }
    }
    
    console.log('\n--- 17Track Registration Status ---');
    console.log(`Total checked: ${trackingNumbers.length}`);
    console.log(`Newly Registered (Accepted): ${acceptedCount}`);
    console.log(`Already Registered: ${registeredCount}`);
    console.log(`Errors / Unknown Rejections: ${errorCount}`);
    
    await client.end();
}
checkAll().catch(console.error);
