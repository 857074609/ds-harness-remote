/**
 * Direct-connect target parsing.
 *
 * Two accepted forms:
 *
 * 1. `host:port` — the classic LAN form, e.g. `192.168.1.10:18888`.
 * 2. A full WebSocket URL — required when the Host is reached through a
 *    reverse proxy on a public domain, e.g. `wss://dsh.example.com/direct`
 *    (or `http(s)://`, which is normalized to `ws(s)://`).
 *
 * A bare hostname without a port is rejected on purpose: silently defaulting
 * to a port hides typos and would make a failed public-domain setup look like
 * a credentials problem. Reverse-proxy deployments must state the scheme.
 */

export interface DirectTarget {
  /** Host to dial: IPv4 literal or DNS name (no scheme, no path). */
  host: string
  /** Port to dial. Defaults to 443 for wss / 80 for ws. */
  port: number
  /**
   * Full dial URL including scheme, optional port and path.
   * Present for every accepted target so the transport never has to guess.
   */
  url: string
}

const WS_PROTOCOLS = new Set(['ws:', 'wss:', 'http:', 'https:'])
const DEFAULT_PORT: Record<string, number> = { 'ws:': 80, 'wss:': 443, http: 80, https: 443 }

function wsUrl(value: string): URL | undefined {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }
  if (!WS_PROTOCOLS.has(parsed.protocol)) return undefined
  if (parsed.hostname === '') return undefined
  if (parsed.username !== '' || parsed.password !== '') return undefined
  if (parsed.hash !== '') return undefined
  return parsed
}

/** `http(s)` is an alias for `ws(s)` so users can paste a browser URL. */
function toWebSocket(parsed: URL): { url: string; port: number } {
  const secure = parsed.protocol === 'wss:' || parsed.protocol === 'https:'
  const scheme = secure ? 'wss:' : 'ws:'
  const explicitPort = parsed.port === '' ? undefined : Number(parsed.port)
  const port = explicitPort ?? DEFAULT_PORT[parsed.protocol] ?? (secure ? 443 : 80)
  const path = parsed.pathname === '' ? '/' : parsed.pathname
  const search = parsed.search
  return { url: `${scheme}//${parsed.host}${path}${search}`, port }
}

export function parseDirectTarget(input: string): DirectTarget | undefined {
  const value = input.trim()
  if (value === '') return undefined

  // Full URL (scheme present) — reverse proxy / public domain form.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    const parsed = wsUrl(value)
    if (parsed === undefined) return undefined
    const { url, port } = toWebSocket(parsed)
    return { host: parsed.hostname, port, url }
  }

  // Classic `host:port`.
  const match = /^([a-zA-Z0-9._-]+):(\d{1,5})$/.exec(value)
  if (match === null) return undefined
  const host = match[1]
  const port = Number(match[2])
  if (host === undefined || port === undefined || port < 1 || port > 65535) return undefined
  return { host, port, url: `ws://${host}:${port}/ws/v1/connect` }
}

/** Path the Host's built-in listener serves; kept for the `host:port` form. */
export const DIRECT_CONNECT_PATH = '/ws/v1/connect'