import * as DshConnection from '@deepseek-ai/dsh-client-connection'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.settings` Context merge and the rc.1 forms type.
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import {
  Config,
  DEFAULT_REMOTE_SERVER_URL,
  resolveConfig,
  type Config as ConfigShape,
  type ConfigInput,
  type EntryConfig,
  type ResolvedConfig,
} from './config.js'
interface HostWebServerLike { port?: number }
interface PluginSettingsBinding {
  get(): ConfigInput
  replace(section: ConfigShape): Promise<unknown>
}
import { IdentityStore, serverStorageDirectory } from './identity-store.js'
import { SafeLogger } from './logging.js'
import { HostPluginRuntime } from './service.js'
import type { TypertGatewayLike } from './typert-gateway-contract.js'
import { subprocessTerminalSpawner, type HostSubprocessLike } from './codex-workspace-bridge.js'
import { TypertGatewaySwitch } from './typert-gateway-switch.js'
import type { FileViewerHostServiceLike } from './file-viewer-bridge.js'
import { createPluginRouteDispatcher, type PluginRouteConnectionLike } from './plugin-route-dispatcher.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshRemote: HostPluginRuntime
    typertGateway: TypertGatewayLike
  }
}

export const name = 'ds-harness-remote'
export { Config }

const legacyLoaderModuleNames = new Set(['dsh-remote', '@dsh-remote/plugin'])
// Settings-registry generation (≤0.1.6). The branded `SettingsNamespace` type
// was removed with the registry in rc.1, so the literals stay plain strings.
const pluginSettingsNamespace = 'ds-harness-remote'
const legacySettingsNamespace = 'dsh-remote'

/** Fallback entry id when the Loader cannot locate this plugin's entry. */
const DEFAULT_ENTRY_ID = 'ds-harness-remote'
/** Root include entry id prefixing every profile row's Loader path id. */
const INCLUDE_ENTRY_PREFIX = 'include:'

/**
 * ≤0.1.6 settings registry seam (removed by DSH 0.1.7-rc.1, DSH-0.1.7-RC1-04).
 * Kept structural so the plugin can still activate on the registry generation
 * while `ctx.settings` types only describe the rc.1 `SettingsForms` face.
 */
interface LegacySettingsScopeLike {
  get(): ConfigInput
  replace(section: Config): Promise<unknown>
}

interface LegacySettingsProviderLike {
  register(ns: string, schema: unknown, options: {
    base?: ConfigInput
    applies?: 'live' | 'restart'
    validate?: (value: ConfigInput) => void
  }): LegacySettingsScopeLike
  describe?(): Array<{ ns: string; user?: unknown }>
}

/** Union of the two settings service generations this plugin must activate on. */
type SettingsServiceLike = SettingsForms | LegacySettingsProviderLike

interface LoaderEntryLike {
  id: string
  options: {
    id: string
    name?: string
    disabled?: boolean | null
  }
}

interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
  locate?(fiber?: unknown): string | undefined
  update(id: string, options: { disabled?: boolean | null }): unknown
}

interface DshWebServerPortLike {
  port?: number
}

export function apply(ctx: Context, entry: EntryConfig | ConfigShape | undefined = undefined): void {
  const readConfig = (): ConfigInput => readEntryConfig(entry)
  const entryId = locateEntryId(ctx)
  // rc.1 (DSH-0.1.7-RC1-04): the settings-namespace registry is gone. The
  // plugin declares its editable fields as the entry's volatile Cordis Config
  // (config.ts) and only records its page policy here (`auto: false` — the
  // plugin ships its own card); values persist in the active profile's
  // `cordis.patch.yml` under this entry id.
  //
  // Only the rc.1 `SettingsForms` face has `configure`. On the ≤0.1.6 registry
  // generation `register` owns the page policy (see `activate`), so feature
  // detection keeps the retired call from throwing during activation.
  ctx.inject(['settings'], (settingsContext) => {
    const settings = settingsContext.settings
    if (typeof (settings as { configure?: unknown }).configure !== 'function') return
    settingsContext.effect(() => settings.configure({ auto: true }, ctx.fiber))
  })

  // A terminal-only dsh-TUI profile has no browser `connection` service.
  // A Gateway without a stream carrier still supports the Host
  // control plane and `/remote` account commands. Desktop
  // profiles still wait for one complete official Harness carrier.
  const activateWhenCarrierReady = (runtimeContext: Context): void | Promise<void> => {
    const gateway = runtimeContext.get('typertGateway') as TypertGatewayLike
    if (new TypertGatewaySwitch(gateway).supportsCarrier()) {
      return activate(runtimeContext, readConfig, entryId)
    }
    runtimeContext.logger.warn('Remote Host idle: no Typert gateway carrier detected')
  }

  ctx.inject(['settings', 'connection', 'typertGateway'], activateWhenCarrierReady)
}

async function activate(
  ctx: Context,
  readConfig: () => ConfigInput,
  entryId: string,
): Promise<void> {
  const resolvedConfig = resolveConfig(readConfig())
  const config: ResolvedConfig = resolvedConfig
  if (!config.enabled) return
  const defaultIdentityDirectory = new IdentityStore().directory
  // Mirrors SafeLogger output to the process stdout/stderr as well as the DSH
  // logger: the web process stdout is captured by the Desktop shell into
  // desktop.log, so remote RPC/transport diagnostics stay greppable there.
  const logger = new SafeLogger({
    debug: message => { ctx.logger.debug(message); console.debug(message) },
    info: message => { ctx.logger.info(message); console.info(message) },
    warn: message => { ctx.logger.warn(message); console.warn(message) },
    error: message => { ctx.logger.error(message); console.error(message) },
  }, config.logLevel)
  // The official Typert gateway (`typertGateway` from dsh-api-gateway) is the
  // dispatch path behind `/api/commands/*` on the host. It is an explicit
  // activation dependency so a peer bridge never silently omits commands.
  const nativeTypertGateway = ctx.get('typertGateway') as TypertGatewayLike
  const hostGateway = new TypertGatewaySwitch(nativeTypertGateway)
  const localTypertGateway = hostGateway.local()
  // Only the authenticated ConnectionController callback creates these owner
  // peers. Never share a browser Peer or accept a principal from the tunnel.
  const connectionExports = DshConnection as Record<string, unknown>
  const PeerConstructor = (typeof connectionExports.Peer === 'function'
    ? connectionExports.Peer
    : connectionExports.OperatorPeer) as (new (ctx: Context, options?: unknown) => { dispose(): unknown }) | undefined
  if (typeof PeerConstructor === 'function') {
    localTypertGateway.createPeer = () => {
      const peer = new PeerConstructor(ctx, { principal: { kind: 'owner' } })
      return {
        ...hostGateway.local(peer),
        dispose: async () => {
          await peer.dispose?.()
        },
      }
    }
  }
  // The Host `subprocess` service owns PTY allocation, containment, and process
  // termination for remote terminals. Profiles without it fall back to the plain
  // pipe spawner inside the bridge.
  const subprocess = ctx.get('subprocess', false) as HostSubprocessLike | undefined
  // Settings edits must reach the direct-connect server without a restart:
  // re-resolve the entry config on each sign-in attempt.
  const liveDirectCredentials = (): { account: string; password: string } | undefined => {
    try {
      return resolveConfig(readConfig()).direct
    } catch {
      return undefined
    }
  }
  const createRuntimes = (config: ResolvedConfig) => {
    const hostIdentities = new IdentityStore({ directory: defaultIdentityDirectory })
    const runtime = new HostPluginRuntime(
      config,
      hostIdentities,
      logger,
      localTypertGateway,
      () => ctx.get('fileViewerHost') as FileViewerHostServiceLike | undefined,
      subprocess === undefined ? undefined : subprocessTerminalSpawner(subprocess),
      peer => createPluginRouteDispatcher(
        () => ctx.get('connection') as PluginRouteConnectionLike | undefined,
        () => (ctx.get('webServer') as DshWebServerPortLike | undefined)?.port,
        peer,
      ),
      liveDirectCredentials,
    )

    return runtime
  }
  let runtime = createRuntimes(config)
  let closed = false
  ctx.provide('dshRemote', runtime)
  await disableLegacyLoaderEntries(ctx, logger)
  await ctx.effect(async () => {
    try {
      await runtime.start()
    } catch (error) {
      await runtime.close()
      throw error
    }
    return async () => {
      closed = true
      await runtime.close()
    }
  }, 'dsh-remote lifecycle')
}

/**
 * Read the plugin entry's config. The Loader passes the resolved
 * {@link EntryConfig} (a live `Volatile` reference); a direct `ctx.plugin()`
 * caller passes the plain composition object instead.
 */
