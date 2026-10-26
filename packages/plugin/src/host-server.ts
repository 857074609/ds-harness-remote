import { WebSocketServer, WebSocket, type RawData } from 'ws'
import {
  PROTOCOL_VERSION,
  createControlFrame,
  decodeControlFrame,
  decodeMessage,
  encodeControlFrame,
  encodeMessage,
  SecureMessageCodec,
  type ControlFrameByteLimits,
  type ConnectAcceptedPayload,
  type ControlErrorPayload,
  type HelloAckPayload,
  type RelayPayload,
  type RemoteMessage,
  type SecureHandshakePayload,
} from '@dsh-remote/protocol'
import {
  NOISE_XX_PSK_PROTOCOL,
  NoiseXxPskSession,
  createDirectNoisePrologue,
  derivePsk,
  fromBase64Url,
  toBase64Url,
} from '@dsh-remote/crypto'
import { SerialSend, waitForRelayCapacity } from '@dsh-remote/webrtc'
import type { ConnectionController } from './connection-controller.js'
import type { HostIdentity, IdentityStore } from './identity-store.js'
import type { SafeLogger } from './logging.js'
import type { AuthenticatedPeerChannel } from './types.js'
import { LocalCredentialStore } from './local-credentials.js'
import { PLUGIN_VERSION } from './version.js'

const MAX_CONTROL_FRAME_BYTES = 65536
const MAX_RELAY_FRAME_BYTES = 1048576

export interface HostDirectServerOptions {
  host: string
  port: number
  /** When true and `port` is busy, bind an ephemeral port so the UI can show it. */
  autoPort?: boolean
}

/** Credentials straight from the (possibly just-edited) plugin settings. */
export interface DirectCredentials {
  account: string
  password: string
}

interface DirectTunnel {
  connectionId: string
  account: string
  clientDeviceId: string
  psk: Uint8Array
  noise?: NoiseXxPskSession
  channel?: DirectNoiseChannel
}

export class HostDirectServer {
  private server?: WebSocketServer
  private readonly tunnels = new Map<WebSocket, DirectTunnel>()
  private running = false
  private boundPort?: number
  private lastActivity?: number
  private readonly limits: ControlFrameByteLimits = {
    maxControlFrameBytes: MAX_CONTROL_FRAME_BYTES,
    maxRelayFrameBytes: MAX_RELAY_FRAME_BYTES,
  }

  constructor(
    private readonly options: HostDirectServerOptions,
    private readonly identity: HostIdentity,
    private readonly identities: IdentityStore,
    private readonly credentials: LocalCredentialStore,
    private readonly connections: ConnectionController,
    private readonly logger: SafeLogger,
    private readonly hostCapabilities: () => readonly string[] = () => [],
    private readonly harnessVersion?: string,
    private readonly liveCredentials?: () => DirectCredentials | undefined,
  ) {}

  /** The address clients should connect to. Known only after `start()`. */
  listenAddress(): { host: string; port: number } | undefined {
    if (this.boundPort === undefined) return undefined
    return { host: this.options.host, port: this.boundPort }
  }

