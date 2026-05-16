import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { handleWebhook } from './webhooks/evolution';

dotenv.config();

const MUSIC_BUILD = '2026-05-cobalt';

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

async function logMusicBackendStatus (): Promise<void> {
  console.log(`[ROBOZAP] Music build: ${MUSIC_BUILD}`);
  const cobaltUrl = process.env.COBALT_API_URL?.trim();

  if (!cobaltUrl) {
    console.warn(
      '[ROBOZAP] COBALT_API_URL ausente — .tocar usará Piped (instável). Use docker compose com o serviço cobalt.'
    );
    return;
  }

  console.log(`[ROBOZAP] COBALT_API_URL=${cobaltUrl}`);

  try {
    const { data } = await axios.get(cobaltUrl.replace(/\/$/, ''), {
      timeout: 8000
    });
    const version = data?.cobalt?.version ?? 'ok';
    console.log(`[ROBOZAP] Cobalt online (versão ${version})`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ROBOZAP] Cobalt INACESSÍVEL em ${cobaltUrl}: ${message}`,
      '\n→ Suba com: docker compose up -d',
      '\n→ Robozap e Cobalt precisam estar na MESMA rede Docker.'
    );
  }
}

app.listen(PORT, () => {
  console.log(`[ROBOZAP] Server running on port ${PORT}`);
  void logMusicBackendStatus();
});
