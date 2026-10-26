import { WorkspaceUploadHost } from './workspace-upload.js'
import { workspaceUploadRootResolver } from './workspace-upload-authority.js'
import { LoopbackHost } from './loopback-host.js'
import { TerminalPolicy } from './terminal-policy.js'
import { createEvent, type RemoteWorkspaceTypeDescription } from '@dsh-remote/protocol'
import { ConnectionController } from './connection-controller.js'
import type { ResolvedConfig } from './config.js'
import type { HostIdentity, IdentityStore } from './identity-store.js'
import {
  harnessSessionGeneration,
  readHarnessDistributionVersion,
} from './harness-version.js'
import type { SafeLogger } from './logging.js'
import { RpcRouter } from './rpc-router.js'
import { RemoteFileViewerBridge, type FileViewerHostServiceLike } from './file-viewer-bridge.js'
import { HostDirectServer } from './host-server.js'
import { LocalCredentialStore } from './local-credentials.js'
import { HarnessRemoteBridge } from './harness-remote-bridge.js'
import type { PluginRouteDispatcher } from './plugin-route-bridge.js'
import { PluginRouteBridge } from './plugin-route-bridge.js'
import type { LocalTypertGateway } from './typert-gateway-contract.js'
import { loadNodeRtcFactory } from './werift-rtc.js'
import type { AuthenticatedPeerChannel } from './types.js'
import { CodexRemoteDomain } from './codex/domain.js'
import { AcpGateway, StdioAcpAdapter } from './acp.js'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { CodexPeerBridge, PublishCodexFrame } from './codex/peer-bridge.js'
import { AcpRemoteGateway } from './acp/gateway.js'
import type { AcpPeerBridge, PublishAcpFrame } from './acp/peer-bridge.js'
import { RpcError } from './safe-error.js'
import { CodexWorkspaceBridge, CodexWorkspaceState, type RemoteTerminalSpawner } from './codex-workspace-bridge.js'

export interface HostConnectedClient {
  deviceId: string
  name: string
  platform?: string
  mode?: 'LAN' | 'P2P' | 'TURN' | 'Relay'
}

export interface HostRemoteStatus {
  deviceId?: string
  configured: boolean
  online: boolean
  reconnecting: boolean
  lastActiveAt?: number
  error?: string
  account?: string
  authorized: boolean
  accountRequired: boolean
  connectedClients: HostConnectedClient[]
  /** Serverless direct-connect listen address, present when the Host is running without a relay Server. */
  directListen?: { host: string; port: number }
}

export class HostPluginRuntime {
  readonly connections: ConnectionController
  private readonly terminalOwners = new Map<string, string>()
  private readonly loopbackHosts = new Set<LoopbackHost>()
  private terminalEnabled: boolean
  private loopbackPorts: readonly number[]
  private identity?: HostIdentity
  private directServer?: HostDirectServer
  private credentialStore?: LocalCredentialStore
  private harnessVersion?: string
  private closed = false
  private readonly codex: CodexRemoteDomain
  private readonly acp: AcpRemoteGateway
  private readonly codexWorkspaceState = new CodexWorkspaceState(key => TerminalPolicy.releaseOwner(this.terminalOwners, key))
  private localCodexPeer?: CodexPeerBridge
  private localCodexPublish: PublishCodexFrame = async () => undefined
  private localAcpPeer?: AcpPeerBridge
  private localAcpPublish: PublishAcpFrame = async () => undefined