function readEntryConfig(entry: EntryConfig | ConfigShape | undefined): ConfigInput {
  if (entry === undefined) return {}
  return isEntryConfig(entry) ? entry.get() : entry
}

/** Whether a config value is the Loader's live volatile reference. */
function isEntryConfig(value: EntryConfig | ConfigShape): value is EntryConfig {
  return typeof (value as { get?: unknown }).get === 'function'
}

/** Entry id whose live Config backs this plugin instance's settings writes. */
function locateEntryId(ctx: Context): string {
  const loader = ctx.get('loader') as LoaderLike | undefined
  // `Entry.id` is the tree path (`include:<row>` for a direct profile row, or
  // `<include>:<group>:<row>` under a group), while `ctx.settings` and
  // configEditor address an entry by its own `options.id` (DSH-0.1.7-RC1-04).
  // Resolve the located path back through the Loader so a bundle-include mount
  // and a plain insert row both derive the same configurable id.
  const located = loader?.locate?.(ctx.fiber)
  if (located === undefined) return DEFAULT_ENTRY_ID
  if (typeof loader?.entries === 'function') {
    for (const entry of loader.entries()) {
      if (entry.id === located) return entry.options.id
    }
  }
  // Fallback for a tree whose entries are not enumerable: the root include's
  // path component is the only prefix a direct profile row carries.
  return located.startsWith(INCLUDE_ENTRY_PREFIX) ? located.slice(INCLUDE_ENTRY_PREFIX.length) : located
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function disableLegacyLoaderEntries(ctx: Context, logger: SafeLogger): Promise<void> {
  const loader = ctx.get('loader') as LoaderLike | undefined
  if (!isLoaderLike(loader)) return

  const currentEntryId = loader.locate?.(ctx.fiber)
  for (const entry of loader.entries()) {
    const moduleName = entry.options.name
    // Rows inserted by pre-0.5.21 manifests: renamed modules and the TUI-scoped
    // entry (which may survive as a nameless zombie row in saved profiles).
    const isLegacy = (moduleName !== undefined && legacyLoaderModuleNames.has(moduleName))
      || entry.id === 'ds-harness-remote-tui'
      || entry.options.id === 'ds-harness-remote-tui'
    if (!isLegacy) continue
    if (entry.id === currentEntryId || entry.options.disabled === true) continue

    try {
      await loader.update(entry.id, { disabled: true })
      logger.warn('disabled legacy loader entry', { entryId: entry.id, moduleName })
    } catch {
      logger.warn('failed to disable legacy loader entry', {
        entryId: entry.id,
        moduleName,
        code: 'LOADER_UPDATE_FAILED',
      })
    }
  }
}

function isLoaderLike(value: unknown): value is LoaderLike {
  return typeof value === 'object' && value !== null
    && typeof (value as { entries?: unknown }).entries === 'function'
    && typeof (value as { update?: unknown }).update === 'function'
}

export type { ResolvedConfig } from './config.js'
export { resolveConfig } from './config.js'
export { ConnectionController, ConnectionRejectedError } from './connection-controller.js'
export type { PeerConnectionContext, RpcRouterFactory } from './connection-controller.js'
export { fingerprint, IdentityInvalidError, IdentityStore } from './identity-store.js'
export { serverStorageDirectory } from './identity-store.js'
export type { HostIdentity, RemoteDeviceRole, TrustedPeer } from './identity-store.js'
export { HOST_CAPABILITIES, RpcError, RpcRouter } from './rpc-router.js'
export { HostPluginRuntime } from './service.js'
export { HARNESS_REMOTE_ALLOWLIST, HarnessRemoteBridge } from './harness-remote-bridge.js'
export { RemoteTypertGateway } from './remote-typert-gateway.js'
export { RemoteFileViewerBridge } from './file-viewer-bridge.js'
export { CodexRemoteDomain } from './codex/domain.js'
export { CodexPeerBridge } from './codex/peer-bridge.js'
export { CodexAppServerClient, CodexAppServerError } from './codex/app-server.js'
export { CODEX_APP_ALLOWLIST } from './codex/method-policy.js'
export { AcpRemoteGateway } from './acp/gateway.js'
export { AcpPeerBridge } from './acp/peer-bridge.js'
export { CursorAcpClient, CursorAcpError } from './acp/adapters/cursor-process.js'
export { ACP_METHOD_ALLOWLIST } from './acp/method-policy.js'
export { createRemoteFileContentProvider } from './remote-file-content-provider.js'
export { TypertGatewaySwitch } from './typert-gateway-switch.js'
export type {
  LocalTypertGateway,
  RemoteTypertGatewayTarget,
  TypertGatewayLike,
  TypertGatewayRequest,
  TypertGatewayWireStreamLike,
  TypertRpcResult,
} from './typert-gateway-contract.js'
export type { AuthenticatedPeerChannel } from './types.js'
export { AcpGateway } from './acp.js'
export type { AcpBackendAdapter } from './acp.js'
