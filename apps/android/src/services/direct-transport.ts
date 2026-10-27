import {
  PROTOCOL_VERSION,
  createControlFrame,
  decodeControlFrame,
  encodeControlFrame,
  type HelloAckPayload,
  type TransportStats,
} from '@dsh-remote/protocol'
import { fromBase64Url, toBase64Url } from '@dsh-remote/crypto'
import type { SecureHandshakeTransport } from '@dsh-remote/webrtc'
import { strings } from '../locales/i18n'

/** Endpoint of a Host that serves its built-in serverless direct-connect listener. */
export interface DirectEndpoint {
  host: string
  port: number
  /**
   * Full dial URL, e.g. `wss://dsh.example.com/direct`.
   *
   * Required when the Host sits behind a reverse proxy: the public scheme,
   * domain and path cannot be derived from `host`/`port` alone. When omitted
   * the transport falls back to `ws://host:port/ws/v1/connect`, preserving the
   * LAN-only behaviour of earlier builds.
   */
  url?: string
}

/** Local Host credentials; the password also derives the Noise PSK. */
export interface DirectCredentials {
  account: string
  password: string
}

type MessageHandler = (data: Uint8Array) => void
type HandshakeHandler = (step: number, data: Uint8Array) => void
type CloseHandler = (error?: Error) => void
type WireFrame = { type: string; payload: Record<string, unknown> }

const CONNECT_TIMEOUT_MS = 15_000

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Carrier for the serverless direct-connect mode. Speaks the Host plugin's
 * built-in control-frame dialect (hello -> hello.ack, connect.request,
 * secure.handshake, relay) over a plain WebSocket, so the secure layer above
 * it stays transport-agnostic.
 */
export class DirectTransport implements SecureHandshakeTransport {
  private ws?: WebSocket
  private readonly messageHandlers = new Set<MessageHandler>()
  private readonly handshakeHandlers = new Set<HandshakeHandler>()
  private readonly closeHandlers = new Set<CloseHandler>()
  private connectionId?: string
  private hostDeviceId?: string
  private heartbeatTimer?: ReturnType<typeof setInterval>
  /** Wall clock of the last inbound frame; the Host-side liveness signal. */
  lastMessageAt = 0
  private heartbeatFailures = 0
  private relayCounter = 0
  private stats: TransportStats = { mode: 'Relay', connected: false }
  private closed = false

  constructor(
    private readonly endpoint: DirectEndpoint,
    private readonly credentials: DirectCredentials,
    private readonly clientDeviceId: string,
  ) {}

  connectionInfo(): { connectionId: string; localDeviceId: string; remoteDeviceId: string } {
    if (this.connectionId === undefined || this.hostDeviceId === undefined) {
      throw new Error(strings.runtime.secureChannelNotConnected)
    }
    return { connectionId: this.connectionId, localDeviceId: this.clientDeviceId, remoteDeviceId: this.hostDeviceId }
  }

  getHostDeviceId(): string {
    if (this.hostDeviceId === undefined) throw new Error(strings.runtime.secureChannelNotConnected)
    return this.hostDeviceId
  }

