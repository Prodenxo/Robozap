import axios from 'axios'
import { exec } from 'child_process'
import { createWriteStream } from 'fs'
import fs from 'fs'
import { promisify } from 'util'
import { pipeline } from 'stream/promises'
import { httpDirect, isProxyAuthError } from './http'

const execAsync = promisify(exec)

const INSTANCE_CACHE_MS = 30 * 60 * 1000
const BLACKLIST_MS = 15 * 60 * 1000
const BLACKLIST_SOFT_MS = 2 * 60 * 1000
const COBALT_WINNER_CACHE_MS = 45 * 60 * 1000
const COBALT_PARALLEL_POOL = 5
const COBALT_REQUEST_TIMEOUT_MS = 12000
const PHASE_TIMEOUT_MS = 25000
const MIN_AUDIO_BYTES = 8 * 1024

const FALLBACK_PIPED_BASES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.lunar.icu',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
  'https://pipedapi.reallyaweso.me'
]

const FALLBACK_INVIDIOUS_BASES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.privacyredirect.com',
  'https://inv.tux.pizza'
]

const FALLBACK_COBALT_PUBLIC = [
  'https://api.cobalt.best',
  'https://cobalt-backend.canine.tools',
  'https://api.cobalt.liubquanti.click',
  'https://api.qwkuns.me',
  'https://api.cobalt.blackcat.sweeux.org',
  'https://fox.kittycat.boo',
  'https://dog.kittycat.boo',
  'https://co.wuk.sh',
  'https://cobalt-api.kwiatekmieniany.pl',
  'https://api.cobalt.solidsoftware.dev'
]

const COBALT_JWT_BASES = new Set([
  'https://subito-c.meowing.de',
  'https://cobalt.omega.wolfy.love',
  'https://grapefruit.clxxped.lol',
  'https://nuko-c.meowing.de',
  'https://lime.clxxped.lol'
])

let pipedInstancesCache: { urls: string[], fetchedAt: number } | null = null
let cobaltInstancesCache: { urls: string[], fetchedAt: number } | null = null
let cobaltWinnerCache: { base: string, fetchedAt: number } | null = null
const instanceBlacklist = new Map<string, number>()

export function extractYouTubeVideoId (url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function envList (envKey: string): string[] {
  return (process.env[envKey] ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function normalizeApiBase (base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '')
  if (!trimmed) return trimmed
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`
}

function uniqueBases (bases: string[]): string[] {
  return [...new Set(bases.map((base) => normalizeApiBase(base)).filter(Boolean))]
}

function isBlacklisted (base: string): boolean {
  const key = normalizeApiBase(base)
  const until = instanceBlacklist.get(key)
  if (!until) return false
  if (Date.now() > until) {
    instanceBlacklist.delete(key)
    return false
  }
  return true
}

function blacklist (base: string, reason: string, soft = false): void {
  const key = normalizeApiBase(base)
  const ttl = soft ? BLACKLIST_SOFT_MS : BLACKLIST_MS
  instanceBlacklist.set(key, Date.now() + ttl)
  if (
    cobaltWinnerCache &&
    normalizeApiBase(cobaltWinnerCache.base) === key
  ) {
    cobaltWinnerCache = null
  }
  console.warn(`[MEDIA] Blacklist ${key} (${Math.round(ttl / 60000)}min): ${reason}`)
}

function filterLive (bases: string[]): string[] {
  return bases.filter((base) => !isBlacklisted(base))
}

function shellQuote (value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function normalizeYoutubeWatchUrl (url: string): string {
  const videoId = extractYouTubeVideoId(url)
  if (!videoId) return url
  return `https://www.youtube.com/watch?v=${videoId}`
}

function getAxiosErrorDetail (error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error)
  }

  const apiError = error.response?.data as
    | { status?: string, error?: { code?: string } }
    | undefined

  if (apiError?.error?.code) return apiError.error.code
  if (apiError && typeof apiError === 'object') return JSON.stringify(apiError)
  return error.message
}

function shouldBlacklistFromError (message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('jwt.missing') ||
    lower.includes('auth.jwt') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('certificate') ||
    lower.includes('status code 521') ||
    lower.includes('status code 502') ||
    lower.includes('status code 503') ||
    lower.includes('status code 403') ||
    lower.includes('cloudflare') ||
    lower.includes('origin_bad_gateway')
  )
}

