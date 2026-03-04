import 'dotenv/config';
import { Client } from 'pg';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('--- TWILIO DEDUP / SKIP TESTS ---');

    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres.guovwqrxqqdrtfjwbyzn:eHnZFTCbdZ72eAmO@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    });
    await client.connect();

    // 1. Get an active order
    const resOrder = await client.query(`SELECT id, confirmation_status FROM orders WHERE status != 'Cancelled' LIMIT 1`);
    if (resOrder.rows.length === 0) {
        console.error('No valid order found in DB to test.');
        process.exit(1);
    }

    const orderId = resOrder.rows[0].id;
    const originalStatus = resOrder.rows[0].confirmation_status;
    console.log(`Using Order ID: ${orderId}`);

    // Test 1: Order is already Confirmed
    console.log('\n[Test 1] Order is already finalized (Confirmed)');
    await client.query(`UPDATE orders SET confirmation_status = 'Confirmed' WHERE id = $1`, [orderId]);

    try {
        await axios.post(`${BASE_URL}/twilio/test-call?orderId=${orderId}&scriptType=short`);
    } catch (e: any) { console.error(e.message); }

    let logRes = await client.query(`SELECT call_status, skip_reason FROM call_logs WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]);
    console.log(`Resulting Call Status: ${logRes.rows[0]?.call_status}`);
    console.log(`Skip Reason: ${logRes.rows[0]?.skip_reason}`);

    // Test 2: Max Attempts
    console.log('\n[Test 2] Order is pending but Max Attempts Reached');
    await client.query(`UPDATE orders SET confirmation_status = 'Pending' WHERE id = $1`, [orderId]);

    const mockDate = new Date().toISOString();
    await client.query(`
    INSERT INTO call_logs (order_id, call_sid, attempt_number, call_status, script_type) 
    VALUES 
    ($1, 'MOCK-1', 1, 'failed', 'short'),
    ($1, 'MOCK-2', 2, 'failed', 'short'),
    ($1, 'MOCK-3', 3, 'failed', 'short')
  `, [orderId]);

    try {
        await axios.post(`${BASE_URL}/twilio/test-call?orderId=${orderId}&scriptType=short`);
    } catch (e: any) { console.error(e.message); }

    logRes = await client.query(`SELECT call_status, skip_reason FROM call_logs WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]);
    console.log(`Resulting Call Status: ${logRes.rows[0]?.call_status}`);
    console.log(`Skip Reason: ${logRes.rows[0]?.skip_reason}`);

    // Restore
    await client.query(`UPDATE orders SET confirmation_status = $1 WHERE id = $2`, [originalStatus, orderId]);
    await client.query(`DELETE FROM call_logs WHERE call_sid LIKE 'MOCK-%'`);

    console.log('\n--- TESTS COMPLETED ---');
    await client.end();
}

runTests().catch(console.error);
