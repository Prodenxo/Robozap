import ytSearch from 'yt-search'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import {
  downloadYouTubeAudioProxy,
  enqueueYouTubeDownload,
  extractYouTubeVideoId,
  promiseAny
} from './youtubeDownload'
import { ensureYtDlpCookiesFile, shouldUseYoutubeCookies, ensureCobaltCookiesJson, hasValidYoutubeCookies } from './youtubeCookies'

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

  if (tokens?.poToken && tokens?.visitorData) {
    strategies.push({
      name: 'po_token+web',
      extraArgs: `--extractor-args "youtube:player_client=web;po_token=web+${tokens.poToken};visitor_data=${tokens.visitorData}"`
    })
  }

  // Poucas estratégias rápidas — sem ficar 7 minutos testando cliente
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
      extraArgs: '--extractor-args "youtube:player_client=tv,tv_embedded"'
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

  /** Busca rápida: yt-search primeiro; Piped/Invidious só se precisar. */
  async searchYouTubeCandidates (query: string, limit = 3): Promise<string[]> {
    const started = Date.now()
    const results: string[] = []

    try {
      const yt = await Promise.race([
        ytSearch(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('yt-search timeout')), 8000)
        )
      ])
      for (const video of yt.videos || []) {
        pushUnique(results, normalizeCandidateUrl(video.url || video.videoId))
        if (results.length >= limit) break
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[YT-SEARCH] yt-search falhou:', message)
    }

    if (results.length < limit) {
      const extras = await Promise.race([
        Promise.all([
          this.searchViaPiped(query, limit),
          this.searchViaInvidious(query, limit)
        ]).then(([a, b]) => [...a, ...b]),
        new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 5000))
      ])

      for (const url of extras) {
        pushUnique(results, url)
        if (results.length >= limit) break
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
    // Sempre materializa cookies do env antes
    ensureCobaltCookiesJson()
    const tokens = await fetchYtSessionTokens()
    const strategies = getStrategies(tokens)
    const formatArgs = buildFormatArgs(kind)
    const cookiesFile = shouldUseYoutubeCookies() ? ensureYtDlpCookiesFile() : null
    const cookiesArg = cookiesFile ? `--cookies ${shellQuote(cookiesFile)}` : ''
    const proxyUrl = (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '').trim()
    const proxyArg = proxyUrl ? `--proxy ${shellQuote(proxyUrl)}` : ''

    console.log(
      `[YT-DLP] Setup: cookies=${cookiesFile ? 'SIM' : 'NÃO'} | proxy=${proxyUrl ? 'SIM' : 'NÃO'} | session=${tokens ? 'SIM' : 'NÃO'}`
    )

    if (!cookiesFile && !tokens) {
      console.warn('[YT-DLP] Sem cookies e sem yt-session — YouTube provavelmente vai bloquear')
    }

    let lastError: Error | null = null
    await maybeUpdateYtDlp()

    for (const strategy of strategies) {
      const outTemplate = kind === 'audio'
        ? shellQuote(outputPath.replace(/\.mp3$/i, '') + '.%(ext)s')
        : shellQuote(outputPath)

      const command = [
        'yt-dlp',
        '--js-runtimes', 'deno',
        '--no-playlist',
        '--no-check-certificates',
        '--geo-bypass',
        '--retries', '2',
        '--fragment-retries', '2',
        '--socket-timeout', '20',
        proxyArg,
        cookiesArg,
        strategy.extraArgs,
        formatArgs,
        shellQuote(url),
        '-o',
        outTemplate
      ].filter(Boolean).join(' ')

      console.log(
        `[YT-DLP] Tentativa (${strategy.name})${cookiesFile ? ' +cookies' : ''}${proxyUrl ? ' +proxy' : ''}: ${url}`
      )

      try {
        const { stderr } = await execAsync(command, {
          maxBuffer: 12 * 1024 * 1024,
          timeout: 60000,
          env: {
            ...process.env,
            // Garante proxy também via env do processo filho
            ...(proxyUrl
              ? {
                  HTTP_PROXY: proxyUrl,
                  HTTPS_PROXY: proxyUrl,
                  http_proxy: proxyUrl,
                  https_proxy: proxyUrl
                }
              : {})
          }
        })

        if (stderr) {
          const hint = stderr.split('\n').filter(Boolean).slice(-3).join(' | ')
          if (hint) console.log(`[YT-DLP] stderr: ${hint.slice(0, 400)}`)
        }

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
   * Com cookies/proxy: yt-dlp PRIMEIRO (caminho que funciona no teu setup).
   * Sem isso: proxies públicos + yt-dlp em paralelo.
   */
  async downloadMusic (
    urlOrCandidates: string | string[],
    outputPath: string
  ): Promise<string> {
    const candidates = (Array.isArray(urlOrCandidates)
      ? urlOrCandidates
      : [urlOrCandidates]).slice(0, 2)

    return enqueueYouTubeDownload(async () => {
      const errors: string[] = []
      ensureCobaltCookiesJson()
      const hasCookies = hasValidYoutubeCookies() && shouldUseYoutubeCookies()
      const hasProxy = Boolean((process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '').trim())
      const preferYtDlp = hasCookies || hasProxy

      console.log(`[MEDIA] Estratégia: preferYtDlp=${preferYtDlp} cookies=${hasCookies} proxy=${hasProxy}`)

      for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i]
        console.log(`[MEDIA] Candidato ${i + 1}/${candidates.length}: ${url}`)

        const proxyTemp = `${outputPath}.proxy.${i}.tmp`
        const ytdlpTemp = `${outputPath}.ytdlp.${i}.tmp`

        try {
          if (preferYtDlp) {
            // Caminho principal: yt-dlp com cookies + proxy residencial
            try {
              await this.runYtDlp(url, ytdlpTemp, 'audio')
              if (fs.existsSync(ytdlpTemp) && fs.statSync(ytdlpTemp).size >= 8192) {
                if (fs.existsSync(outputPath)) safeUnlink(outputPath)
                fs.renameSync(ytdlpTemp, outputPath)
                console.log(`[MEDIA] Áudio OK via yt-dlp (candidato ${i + 1})`)
                return url
              }
            } catch (ytdlpError: unknown) {
              const message = ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError)
              console.error(`[MEDIA] yt-dlp falhou, tentando proxies:`, message.slice(0, 300))
              errors.push(`ytdlp[${i}]: ${message}`)
            }

            try {
              await downloadYouTubeAudioProxy(url, proxyTemp)
              if (fs.existsSync(proxyTemp) && fs.statSync(proxyTemp).size >= 8192) {
                if (fs.existsSync(outputPath)) safeUnlink(outputPath)
                fs.renameSync(proxyTemp, outputPath)
                console.log(`[MEDIA] Áudio OK via proxy (candidato ${i + 1})`)
                return url
              }
            } catch (proxyError: unknown) {
              const message = proxyError instanceof Error ? proxyError.message : String(proxyError)
              errors.push(`proxy[${i}]: ${message}`)
            }
          } else {
            const winner = await promiseAny([
              downloadYouTubeAudioProxy(url, proxyTemp).then(() => 'proxy' as const),
              this.runYtDlp(url, ytdlpTemp, 'audio').then(() => 'ytdlp' as const)
            ])

            const source = winner === 'proxy' ? proxyTemp : ytdlpTemp
            const other = winner === 'proxy' ? ytdlpTemp : proxyTemp

            if (!fs.existsSync(source) || fs.statSync(source).size < 8192) {
              throw new Error('Arquivo inválido após download')
            }

            if (fs.existsSync(outputPath)) safeUnlink(outputPath)
            fs.renameSync(source, outputPath)
            safeUnlink(other)
            console.log(`[MEDIA] Áudio OK via ${winner} (candidato ${i + 1})`)
            return url
          }

          throw new Error(errors[errors.length - 1] || 'download falhou')
        } catch (error: unknown) {
          safeUnlink(proxyTemp)
          safeUnlink(ytdlpTemp)
          safeUnlink(outputPath)

          const message = error instanceof Error ? error.message : String(error)
          console.error(`[MEDIA] Candidato ${i + 1} falhou:`, message.slice(0, 400))
          errors.push(`c${i}: ${message}`)
        }
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
