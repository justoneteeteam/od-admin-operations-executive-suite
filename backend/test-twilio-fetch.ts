import * as dotenv from 'dotenv';
dotenv.config();

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function fetchCall() {
  const callSid = 'CA4342d4032db67bb3fd287d54f12f3d32'; // Order 1501

  try {
    const call = await client.calls(callSid).fetch();
    console.log("=== Call Details ===");
    console.log(call);

    // Check if there are any recordings related to this call
    const recordings = await client.recordings.list({ callSid });
    console.log("\n=== Recordings ===");
    console.log(recordings);

    // Check notifications to see if the HTTP request to Railway is captured
    const notifications = await client.calls(callSid).notifications.list({ limit: 5 });
    console.log("\n=== Notifications/Warnings ===");
    for (const notif of notifications) {
      console.log(`Log: ${notif.log}, Message: ${notif.messageText}`);
    }
  } catch (err) {
    console.error("Error fetching Twilio data:", err);
  }
}

fetchCall();
