import axios from 'axios'

/**
 * Axios que NUNCA usa HTTP_PROXY do ambiente.
 * Proxy residencial quebrado (407) não pode derrubar Cobalt local,
 * Piped, Invidious nem a Evolution API.
 */
export const httpDirect = axios.create({
  proxy: false,
  timeout: 30000,
  // Impede o Node de herdar HTTP_PROXY/HTTPS_PROXY
  // (axios respeita proxy:false; adapters ainda podem ler env em alguns casos)
  transitional: { clarifyTimeoutError: true }
})

// Garante que requests não peguem proxy via env do undici/axios
httpDirect.defaults.proxy = false

export function isProxyAuthError (message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('407') ||
    lower.includes('proxy authentication') ||
    lower.includes('proxy authentication required') ||
    lower.includes('tunnel connection failed')
  )
}
