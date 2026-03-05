const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query("SELECT * FROM tracking_history ORDER BY status_date DESC LIMIT 5");
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}
check().catch(console.error);
