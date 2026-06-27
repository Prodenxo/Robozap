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

/** Converte cookies.json (formato Cobalt) para Netscape — usado pelo yt-dlp. */
export function ensureYtDlpCookiesFile (): string | null {
  const explicit = process.env.YTDLP_COOKIES_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) {
    return explicit
  }

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
      '# Generated for yt-dlp from cookies.json'
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
    console.warn('[COOKIES] Falha ao converter cookies.json para yt-dlp:', error)
    return fs.existsSync(NETSCAPE_FILE) ? NETSCAPE_FILE : null
  }
}

export function shouldUseYoutubeCookies (): boolean {
  if (process.env.YOUTUBE_USE_COOKIES === 'false') return false
  if (process.env.YOUTUBE_USE_COOKIES === 'true') return true

  const explicit = process.env.YOUTUBE_COOKIES_PATH?.trim()
    || process.env.YTDLP_COOKIES_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return true

  // Padrão: sem cookies (Cobalt/Piped/Invidious primeiro)
  return false
}
