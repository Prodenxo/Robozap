import ytSearch from 'yt-search'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import {
  downloadYouTubeAudioProxy,
  enqueueYouTubeDownload,
  extractYouTubeVideoId
} from './youtubeDownload'
import { ensureYtDlpCookiesFile, shouldUseYoutubeCookies, ensureCobaltCookiesJson } from './youtubeCookies'
import { httpDirect, isProxyAuthError, getYtDlpProxyUrl } from './http'

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
      const response = await httpDirect.get<YtSessionResponse>(url, {
        timeout: 4000,
        proxy: false
      })
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
          const { data } = await httpDirect.get(`${base}/search`, {
            params: { q: query, filter },
            timeout: 7000,
            headers: { 'User-Agent': 'robozap/1.0' },
            proxy: false
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
        const { data } = await httpDirect.get(`${base}/api/v1/search`, {
          params: { q: query, type: 'video' },
          timeout: 7000,
          headers: { 'User-Agent': 'robozap/1.0' },
          proxy: false
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
    if (shouldUseYoutubeCookies()) ensureCobaltCookiesJson()
    const tokens = await fetchYtSessionTokens()
    const strategies = getStrategies(tokens)
    const formatArgs = buildFormatArgs(kind)
    const cookiesFile = shouldUseYoutubeCookies() ? ensureYtDlpCookiesFile() : null
    const cookiesArg = cookiesFile ? `--cookies ${shellQuote(cookiesFile)}` : ''
    const proxyUrl = getYtDlpProxyUrl()

    // Se o proxy já deu 407 nesta sessão, nem tenta de novo
    const tryProxyFirst = Boolean(proxyUrl) && !proxyAuthFailedThisProcess

    console.log(
      `[YT-DLP] Setup: cookies=${cookiesFile ? 'SIM' : 'NÃO'} | proxy=${proxyUrl ? (tryProxyFirst ? 'tentar' : 'quebrado/skip') : 'NÃO'} | session=${tokens ? 'SIM' : 'NÃO'}`
    )

    if (!cookiesFile && !tokens) {
      console.warn('[YT-DLP] Sem cookies e sem yt-session — YouTube provavelmente vai bloquear')
    }

    await maybeUpdateYtDlp()

    const modes = tryProxyFirst
      ? [{ useProxy: true, label: '+proxy' }, { useProxy: false, label: 'direto' }]
      : [{ useProxy: false, label: 'direto' }]

    let lastError: Error | null = null

    for (const mode of modes) {
      console.log(`[YT-DLP] Modo ${mode.label}`)

      for (const strategy of strategies) {
        const outTemplate = kind === 'audio'
          ? shellQuote(outputPath.replace(/\.mp3$/i, '') + '.%(ext)s')
          : shellQuote(outputPath)

        const proxyArg = mode.useProxy && proxyUrl
          ? `--proxy ${shellQuote(proxyUrl)}`
          : ''

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
          `[YT-DLP] Tentativa (${strategy.name})${cookiesFile ? ' +cookies' : ''} ${mode.label}: ${url}`
        )

        const childEnv: NodeJS.ProcessEnv = { ...process.env }
        if (mode.useProxy && proxyUrl) {
          childEnv.HTTP_PROXY = proxyUrl
          childEnv.HTTPS_PROXY = proxyUrl
          childEnv.http_proxy = proxyUrl
          childEnv.https_proxy = proxyUrl
        } else {
          delete childEnv.HTTP_PROXY
          delete childEnv.HTTPS_PROXY
          delete childEnv.http_proxy
          delete childEnv.https_proxy
          delete childEnv.ALL_PROXY
          delete childEnv.all_proxy
          delete childEnv.YTDLP_HTTP_PROXY
          delete childEnv.MUSIC_HTTP_PROXY
        }

        try {
          const { stderr } = await execAsync(command, {
            maxBuffer: 12 * 1024 * 1024,
            timeout: 60000,
            env: childEnv
          })

          if (stderr) {
            const hint = stderr.split('\n').filter(Boolean).slice(-3).join(' | ')
            if (hint) console.log(`[YT-DLP] stderr: ${hint.slice(0, 400)}`)
          }

          if (kind === 'audio') {
            const stem = outputPath.replace(/\.mp3$/i, '')
            const dir = path.dirname(outputPath)
            const stemBase = path.basename(stem)
            const foundFiles = fs.readdirSync(dir)
              .filter((name) => name === `${stemBase}.mp3` || name.startsWith(`${stemBase}.`))
              .map((name) => path.join(dir, name))

            let source =
              foundFiles.find((file) => file.toLowerCase().endsWith('.mp3')) ||
              foundFiles[0]

            if (!source && fs.existsSync(outputPath)) source = outputPath
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

            console.log(`[YT-DLP] Sucesso (${strategy.name} / ${mode.label})`)
            return
          }

          if (fs.existsSync(outputPath)) {
            console.log(`[YT-DLP] Sucesso (${strategy.name} / ${mode.label})`)
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
          console.error(`[YT-DLP] Falha (${strategy.name} / ${mode.label}):`, message.slice(0, 350))
          lastError = error instanceof Error ? error : new Error(message)

          if (mode.useProxy && isProxyAuthError(message)) {
            proxyAuthFailedThisProcess = true
            console.warn('[YT-DLP] Proxy 407 — pulando proxy e tentando conexão direta + cookies')
            break // sai das strategies, vai pro modo direto
          }
        }
      }
    }

    throw lastError ?? new Error('Não foi possível baixar o conteúdo do YouTube.')
  }

  /**
   * Cobalt PRIMEIRO (já provou funcionar com liubquanti).
   * yt-dlp só se Cobalt falhar — outros bots usam Cobalt/self-host, não yt-dlp lento.
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
      if (shouldUseYoutubeCookies()) ensureCobaltCookiesJson()

      console.log('[MEDIA] Estratégia: Cobalt-first (sem cookie obrigatório) → yt-dlp fallback')

      for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i]
        console.log(`[MEDIA] Candidato ${i + 1}/${candidates.length}: ${url}`)

        const proxyTemp = `${outputPath}.proxy.${i}.tmp`
        const ytdlpTemp = `${outputPath}.ytdlp.${i}.tmp`

        try {
          try {
            await downloadYouTubeAudioProxy(url, proxyTemp)
            if (fs.existsSync(proxyTemp) && fs.statSync(proxyTemp).size >= 8192) {
              if (fs.existsSync(outputPath)) safeUnlink(outputPath)
              fs.renameSync(proxyTemp, outputPath)
              safeUnlink(ytdlpTemp)
              console.log(`[MEDIA] Áudio OK via Cobalt/Piped (candidato ${i + 1})`)
              return url
            }
          } catch (proxyError: unknown) {
            const message = proxyError instanceof Error ? proxyError.message : String(proxyError)
            console.error(`[MEDIA] Cobalt/Piped falhou:`, message.slice(0, 300))
            errors.push(`proxy[${i}]: ${message}`)
          }

          try {
            console.log(`[MEDIA] Fallback yt-dlp candidato ${i + 1}...`)
            await this.runYtDlp(url, ytdlpTemp, 'audio')
            if (fs.existsSync(ytdlpTemp) && fs.statSync(ytdlpTemp).size >= 8192) {
              if (fs.existsSync(outputPath)) safeUnlink(outputPath)
              fs.renameSync(ytdlpTemp, outputPath)
              safeUnlink(proxyTemp)
              console.log(`[MEDIA] Áudio OK via yt-dlp (candidato ${i + 1})`)
              return url
            }
          } catch (ytdlpError: unknown) {
            const message = ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError)
            const stderr = (ytdlpError as { stderr?: string })?.stderr
            if (stderr) console.error('[YT-DLP] stderr:', stderr.slice(-500))
            errors.push(`ytdlp[${i}]: ${message}`)
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
let proxyAuthFailedThisProcess = false

async function maybeUpdateYtDlp (): Promise<void> {
  if (ytDlpUpdatedThisProcess) return
  ytDlpUpdatedThisProcess = true

  try {
    console.log('[YT-DLP] Atualizando yt-dlp (best-effort, sem proxy)...')
    const env = { ...process.env }
    delete env.HTTP_PROXY
    delete env.HTTPS_PROXY
    delete env.http_proxy
    delete env.https_proxy
    await execAsync('yt-dlp -U', {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      env
    })
    console.log('[YT-DLP] Atualizado')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[YT-DLP] Não foi possível atualizar:', message.slice(0, 200))
  }
}
