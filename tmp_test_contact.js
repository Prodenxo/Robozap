const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Basic env parsing
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key) env[key.trim()] = val.join('=').replace(/['"]+/g, '').trim();
});

const baseUrl = env.EVOLUTION_API_URL;
const apiKey = env.EVOLUTION_API_KEY;
const instance = env.EVOLUTION_INSTANCE_NAME;

async function test() {
    const jid = '113787038347341@s.whatsapp.net';
    const number = jid.split('@')[0];
    try {
        const url = `${baseUrl}/contact/checkNumber/${instance}`;
        console.log('Testing URL (checkNumber):', url);
        const response = await axios.post(url, {
            numbers: [number]
        }, { headers: { apikey: apiKey } });
        console.log('Response:', JSON.stringify(response.data, null, 2));

        const url2 = `${baseUrl}/contact/getContact/${instance}`;
        console.log('\nTesting URL (getContact):', url2);
        const response2 = await axios.post(url2, {
            number: number
        }, { headers: { apikey: apiKey } });
        console.log('Response:', JSON.stringify(response2.data, null, 2));

    } catch (e) {
        console.error('Error:', e.response?.data || e.message);
    }
}

test();
