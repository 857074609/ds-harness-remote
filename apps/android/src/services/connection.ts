import { AgentAcpClient, CodexRemoteClient, HarnessAlphaClient, RemoteClientCore, RemoteTypertGateway, probeRemoteHostFeatures, remoteWorkspaceTypeAvailable, type RemoteHostFeatures } from '@dsh-remote/client-core'
import { strings } from '../locales/i18n'
import type { DeviceIdentity, MuxStreamFrame } from '../types'
import { AcpSessionTools, HarnessSessionTools, type SessionTools } from './session-tools'
import { DirectTransport, type DirectCredentials, type DirectEndpoint } from './direct-transport'
import { DirectSecureTransport, SecureTransport } from './secure-transport'
import { BotRemoteClient } from './bot-catalog'

/**
 * Inbound silence that counts as a dead tunnel. The heartbeat answers every
 * 25s, so this tolerates several missed rounds before closing.
 */
const SILENT_TUNNEL_MS = 120_000

export type MuxFrameHandler = (frame: MuxStreamFrame) => void
export type CloseHandler = (options?: { retryable: boolean }) => void
type RemoteHarnessClient = HarnessAlphaClient

export interface AndroidConnectionOptions {
  onOpencodeArchived?: (sessionId: string) => void
  onSecureHandshake?: () => void
  onClose?: CloseHandler
}

export class AndroidRemoteConnection {
  private compactHistorySupported = false
  private pluginRouteSupported = false
  private core?: RemoteClientCore
  private proxy?: RemoteHarnessClient
  private codex?: CodexRemoteClient
  private cursor?: AgentAcpClient
  private acpBackends = new Set<string>()
  private codexAvailable = false
  private sessionTools?: HarnessSessionTools
  private closeMux?: (notifyRemote?: boolean) => Promise<void>
  private unsubscribeClose?: () => void
  private unsubscribeArchived?: () => void
  private muxHandler?: MuxFrameHandler
  private transport?: DirectTransport
  private connectionAttempt = 0
  private healthTimer?: ReturnType<typeof setTimeout>
  /** Consecutive probe misses; a teardown needs more than one. */
  private healthFailures = 0

  private healthFlight?: { core: RemoteClientCore; result: Promise<boolean> }

  async configureHistory(compact: boolean): Promise<void> {
    if (this.core !== undefined && this.compactHistorySupported) {
      await this.core.rpc('remote.history.configure', { compact })
    }
  }

  async refreshBackends(): Promise<void> {
    if (this.core === undefined) throw new Error(strings.runtime.connectHostFirst)
    const core = this.core
    const features = await probeRemoteHostFeatures(core)
    if (this.core !== core) return
    this.applyBackendFeatures(core, features)
  }

  private applyBackendFeatures(core: RemoteClientCore, features: RemoteHostFeatures): void {
    this.pluginRouteSupported = features.pluginRoute
    this.codexAvailable = features.capabilities.includes('codex.appserver.transfer.v1')
      && remoteWorkspaceTypeAvailable(features.capabilities, features.workspaceTypes, 'codex', 'codex.appserver.v1')
    if (this.codexAvailable) this.codex ??= new CodexRemoteClient(core, true)
    this.acpBackends.clear()
    for (const backend of ['cursor', 'antigravity', 'pi', 'opencode', 'claude'] as const) {
      if (remoteWorkspaceTypeAvailable(features.capabilities, features.workspaceTypes, backend, `agent.acp.${backend}.v1`)) {
        this.acpBackends.add(backend)
      }
    }
    if (this.acpBackends.size > 0) this.cursor ??= new AgentAcpClient(core, features.capabilities)
  }

  /** Harness business client; only available while connected. */
  requireProxy(): RemoteHarnessClient {
    if (this.proxy === undefined) throw new Error(strings.runtime.connectHostFirst)
    return this.proxy
  }

  /** Read an existing session reference through its native carrier; never accept a filesystem path. */
  async readSessionImageAttachment(sessionId: string, attachmentId: string, signal: AbortSignal): Promise<unknown> {
    const core = this.core
    const proxy = this.requireProxy()
    if (core === undefined) throw new Error(strings.runtime.connectHostFirst)
    const value = await new RemoteTypertGateway(core).call<unknown>('session/attachment', {
      args: { request: { sessionId, attachmentId } },
    }, signal, { maxResponseBytes: 12 * 1024 * 1024 })
    if (this.core !== core || this.proxy !== proxy || signal.aborted) throw new Error(strings.runtime.connectHostFirst)
    // Typert versions may preserve the official business Result inside the carrier result.
    if (typeof value === 'object' && value !== null && 'ok' in value) {
      if (value.ok === true && 'value' in value) return value.value
      throw new Error(strings.common.unavailable)
    }
    return value
  }

