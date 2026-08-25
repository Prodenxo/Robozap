import ytSearch from 'yt-search'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import {
  downloadYouTubeAudioProxy,
  enqueueYouTubeDownload,
  extractYouTubeVideoId
} from './youtubeDownload'
import { ensureYtDlpCookiesFile, shouldUseYoutubeCookies } from './youtubeCookies'

const execAsync = promisify(exec)

type DownloadKind = 'audio' | 'video'

interface YtDlpStrategy {
  name: string
  extraArgs: string
}

interface YtSessionResponse {
  poToken?: string
  po_token?: string
  visitorData?: string
  visitor_data?: string
}

async function fetchYtSessionTokens (): Promise<{ poToken: string, visitorData: string } | null> {
  const sessionServer = process.env.YOUTUBE_SESSION_SERVER?.trim()
  if (!sessionServer) return null

  const urls = [
    `${sessionServer.replace(/\/$/, '')}/token`,
    `${sessionServer.replace(/\/$/, '')}/`
  ]

  for (const url of urls) {
    try {
      console.log(`[YT-SESSION] Tentando tokens: ${url}`)
      const response = await axios.get<YtSessionResponse>(url, { timeout: 4000 })
      const poToken = response.data?.poToken || response.data?.po_token
      const visitorData = response.data?.visitorData || response.data?.visitor_data

      if (poToken && visitorData) {
        console.log('[YT-SESSION] Tokens OK')
        return { poToken, visitorData }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`[YT-SESSION] Falha em ${url}: ${msg}`)
    }
  }

  return null
}

