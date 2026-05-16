import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { downloadYouTubeAudioProxy } from './youtubeDownload';

const execAsync = promisify(exec)

type DownloadKind = 'audio' | 'video'

interface YtDlpStrategy {
  name: string
  extraArgs: string
}

function getCookiesPath (): string | null {
  const fromEnv = process.env.YOUTUBE_COOKIES_PATH?.trim()
  const candidates = [
    fromEnv,
    path.join(process.cwd(), 'cookies.txt')
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
      return candidate
    }
  }

  return null
}

function shellQuote (value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildFormatArgs (kind: DownloadKind): string {
  if (kind === 'audio') {
    return '-f "bestaudio/best" -x --audio-format mp3 --audio-quality 0'
  }
  return '-f "bestvideo+bestaudio/best" --merge-output-format mp4'
}

function getStrategies (cookiesPath: string | null): YtDlpStrategy[] {
  const strategies: YtDlpStrategy[] = []

  if (cookiesPath) {
    strategies.push({
      name: 'cookies+deno',
      extraArgs: `--cookies ${shellQuote(cookiesPath)}`
    })
  }

  strategies.push(
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
    }
  )

  return strategies
}

function isInvalidCookiesError (message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('cookies are no longer valid') ||
    lower.includes('sign in to confirm') ||
    lower.includes('use --cookies-from-browser')
  )
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
    const cookiesPath = getCookiesPath()
    const strategies = getStrategies(cookiesPath)
    const formatArgs = buildFormatArgs(kind)
    let lastError: Error | null = null
    let skipCookies = false

    for (const strategy of strategies) {
      if (skipCookies && strategy.extraArgs.includes('--cookies')) {
        continue
      }

      const command = [
        'yt-dlp',
        '--js-runtimes deno',
        strategy.extraArgs,
        formatArgs,
        '--no-playlist',
        '--no-check-certificates',
        shellQuote(url),
        '-o',
        shellQuote(outputPath)
      ].join(' ')

      console.log(`[YT-DLP] Tentativa (${strategy.name}): ${url}`)

      try {
        await execAsync(command, { maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(outputPath)) {
          console.log(`[YT-DLP] Sucesso com estratégia: ${strategy.name}`)
          return
        }

        lastError = new Error('O arquivo não foi gerado após o download.')
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error)
        console.error(`[YT-DLP] Falha (${strategy.name}):`, message)
        lastError = error instanceof Error ? error : new Error(message)

        if (
          cookiesPath &&
          strategy.extraArgs.includes('--cookies') &&
          isInvalidCookiesError(message)
        ) {
          skipCookies = true
          console.warn(
            '[YT-DLP] cookies.txt inválido ou expirado. Atualize o arquivo e tente de novo. Tentando sem cookies...'
          )
        }
      }
    }

    throw lastError ?? new Error('Não foi possível baixar o conteúdo do YouTube.')
  }

  async downloadMusic (url: string, outputPath: string): Promise<void> {
    try {
      console.log('[MEDIA] Baixando áudio via Piped/Invidious (sem cookies)...');
      await downloadYouTubeAudioProxy(url, outputPath);
      return;
    } catch (proxyError: unknown) {
      const proxyMessage =
        proxyError instanceof Error ? proxyError.message : String(proxyError);
      console.warn('[MEDIA] Proxy falhou, tentando yt-dlp:', proxyMessage);
    }

    try {
      await this.runYtDlp(url, outputPath, 'audio');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[YT-DLP ERROR]:', message);
      throw new Error(
        'Não consegui baixar o áudio agora. Tenta de novo em alguns minutos ou manda o link direto do YouTube.'
      );
    }
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