  port(): number | undefined { return this.boundPort }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    const server = new WebSocketServer({ host: this.options.host, port: this.options.port })
    this.server = server
    server.on('listening', () => {
      const addr = server.address()
      if (typeof addr === 'object' && addr !== null) {
        this.boundPort = addr.port
        this.logger.info('direct-connect host listening', { host: this.options.host, port: addr.port })
      }
    })
    server.on('connection', ws => this.handleConnection(ws))
    server.on('error', error => this.logger.error('direct-connect host server error', { reason: String(error) }))
  }

  async stop(): Promise<void> {
    this.running = false
    this.boundPort = undefined
    for (const tunnel of this.tunnels.values()) tunnel.noise?.destroy()
    this.tunnels.clear()
    await this.connections.close()
    const server = this.server
    this.server = undefined
    await new Promise<void>(resolve => {
      if (server === undefined) { resolve(); return }
      server.close(() => resolve())
    })
  }

  private handleConnection(ws: WebSocket): void {
    let acknowledged = false
    let tunnel: DirectTunnel | undefined
    let messageQueue: Promise<void> = Promise.resolve()
    const finish = (code: number, reason: string): void => {
      const t = this.tunnels.get(ws)
      if (t?.channel === undefined) t?.noise?.destroy()
      this.tunnels.delete(ws)
      try { ws.close(code, reason) } catch { /* already closing */ }
    }
    ws.on('message', (raw: RawData) => {
      messageQueue = messageQueue.then(async () => {
        const frame = decodeControlFrame(String(raw), this.limits)
        this.lastActivity = Date.now()
        if (frame.type === 'hello') { tunnel = await this.handleHello(ws, frame.payload); acknowledged = true }
        else if (!acknowledged) throw new ControlError('INVALID_MESSAGE', 'Received a frame before hello.')
        else if (frame.type === 'connect.request') { await this.handleConnectRequest(ws, tunnel) }
        else if (frame.type === 'secure.handshake') { await this.handleHandshake(ws, tunnel, frame.payload) }
        else if (frame.type === 'relay') { await this.handleRelay(tunnel, frame.payload) }
        else if (frame.type === 'ping') { this.send(ws, 'pong', (frame.payload as { nonce: string }).nonce) }
      }).catch(error => {
        this.logger.warn('direct-connect control frame failed', { code: errorCode(error), reason: String(error) })
        finish(4008, 'invalid control frame')
      })
    })
    ws.on('close', () => finish(1000, 'client closed'))
    ws.on('error', () => finish(4001, 'client socket error'))
  }

  private async handleHello(ws: WebSocket, payload: unknown): Promise<DirectTunnel> {
    const p = requireObject(payload)
    const account = typeof p.account === 'string' ? p.account : ''
    const password = typeof p.password === 'string' ? p.password : ''
    const clientDeviceId = typeof p.deviceId === 'string' ? p.deviceId : ''
    if (account.length === 0 || password.length === 0 || clientDeviceId.length === 0) {
      this.sendError(ws, 'AUTH_REQUIRED', 'account, password and deviceId are required')
      throw new ControlError('AUTH_REQUIRED', 'Missing account, password or deviceId.')
    }
    let verified = await this.credentials.verify(account, password)
    if (verified === undefined) {
      const live = this.liveCredentials?.()
      if (live !== undefined && live.account === account && live.password === password) verified = account
    }
    if (verified === undefined) {
      this.sendError(ws, 'AUTH_INVALID', 'invalid account or password')
      throw new ControlError('AUTH_INVALID', 'Invalid account or password.')
    }
    const connectionId = `direct-${randomId()}`
    const psk = derivePsk(password, account)
    const tunnel: DirectTunnel = { connectionId, account: verified, clientDeviceId, psk }
    this.tunnels.set(ws, tunnel)
    const ack: HelloAckPayload = {
      protocol: PROTOCOL_VERSION,
      serverVersion: `direct-${PLUGIN_VERSION}`,
      connectionSessionId: connectionId,
      heartbeatIntervalMs: 25000,
      maxControlFrameBytes: MAX_CONTROL_FRAME_BYTES,
      maxRelayFrameBytes: MAX_RELAY_FRAME_BYTES,
      hostDeviceId: this.identity.publicKey,
      capabilities: ['transport.relay', ...this.hostCapabilities()],
      webrtcEnabled: false,
    }
    this.send(ws, 'hello.ack', ack)
    return tunnel
  }

  private async handleConnectRequest(ws: WebSocket, tunnel: DirectTunnel | undefined): Promise<void> {
    if (tunnel === undefined) throw new ControlError('INVALID_MESSAGE', 'connect.request before hello')
    const payload: ConnectAcceptedPayload = { connectionId: tunnel.connectionId }
    this.send(ws, 'connect.accepted', payload)
  }

  private async handleHandshake(ws: WebSocket, tunnel: DirectTunnel | undefined, payload: unknown): Promise<void> {
    if (tunnel === undefined) throw new ControlError('SECURE_CHANNEL_FAILED', 'secure.handshake before connect')
    const p = requireObject(payload)
    const step = p.step
    if (typeof p.connectionId !== 'string' || p.connectionId !== tunnel.connectionId
      || typeof p.targetDeviceId !== 'string' || p.targetDeviceId !== this.identity.publicKey
      || typeof step !== 'number' || !Number.isSafeInteger(step) || typeof p.data !== 'string') {
      throw new ControlError('SECURE_CHANNEL_FAILED', 'secure.handshake payload is invalid')
    }
    if (tunnel.noise === undefined) {
      tunnel.noise = new NoiseXxPskSession({
        role: 'responder',
        localPrivateKey: this.identity.privateKey,
        localPublicKey: this.identity.publicKey,
        psk: tunnel.psk,
        prologue: createDirectNoisePrologue(tunnel.account, tunnel.connectionId),
      })
    }
    tunnel.noise.readHandshake(fromBase64Url(p.data))
    if (!tunnel.noise.complete && tunnel.noise.canWriteHandshake) {
      const reply = tunnel.noise.writeHandshake()
      this.send(ws, 'secure.handshake', {
        connectionId: tunnel.connectionId,
        targetDeviceId: tunnel.clientDeviceId,
        step: step + 1,
        data: toBase64Url(reply),
      } satisfies SecureHandshakePayload)
      return
    }
    if (!tunnel.noise.complete) throw new ControlError('SECURE_CHANNEL_FAILED', 'Noise XXpsk3 handshake did not complete')
    const channel = new DirectNoiseChannel(
      tunnel.noise,
      tunnel.connectionId,
      tunnel.clientDeviceId,
      ct => this.sendRelay(ws, tunnel, ct),
      () => this.tunnels.delete(ws),
    )
    tunnel.channel = channel
    await this.connections.accept(channel)
    this.logger.info('direct-connect peer channel ready', { connectionId: tunnel.connectionId, account: tunnel.account })
  }

  private async handleRelay(tunnel: DirectTunnel | undefined, payload: unknown): Promise<void> {
    if (tunnel?.channel === undefined) return
    const p = requireObject(payload)
    if (typeof p.connectionId !== 'string' || p.connectionId !== tunnel.connectionId
      || !Number.isSafeInteger(p.counter) || typeof p.ciphertext !== 'string') {
      throw new ControlError('INVALID_MESSAGE', 'relay payload is invalid')
    }
    tunnel.channel.receive(undefined, fromBase64Url(p.ciphertext))
  }

  private async sendRelay(ws: WebSocket, tunnel: DirectTunnel, ciphertext: Uint8Array): Promise<void> {
    await waitForRelayCapacity(ws)
    this.send(ws, 'relay', {
      connectionId: tunnel.connectionId,
      targetDeviceId: tunnel.clientDeviceId,
      counter: Number(tunnel.noise!.sendingCounter() - 1n),
      ciphertext: toBase64Url(ciphertext),
    } satisfies RelayPayload)
  }

  private send(ws: WebSocket, type: Parameters<typeof createControlFrame>[0], payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) throw new ControlError('CONNECTION_FAILED', 'control socket is not open')
    ws.send(encodeControlFrame(createControlFrame(type, payload), this.limits))
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    try { this.send(ws, 'error', { code, message, retryable: false } satisfies ControlErrorPayload) } catch { /* closing */ }
  }
}

