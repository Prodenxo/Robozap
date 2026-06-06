import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  downloadYouTubeAudioProxy,
  enqueueYouTubeDownload
} from './youtubeDownload';

const execAsync = promisify(exec)

type DownloadKind = 'audio' | 'video'

interface YtDlpStrategy {
  name: string
  extraArgs: string
}

interface YtSessionResponse {
  poToken?: string;
  po_token?: string;
  visitorData?: string;
  visitor_data?: string;
}

async function fetchYtSessionTokens(): Promise<{ poToken: string; visitorData: string } | null> {
  const urls = [
    'http://yt-session:8080/token',
    'http://yt-session:8080/'
  ];

  for (const url of urls) {
    try {
      console.log(`[YT-SESSION] Tentando obter session tokens de: ${url}`);
      const response = await axios.get<YtSessionResponse>(url, { timeout: 3000 });
      const poToken = response.data?.poToken || response.data?.po_token;
      const visitorData = response.data?.visitorData || response.data?.visitor_data;

      if (poToken && visitorData) {
        console.log('[YT-SESSION] Session tokens obtidos com sucesso!');
        return { poToken, visitorData };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[YT-SESSION] Falha ao obter tokens em ${url}: ${msg}`);
    }
  }

  return null;
}

function shellQuote (value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildFormatArgs (kind: DownloadKind): string {
  if (kind === 'audio') {
    return '-f "bestaudio/best"'
  }
  return '-f "bestvideo+bestaudio/best" --merge-output-format mp4'
}

function getStrategies (tokens: { poToken: string; visitorData: string } | null): YtDlpStrategy[] {
  const strategies: YtDlpStrategy[] = []

  if (tokens?.poToken && tokens?.visitorData) {
    strategies.push({
      name: 'po_token+web',
      extraArgs: `--extractor-args "youtube:player_client=web;po_token=web+${tokens.poToken};visitor_data=${tokens.visitorData}"`
    })
    strategies.push({
      name: 'po_token+web_embedded',
      extraArgs: `--extractor-args "youtube:player_client=web_embedded;po_token=web+${tokens.poToken};visitor_data=${tokens.visitorData}"`
    })
  }

  strategies.push(
    {
      name: 'web_embedded',
      extraArgs: '--extractor-args "youtube:player_client=web_embedded"'
    },
    {
      name: 'web_safari',
      extraArgs: '--extractor-args "youtube:player_client=web_safari"'
    },
    {
      name: 'android_vr',
      extraArgs: '--extractor-args "youtube:player_client=android_vr,web"'
    },
    {
      name: 'tv_embedded',
      extraArgs: '--extractor-args "youtube:player_client=tv_embedded,web"'
    },
    {
      name: 'ios',
      extraArgs: '--extractor-args "youtube:player_client=ios,web"'
    },
    {
      name: 'default_sans_sdkless',
      extraArgs: '--extractor-args "youtube:player_client=default,-android_sdkless"'
    }
  )

  return strategies
}

export class MediaService {
  async searchYouTube (query: string): Promise<string | null> {
    const results = await ytSearch(query)
    return results.videos.length > 0 ? results.videos[0].url : null
  }

  private async runYtDlp (
    url: string,
    outputPath: string,
    kind: DownloadKind
  ): Promise<void> {
    const tokens = await fetchYtSessionTokens()
    const strategies = getStrategies(tokens)
    const formatArgs = buildFormatArgs(kind)
    let lastError: Error | null = null

    for (const strategy of strategies) {
      const targetPath = kind === 'audio' ? outputPath + '.raw' : outputPath

      const command = [
        'yt-dlp',
        '--js-runtimes deno',
        strategy.extraArgs,
        formatArgs,
        '--no-playlist',
        '--no-check-certificates',
        shellQuote(url),
        '-o',
        shellQuote(targetPath)
      ].filter(Boolean).join(' ')

      console.log(`[YT-DLP] Tentativa (${strategy.name}): ${url}`)

      try {
        await execAsync(command, { maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(targetPath)) {
          if (kind === 'audio') {
            console.log(`[YT-DLP] Sucesso no download bruto. Convertendo para MP3...`)
            const convertCommand = `ffmpeg -y -i ${shellQuote(targetPath)} -vn -acodec libmp3lame -q:a 2 ${shellQuote(outputPath)}`
            await execAsync(convertCommand)
            
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath)
            }
          }

          console.log(`[YT-DLP] Sucesso com estratégia: ${strategy.name}`)
          return
        }

        lastError = new Error('O arquivo não foi gerado após o download.')
      } catch (error: unknown) {
        if (kind === 'audio' && fs.existsSync(targetPath)) {
          try { fs.unlinkSync(targetPath) } catch {}
        }

        const message =
          error instanceof Error ? error.message : String(error)
        console.error(`[YT-DLP] Falha (${strategy.name}):`, message)
        lastError = error instanceof Error ? error : new Error(message)
      }
    }

    throw lastError ?? new Error('Não foi possível baixar o conteúdo do YouTube.')
  }

  async downloadMusic (url: string, outputPath: string): Promise<void> {
    return enqueueYouTubeDownload(async () => {
      try {
        console.log('[MEDIA] Baixando áudio (Cobalt/Piped/Invidious)...');
        await downloadYouTubeAudioProxy(url, outputPath);
        return;
      } catch (proxyError: unknown) {
        const proxyMessage =
          proxyError instanceof Error ? proxyError.message : String(proxyError);
        console.warn('[MEDIA] Proxies falharam, tentando yt-dlp:', proxyMessage);
      }

      try {
        await this.runYtDlp(url, outputPath, 'audio');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[YT-DLP ERROR]:', message);
        throw new Error(
          'Não consegui baixar o áudio. Suba o Cobalt (porta 9000) e aponte COBALT_API_URL, ou tente de novo.'
        );
      }
    });
  }

  async downloadVideo (url: string, outputPath: string): Promise<void> {
    try {
      console.log(`[YT-DLP] Downloading Video: ${url}`)
      await this.runYtDlp(url, outputPath, 'video')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[YT-DLP VIDEO ERROR]:', message)
      throw new Error('Erro ao baixar vídeo. Pode ser link privado, bloqueado ou cookies expirados.')
    }
  }
}
