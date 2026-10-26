import { NoiseIkSession, NoiseXxPskSession, createDirectNoisePrologue, createNoisePrologue, derivePsk } from '@dsh-remote/crypto'
import { SecureMessageCodec } from '@dsh-remote/protocol'
import type { RemoteTransport, SecureHandshakeTransport } from '@dsh-remote/webrtc'
import { strings } from '../locales/i18n'
import type { DeviceIdentity, RemoteDevice } from '../types'
import { DirectTransport, type DirectCredentials } from './direct-transport'

export class SecureTransport implements RemoteTransport {
  private noise?: NoiseIkSession
  private unsubscribeInner?: () => void
  private readonly incoming = new SecureMessageCodec()
  private readonly outgoing = new SecureMessageCodec()
  private closed = false
  /** Noise + SecureMessageCodec counters are not re-entrant; serialize sends. */
  private sendTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly inner: SecureHandshakeTransport,
    private readonly identity: DeviceIdentity,
    private readonly host: RemoteDevice,
    private readonly onHandshakeStarting?: () => void,
  ) {
    if (host.identityKey.length === 0) throw new Error(strings.runtime.hostMissingKey)
  }

  async connect(): Promise<void> {
    this.closed = false
    this.incoming.reset()
    this.outgoing.reset()
    await this.inner.connect()
    const info = this.inner.connectionInfo()
    if (info.localDeviceId !== this.identity.deviceId || info.remoteDeviceId !== this.host.deviceId) {
      await this.inner.close()
      throw new Error(strings.runtime.unexpectedRelayDevice)
    }
    this.onHandshakeStarting?.()
    const noise = new NoiseIkSession({
      role: 'initiator',
      localPrivateKey: this.identity.privateKey,
      localPublicKey: this.identity.publicKey,
      remotePublicKey: this.host.identityKey,
      prologue: createNoisePrologue(info.connectionId, this.host.deviceId, this.identity.deviceId),
    })
    this.noise = noise
    try {
      await waitForResponder(this.inner, noise)
    } catch (error) {
      noise.destroy()
      this.noise = undefined
      await this.inner.close()
      throw error
    }
  }

  async send(data: Uint8Array): Promise<void> {
    const run = this.sendTail.then(() => this.sendNow(data))
    this.sendTail = run.catch(() => undefined)
    return run
  }

  private async sendNow(data: Uint8Array): Promise<void> {
    const plaintextFrames = this.outgoing.encode(data)
    try {
      for (const plaintext of plaintextFrames) {
        await this.inner.send(this.requireNoise().encrypt(plaintext))
      }
    } catch (error) {
      console.warn('[dsh-remote] Secure send failed; closing carrier')
      await this.close().catch(() => undefined)
      throw error
    }
  }

  onMessage(cb: (data: Uint8Array) => void): () => void {
    this.unsubscribeInner?.()
    this.unsubscribeInner = this.inner.onMessage(data => {
      const noise = this.noise
      if (noise === undefined || !noise.complete || this.closed) return
      let stage = 'decrypt'
      try {
        const plaintext = noise.decrypt(data)
        stage = 'reassembly'
        const message = this.incoming.decode(plaintext)
        if (message !== undefined) {
          stage = 'message-handler'
          cb(message)
        }
      } catch (error) {
        // Only known error classes and numeric bundle positions. Error messages
        // and arbitrary stack lines can contain decrypted application content.
        const name = error instanceof Error
          && ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'ZodError'].includes(error.name)
          ? error.name : 'unknown'
        const positions = error instanceof Error && typeof error.stack === 'string'
          ? [...error.stack.matchAll(/index\.android\.bundle:(\d+):(\d+)/g)]
            .slice(0, 12).map(match => `${match[1]}:${match[2]}`) : []
        console.warn('[dsh-remote] Secure receive failed:', stage, name, JSON.stringify(positions))
        void this.close()
      }
    })
    return () => {
      this.unsubscribeInner?.()
      this.unsubscribeInner = undefined
    }
  }

  onClose(handler: () => void): () => void {
    return this.inner.onClose?.(handler) ?? (() => undefined)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.unsubscribeInner?.()
    this.unsubscribeInner = undefined
    this.incoming.reset()
    this.outgoing.reset()
    this.noise?.destroy()
    this.noise = undefined
    await this.inner.close()
  }

  getStats() { return this.inner.getStats() }

  private requireNoise(): NoiseIkSession {
    if (this.noise === undefined || !this.noise.complete || this.closed) {
      throw new Error(strings.runtime.secureChannelNotConnected)
    }
    return this.noise
  }
}