function pickExtension (mimeType?: string): string {
  if (!mimeType) return '.webm'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a'
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return '.ogg'
  return '.webm'
}

function assertAudioFile (filePath: string): void {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < MIN_AUDIO_BYTES) {
    throw new Error('Download vazio ou corrompido.')
  }
}

async function convertToMp3 (inputPath: string, outputPath: string): Promise<void> {
  const command = [
    'ffmpeg -y -hide_banner -loglevel error',
    `-i ${shellQuote(inputPath)}`,
    '-vn -acodec libmp3lame -q:a 0',
    shellQuote(outputPath)
  ].join(' ')

  await execAsync(command, { timeout: 120000 })
  assertAudioFile(outputPath)

  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath)
  }
}

async function downloadStreamToFile (
  streamUrl: string,
  outputPath: string,
  mimeType?: string,
  referer?: string,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const rawExt = pickExtension(mimeType)
  const wantsMp3 = outputPath.toLowerCase().endsWith('.mp3')
  const rawPath =
    wantsMp3 && rawExt !== '.mp3'
      ? `${outputPath}.raw${rawExt}`
      : outputPath

  const response = await httpDirect.get(streamUrl, {
    responseType: 'stream',
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      ...(referer ? { Referer: referer } : {}),
      ...(extraHeaders ?? {})
    }
  })

  await pipeline(response.data, createWriteStream(rawPath))
  assertAudioFile(rawPath)

  if (wantsMp3 && rawPath !== outputPath) {
    await convertToMp3(rawPath, outputPath)
    return
  }

  if (rawPath !== outputPath) {
    fs.renameSync(rawPath, outputPath)
  }
}

function withTimeout<T> (promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout ${label} (${ms}ms)`))
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export async function promiseAny<T> (promises: Array<Promise<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    const errors: unknown[] = []
    let rejected = 0
    let settled = false

    if (promises.length === 0) {
      reject(Object.assign(new Error('Nenhuma promise fornecida.'), { errors: [] }))
      return
    }

    for (const promise of promises) {
      void Promise.resolve(promise).then(
        (value) => {
          if (settled) return
          settled = true
          resolve(value)
        },
        (error: unknown) => {
          errors.push(error)
          rejected += 1
          if (!settled && rejected === promises.length) {
            reject(Object.assign(new Error('Todas as promises falharam.'), { errors }))
          }
        }
      )
    }
  })
}

function uniqueTemp (basePath: string, tag: string): string {
  return `${basePath}.${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.part`
}

function safeUnlink (filePath: string): void {
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
  }
}

function moveToOutput (source: string, outputPath: string): void {
  assertAudioFile(source)
  if (fs.existsSync(outputPath)) safeUnlink(outputPath)
  fs.renameSync(source, outputPath)
}

// ─── Cobalt ───────────────────────────────────────────────

interface CobaltResponse {
  status: string
  url?: string
  error?: { code?: string }
}

interface CobaltRequestBody {
  url: string
  downloadMode: 'audio'
  audioFormat?: 'mp3' | 'best' | 'opus' | 'ogg'
  audioBitrate?: string
  youtubeBetterAudio?: boolean
}

const COBALT_REQUEST_VARIANTS: Array<Partial<CobaltRequestBody>> = [
  { audioFormat: 'mp3', audioBitrate: '128', youtubeBetterAudio: false },
  { audioFormat: 'mp3', audioBitrate: '192', youtubeBetterAudio: true },
  { audioFormat: 'best', youtubeBetterAudio: true },
  { audioFormat: 'mp3', audioBitrate: '320', youtubeBetterAudio: false }
]

function getCobaltAuthHeaders (): Record<string, string> {
  const apiKey = process.env.COBALT_API_KEY?.trim()
  if (!apiKey) return {}
  return { Authorization: `Api-Key ${apiKey}` }
}

async function fetchDynamicCobaltInstances (): Promise<string[]> {
  const now = Date.now()
  if (cobaltInstancesCache && now - cobaltInstancesCache.fetchedAt < INSTANCE_CACHE_MS) {
    return cobaltInstancesCache.urls
  }

  const urls: string[] = []
  const feeds = [
    'https://instances.cobalt.best/api/instances.json',
    'https://cobalt.directory/api/instances'
  ]

  for (const feed of feeds) {
    try {
      const { data } = await httpDirect.get(feed, { timeout: 10000 })
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.instances)
          ? data.instances
          : []

      for (const item of list) {
        const api =
          item?.api ??
          item?.api_url ??
          item?.url ??
          item?.apiUrl ??
          (typeof item === 'string' ? item : null)

        if (typeof api === 'string' && api.startsWith('http')) {
          urls.push(api.replace(/\/$/, ''))
        }
      }

      if (urls.length > 0) break
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[COBALT] Feed ${feed} indisponível: ${message}`)
    }
  }

  cobaltInstancesCache = {
    urls: uniqueBases(urls).slice(0, 25),
    fetchedAt: now
  }

  return cobaltInstancesCache.urls
}