  constructor(
    private readonly config: ResolvedConfig,
    private readonly identities: IdentityStore,
    private readonly logger: SafeLogger,
    private readonly localGateway?: LocalTypertGateway,
    private readonly fileViewerHost?: () => FileViewerHostServiceLike | undefined,
    /** PTY-backed terminal provider from the Host `subprocess` service, when present. */
    private readonly terminalSpawner?: RemoteTerminalSpawner,
    private readonly pluginRoutes?: (peer?: unknown) => PluginRouteDispatcher | undefined,
  ) {
    this.terminalEnabled = config.terminal.enabled
    this.loopbackPorts = [...config.loopback.ports]
    this.codex = new CodexRemoteDomain(config.codex, logger)
    this.acp = new AcpRemoteGateway(config.acp ?? { enabled: false, backends: [] }, logger, undefined, undefined, () => this.terminalEnabled, this.terminalSpawner)
    this.connections = new ConnectionController(this.identities, (context, send) => {
      const peerGateway = this.localGateway?.createPeer?.() ?? this.localGateway
      const harnessRemote = peerGateway?.supportsCarrier === true
        ? new HarnessRemoteBridge(
            peerGateway,
            (event, data) => send(createEvent(event, data)),
            this.logger,
            this.harnessVersion,
            new TerminalPolicy(() => this.terminalEnabled, context.peerDeviceId, this.terminalOwners),
            new CodexWorkspaceBridge(
              (threadId, signal) => this.codex.resolveThreadWorkspace(context.connectionId, threadId),
              () => this.terminalEnabled,
              this.codexWorkspaceState,
              this.terminalSpawner,
            ),
          )
        : undefined
      const fileViewer = new RemoteFileViewerBridge(
        () => this.fileViewerHost?.(),
        this.logger,
      )
      const codex = this.codex.createPeer(
        context,
        (event, data) => send(createEvent(event, data)),
      )
      const cursor = this.acp.createPeer(
        context,
        (event, data) => send(createEvent(event, data)),
      )
      // The dispatcher must resolve inside the callback: the DSH connection
      // service (and its shared fetch handler) may become ready after this
      // plugin is activated.
      const dispatcher = this.pluginRoutes?.(peerGateway?.peer)
      const pluginRoute = dispatcher === undefined ? undefined : new PluginRouteBridge(dispatcher, this.logger)
      return new RpcRouter(
        undefined,
        this.logger,
        fileViewer,
        harnessRemote,
        () => this.hostCapabilities(),
        codex,
        cursor,
        // Handles and their lifetime belong to this connection; only policy is shared.
        this.createLoopbackHost(),
        () => this.hostWorkspaceTypes(),
        pluginRoute,
        new WorkspaceUploadHost(workspaceUploadRootResolver(
          peerGateway,
          () => harnessSessionGeneration(this.harnessVersion) === 'v3',
          threadId => this.codex.resolveThreadWorkspace(context.connectionId, threadId),
          sessionId => this.acp.resolveUploadWorkspace(context.connectionId, sessionId),
        )),
      )
    }, this.logger)
  }

  setTerminalEnabled(enabled: boolean): void {
    this.terminalEnabled = enabled
  }

  setLoopbackPorts(ports: readonly number[]): void {
    this.loopbackPorts = [...ports]
    for (const loopback of this.loopbackHosts) loopback.setPorts(this.loopbackPorts)
  }

  private backendUpdate: Promise<void> = Promise.resolve()

  setAgentBackends(config: ResolvedConfig): Promise<void> {
    const update = this.backendUpdate.catch(() => undefined).then(async () => {
      if (this.closed) throw new Error('remote runtime is closed')
      const codexChanged = JSON.stringify(this.config.codex) !== JSON.stringify(config.codex)
      await Promise.all([this.codex.reconfigure(config.codex), this.acp.reconfigure(config.acp ?? { enabled: false, backends: [] })])
      if (codexChanged) await this.codexWorkspaceState.dispose()
      this.config.codex = config.codex
    })
    this.backendUpdate = update
    return update
  }

  private createLoopbackHost(): LoopbackHost {
    let loopback: LoopbackHost
    loopback = new LoopbackHost(() => this.loopbackPorts, () => this.loopbackHosts.delete(loopback))
    this.loopbackHosts.add(loopback)
    return loopback
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('remote runtime is closed')
    this.identity = await this.identities.loadOrCreate(this.config.deviceName)
    this.logger.info('host identity ready', {
      deviceId: shortId(this.identity.deviceId),
      fingerprint: this.identity.fingerprint,
      server: this.config.serverUrl ?? 'not configured',
    })
    await this.codex.start()
    void this.acp.start().catch(() => {
      this.logger.warn('ACP background initialization failed', { code: 'ACP_START_FAILED' })
    })
    this.harnessVersion = await this.readHarnessVersion()
    this.credentialStore = new LocalCredentialStore()
    this.directServer = new HostDirectServer(
      this.config.listen,
      this.identity,
      this.identities,
      this.credentialStore,
      this.connections,
      this.logger,
      () => this.hostCapabilities(),
      this.harnessVersion,
    )
    if (this.config.hostControl?.enabled !== false) this.directServer.start()
  }

  currentIdentity(): HostIdentity {
    if (this.identity === undefined) throw new Error('remote runtime has not started')
    return this.identity
  }

  acceptAuthenticatedPeer(channel: AuthenticatedPeerChannel): Promise<void> {
    this.currentIdentity()
    return this.connections.accept(channel)
  }

