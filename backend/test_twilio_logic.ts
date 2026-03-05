import 'dotenv/config';
import { Client } from 'pg';
import axios from 'axios';
import * as qs from 'querystring';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('--- TWILIO WEBHOOK LOGIC TESTS ---');

    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres.guovwqrxqqdrtfjwbyzn:eHnZFTCbdZ72eAmO@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    });
    await client.connect();

    // 1. Get an order ID
    const res = await client.query(`SELECT id FROM orders WHERE status != 'Cancelled' LIMIT 1`);
    if (res.rows.length === 0) {
        console.error('No valid order found in DB to test.');
        process.exit(1);
    }
    const orderId = res.rows[0].id;
    console.log(`Using Order ID: ${orderId}`);

    // Test 1: Digits=1 -> Confirm
    console.log('\n[Test 1] POST /twilio/process-response (Digits=1) -> Should Confirm');
    try {
        const resConfirm = await axios.post(
            `${BASE_URL}/twilio/process-response?orderId=${orderId}&scriptType=short`,
            qs.stringify({ Digits: '1' }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log('TwiML Response:\n', resConfirm.data);
    } catch (err: any) {
        console.error('Error in Test 1:', err.message);
    }

    // Reload order to check status
    let resOrder = await client.query(`SELECT status, confirmation_status FROM orders WHERE id = $1`, [orderId]);
    let updatedOrder = resOrder.rows[0];
    console.log(`DB confirmationStatus: ${updatedOrder?.confirmation_status}`);

    // Test 2: Digits=2 -> Cancel
    console.log('\n[Test 2] POST /twilio/process-response (Digits=2) -> Should Decline/Cancel');
    try {
        const resCancel = await axios.post(
            `${BASE_URL}/twilio/process-response?orderId=${orderId}&scriptType=short`,
            qs.stringify({ Digits: '2' }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log('TwiML Response:\n', resCancel.data);
    } catch (err: any) {
        console.error('Error in Test 2:', err.message);
    }

    resOrder = await client.query(`SELECT status, confirmation_status FROM orders WHERE id = $1`, [orderId]);
    updatedOrder = resOrder.rows[0];
    console.log(`DB confirmationStatus: ${updatedOrder?.confirmation_status}`);
    console.log(`DB orderStatus: ${updatedOrder?.status}`);

    // Test 3: Unclear speech -> Forward
    console.log('\n[Test 3] POST /twilio/process-response (No digits, low confidence/unclear speech) -> Forward to call center');
    try {
        const resUnclear = await axios.post(
            `${BASE_URL}/twilio/process-response?orderId=${orderId}&scriptType=short`,
            qs.stringify({ SpeechResult: 'hello?', Confidence: '0.1' }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log('TwiML Response:\n', resUnclear.data);
    } catch (err: any) {
        console.error('Error in Test 3:', err.message);
    }

    // Fallback to Spanish (es-ES)
    console.log('\n[Test 4] POST /twilio/call-script?language=es-ES (Spanish)');
    try {
        const resEs = await axios.post(
            `${BASE_URL}/twilio/call-script?orderId=${orderId}&scriptType=long&language=es-ES`
        );
        console.log('TwiML Response:\n', resEs.data);
    } catch (err: any) {
        console.error('Error in Test 4:', err.message);
    }

    // Fallback to Italian (it-IT)
    console.log('\n[Test 5] POST /twilio/call-script?language=it-IT (Italian)');
    try {
        const resIt = await axios.post(
            `${BASE_URL}/twilio/call-script?orderId=${orderId}&scriptType=long&language=it-IT`
        );
        console.log('TwiML Response:\n', resIt.data);
    } catch (err: any) {
        console.error('Error in Test 5:', err.message);
    }
    await client.end();
    console.log('\n--- TESTS COMPLETED ---');
}

runTests();
