import axios from 'axios'
import http from 'http'
import https from 'https'
import { getYtDlpProxyUrl } from '../proxyBootstrap'

/**
 * Axios que NUNCA usa proxy.
 * Agentes explícitos + proxy:false — Evolution, Cobalt local, Piped, etc.
 */
export const httpDirect = axios.create({
  proxy: false,
  timeout: 60000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  transitional: { clarifyTimeoutError: true }
})

httpDirect.defaults.proxy = false

// Cinto e suspensório: cada request força proxy:false
httpDirect.interceptors.request.use((config) => {
  config.proxy = false
  return config
})

export function isProxyAuthError (message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('407') ||
    lower.includes('proxy authentication') ||
    lower.includes('proxy authentication required') ||
    lower.includes('tunnel connection failed') ||
    lower.includes('not in your list')
  )
}

/** Proxy só para yt-dlp (se ainda válido). */
export { getYtDlpProxyUrl }
