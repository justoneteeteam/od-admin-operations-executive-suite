const axios = require('axios');
require('dotenv').config();

async function init() {
  const numbers = ['32300027886181001140135', '32300027886181301301397', '32300027886182101335605'];
  
  try {
    const response = await axios.post(
      'https://api.17track.net/track/v2.2/register',
      numbers.map(n => ({ number: n })),
      {
        headers: {
          '17token': process.env.TRACK17_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(JSON.stringify(response.data, null, 2));
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
init().catch(console.error);