function shellQuote (value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildFormatArgs (kind: DownloadKind): string {
  if (kind === 'audio') {
    return '-f "bestaudio[ext=m4a]/bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0'
  }
  return '-f "bestvideo+bestaudio/best" --merge-output-format mp4'
}

function getStrategies (tokens: { poToken: string, visitorData: string } | null): YtDlpStrategy[] {
  const strategies: YtDlpStrategy[] = []

  // Clientes que costumam funcionar SEM po_token primeiro (mais rápidos)
  strategies.push(
    {
      name: 'android',
      extraArgs: '--extractor-args "youtube:player_client=android"'
    },
    {
      name: 'ios',
      extraArgs: '--extractor-args "youtube:player_client=ios"'
    },
    {
      name: 'tv',
      extraArgs: '--extractor-args "youtube:player_client=tv"'
    },
    {
      name: 'tv_embedded',
      extraArgs: '--extractor-args "youtube:player_client=tv_embedded"'
    },
    {
      name: 'mweb',
      extraArgs: '--extractor-args "youtube:player_client=mweb"'
    }
  )

  if (tokens?.poToken && tokens?.visitorData) {
    strategies.unshift({
      name: 'po_token+web',
      extraArgs: `--extractor-args "youtube:player_client=web;po_token=web+${tokens.poToken};visitor_data=${tokens.visitorData}"`
    })
  }

  strategies.push(
    {
      name: 'web_safari',
      extraArgs: '--extractor-args "youtube:player_client=web_safari"'
    },
    {
      name: 'default',
      extraArgs: ''
    }
  )

  return strategies
}

function normalizeCandidateUrl (raw: string): string | null {
  const id = extractYouTubeVideoId(raw) || extractYouTubeVideoId(
    raw.includes('watch?v=') ? raw : `https://www.youtube.com/watch?v=${raw}`
  )
  if (!id || id.length < 11) return null
  return `https://www.youtube.com/watch?v=${id.slice(0, 11)}`
}

function pushUnique (list: string[], url: string | null): void {
  if (!url) return
  if (!list.includes(url)) list.push(url)
}

export class MediaService {
  private async searchViaPiped (query: string, limit: number): Promise<string[]> {
    const bases = [
      ...((process.env.PIPED_API_URL ?? '')
        .split(',')
        .map((value) => value.trim().replace(/\/$/, ''))
        .filter(Boolean)),
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.syncpundit.io',
      'https://api-piped.mha.fi',
      'https://pipedapi.tokhmi.xyz',
      'https://piped-api.lunar.icu',
      'https://pipedapi.adminforge.de'
    ]

    const results: string[] = []
    const filters = ['music_songs', 'videos']

    for (const base of bases.slice(0, 5)) {
      if (results.length >= limit) break

      for (const filter of filters) {
        if (results.length >= limit) break

        try {
          const { data } = await axios.get(`${base}/search`, {
            params: { q: query, filter },
            timeout: 7000,
            headers: { 'User-Agent': 'robozap/1.0' }
          })

          const items = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : []

          for (const item of items) {
            const raw =
              item?.videoId ||
              item?.id ||
              item?.url ||
              ''
            pushUnique(results, normalizeCandidateUrl(String(raw)))
            if (results.length >= limit) break
          }

          if (results.length > 0) {
            console.log(`[YT-SEARCH] Piped ${base}/${filter}: ${results.length} candidatos`)
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`[YT-SEARCH] Piped ${base} falhou: ${message}`)
        }
      }
    }

    return results
  }

  private async searchViaInvidious (query: string, limit: number): Promise<string[]> {
    const bases = [
      ...((process.env.INVIDIOUS_API_URL ?? '')
        .split(',')
        .map((value) => value.trim().replace(/\/$/, ''))
        .filter(Boolean)),
      'https://inv.nadeko.net',
      'https://yewtu.be',
      'https://invidious.nerdvpn.de',
      'https://vid.puffyan.us'
    ]

    const results: string[] = []

    for (const base of bases.slice(0, 4)) {
      if (results.length >= limit) break

      try {
        const { data } = await axios.get(`${base}/api/v1/search`, {
          params: { q: query, type: 'video' },
          timeout: 7000,
          headers: { 'User-Agent': 'robozap/1.0' }
        })

        const items = Array.isArray(data) ? data : []
        for (const item of items) {
          pushUnique(results, normalizeCandidateUrl(String(item?.videoId || item?.video_id || '')))
          if (results.length >= limit) break
        }

        if (results.length > 0) {
          console.log(`[YT-SEARCH] Invidious ${base}: ${results.length} candidatos`)
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[YT-SEARCH] Invidious ${base} falhou: ${message}`)
      }
    }

    return results
  }

  /** Retorna até N URLs candidatas (para retry se o 1º vídeo falhar no download). */
  async searchYouTubeCandidates (query: string, limit = 5): Promise<string[]> {
    const started = Date.now()
    const results: string[] = []

    const [piped, invidious] = await Promise.all([
      this.searchViaPiped(query, limit),
      this.searchViaInvidious(query, limit)
    ])

    for (const url of [...piped, ...invidious]) pushUnique(results, url)

    if (results.length < limit) {
      try {
        const yt = await ytSearch(query)
        for (const video of yt.videos || []) {
          pushUnique(results, normalizeCandidateUrl(video.url || video.videoId))
          if (results.length >= limit) break
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[YT-SEARCH] yt-search falhou:', message)
      }
    }

    console.log(
      `[YT-SEARCH] "${query}" → ${results.length} candidatos em ${Date.now() - started}ms`
    )
    return results.slice(0, limit)
  }

  async searchYouTube (query: string): Promise<string | null> {
    const candidates = await this.searchYouTubeCandidates(query, 1)
    return candidates[0] || null
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

    // Atualiza yt-dlp uma vez por processo (best-effort)
    await maybeUpdateYtDlp()

    for (const strategy of strategies) {
      const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || ''
      const proxyArg = proxyUrl ? `--proxy ${shellQuote(proxyUrl)}` : ''
      const outTemplate = kind === 'audio'
        ? shellQuote(outputPath.replace(/\.mp3$/i, '') + '.%(ext)s')
        : shellQuote(outputPath)

      const command = [
        'yt-dlp',
        '--no-playlist',
        '--no-check-certificates',
        '--geo-bypass',
        '--retries', '3',
        '--fragment-retries', '3',
        '--socket-timeout', '20',
        proxyArg,
        cookiesArg,
        strategy.extraArgs,
        formatArgs,
        shellQuote(url),
        '-o',
        outTemplate
      ].filter(Boolean).join(' ')

      console.log(`[YT-DLP] Tentativa (${strategy.name})${cookiesFile ? ' + cookies' : ''}: ${url}`)

      try {
        await execAsync(command, {
          maxBuffer: 12 * 1024 * 1024,
          timeout: 90000
        })

        if (kind === 'audio') {
          const stem = outputPath.replace(/\.mp3$/i, '')
          const dir = path.dirname(outputPath)
          const stemBase = path.basename(stem)
          const candidates = fs.readdirSync(dir)
            .filter((name) => name === `${stemBase}.mp3` || name.startsWith(`${stemBase}.`))
            .map((name) => path.join(dir, name))

          let source =
            candidates.find((file) => file.toLowerCase().endsWith('.mp3')) ||
            candidates[0]

          if (!source && fs.existsSync(outputPath)) {
            source = outputPath
          }

          if (!source) throw new Error('Arquivo não gerado pelo yt-dlp')

          if (source !== outputPath) {
            if (source.toLowerCase().endsWith('.mp3')) {
              if (fs.existsSync(outputPath)) safeUnlink(outputPath)
              fs.renameSync(source, outputPath)
            } else {
              const convertCommand = `ffmpeg -y -hide_banner -loglevel error -i ${shellQuote(source)} -vn -acodec libmp3lame -q:a 0 ${shellQuote(outputPath)}`
              await execAsync(convertCommand, { timeout: 120000 })
              safeUnlink(source)
            }
          }

          if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 8192) {
            throw new Error('MP3 inválido após yt-dlp')
          }

          console.log(`[YT-DLP] Sucesso (${strategy.name})`)
          return
        }

        if (fs.existsSync(outputPath)) {
          console.log(`[YT-DLP] Sucesso (${strategy.name})`)
          return
        }

        lastError = new Error('Arquivo não gerado após o download.')
      } catch (error: unknown) {
        try {
          const stem = outputPath.replace(/\.mp3$/i, '')
          const dir = path.dirname(outputPath)
          const stemBase = path.basename(stem)
          for (const name of fs.readdirSync(dir)) {
            if (name.startsWith(stemBase + '.')) {
              safeUnlink(path.join(dir, name))
            }
          }
        } catch { /* ignore */ }

        const message = error instanceof Error ? error.message : String(error)
        console.error(`[YT-DLP] Falha (${strategy.name}):`, message.slice(0, 300))
        lastError = error instanceof Error ? error : new Error(message)
      }
    }

    throw lastError ?? new Error('Não foi possível baixar o conteúdo do YouTube.')
  }

  /**
   * Baixa música com máxima resiliência:
   * 1) proxies (Cobalt/Piped/Invidious)
   * 2) yt-dlp
   * Se receber vários candidatos, tenta o próximo quando o atual falha.
   */
  async downloadMusic (
    urlOrCandidates: string | string[],
    outputPath: string
  ): Promise<string> {
    const candidates = Array.isArray(urlOrCandidates)
      ? urlOrCandidates
      : [urlOrCandidates]

    return enqueueYouTubeDownload(async () => {
      const errors: string[] = []

      for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i]
        console.log(`[MEDIA] Candidato ${i + 1}/${candidates.length}: ${url}`)

        try {
          await downloadYouTubeAudioProxy(url, outputPath)
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size >= 8192) {
            return url
          }
        } catch (proxyError: unknown) {
          const proxyMessage =
            proxyError instanceof Error ? proxyError.message : String(proxyError)
          console.error(`[MEDIA] Proxies falharam no candidato ${i + 1}:`, proxyMessage.slice(0, 400))
          errors.push(`proxy[${i}]: ${proxyMessage}`)
        }

        try {
          console.log(`[MEDIA] Fallback yt-dlp no candidato ${i + 1}...`)
          await this.runYtDlp(url, outputPath, 'audio')
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size >= 8192) {
            return url
          }
        } catch (ytdlpError: unknown) {
          const message =
            ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError)
          console.error(`[MEDIA] yt-dlp falhou no candidato ${i + 1}:`, message.slice(0, 400))
          errors.push(`ytdlp[${i}]: ${message}`)
        }

        safeUnlink(outputPath)
      }

      const joined = errors.join(' | ')
      if (/youtube\.login|sign in|not a bot|no_session/i.test(joined)) {
        throw new Error('error.api.youtube.login')
      }

      throw new Error(joined || 'error.download.failed')
    })
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

function safeUnlink (filePath: string): void {
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
  }
}

let ytDlpUpdatedThisProcess = false

async function maybeUpdateYtDlp (): Promise<void> {
  if (ytDlpUpdatedThisProcess) return
  ytDlpUpdatedThisProcess = true

  try {
    console.log('[YT-DLP] Atualizando yt-dlp (best-effort)...')
    await execAsync('yt-dlp -U', { timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
    console.log('[YT-DLP] Atualizado')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[YT-DLP] Não foi possível atualizar:', message.slice(0, 200))
  }
}
