import './proxyBootstrap'
import express from 'express'
import dotenv from 'dotenv'
import { handleWebhook } from './webhooks/evolution'

dotenv.config()

// Garante de novo após dotenv (caso .env reinsira HTTP_PROXY)
import './proxyBootstrap'

import { probeCobaltHealth } from './services/youtubeDownload'
import {
  ensureCobaltCookiesJson,
  ensureYtDlpCookiesFile,
  shouldUseYoutubeCookies,
  hasValidYoutubeCookies
} from './services/youtubeCookies'
import { getYtDlpProxyUrl } from './proxyBootstrap'

const MUSIC_BUILD = '2026-08-tocar-noproxy-v9'

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

  // Materializa cookies do env → cookies.json + netscape pro yt-dlp
  const jsonPath = ensureCobaltCookiesJson()
  const netscapePath = shouldUseYoutubeCookies() ? ensureYtDlpCookiesFile() : null
  console.log(
    `[ROBOZAP] Cookies YouTube: ${hasValidYoutubeCookies() ? 'SIM' : 'NÃO'} | ` +
    `usar=${shouldUseYoutubeCookies()} | json=${jsonPath || 'none'} | ytdlp=${netscapePath || 'none'}`
  )

  if (getYtDlpProxyUrl()) {
    console.log('[ROBOZAP] Proxy guardado só pro yt-dlp (WhatsApp/Evolution SEM proxy)')
  } else {
    console.log('[ROBOZAP] Sem proxy — WhatsApp/Evolution direto; yt-dlp com cookies')
  }

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
      '[ROBOZAP] Cobalt OFFLINE ou sem resposta POST',
      '\n→ COBALT_API_URL=http://cobalt:9000',
      '\n→ Com cookies no env, o yt-dlp ainda pode salvar o .tocar'
    );
  }

  console.log(
    '[ROBOZAP] .tocar v6: cookies env + yt-session + proxy + fail-fast'
  );
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[ROBOZAP] Server running on port ${PORT} (0.0.0.0)`);
  void logMusicBackendStatus();
  
  // Inicializa o agendador de alertas programados
  const { startAlertScheduler } = require('./services/alertScheduler');
  startAlertScheduler();
});
