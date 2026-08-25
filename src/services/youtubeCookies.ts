import fs from 'fs'
import path from 'path'

const COOKIE_FILE = path.join(process.cwd(), 'cookies.json')
const NETSCAPE_FILE = path.join(process.cwd(), 'cookies_ytdlp.txt')

function parseCookieHeader (header: string): Array<{ name: string, value: string }> {
  return header
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const eq = part.indexOf('=')
      if (eq <= 0) return null
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim()
      }
    })
    .filter((item): item is { name: string, value: string } => Boolean(item?.name))
}

/** Lê o header de cookies do env YOUTUBE_COOKIES (string do navegador). */
export function getYoutubeCookieHeaderFromEnv (): string | null {
  const raw = process.env.YOUTUBE_COOKIES?.trim()
  if (!raw || raw.length < 20) return null
  return raw
}

/**
 * Garante cookies.json no formato Cobalt a partir de YOUTUBE_COOKIES.
 * Também copia pra pasta compartilhada com o serviço Cobalt (se montada).
 */
export function ensureCobaltCookiesJson (): string | null {
  const jsonPath = process.env.COBALT_COOKIES_JSON?.trim() || COOKIE_FILE
  const fromEnv = getYoutubeCookieHeaderFromEnv()
  const sharedPaths = [
    process.env.COBALT_SHARED_COOKIES_PATH?.trim(),
    '/data/cookies/cookies.json',
    '/cookies/cookies.json'
  ].filter(Boolean) as string[]

  const writeJson = (target: string, header: string): boolean => {
    try {
      const dir = path.dirname(target)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        target,
        JSON.stringify({ youtube: [header] }, null, 2),
        'utf-8'
      )
      return true
    } catch (error) {
      console.warn(`[COOKIES] Falha ao gravar ${target}:`, error)
      return false
    }
  }

  if (fromEnv) {
    writeJson(jsonPath, fromEnv)
    for (const shared of sharedPaths) {
      writeJson(shared, fromEnv)
    }
    console.log('[COOKIES] cookies.json atualizado a partir de YOUTUBE_COOKIES')
    return jsonPath
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { youtube?: string[] }
      if (typeof raw.youtube?.[0] === 'string' && raw.youtube[0].trim().length > 20) {
        for (const shared of sharedPaths) {
          writeJson(shared, raw.youtube[0])
        }
        return jsonPath
      }
    } catch {
      // ignore
    }
  }

  return null
}

/** Converte cookies (env ou cookies.json) para Netscape — usado pelo yt-dlp. */
export function ensureYtDlpCookiesFile (): string | null {
  const explicit = process.env.YTDLP_COOKIES_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) {
    return explicit
  }

  ensureCobaltCookiesJson()

  const jsonPath = process.env.COBALT_COOKIES_JSON?.trim() || COOKIE_FILE
  if (!fs.existsSync(jsonPath)) {
    return fs.existsSync(NETSCAPE_FILE) ? NETSCAPE_FILE : null
  }

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
      youtube?: string[]
    }

    const header = raw.youtube?.[0]
    if (!header || typeof header !== 'string') {
      return fs.existsSync(NETSCAPE_FILE) ? NETSCAPE_FILE : null
    }

    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180
    const lines = [
      '# Netscape HTTP Cookie File',
      '# Generated for yt-dlp from cookies'
    ]

    for (const cookie of parseCookieHeader(header)) {
      lines.push(
        [
          '.youtube.com',
          'TRUE',
          '/',
          'TRUE',
          String(expires),
          cookie.name,
          cookie.value
        ].join('\t')
      )
    }

    fs.writeFileSync(NETSCAPE_FILE, lines.join('\n') + '\n', 'utf-8')
    return NETSCAPE_FILE
  } catch (error) {
    console.warn('[COOKIES] Falha ao converter cookies para yt-dlp:', error)
    return fs.existsSync(NETSCAPE_FILE) ? NETSCAPE_FILE : null
  }
}

/** Tem cookies válidos (env YOUTUBE_COOKIES ou cookies.json). */
export function hasValidYoutubeCookies (): boolean {
  if (getYoutubeCookieHeaderFromEnv()) return true

  const jsonPath = process.env.COBALT_COOKIES_JSON?.trim() || COOKIE_FILE
  if (!fs.existsSync(jsonPath)) return false

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { youtube?: string[] }
    const header = raw.youtube?.[0]
    return typeof header === 'string' && header.trim().length > 20
  } catch {
    return false
  }
}

/**
 * Cookies manuais são OPCIONAIS (opt-in).
 * Default: NÃO usa — o .tocar vai de Cobalt público/local, sem renovar cookie.
 * Só ativa com YOUTUBE_USE_COOKIES=true + cookies válidos.
 */
export function shouldUseYoutubeCookies (): boolean {
  if (process.env.YOUTUBE_USE_COOKIES !== 'true') {
    return false
  }
  return hasValidYoutubeCookies()
}