  requireBotClient(): BotRemoteClient {
    const core = this.core
    const proxy = this.proxy
    if (core === undefined || proxy === undefined) throw new Error(strings.runtime.connectHostFirst)
    if (!this.pluginRouteSupported) throw new Error(strings.bots.unsupported)
    const current = () => {
      if (this.core !== core || this.proxy !== proxy) throw new Error(strings.runtime.connectHostFirst)
      if (!this.pluginRouteSupported) throw new Error(strings.bots.unsupported)
    }
    return new BotRemoteClient(
      (body, signal) => { current(); return core.rpc('plugin.route.call', { route: 'api/bot', body }, signal) },
      () => { current(); return proxy.sessionList() },
      current,
    )
  }

  /** Optional CodeX business client; available only when the Host advertises both domain capabilities. */
  requireCodex(): CodexRemoteClient {
    if (this.codex === undefined || !this.codexAvailable) throw new Error(strings.runtime.codexUnavailable)
    return this.codex
  }

  requireSessionTools(sessionId?: string): SessionTools {
    if (sessionId?.startsWith('cursor:') && this.cursor !== undefined) return new AcpSessionTools(this.cursor, 'cursor')
    if (sessionId?.startsWith('pi:')) return new AcpSessionTools(this.requirePi(), 'pi')
    if (sessionId?.startsWith('antigravity:') && this.cursor !== undefined) return new AcpSessionTools(this.cursor, 'antigravity')
    if (sessionId?.startsWith('claude:')) throw new Error('Claude workspace tools are not available.')
    if (sessionId?.startsWith('opencode:') && this.cursor !== undefined) return new AcpSessionTools(this.cursor, 'opencode')
    if (this.sessionTools === undefined) throw Object.assign(new Error('Native session tools require a compatible Host.'), { code: 'FEATURE_NOT_SUPPORTED' })
    return this.sessionTools
  }

  hasCodex(): boolean {
    return this.codex !== undefined && this.codexAvailable
  }

  /** Optional Agent ACP client (Cursor UI backend); available when the Host advertises agent.acp.cursor.v1. */
  requireCursor(): AgentAcpClient {
    if (this.cursor === undefined || !this.acpBackends.has('cursor')) throw new Error(strings.runtime.cursorUnavailable)
    return this.cursor
  }

  hasCursor(): boolean {
    return this.cursor !== undefined && this.acpBackends.has('cursor')
  }

  /** Optional Agent ACP client (Antigravity UI backend); available when the Host advertises agent.acp.antigravity.v1. */
  requireAntigravity(): AgentAcpClient {
    if (this.cursor === undefined || !this.acpBackends.has('antigravity')) throw new Error(strings.runtime.antigravityUnavailable)
    return this.cursor
  }

  hasAntigravity(): boolean {
    return this.cursor !== undefined && this.acpBackends.has('antigravity')
  }

  requirePi(): AgentAcpClient {
    if (this.cursor === undefined || !this.acpBackends.has('pi')) throw new Error(strings.runtime.piUnavailable)
    return this.cursor
  }

  hasPi(): boolean {
    return this.cursor !== undefined && this.acpBackends.has('pi')
  }

  /** Optional Agent ACP client (OpenCode UI backend); available when the Host advertises agent.acp.opencode.v1. */
  requireOpencode(): AgentAcpClient {
    if (this.cursor === undefined || !this.acpBackends.has('opencode')) throw new Error(strings.runtime.opencodeUnavailable)
    return this.cursor
  }

  hasOpencode(): boolean {
    return this.cursor !== undefined && this.acpBackends.has('opencode')
  }

  requireClaude(): AgentAcpClient {
    if (this.cursor === undefined || !this.acpBackends.has('claude')) throw new Error(strings.runtime.claudeUnavailable)
    return this.cursor
  }

  hasClaude(): boolean {
    return this.cursor !== undefined && this.acpBackends.has('claude')
  }

  getStats() {
    return this.core?.getStats()
  }

  /** A locally open socket can be half-open after Android suspends networking. */
  checkHealth(): Promise<boolean> {
    const core = this.core
    if (core === undefined || !core.getStats().connected) return Promise.resolve(false)
    if (this.healthFlight?.core === core) return this.healthFlight.result
    const result = this.probeHealth(core)
    this.healthFlight = { core, result }
    void result.finally(() => {
      if (this.healthFlight?.result === result) this.healthFlight = undefined
    })
    return result
  }

  private async probeHealth(core: RemoteClientCore): Promise<boolean> {
    // Live traffic is stronger evidence than a probe: an agent run streams
    // frames continuously, and probing a busy Host only produces false alarms
    // (the "device disconnected" banner while the tunnel is perfectly fine).
    const lastAt = (this.transport as DirectTransport | undefined)?.lastMessageAt ?? 0
    if (lastAt > 0 && Date.now() - lastAt < 90_000) return this.core === core
    for (let attempt = 0; ; attempt += 1) {
      try {
        // Existing authenticated, encrypted capability RPC; no new wire heartbeat.
        // A Host busy with an agent run can miss a short window, so allow a
        // generous timeout and one retry before declaring the tunnel dead.
        await core.rpc('harness.transport.describe', {}, undefined, { timeoutMs: 12_000 })
        return this.core === core
      } catch {
        if (this.core !== core) return false
        if (attempt >= 1) return false
        await new Promise(resolve => setTimeout(resolve, 2_000))
        if (this.core !== core) return false
      }
    }
  }

