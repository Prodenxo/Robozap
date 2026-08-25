import express from 'express';
import dotenv from 'dotenv';
import { handleWebhook } from './webhooks/evolution';

dotenv.config();

import { probeCobaltHealth } from './services/youtubeDownload';

const MUSIC_BUILD = '2026-08-tocar-fastfail-v5';

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

  let cobaltOnline = false

  for (const cobaltUrl of all) {
    const probe = await probeCobaltHealth(cobaltUrl)
    if (probe.ok) {
      console.log(`[ROBOZAP] Cobalt OK em ${cobaltUrl} (${probe.detail})`)
      cobaltOnline = true
      break
    }
    console.warn(`[ROBOZAP] Cobalt falhou em ${cobaltUrl}: ${probe.detail}`)
  }

  if (!cobaltOnline) {
    console.error(
      '[ROBOZAP] Cobalt OFFLINE ou sem resposta POST — .tocar vai falhar',
      '\n→ Easypanel (mesmo projeto): COBALT_API_URL=http://cobalt:9000',
      '\n→ Apps separados: use o hostname interno do serviço cobalt',
      '\n→ yt-session quebrado (503) NÃO afeta se Cobalt tiver cookies'
    );
  }

  console.log(
    '[ROBOZAP] .tocar v4: multi-candidato + Cobalt/Piped/Invidious race + yt-dlp + blacklist'
  );
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[ROBOZAP] Server running on port ${PORT} (0.0.0.0)`);
  void logMusicBackendStatus();
  
  // Inicializa o agendador de alertas programados
  const { startAlertScheduler } = require('./services/alertScheduler');
  startAlertScheduler();
});