  async connect(): Promise<void> {
    if (this.ws !== undefined) return
    this.closed = false
    // A reverse-proxied Host is reached by its public URL (wss:// + domain +
    // path); a LAN Host keeps the legacy `ws://host:port/ws/v1/connect`.
    const url = this.endpoint.url ?? `ws://${this.endpoint.host}:${this.endpoint.port}/ws/v1/connect`
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error === undefined) resolve()
        else reject(error)
      }
      const timer = setTimeout(() => finish(new Error(strings.runtime.secureHandshakeTimedOut)), CONNECT_TIMEOUT_MS)
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => {
        this.sendFrame('hello', {
          role: 'client',
          deviceId: this.clientDeviceId,
          account: this.credentials.account,
          password: this.credentials.password,
          protocols: [PROTOCOL_VERSION],
          capabilities: ['transport.relay'],
        })
      }
      ws.onmessage = event => {
        this.lastMessageAt = Date.now()
        let frame: WireFrame
        try {
          const parsed = decodeControlFrame(String(event.data))
          frame = { type: parsed.type, payload: parsed.payload as Record<string, unknown> }
        } catch {
          finish(new Error(strings.runtime.secureHandshakeFailed))
          return
        }
        if (frame.type === 'hello.ack') {
          const ack = frame.payload as unknown as HelloAckPayload
          this.hostDeviceId = ack.hostDeviceId
          this.connectionId = ack.connectionSessionId
          this.stats = { mode: 'Relay', connected: true }
          this.startHeartbeat(ack.heartbeatIntervalMs)
          this.sendFrame('connect.request', { hostDeviceId: ack.hostDeviceId, preferredTransports: ['relay'] })
            .then(() => finish())
            .catch(error => finish(error instanceof Error ? error : new Error(strings.runtime.secureHandshakeFailed)))
          return
        }
        if (frame.type === 'connect.accepted') {
          finish()
          return
        }
        if (frame.type === 'secure.handshake') {
          if (typeof frame.payload.data !== 'string') return
          const data = fromBase64Url(frame.payload.data)
          for (const handler of [...this.handshakeHandlers]) handler(Number(frame.payload.step), data)
          return
        }
        if (frame.type === 'relay') {
          if (typeof frame.payload.ciphertext !== 'string') return
          const data = fromBase64Url(frame.payload.ciphertext)
          for (const handler of [...this.messageHandlers]) handler(data)
          return
        }
        if (frame.type === 'error') {
          const message = typeof frame.payload.message === 'string' ? frame.payload.message : 'direct connect failed'
          finish(new Error(message))
          this.handleClose(new Error(message))
          return
        }
        // pong and unknown frame types are ignored.
      }
      ws.onerror = () => finish(new Error(strings.runtime.hostClosed))
      ws.onclose = () => {
        finish(new Error(strings.runtime.hostClosed))
        this.handleClose()
      }
    })
  }

  async send(data: Uint8Array): Promise<void> {
    await this.sendFrame('relay', {
      connectionId: this.requireConnectionId(),
      targetDeviceId: this.hostDeviceId ?? '',
      counter: this.relayCounter++,
      ciphertext: toBase64Url(data),
    })
  }

  onMessage(cb: MessageHandler): () => void {
    this.messageHandlers.add(cb)
    return () => this.messageHandlers.delete(cb)
  }

  sendHandshake(step: number, data: Uint8Array): Promise<void> {
    return this.sendFrame('secure.handshake', {
      connectionId: this.requireConnectionId(),
      targetDeviceId: this.hostDeviceId ?? '',
      step,
      data: toBase64Url(data),
    })
  }

  onHandshake(cb: HandshakeHandler): () => void {
    this.handshakeHandlers.add(cb)
    return () => this.handshakeHandlers.delete(cb)
  }

  onClose(cb: CloseHandler): () => void {
    this.closeHandlers.add(cb)
    return () => this.closeHandlers.delete(cb)
  }

  async close(): Promise<void> {
    this.closed = true
    this.stopHeartbeat()
    const ws = this.ws
    this.ws = undefined
    if (ws !== undefined) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
    }
    this.messageHandlers.clear()
    this.handshakeHandlers.clear()
    this.closeHandlers.clear()
    this.stats = { mode: 'Relay', connected: false }
  }

  getStats(): TransportStats {
    return this.stats
  }

  private requireConnectionId(): string {
    if (this.connectionId === undefined) throw new Error(strings.runtime.secureChannelNotConnected)
    return this.connectionId
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat()
    this.heartbeatFailures = 0
    this.heartbeatTimer = setInterval(() => {
      // A failed beat only means the write buffer was busy: closing here used
      // to tear down healthy tunnels. onclose is the only authority.
      void this.sendFrame('ping', { nonce: nonce() }).catch(() => undefined)
    }, Math.max(5000, intervalMs))
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private sendFrame(type: string, payload: Record<string, unknown>): Promise<void> {
    const ws = this.ws
    if (ws === undefined || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(strings.runtime.secureChannelNotConnected))
    }
    try {
      ws.send(encodeControlFrame(createControlFrame(type as never, payload)))
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(strings.runtime.secureHandshakeFailed))
    }
  }

  private handleClose(error?: Error): void {
    this.stopHeartbeat()
    this.stats = { mode: 'Relay', connected: false }
    if (!this.closed) {
      for (const handler of [...this.closeHandlers]) handler(error)
    }
  }
}