  private scheduleHealthCheck(core: RemoteClientCore): void {
    this.clearHealthTimer()
    // No client-side teardown: the socket's onclose is the only authority on
    // liveness. Timers here produced a reconnect every few minutes on tunnels
    // that were perfectly healthy.
    this.healthTimer = undefined
  }

  private clearHealthTimer(): void {
    if (this.healthTimer !== undefined) clearTimeout(this.healthTimer)
    this.healthTimer = undefined
  }

  async getNetworkDetails(): Promise<undefined> {
    return undefined
  }

  /**
   * Connect to a Host that serves its built-in serverless direct listener:
   * no relay Server, no OAuth access token — the local account password both
   * authenticates the hello frame and derives the Noise PSK. Returns the
   * Host's device id as announced in hello.ack.
   */
  async connectDirect(
    endpoint: DirectEndpoint,
    credentials: DirectCredentials,
    identity: DeviceIdentity,
    onFrame: MuxFrameHandler,
    options: AndroidConnectionOptions = {},
  ): Promise<string> {
    const attempt = ++this.connectionAttempt
    await this.clearConnection()
    if (attempt !== this.connectionAttempt) throw new Error('The connection attempt was superseded.')
    this.muxHandler = onFrame
    const transport = new DirectTransport(endpoint, credentials, identity.deviceId)
    this.transport = transport
    // Host-side Typert calls are capped at 30s. Leave a small delivery
    // margin, then treat silence as an unhealthy business channel.
    const core = new RemoteClientCore(
      new DirectSecureTransport(transport, identity, credentials),
      35_000,
    )
    this.core = core
    this.healthFailures = 0
    this.unsubscribeClose = core.onClose(() => {
      if (this.core !== core) return
      this.clearHealthTimer()
      void this.closeMux?.(false)
      this.closeMux = undefined
      this.core = undefined
      this.proxy = undefined
      this.codex = undefined
      this.codexAvailable = false
      this.cursor = undefined
      this.acpBackends.clear()
      this.sessionTools = undefined
      options.onClose?.({ retryable: true })
    })
    options.onSecureHandshake?.()
    await core.connect()
    if (attempt !== this.connectionAttempt || this.core !== core) {
      throw new Error('The connection attempt was superseded.')
    }
    // The direct path must expose the business client exactly like the
    // probe-verified stack: RPCs (hostDescribe, session list) go through it.
    //
    // Three constructor details decide whether the phone streams at all:
    // `sessionFormat: 3` makes `session/follow` ask for assistant chunks (a
    // Host that advertises `harness.remote.v3`), `onFrame` is the only way the
    // store ever sees live events, and `start()` opens the `$events` /
    // `session/control` pumps that carry approvals, questions and projections.
    // Omitting any of them left the app with a silent timeline: replies only
    // appeared when history was re-read, and approvals never arrived.
    const proxy = new HarnessAlphaClient(
      core,
      await this.describeHarnessHost(core),
      frame => {
        // HarnessClientFrame.payload is an open record; the store's MuxStreamFrame
        // requires a discriminant. Every frame the client emits carries one, so
        // gate on it instead of casting blindly.
        if (typeof frame.payload.type !== 'string') return
        this.muxHandler?.(frame as unknown as MuxStreamFrame)
      },
    )
    this.proxy = proxy
    proxy.start()
    return transport.getHostDeviceId()
  }

  /**
   * The Host states its Session wire generation in `harness.transport.describe`.
   * A failed probe keeps the client on the legacy path rather than guessing a
   * format the Host may not implement.
   */
  private async describeHarnessHost(core: RemoteClientCore): Promise<{ sessionFormat?: 3 }> {
    try {
      const description = await core.rpc('harness.transport.describe', {}) as { capabilities?: unknown }
      const capabilities = Array.isArray(description.capabilities) ? description.capabilities : []
      return capabilities.includes('harness.remote.v3') ? { sessionFormat: 3 } : {}
    } catch {
      return {}
    }
  }

  async close(): Promise<void> {
    ++this.connectionAttempt
    await this.clearConnection()
  }

  private async clearConnection(): Promise<void> {
    this.clearHealthTimer()
    this.muxHandler = undefined
    const mux = this.closeMux
    this.closeMux = undefined
    const core = this.core
    this.core = undefined
    // Closing the whole transport makes a remote stream-close redundant.
    // Only remove the local subscription here so a half-open RTC path cannot
    // add another RPC timeout before recovery begins.
    this.unsubscribeClose?.()
    this.unsubscribeClose = undefined
    this.unsubscribeArchived?.()
    this.unsubscribeArchived = undefined
    this.transport = undefined
    const proxy = this.proxy
    this.proxy = undefined
    this.codex = undefined
    this.codexAvailable = false
    this.cursor = undefined
    this.acpBackends.clear()
    this.sessionTools = undefined
    if (mux !== undefined) await mux(false).catch(() => undefined)
    // Release the two permanent pumps before the transport goes away so their
    // stream slots are returned while the RPC channel still works.
    if (proxy !== undefined) await proxy.close(false).catch(() => undefined)
    if (core !== undefined) await core.close()
  }
}