async function resolveCobaltBases (): Promise<string[]> {
  const fromEnv = envList('COBALT_API_URL')
  const extraPublic = envList('COBALT_PUBLIC_URL')
  const localBases = fromEnv.length ? fromEnv : ['http://cobalt:9000']

  let dynamic: string[] = []
  try {
    dynamic = await Promise.race([
      fetchDynamicCobaltInstances(),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 2500))
    ])
  } catch {
    dynamic = []
  }

  const hasApiKey = Boolean(process.env.COBALT_API_KEY?.trim())
  const publicBases = uniqueBases([
    'https://api.cobalt.liubquanti.click',
    ...extraPublic,
    ...dynamic,
    ...FALLBACK_COBALT_PUBLIC
  ]).filter((base) => hasApiKey || !COBALT_JWT_BASES.has(normalizeApiBase(base)))

  let ordered = uniqueBases([...localBases, ...publicBases])

  if (
    cobaltWinnerCache &&
    Date.now() - cobaltWinnerCache.fetchedAt < COBALT_WINNER_CACHE_MS &&
    !isBlacklisted(cobaltWinnerCache.base)
  ) {
    ordered = uniqueBases([cobaltWinnerCache.base, ...ordered])
    console.log(`[COBALT] Priorizando vencedor: ${cobaltWinnerCache.base}`)
  }

  return filterLive(ordered)
}

async function requestCobaltAudio (
  base: string,
  youtubeUrl: string,
  bodyOverrides: Partial<CobaltRequestBody> = {}
): Promise<{ downloadUrl: string, base: string }> {
  const endpoint = `${normalizeApiBase(base)}/`
  const body: CobaltRequestBody = {
    url: normalizeYoutubeWatchUrl(youtubeUrl),
    downloadMode: 'audio',
    audioFormat: 'mp3',
    audioBitrate: '128',
    youtubeBetterAudio: false,
    ...bodyOverrides
  }

  const { data } = await httpDirect.post<CobaltResponse>(endpoint, body, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getCobaltAuthHeaders()
    },
    timeout: COBALT_REQUEST_TIMEOUT_MS
  })

  if (data.status === 'error') {
    throw new Error(data.error?.code ?? 'erro cobalt')
  }

  if (!data.url || !['tunnel', 'redirect'].includes(data.status)) {
    throw new Error(`resposta cobalt inválida: ${data.status}`)
  }

  let downloadUrl = data.url
  if (!downloadUrl.startsWith('http')) {
    downloadUrl = `${normalizeApiBase(base)}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`
  }

  const cobaltBase = normalizeApiBase(base)
  if (downloadUrl.includes('127.0.0.1') || downloadUrl.includes('localhost')) {
    downloadUrl = downloadUrl
      .replace(/https?:\/\/127\.0\.0\.1:\d+/g, cobaltBase)
      .replace(/https?:\/\/localhost:\d+/g, cobaltBase)
  }

  return { downloadUrl, base: cobaltBase }
}

