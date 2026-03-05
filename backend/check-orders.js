const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    await client.connect();

    const res = await client.query('SELECT o."order_number", th."status", th."substatus", th."description", th."created_at" FROM "tracking_history" th JOIN "orders" o ON th."order_id" = o."id" WHERE o."order_number" LIKE \'%1524%\' ORDER BY th."created_at" ASC');
    console.log(JSON.stringify(res.rows, null, 2));

    await client.end();
}

check().catch(console.error);
