/**
 * DEVE ser o primeiro import do processo.
 * Easypanel injeta HTTP_PROXY no container — o axios usa isso e quebra
 * Evolution/WhatsApp com 407. Guardamos só pra yt-dlp.
 */
const savedProxy = (
  process.env.YTDLP_HTTP_PROXY ||
  process.env.MUSIC_HTTP_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.https_proxy ||
  ''
).trim()

if (savedProxy) {
  process.env.YTDLP_HTTP_PROXY = savedProxy
  console.log('[PROXY] HTTP_PROXY removido do processo (salvo em YTDLP_HTTP_PROXY só pro yt-dlp)')
} else {
  console.log('[PROXY] Nenhum HTTP_PROXY no ambiente')
}

for (const key of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy'
]) {
  delete process.env[key]
}

export function getYtDlpProxyUrl (): string {
  return (process.env.YTDLP_HTTP_PROXY || process.env.MUSIC_HTTP_PROXY || '').trim()
}
