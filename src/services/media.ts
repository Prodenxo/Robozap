import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  downloadYouTubeAudioProxy,
  enqueueYouTubeDownload
} from './youtubeDownload'
import { ensureYtDlpCookiesFile, shouldUseYoutubeCookies } from './youtubeCookies'

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
  const sessionServer = process.env.YOUTUBE_SESSION_SERVER?.trim()
  if (!sessionServer) return null

  const urls = [
    `${sessionServer.replace(/\/$/, '')}/token`,
    `${sessionServer.replace(/\/$/, '')}/`
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
  private async searchYouTubeViaPiped (query: string): Promise<string | null> {
    const bases = [
      ...(process.env.PIPED_API_URL ?? '')
        .split(',')
        .map((value) => value.trim().replace(/\/$/, ''))
        .filter(Boolean),
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.syncpundit.io',
      'https://api-piped.mha.fi',
      'https://pipedapi.tokhmi.xyz',
      'https://piped-api.lunar.icu'
    ]

    const encoded = encodeURIComponent(query)

    for (const base of bases.slice(0, 4)) {
      try {
        const { data } = await axios.get(`${base}/search`, {
          params: { q: query, filter: 'music_songs' },
          timeout: 8000,
          headers: { 'User-Agent': 'robozap/1.0' }
        })

        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : []

        const video = items.find(
          (item: any) =>
            item?.url ||
            item?.id ||
            item?.videoId ||
            typeof item?.url === 'string'
        )

        if (!video) {
          // fallback sem filtro music
          const { data: all } = await axios.get(`${base}/search?q=${encoded}&filter=videos`, {
            timeout: 8000,
            headers: { 'User-Agent': 'robozap/1.0' }
          })
          const list = Array.isArray(all?.items) ? all.items : Array.isArray(all) ? all : []
          const first = list[0]
          if (!first) continue
          const id = first.videoId || first.id || String(first.url || '').replace(/^\//, '')
          const cleanId = String(id).replace(/^\/watch\?v=/, '').split('&')[0]
          if (cleanId && cleanId.length >= 11) {
            console.log(`[YT-SEARCH] Piped (${base}): ${cleanId}`)
            return `https://www.youtube.com/watch?v=${cleanId.slice(0, 11)}`
          }
          continue
        }

        const id =
          video.videoId ||
          video.id ||
          String(video.url || '').replace(/^\/watch\?v=/, '').split('&')[0]
        const cleanId = String(id).replace(/^\//, '')
        if (cleanId && cleanId.length >= 11) {
          console.log(`[YT-SEARCH] Piped music (${base}): ${cleanId}`)
          return `https://www.youtube.com/watch?v=${cleanId.slice(0, 11)}`
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[YT-SEARCH] Piped falhou em ${base}: ${message}`)
      }
    }

    return null
  }

  async searchYouTube (query: string): Promise<string | null> {
    const started = Date.now()

    try {
      const pipedUrl = await this.searchYouTubeViaPiped(query)
      if (pipedUrl) {
        console.log(`[YT-SEARCH] OK via Piped em ${Date.now() - started}ms`)
        return pipedUrl
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[YT-SEARCH] Piped search falhou:', message)
    }

    try {
      const results = await ytSearch(query)
      const url = results.videos.length > 0 ? results.videos[0].url : null
      console.log(`[YT-SEARCH] Fallback yt-search em ${Date.now() - started}ms → ${url || 'vazio'}`)
      return url
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[YT-SEARCH] yt-search falhou:', message)
      return null
    }
  }

  private async runYtDlp (
    url: string,
    outputPath: string,
    kind: DownloadKind
  ): Promise<void> {
    const tokens = await fetchYtSessionTokens()
    const strategies = getStrategies(tokens)
    const formatArgs = buildFormatArgs(kind)
    const cookiesFile = shouldUseYoutubeCookies() ? ensureYtDlpCookiesFile() : null
    const cookiesArg = cookiesFile ? `--cookies ${shellQuote(cookiesFile)}` : ''
    let lastError: Error | null = null

    for (const strategy of strategies) {
      const targetPath = kind === 'audio' ? outputPath + '.raw' : outputPath

      const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
      const proxyArg = proxyUrl ? `--proxy ${shellQuote(proxyUrl)}` : '';

      const command = [
        'yt-dlp',
        '--js-runtimes deno',
        proxyArg,
        cookiesArg,
        strategy.extraArgs,
        formatArgs,
        '--no-playlist',
        '--no-check-certificates',
        shellQuote(url),
        '-o',
        shellQuote(targetPath)
      ].filter(Boolean).join(' ')

      console.log(`[YT-DLP] Tentativa (${strategy.name})${cookiesFile ? ' + cookies' : ''}: ${url}`)

      try {
        await execAsync(command, { maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(targetPath)) {
          if (kind === 'audio') {
            console.log(`[YT-DLP] Sucesso no download bruto. Convertendo para MP3...`)
            const convertCommand = `ffmpeg -y -i ${shellQuote(targetPath)} -vn -acodec libmp3lame -q:a 0 ${shellQuote(outputPath)}`
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

        if (message.toLowerCase().includes('sign in') || message.toLowerCase().includes('not a bot')) {
          // continua tentando outras estratégias / cookies
        }
      }
    }

    const finalMessage = lastError?.message ?? ''
    if (
      finalMessage.toLowerCase().includes('sign in') ||
      finalMessage.toLowerCase().includes('not a bot') ||
      finalMessage.includes('error.api.youtube')
    ) {
      throw new Error('error.api.youtube.login')
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
        console.error('[MEDIA] Proxies falharam:', proxyMessage);
      }

      try {
        await this.runYtDlp(url, outputPath, 'audio');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[YT-DLP ERROR]:', message)
        if (message.includes('error.api.youtube.login')) {
          throw new Error('error.api.youtube.login')
        }
        throw new Error('error.download.failed')
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
