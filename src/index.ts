import express from 'express';
import dotenv from 'dotenv';
import { handleWebhook } from './webhooks/evolution';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'online', bot: 'RoboZap' });
});

// Evolution API Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => {
  console.log(`[ROBOZAP] Server running on port ${PORT}`);
});
