const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: __dirname + '/.env' });

const token = jwt.sign({ sub: 'admin-id', role: 'Super Admin', email: 'admin@example.com' }, process.env.JWT_SECRET || '58cae64d-568f-47ef-ae66-405af178e3e2', { expiresIn: '1h' });

async function testFetch() {
  try {
    const res = await axios.get('http://localhost:3000/orders?skuType=sku&page=1&limit=20&sortBy=createdAt&sortOrder=desc', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Status:", res.status);
    console.log("Data length:", res.data.data ? res.data.data.length : 'none');
  } catch (err) {
    if (err.response) {
      console.error("HTTP Error:", err.response.status, err.response.data);
    } else {
      console.error("Fetch Error:", err.message);
    }
  }
}
testFetch();
