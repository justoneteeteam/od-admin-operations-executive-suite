const { Client } = require('pg');
require('dotenv').config();

async function getTracking() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query('SELECT order_number, tracking_number FROM orders WHERE order_number LIKE \'%1524%\'');
    console.log(res.rows);
    await client.end();
}
getTracking().catch(console.error);
