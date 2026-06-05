import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
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

function ensureCookiesFile (): string | null {
  try {
    const fromEnv = process.env.YOUTUBE_COOKIES_PATH?.trim()
    if (fromEnv && fs.existsSync(fromEnv) && fs.statSync(fromEnv).size > 0) {
      return fromEnv
    }

    const cookiesTxtPath = path.join(process.cwd(), 'cookies.txt')

    // 1. Verificar se os cookies foram passados diretamente por variável de ambiente YOUTUBE_COOKIES
    const rawCookiesEnv = process.env.YOUTUBE_COOKIES?.trim()
    if (rawCookiesEnv && rawCookiesEnv.length > 0) {
      console.log('[COOKIES] Detectada variável YOUTUBE_COOKIES. Gerando cookies.txt...')
      const lines = [
        '# Netscape HTTP Cookie File',
        '# http://curl.haxx.se/rfc/cookie_spec.html',
        '# This is a generated file! Do not edit.',
        ''
      ]
      const parts = rawCookiesEnv.split(';')
      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const name = trimmed.substring(0, eqIdx)
        const value = trimmed.substring(eqIdx + 1)
        
        const domain = '.youtube.com'
        const flag = 'TRUE'
        const pathVal = '/'
        const secure = 'TRUE'
        const expiration = '2000000000' // Ano 2033
        
        lines.push([domain, flag, pathVal, secure, expiration, name, value].join('\t'))
      }
      fs.writeFileSync(cookiesTxtPath, lines.join('\n'), 'utf8')
      console.log('[COOKIES] cookies.txt gerado com sucesso a partir da variável YOUTUBE_COOKIES!')
      return cookiesTxtPath
    }

    // 2. Se cookies.txt já existe na raiz e tem tamanho maior que zero, retornamos ele
    if (fs.existsSync(cookiesTxtPath) && fs.statSync(cookiesTxtPath).size > 0) {
      return cookiesTxtPath
    }

    // 3. Se cookies.json existe, vamos ler e converter
    const cookiesJsonPath = path.join(process.cwd(), 'cookies.json')
    if (fs.existsSync(cookiesJsonPath)) {
      console.log('[COOKIES] Encontrado cookies.json. Iniciando conversão para formato Netscape...')
      const content = fs.readFileSync(cookiesJsonPath, 'utf8')
      const data = JSON.parse(content)
      const youtubeData = data?.youtube
      let cookieStr = ''
      
      if (Array.isArray(youtubeData)) {
        cookieStr = youtubeData[0] || ''
      } else if (typeof youtubeData === 'string') {
        cookieStr = youtubeData
      }

      if (cookieStr && cookieStr.trim().length > 0) {
        const lines = [
          '# Netscape HTTP Cookie File',
          '# http://curl.haxx.se/rfc/cookie_spec.html',
          '# This is a generated file! Do not edit.',
          ''
        ]
        const parts = cookieStr.split(';')
        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx === -1) continue
          const name = trimmed.substring(0, eqIdx)
          const value = trimmed.substring(eqIdx + 1)
          
          const domain = '.youtube.com'
          const flag = 'TRUE'
          const pathVal = '/'
          const secure = 'TRUE'
          const expiration = '2000000000' // Ano 2033
          
          lines.push([domain, flag, pathVal, secure, expiration, name, value].join('\t'))
        }
        
        fs.writeFileSync(cookiesTxtPath, lines.join('\n'), 'utf8')
        console.log('[COOKIES] Convertido cookies.json para cookies.txt com sucesso!')
        return cookiesTxtPath
      } else {
        console.warn('[COOKIES] O cookies.json foi encontrado, mas a chave "youtube" estava vazia ou inválida.')
      }
    }
  } catch (error) {
    console.error('[COOKIES] Erro ao obter cookies:', error)
  }

  return null
}

function getCookiesPath (): string | null {
  if (process.env.YOUTUBE_USE_COOKIES === 'false') {
    return null
  }
  return ensureCookiesFile()
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

      const proxyArg = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
        ? `--proxy ${shellQuote(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '')}`
        : ''

      const command = [
        'yt-dlp',
        '--js-runtimes deno',
        proxyArg,
        strategy.extraArgs,
        formatArgs,
        '--no-playlist',
        '--no-check-certificates',
        shellQuote(url),
        '-o',
        shellQuote(outputPath)
      ].filter(Boolean).join(' ')

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
    return enqueueYouTubeDownload(async () => {
      try {
        console.log('[MEDIA] Baixando áudio (Cobalt/Piped/ytdl-core)...');
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