  hostStatus(): HostRemoteStatus {
    const listen = this.directServer?.listenAddress()
    return {
      ...(this.identity === undefined ? {} : { deviceId: this.identity.deviceId }),
      configured: true,
      online: this.directServer !== undefined,
      reconnecting: false,
      ...(listen === undefined ? {} : { directListen: listen }),
      authorized: this.credentialStore !== undefined,
      accountRequired: false,
      connectedClients: this.listConnectedClients(),
    }
  }

  private listConnectedClients(): HostConnectedClient[] {
    return this.connections.connectedPeers().map(peer => {
      const trusted = this.identities.trustedPeer(peer.deviceId)
      return {
        deviceId: peer.deviceId,
        name: trusted?.name.trim() ?? '',
        ...(trusted === undefined ? {} : { platform: trusted.platform }),
        ...(peer.mode === undefined ? {} : { mode: peer.mode }),
      }
    })
  }

  localHarnessVersion(): string | undefined {
    return this.harnessVersion
  }

  async revokePeer(deviceId: string): Promise<boolean> {
    const revoked = await this.identities.revokePeer(deviceId)
    if (revoked) await this.connections.revoke(deviceId)
    return revoked
  }

  codexStatus(): ReturnType<CodexRemoteDomain['status']> {
    return this.codex.status()
  }

  codexCall(input: unknown): Promise<unknown> {
    return this.requireLocalCodexPeer().call(input)
  }

  codexRespond(input: unknown): Promise<{ resolved: true }> {
    return this.requireLocalCodexPeer().respond(input)
  }

  codexOpenStream(input: unknown, publish: PublishCodexFrame): Promise<unknown> {
    this.localCodexPublish = publish
    return this.requireLocalCodexPeer().openStream(input)
  }

  async codexCloseStream(input: unknown): Promise<unknown> {
    const peer = this.localCodexPeer
    if (peer !== undefined) return peer.closeStream(input)
    const streamId = isPlainRecord(input) && typeof input.streamId === 'string' ? input.streamId : undefined
    if (streamId === undefined) throw new RpcError('INVALID_MESSAGE', 'A Codex stream is required.')
    return { closed: false, streamId }
  }

  acpStatus(): ReturnType<AcpRemoteGateway['status']> {
    return this.acp.status()
  }

  acpCall(input: unknown): Promise<unknown> {
    return this.requireLocalAcpPeer().call(input)
  }

  acpRespond(input: unknown): Promise<{ resolved: true }> {
    return this.requireLocalAcpPeer().respond(input)
  }

  acpOpenStream(input: unknown, publish: PublishAcpFrame): Promise<unknown> {
    this.localAcpPublish = publish
    return this.requireLocalAcpPeer().openStream(input)
  }

  async acpCloseStream(input: unknown): Promise<unknown> {
    const peer = this.localAcpPeer
    if (peer !== undefined) return peer.closeStream(input)
    const streamId = isPlainRecord(input) && typeof input.streamId === 'string' ? input.streamId : undefined
    if (streamId === undefined) throw new RpcError('INVALID_MESSAGE', 'A Cursor stream is required.')
    return { closed: false, streamId }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.directServer?.stop().catch(() => undefined)
    this.directServer = undefined
    this.credentialStore = undefined
    await this.connections.close()
    await this.localCodexPeer?.closeAll()
    this.localCodexPeer = undefined
    await this.localAcpPeer?.closeAll()
    this.localAcpPeer = undefined
    const shutdown = await Promise.allSettled([this.codexWorkspaceState.dispose(), this.codex.close(), this.acp.close()])
    if (shutdown.some(result => result.status === 'rejected')) throw new RpcError('HOST_SHUTDOWN_FAILED', 'Some Host backend processes could not be stopped.')
    this.logger.info('host runtime stopped')
  }

  diagnostics() {
    return {
      loaded: this.identity !== undefined,
      deviceId: this.identity === undefined ? undefined : shortId(this.identity.deviceId),
      identityValid: this.identity !== undefined,
      online: this.connections.isOnline(),
      activeConnections: this.connections.connectionCount(),
      peerDeviceId: this.connections.peerDeviceId() === undefined ? undefined : shortId(this.connections.peerDeviceId()!),
      peerDeviceIds: this.connections.peerDeviceIds().map(shortId),
      trustedPeers: this.identities.listTrustedPeers().length,
      capabilities: this.hostCapabilities(),
      workspaceTypes: this.hostWorkspaceTypes(),
      codex: this.codex.status(),
      acp: this.acp.status(),
    }
  }

  private async readHarnessVersion(): Promise<string | undefined> {
    const version = await readHarnessDistributionVersion()
    if (version === undefined) this.logger.warn('Harness version is unavailable')
    return version
  }

