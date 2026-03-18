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
app.post('/webhook/evolution', async (req, res) => {
  try {
    console.log('[ROBOZAP] Received new webhook payload');
    await handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('[ROBOZAP] Webhook Processing Error:', error);
    res.status(200).send('Webhook error handled'); // Don't let the server crash
  }
});

app.listen(PORT, () => {
  console.log(`[ROBOZAP] Server running on port ${PORT}`);
});