async function attemptCobaltDownload (
  url: string,
  outputPath: string,
  base: string,
  variant: Partial<CobaltRequestBody>,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new Error('abort')

  const tempPath = uniqueTemp(outputPath, 'cobalt')

  try {
    const { downloadUrl } = await requestCobaltAudio(base, url, variant)
    if (signal?.aborted) throw new Error('abort')

    await downloadStreamToFile(
      downloadUrl,
      tempPath,
      'audio/mpeg',
      base,
      getCobaltAuthHeaders()
    )

    if (signal?.aborted) throw new Error('abort')
    moveToOutput(tempPath, outputPath)
    return normalizeApiBase(base)
  } catch (error: unknown) {
    const message = getAxiosErrorDetail(error)
    if (shouldBlacklistFromError(message) || message.includes('youtube.login') || message.includes('no_session')) {
      const soft = message.includes('youtube.login') || message.includes('no_session')
      blacklist(base, message, soft)
    }
    throw error
  } finally {
    safeUnlink(tempPath)
  }
}

async function tryCobaltRace (url: string, outputPath: string, bases: string[]): Promise<void> {
  const pool = bases.slice(0, COBALT_PARALLEL_POOL)
  const variant = COBALT_REQUEST_VARIANTS[0]
  const abort = new AbortController()
  let lastError: Error | null = null

  console.log(`[COBALT] Corrida em ${pool.length} instâncias`)

  await new Promise<void>((resolve, reject) => {
    let pending = pool.length
    let settled = false

    if (pending === 0) {
      reject(new Error('Nenhuma instância Cobalt disponível.'))
      return
    }

    for (const base of pool) {
      void attemptCobaltDownload(url, outputPath, base, variant, abort.signal)
        .then((winner) => {
          if (settled) return
          settled = true
          abort.abort()
          cobaltWinnerCache = { base: winner, fetchedAt: Date.now() }
          console.log(`[COBALT] OK via ${winner}`)
          resolve()
        })
        .catch((error: unknown) => {
          if (abort.signal.aborted || settled) return
          const message = getAxiosErrorDetail(error)
          if (!shouldBlacklistFromError(message)) {
            console.warn(`[COBALT] Falha ${base}: ${message}`)
          }
          lastError = new Error(message)
          pending -= 1
          if (pending === 0) {
            reject(lastError ?? new Error('Corrida Cobalt falhou.'))
          }
        })
    }
  })
}

async function tryCobaltDownload (url: string, outputPath: string): Promise<void> {
  const ordered = await resolveCobaltBases()
  if (!ordered.length) throw new Error('Nenhuma instância Cobalt disponível')

  // Só corrida rápida — sem sequencial infinito (era isso que travava 3+ min)
  await withTimeout(
    tryCobaltRace(url, outputPath, ordered),
    PHASE_TIMEOUT_MS,
    'cobalt'
  )
}

// ─── Piped ────────────────────────────────────────────────