  private hostCapabilities(): string[] {
    const capabilities: string[] = ['workspace.upload.v1']
    if (this.loopbackPorts.length > 0) capabilities.push('loopback.http-ws.v1')
    if (this.localGateway?.supportsCarrier === true) {
      capabilities.push(
        harnessSessionGeneration(this.harnessVersion) === 'v3' ? 'harness.remote.v3' : 'harness.remote.v1',
        'harness.remote.transfer.v1',
      )
    }
    if (this.localGateway?.supportsCarrier && this.terminalEnabled) capabilities.push('harness.terminal.v1')
    if (this.fileViewerHost?.() !== undefined) capabilities.push('fileviewer.read.v1')
    if (this.pluginRoutes?.() !== undefined) capabilities.push('plugin.route.v1')
    if (this.codex.isAvailable()) capabilities.push('codex.appserver.v1', 'codex.appserver.transfer.v1')
    // Protocol support is stable during background warmup; workspaceTypes reports readiness.
    if (this.acp.enabledBackends().length > 0) {
      capabilities.push('agent.acp.v1', 'agent.acp.transfer.v1', 'agent.acp.workspace-files.v1')
      if (this.acp.enabledBackends().includes('opencode')) capabilities.push('agent.acp.opencode.archive.v1')
      if (this.terminalEnabled) capabilities.push('agent.acp.terminal.v1')
      if (this.acp.enabledBackends().includes('antigravity')) capabilities.push('agent.acp.antigravity.models.v1', 'agent.acp.antigravity.model-load.v1')
      for (const backend of this.acp.enabledBackends()) {
        capabilities.push(`agent.acp.${backend}.v1`)
      }
    }
    return capabilities
  }

  private hostWorkspaceTypes(): RemoteWorkspaceTypeDescription[] {
    const types: RemoteWorkspaceTypeDescription[] = []
    if (this.codex.isAvailable()) {
      types.push({
        id: 'codex',
        name: 'CodeX',
        capability: 'codex.appserver.v1',
        available: true,
      })
    }
    const readyBackends = this.acp.availableBackends()
    for (const backend of this.acp.enabledBackends()) {
      types.push({
        id: backend,
        name: backend === 'claude' ? 'Claude' : backend === 'pi' ? 'Pi' : backend === 'cursor' ? 'Cursor' : backend === 'antigravity' ? 'Antigravity' : backend === 'opencode' ? 'OpenCode' : backend,
        capability: `agent.acp.${backend}.v1`,
        available: readyBackends.includes(backend),
      })
    }
    return types
  }

  private acpAvailable(command: string): boolean {
    if (command === 'opencode') {
      try {
        if (existsSync('/usr/local/bin/opencode') || existsSync('/var/lib/dsh/.opencode/bin/opencode')) return true
      } catch {}
    }
    try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' }); return true } catch { return false }
  }

  private requireLocalCodexPeer(): CodexPeerBridge {
    if (!this.codex.isAvailable()) {
      throw new RpcError('CODEX_UNAVAILABLE', 'Local CodeX is disabled or unavailable on this Host.')
    }
    if (this.localCodexPeer !== undefined) return this.localCodexPeer
    const identity = this.currentIdentity()
    const peer = this.codex.createPeer({
      connectionId: `loopback:${identity.deviceId}`,
      peerDeviceId: identity.deviceId,
    }, (event, data) => this.localCodexPublish(event, data))
    if (peer === undefined) {
      throw new RpcError('CODEX_UNAVAILABLE', 'Local CodeX is disabled or unavailable on this Host.')
    }
    this.localCodexPeer = peer
    return peer
  }

  private requireLocalAcpPeer(): AcpPeerBridge {
    if (!this.acp.isAvailable()) {
      throw new RpcError('CURSOR_UNAVAILABLE', 'Local Agent ACP is disabled or unavailable on this Host.')
    }
    if (this.localAcpPeer !== undefined) return this.localAcpPeer
    const identity = this.currentIdentity()
    const peer = this.acp.createPeer({
      connectionId: `loopback:${identity.deviceId}`,
      peerDeviceId: identity.deviceId,
    }, (event, data) => this.localAcpPublish(event, data))
    if (peer === undefined) {
      throw new RpcError('CURSOR_UNAVAILABLE', 'Local Agent ACP is disabled or unavailable on this Host.')
    }
    this.localAcpPeer = peer
    return peer
  }
}

function shortId(value: string): string { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}` }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