class DirectNoiseChannel implements AuthenticatedPeerChannel {
  readonly security: AuthenticatedPeerChannel['security']
  readonly peerDeviceId: string
  readonly peerIdentityKey: string
  readonly mode = 'Relay' as const
  private readonly handlers = new Set<(message: RemoteMessage) => void>()
  private readonly incoming = new SecureMessageCodec()
  private readonly outgoing = new SecureMessageCodec()
  private readonly sends = new SerialSend()
  private sendTail: Promise<void> = Promise.resolve()
  private closed = false

  constructor(
    private readonly noise: NoiseXxPskSession,
    connectionId: string,
    clientDeviceId: string,
    private readonly transmit: (ciphertext: Uint8Array) => Promise<void>,
    private readonly onClose: () => void,
  ) {
    this.security = { protocol: NOISE_XX_PSK_PROTOCOL, connectionId, authenticatedByPassword: true }
    this.peerDeviceId = clientDeviceId
    this.peerIdentityKey = ''
  }

  async send(message: RemoteMessage): Promise<void> {
    const run = this.sendTail.then(() => this.sendNow(message))
    this.sendTail = run.catch(() => undefined)
    return run
  }

  private async sendNow(message: RemoteMessage): Promise<void> {
    if (this.closed) throw new Error('secure channel is closed')
    const encoded = encodeMessage(message)
    await this.sends.run(encoded.byteLength, async () => {
      if (this.closed) throw new Error('Secure channel closed')
      for (const plaintext of this.outgoing.encode(encoded)) await this.transmit(this.noise.encrypt(plaintext))
    })
  }

  onMessage(handler: (message: RemoteMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  receive(_counter: number | undefined, ciphertext: Uint8Array): void {
    if (this.closed) return
    const plaintext = this.incoming.decode(this.noise.decrypt(ciphertext))
    if (plaintext === undefined) return
    const message = decodeMessage(plaintext)
    for (const handler of this.handlers) handler(message)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.handlers.clear()
    this.incoming.reset()
    this.outgoing.reset()
    this.onClose()
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ControlError('INVALID_MESSAGE', 'Control payload must be an object.')
  }
  return value as Record<string, unknown>
}
function randomId(): string {
  const a = new Uint8Array(9)
  require('node:crypto').randomFillSync(a)
  return Buffer.from(a).toString('base64url')
}
function errorCode(error: unknown): string { return error instanceof ControlError ? error.code : 'CONNECTION_FAILED' }

class ControlError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}
