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

  const cobaltCandidates = (process.env.COBALT_API_URL ?? 'http://cobalt:9000')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const all = [...new Set(cobaltCandidates)];

  for (const cobaltUrl of all) {
    try {
      const { data } = await axios.get(cobaltUrl, { timeout: 5000 });
      const version = data?.cobalt?.version ?? 'ok';
      console.log(`[ROBOZAP] Cobalt online em ${cobaltUrl} (versão ${version})`);
      return;
    } catch {
      // tenta próximo
    }
  }

  console.error(
    '[ROBOZAP] Cobalt OFFLINE — suba o container ghcr.io/imputnet/cobalt na porta 9000',
    '\n→ Docker Compose: docker compose up -d (robozap + cobalt juntos)',
    '\n→ Painel (2 apps): COBALT_API_URL=http://NOME-INTERNO-DO-COBALT:9000',
    '\n→ Mesmo servidor: COBALT_API_URL=http://127.0.0.1:9000'
  );
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[ROBOZAP] Server running on port ${PORT} (0.0.0.0)`);
  void logMusicBackendStatus();
  
  // Inicializa o agendador de alertas programados
  const { startAlertScheduler } = require('./services/alertScheduler');
  startAlertScheduler();
});