async function fetchHealthyPipedInstances (): Promise<string[]> {
  const now = Date.now()
  if (pipedInstancesCache && now - pipedInstancesCache.fetchedAt < INSTANCE_CACHE_MS) {
    return pipedInstancesCache.urls
  }

  const urls: string[] = []

  try {
    const { data } = await httpDirect.get('https://piped-instances.kavin.rocks/', {
      timeout: 10000
    })

    if (Array.isArray(data)) {
      for (const item of data) {
        const apiUrl = item?.api_url ?? item?.api
        const uptime = Number(item?.uptime_24h ?? item?.uptime ?? 100)
        if (typeof apiUrl === 'string' && uptime >= 70) {
          urls.push(apiUrl.replace(/\/$/, ''))
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[PIPED] Lista dinâmica indisponível:', message)
  }

  pipedInstancesCache = {
    urls: uniqueBases(urls).slice(0, 20),
    fetchedAt: now
  }

  return pipedInstancesCache.urls
}

async function resolvePipedBases (): Promise<string[]> {
  const dynamic = await fetchHealthyPipedInstances()
  return filterLive(uniqueBases([
    ...envList('PIPED_API_URL'),
    ...dynamic,
    ...FALLBACK_PIPED_BASES
  ]))
}

interface PipedAudioStream {
  url: string
  bitrate?: number
  mimeType?: string
}

async function fetchPipedAudioStream (
  base: string,
  videoId: string,
  signal?: AbortSignal
): Promise<PipedAudioStream> {
  const { data } = await httpDirect.get(
    `${normalizeApiBase(base)}/streams/${videoId}`,
    {
      timeout: 15000,
      signal,
      headers: { 'User-Agent': 'robozap/1.0' }
    }
  )

  const streams = (data?.audioStreams ?? []) as PipedAudioStream[]
  if (!streams.length) throw new Error('sem áudio')

  return [...streams].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
}

async function tryPipedRace (videoId: string, outputPath: string): Promise<void> {
  const bases = (await resolvePipedBases()).slice(0, 10)
  const abort = new AbortController()
  let lastError: Error | null = null

  await new Promise<void>((resolve, reject) => {
    let pending = bases.length
    let settled = false

    if (pending === 0) {
      reject(new Error('Nenhuma instância Piped disponível.'))
      return
    }

    for (const base of bases) {
      void (async () => {
        const tempPath = uniqueTemp(outputPath, 'piped')
        try {
          console.log(`[PIPED] ${base} — ${videoId}`)
          const stream = await fetchPipedAudioStream(base, videoId, abort.signal)
          if (abort.signal.aborted || settled) return

          await downloadStreamToFile(stream.url, tempPath, stream.mimeType, base)
          if (abort.signal.aborted || settled) return

          settled = true
          abort.abort()
          moveToOutput(tempPath, outputPath)
          console.log(`[PIPED] OK via ${base}`)
          resolve()
        } catch (error: unknown) {
          safeUnlink(tempPath)
          if (abort.signal.aborted || settled) return

          const message = error instanceof Error ? error.message : String(error)
          if (shouldBlacklistFromError(message)) blacklist(base, message)
          else console.warn(`[PIPED] Falha ${base}: ${message}`)

          lastError = error instanceof Error ? error : new Error(message)
          pending -= 1
          if (pending === 0) {
            reject(lastError ?? new Error('Piped falhou.'))
          }
        }
      })()
    }
  })
}

// ─── Invidious ────────────────────────────────────────────

interface InvidiousFormat {
  url?: string
  type?: string
  bitrate?: string | number
}

async function tryInvidiousRace (videoId: string, outputPath: string): Promise<void> {
  const bases = filterLive(uniqueBases([
    ...envList('INVIDIOUS_API_URL'),
    ...FALLBACK_INVIDIOUS_BASES
  ])).slice(0, 8)

  const abort = new AbortController()
  let lastError: Error | null = null

  await new Promise<void>((resolve, reject) => {
    let pending = bases.length
    let settled = false

    if (pending === 0) {
      reject(new Error('Nenhuma instância Invidious disponível.'))
      return
    }

    for (const base of bases) {
      void (async () => {
        const tempPath = uniqueTemp(outputPath, 'inv')
        try {
          console.log(`[INVIDIOUS] ${base} — ${videoId}`)
          const { data } = await httpDirect.get(`${normalizeApiBase(base)}/api/v1/videos/${videoId}`, {
            timeout: 15000,
            signal: abort.signal,
            headers: { 'User-Agent': 'robozap/1.0' }
          })

          const formats = (data?.adaptiveFormats ?? []) as InvidiousFormat[]
          const audioOnly = formats.filter(
            (format) =>
              format.url &&
              format.type?.startsWith('audio/') &&
              !format.type.includes('video')
          )

          if (!audioOnly.length) throw new Error('sem áudio')

          const best = [...audioOnly].sort(
            (a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
          )[0]

          if (abort.signal.aborted || settled) return
          await downloadStreamToFile(best.url!, tempPath, best.type, base)
          if (abort.signal.aborted || settled) return

          settled = true
          abort.abort()
          moveToOutput(tempPath, outputPath)
          console.log(`[INVIDIOUS] OK via ${base}`)
          resolve()
        } catch (error: unknown) {
          safeUnlink(tempPath)
          if (abort.signal.aborted || settled) return

          const message = error instanceof Error ? error.message : String(error)
          if (shouldBlacklistFromError(message)) blacklist(base, message)
          else console.warn(`[INVIDIOUS] Falha ${base}: ${message}`)

          lastError = error instanceof Error ? error : new Error(message)
          pending -= 1
          if (pending === 0) {
            reject(lastError ?? new Error('Invidious falhou.'))
          }
        }
      })()
    }
  })
}

// ─── Public API ───────────────────────────────────────────

export async function probeCobaltHealth (base: string): Promise<{
  ok: boolean
  detail: string
}> {
  const normalized = normalizeApiBase(base)

  try {
    const { data } = await httpDirect.get(normalized, { timeout: 8000 })
    const version = data?.cobalt?.version ?? 'ok'
    console.log(`[COBALT] GET ${normalized} → v${version}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, detail: `GET falhou: ${message}` }
  }

  try {
    const { data } = await httpDirect.post<CobaltResponse>(
      `${normalized}/`,
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        downloadMode: 'audio',
        audioFormat: 'mp3',
        youtubeBetterAudio: false
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...getCobaltAuthHeaders()
        },
        timeout: 25000
      }
    )

    if (data.status === 'error') {
      return { ok: false, detail: `POST erro: ${data.error?.code ?? 'unknown'}` }
    }

    if (data.url && ['tunnel', 'redirect'].includes(data.status)) {
      return { ok: true, detail: `POST ok (${data.status})` }
    }

    return { ok: false, detail: `POST resposta inválida: ${data.status}` }
  } catch (error: unknown) {
    return { ok: false, detail: `POST falhou: ${getAxiosErrorDetail(error)}` }
  }
}

/** Concorrência limitada (não fila infinita global). */
let activeDownloads = 0
const MAX_PARALLEL_DOWNLOADS = Number(process.env.MUSIC_MAX_PARALLEL) || 3
const downloadWaiters: Array<() => void> = []

export async function enqueueYouTubeDownload<T> (task: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_PARALLEL_DOWNLOADS) {
    await new Promise<void>((resolve) => downloadWaiters.push(resolve))
  }

  activeDownloads += 1
  try {
    return await task()
  } finally {
    activeDownloads -= 1
    const next = downloadWaiters.shift()
    if (next) next()
  }
}

/**
 * Baixa áudio com timeout duro por fase (~25s max em proxies).
 */
export async function downloadYouTubeAudioProxy (
  url: string,
  outputPath: string
): Promise<void> {
  const videoId = extractYouTubeVideoId(url)
  if (!videoId) throw new Error('Não foi possível extrair o ID do vídeo.')

  const errors: string[] = []
  const cobaltTemp = uniqueTemp(outputPath, 'phase-cobalt')
  const pipedTemp = uniqueTemp(outputPath, 'phase-piped')
  const invTemp = uniqueTemp(outputPath, 'phase-inv')

  try {
    try {
      const winner = await withTimeout(
        promiseAny([
          tryCobaltDownload(url, cobaltTemp).then(() => 'cobalt' as const),
          tryPipedRace(videoId, pipedTemp).then(() => 'piped' as const)
        ]),
        PHASE_TIMEOUT_MS,
        'cobalt+piped'
      )

      const source = winner === 'cobalt' ? cobaltTemp : pipedTemp
      const other = winner === 'cobalt' ? pipedTemp : cobaltTemp
      moveToOutput(source, outputPath)
      safeUnlink(other)
      console.log(`[MEDIA] Áudio OK via ${winner}`)
      return
    } catch (aggregateError: unknown) {
      const list =
        aggregateError &&
        typeof aggregateError === 'object' &&
        'errors' in aggregateError
          ? (aggregateError as { errors: unknown[] }).errors
          : [aggregateError]

      for (const item of list) {
        errors.push(item instanceof Error ? item.message : String(item))
      }
      console.warn('[MEDIA] Fase Cobalt/Piped falhou:', errors.slice(0, 3).join(' | '))
    }

    try {
      await withTimeout(tryInvidiousRace(videoId, invTemp), 12000, 'invidious')
      moveToOutput(invTemp, outputPath)
      console.log('[MEDIA] Áudio OK via Invidious')
      return
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`invidious: ${message}`)
      console.warn('[MEDIA] Invidious falhou:', message)
    }

    throw new Error(errors.slice(0, 4).join(' | ') || 'Falha ao baixar áudio via proxies.')
  } finally {
    safeUnlink(cobaltTemp)
    safeUnlink(pipedTemp)
    safeUnlink(invTemp)
  }
}
