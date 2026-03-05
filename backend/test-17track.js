const axios = require('axios');

async function test17Track() {
    const apiKey = '22912DAE08EE8A630DDEF533ECDEA903';
    // Using a dummy tracking number for testing
    const trackingNumber = 'TEST_TRACKING_12345';
    
    console.log(`Testing 17Track API with Key: ${apiKey.substring(0, 5)}...`);
    console.log(`Payload: { number: '${trackingNumber}' }`);

    try {
        const response = await axios.post(
            'https://api.17track.net/track/v2.2/register',
            [{ number: trackingNumber }],
            {
                headers: {
                    '17token': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('\n--- 17TRACK RESPONSE ---');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('\n--- TEST FAILED ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

test17Track();
