const { Client } = require('pg');
require('dotenv').config();

async function getHistory() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query('SELECT o."order_number", th."status", th."substatus", th."description", th."created_at" FROM "tracking_history" th JOIN "orders" o ON th."order_id" = o."id" WHERE o."order_number" IN (\'#1511\', \'#1512\', \'#1513\') OR o."order_number" IN (\'1511\', \'1512\', \'1513\') ORDER BY o."order_number", th."created_at" ASC');
    console.log(JSON.stringify(res.rows, null, 2));

    const check = await client.query('SELECT order_number, tracking_number FROM orders WHERE order_number IN (\'#1511\', \'#1512\', \'#1513\')');
    console.log("Check orders:", JSON.stringify(check.rows, null, 2));

    await client.end();
}
getHistory().catch(console.error);
