import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const baseUrl = process.env.EVOLUTION_API_URL?.replace(/['"]+/g, '').trim();
const apiKey = process.env.EVOLUTION_API_KEY?.replace(/['"]+/g, '').trim();
const instance = process.env.EVOLUTION_INSTANCE_NAME?.replace(/['"]+/g, '').trim();

async function test() {
    const jid = '113787038347341@s.whatsapp.net';
    const number = jid.split('@')[0];
    try {
        const url = `${baseUrl}/contact/getContact/${instance}`;
        console.log('Testing URL:', url);
        const response = await axios.post(url, {
            number: number
        }, { headers: { apikey: apiKey } });
        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

test();