async function waitForResponder(inner: SecureHandshakeTransport, noise: NoiseIkSession): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error(strings.runtime.secureHandshakeTimedOut)), 10_000)
    const unsubscribe = inner.onHandshake((step, data) => {
      if (settled) return
      try {
        if (step !== 2) throw new Error(strings.runtime.secureHandshakeOrder)
        noise.readHandshake(data)
        if (!noise.complete) throw new Error(strings.runtime.secureHandshakeIncomplete)
        finish()
      } catch (error) {
        finish(error instanceof Error ? error : new Error(strings.runtime.secureHandshakeFailed))
      }
    })
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      if (error === undefined) resolve()
      else reject(error)
    }
    void inner.sendHandshake(1, noise.writeHandshake()).catch(error => {
      finish(error instanceof Error ? error : new Error(strings.runtime.secureHandshakeFailed))
    })
  })
}

/**
 * Secure channel for the serverless direct-connect mode: Noise XXpsk3 with a
 * PSK derived from the local Host account password. The Host's identity key
 * is learned inside the handshake (the PSK authenticates it), so unlike
 * `SecureTransport` there is no pre-pinned `identityKey` to verify.
 */
export class DirectSecureTransport implements RemoteTransport {
  private noise?: NoiseXxPskSession
  private unsubscribeInner?: () => void
  private readonly incoming = new SecureMessageCodec()
  private readonly outgoing = new SecureMessageCodec()
  private closed = false
  /** Noise + SecureMessageCodec counters are not re-entrant; serialize sends. */
  private sendTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly inner: DirectTransport,
    private readonly identity: DeviceIdentity,
    private readonly credentials: DirectCredentials,
  ) {}

  async connect(): Promise<void> {
    this.closed = false
    this.incoming.reset()
    this.outgoing.reset()
    await this.inner.connect()
    const info = this.inner.connectionInfo()
    const noise = new NoiseXxPskSession({
      role: 'initiator',
      localPrivateKey: this.identity.privateKey,
      localPublicKey: this.identity.publicKey,
      psk: derivePsk(this.credentials.password, this.credentials.account),
      prologue: createDirectNoisePrologue(this.credentials.account, info.connectionId),
    })
    this.noise = noise
    try {
      // XXpsk3 initiator: message 1 ->, <- message 2, -> message 3.
      await this.inner.sendHandshake(1, noise.writeHandshake())
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          unsubscribe()
          if (error === undefined) resolve()
          else reject(error)
        }
        const timer = setTimeout(() => finish(new Error(strings.runtime.secureHandshakeTimedOut)), 10_000)
        const unsubscribe = this.inner.onHandshake((step, data) => {
          if (settled) return
          try {
            if (step !== 2) throw new Error(strings.runtime.secureHandshakeOrder)
            noise.readHandshake(data)
            if (!noise.complete) throw new Error(strings.runtime.secureHandshakeIncomplete)
            finish()
          } catch (error) {
            finish(error instanceof Error ? error : new Error(strings.runtime.secureHandshakeFailed))
          }
        })
      })
      await this.inner.sendHandshake(3, noise.writeHandshake())
      if (!noise.complete) throw new Error(strings.runtime.secureHandshakeIncomplete)
    } catch (error) {
      noise.destroy()
      this.noise = undefined
      await this.inner.close()
      throw error
    }
  }

  async send(data: Uint8Array): Promise<void> {
    const run = this.sendTail.then(() => this.sendNow(data))
    this.sendTail = run.catch(() => undefined)
    return run
  }

  private async sendNow(data: Uint8Array): Promise<void> {
    const plaintextFrames = this.outgoing.encode(data)
    try {
      for (const plaintext of plaintextFrames) {
        await this.inner.send(this.requireNoise().encrypt(plaintext))
      }
    } catch (error) {
      console.warn('[dsh-remote] Direct secure send failed; closing carrier')
      await this.close().catch(() => undefined)
      throw error
    }
  }

  onMessage(cb: (data: Uint8Array) => void): () => void {
    this.unsubscribeInner?.()
    this.unsubscribeInner = this.inner.onMessage(data => {
      const noise = this.noise
      if (noise === undefined || !noise.complete || this.closed) return
      try {
        const plaintext = noise.decrypt(data)
        const message = this.incoming.decode(plaintext)
        if (message !== undefined) cb(message)
      } catch {
        // Malformed frames must not crash the app; the carrier close handler
        // drives recovery exactly like the relayed SecureTransport path.
      }
    })
    return () => {
      this.unsubscribeInner?.()
      this.unsubscribeInner = undefined
    }
  }

  onClose(handler: (error?: Error) => void): () => void {
    return this.inner.onClose(handler)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.unsubscribeInner?.()
    this.unsubscribeInner = undefined
    this.incoming.reset()
    this.outgoing.reset()
    this.noise?.destroy()
    this.noise = undefined
    await this.inner.close()
  }

  getStats() { return this.inner.getStats() }

  private requireNoise(): NoiseXxPskSession {
    const noise = this.noise
    if (noise === undefined || !noise.complete) throw new Error(strings.runtime.secureChannelNotConnected)
    return noise
  }
}
