import { strings as zhCN } from '../locales/i18n'

export class RemoteApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'RemoteApiError'
  }
}

export function friendlyError(error: unknown): string {
  const friendlyByCode: Record<string, string> = zhCN.errors
  if (isSessionWriterHeldError(error)) return friendlyByCode['session/writer-held']!
  if (error instanceof RemoteApiError) return friendlyByCode[error.code] ?? error.message
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code
    if (typeof code === 'string' && friendlyByCode[code] !== undefined) return friendlyByCode[code]!
    if (/network request failed|failed to fetch|websocket/i.test(error.message)) {
      return zhCN.errors.serverUnreachable
    }
    if (isRpcTimeoutError(error)) return friendlyByCode.RPC_TIMEOUT!
    return error.message
  }
  return zhCN.errors.unknown
}

/** Newer Harness exposes a code; older carriers retain only the native message. */
function isSessionWriterHeldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: unknown }).code
  return code === 'session/writer-held'
    || error.name === 'SessionAlreadyOwnedError'
    || /^session "[^"\r\n]+" is already owned by an active write handle$/.test(error.message)
}

export function isRpcTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timed?\s*out|timeout/i.test(error.message)
}

/** The bounded session-follow open/snapshot timeout (client-core STREAM_TIMEOUT). */
export function isStreamTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { code?: unknown }).code === 'STREAM_TIMEOUT'
}

/** A request can race with the transport closing while Android resumes. */
export function isRecoverableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: unknown }).code
  return code === 'TRANSPORT_CLOSED' || code === 'CLIENT_CLOSED'
}
