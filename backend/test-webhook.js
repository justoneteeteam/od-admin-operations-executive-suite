const axios = require('axios');

const endpoint = 'http://localhost:3000/tracking/webhook';

const inTransitPayload = {
    event: 'TRACKING_UPDATED',
    data: {
        number: '32300027886184201251908',
        track_info: {
            latest_status: { status: 'Transit', sub_status: 'InTransit_Arrival' },
            latest_event: { description: 'Arrived at hub', location: 'Hub', time_utc: new Date().toISOString() }
        }
    }
};

const pickUpPayload = {
    event: 'TRACKING_UPDATED',
    data: {
        number: '32300027886184201251908',
        track_info: {
            latest_status: { status: 'OutForDelivery', sub_status: 'OutForDelivery_Other' },
            latest_event: { description: 'Out for delivery', location: 'Local', time_utc: new Date().toISOString() }
        }
    }
};

async function testWebhook() {
    try {
        console.log('Sending first InTransit_Arrival webhook...');
        await axios.post(endpoint, inTransitPayload);
        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Done.');

        console.log('Sending first PickUp webhook...');
        await axios.post(endpoint, pickUpPayload);
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Done. (SMS should have sent)');

        console.log('Sending second PickUp webhook...');
        await axios.post(endpoint, pickUpPayload);
        console.log('Done. (SMS should be skipped)');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testWebhook().catch(console.error);
