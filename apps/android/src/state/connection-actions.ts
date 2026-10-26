import { browseScope, useBrowseMemory } from '../services/browse-memory'
import { friendlyError } from '../lib/errors'
import { strings as zhCN } from '../locales/i18n'
import { saveDirectConnect, loadDirectConnect, saveLastConnectedDeviceId } from '../services/storage'
import type { SessionAccess } from './session-runtime'
import type { AppState } from './store-state'
import { disconnected } from './store-state'

/** Connection actions use the store's single connection/session runtime. */
export function createConnectionActions({ get, set, runtime }: SessionAccess): Pick<AppState,
  'connectDevice' | 'connectDirectHost' | 'reconnect' | 'resumeConnection' | 'refreshConnectionNetworkDetails' | 'disconnect' | 'setOffline'> {
  return {
    async connectDevice(device, options = {}) {
      const { identity } = get()
      if (identity === undefined) return false
      if (device.platform !== 'direct') return false
      const generation = ++runtime.connectionGeneration
      ++runtime.sessionLoadGeneration
      runtime.sessionReadAbort?.abort()
      const memory = useBrowseMemory.getState()
      const scope = browseScope({...get(), selectedDevice: device})
      const cached = device.trusted ? memory.catalogs[scope] : undefined
      const sameHost = get().selectedDevice?.deviceId === device.deviceId
      // reconnect() marks recovery before delegating here. A direct connect starts
      // a new usage lifecycle even when choosing the same Host again.
      const recovering = sameHost && get().connection.phase === 'reconnecting'
      // In-memory catalogs belong to one Host; keep them only across its reconnect.
      set(state => ({
        ...(!recovering ? { currentWorkSessionIds: [] } : {}),
        ...(!sameHost ? { selectedSession: undefined, messages: {}, feedbackBySession: {} } : {}),
        sessionLifecycles: {},
        sessionProjectionSeqs: {},
        permissionSelecting: false,
        modelSelecting: false,
        busyAction: undefined,
        codexReadySessionId: undefined,
        selectedDevice: device,
        connection: { phase: 'connecting', stats: { mode: 'Disconnected', connected: false } },
        connectionStage: 'authenticating',
        connectionProbeOrder: [],
        connectionNetworkDetails: undefined,
        hostDescriptor: undefined,
        codexAvailable: false,
        cursorAvailable: false,
        antigravityAvailable: false,
        piAvailable: false,
        opencodeAvailable: false,
        claudeAvailable: false,
        workspaceCatalog: undefined,
        workspaces: sameHost ? state.workspaces : cached?.workspaces ?? [],
        sessions: sameHost ? state.sessions : cached?.sessions ?? [],
        archivedSessionIds: sameHost ? state.archivedSessionIds : [],
        sessionModels: undefined,
        error: undefined,
      }))
      try {
        await runtime.connection.prepareConnection(recovering)
        if (generation !== runtime.connectionGeneration) return false
        await runtime.closeActiveCodexStream(false)
        // Serverless direct connect: no Server, no access token; the local
        // account password authenticates hello and derives the Noise PSK.
        // Credentials persist in SecureStore so reconnects survive restarts.
        let directSpec = runtime.pendingDirectConnect
        if (directSpec === undefined) {
          directSpec = await loadDirectConnect()
          if (directSpec !== undefined) runtime.pendingDirectConnect = directSpec
        }
        if (directSpec === undefined) {
          set({ connection: { phase: 'offline', stats: { mode: 'Disconnected', connected: false }, error: zhCN.setup.directHint, retryable: false } })
          return false
        }
        runtime.pendingDirectConnect = directSpec
        set({ connectionStage: 'secure' })
        const connectedDeviceId = await runtime.connection.connectDirect(
          { host: directSpec.host, port: directSpec.port },
          { account: directSpec.account, password: directSpec.password },
          identity,
          frame => runtime.enqueueMuxFrame(generation, frame),
          {
            onSecureHandshake: () => {
              if (generation !== runtime.connectionGeneration) return
              set(state => ({
                connectionStage: 'secure', connection: {
                  ...state.connection, stats: runtime.connection.getStats() ?? state.connection.stats,
                }
              }))
            },
            onClose: () => {
              if (generation !== runtime.connectionGeneration) return
              void runtime.closeActiveCodexStream(false)
              void runtime.closeActiveCursorStream(false)
              if (get().connection.phase !== 'disconnected') {
                ++runtime.connectionGeneration
                ++runtime.sessionLoadGeneration
                set({
                  connection: { phase: 'offline', stats: { mode: 'Disconnected', connected: false }, error: zhCN.runtime.hostClosed,
                    retryable: true },
                  codexAvailable: false,
                  cursorAvailable: false,
                  antigravityAvailable: false,
                  piAvailable: false,
                  opencodeAvailable: false,
                  claudeAvailable: false,
                  busyAction: undefined,
                })
              }
            },
          },
        )
        device = { ...device, deviceId: connectedDeviceId }
        set(state => ({
          selectedDevice: state.selectedDevice === undefined ? undefined : { ...state.selectedDevice, deviceId: connectedDeviceId },
        }))
        if (generation !== runtime.connectionGeneration) return false
        set({ connectionStage: 'loading' })
        const proxy = runtime.connection.requireProxy()
        // Catalogs belong to the category the user opens, not connection setup.
        const hostDescriptor = await proxy.hostDescribe()
        if (generation !== runtime.connectionGeneration) return false
        set({
          hostDescriptor,
          codexAvailable: runtime.connection.hasCodex(),
          cursorAvailable: runtime.connection.hasCursor(),
          antigravityAvailable: runtime.connection.hasAntigravity(),
          piAvailable: runtime.connection.hasPi(),
          opencodeAvailable: runtime.connection.hasOpencode(),
          claudeAvailable: runtime.connection.hasClaude(),
          connectionStage: 'ready',
          connectionNetworkDetails: undefined,
          lastConnectedDeviceId: connectedDeviceId,
          pendingAutoConnectDeviceId: undefined,
          connection: { phase: 'connected', stats: runtime.connection.getStats() ?? { mode: 'Relay', connected: true } },
        })
        runtime.connectionStartedAt = Date.now()
        await saveLastConnectedDeviceId(connectedDeviceId)
        return true
      } catch (error) {
        if (generation !== runtime.connectionGeneration) return false
        console.warn('[dsh-remote] Connection setup failed at stage:', get().connectionStage, error)
        await runtime.connection.close({ preserveRecovery: recovering })
        const message = friendlyError(error)
        set({
          connection: { phase: 'offline', stats: { mode: 'Disconnected', connected: false }, error: message },
          codexAvailable: false,
          cursorAvailable: false,
          antigravityAvailable: false,
          piAvailable: false,
          opencodeAvailable: false,
          claudeAvailable: false,
          error: message,
        })
        return false
      }
    },

    async connectDirectHost(spec) {
      const identity = get().identity
      if (identity === undefined) return false
      runtime.pendingDirectConnect = spec
      try {
        const ok = await get().connectDevice({
          deviceId: 'direct',
          name: spec.account,
          platform: 'direct',
          identityKey: '',
          membershipId: '',
          online: true,
          trusted: true,
        })
        if (ok) {
          await saveDirectConnect(spec)
          set(state => ({
            config: { baseUrl: `direct://${spec.host}:${spec.port}`, host: spec.host, port: spec.port, account: spec.account },
            account: spec.account,
            devices: state.devices.some(device => device.deviceId === 'direct')
              ? state.devices.map(device => device.deviceId === 'direct' ? { ...device, name: spec.account } : device)
              : [...state.devices, {
                  deviceId: 'direct', name: spec.account, platform: 'direct', identityKey: '', membershipId: '', online: true, trusted: true,
                }],
          }))
        }
        return ok
      } catch (error) {
        console.warn('[dsh-remote] Direct connect failed:', error)
        return false
      }
    },

    reconnect(options = {}) {
      if (runtime.reconnectFlight !== undefined) return runtime.reconnectFlight
      const device = get().selectedDevice
      const phase = get().connection.phase
      if (device === undefined || phase === 'connecting' || phase === 'reconnecting') return Promise.resolve(false)
      set(state => ({ connection: { ...state.connection, phase: 'reconnecting', error: undefined } }))
      const task = (async () => {
        if (!await get().connectDevice(device, options)) return false
        const session = get().selectedSession
        if (options.restoreSession !== false && session !== undefined) return get().openSession(session)
        return true
      })()
      runtime.reconnectFlight = task
      void task.finally(() => { if (runtime.reconnectFlight === task) runtime.reconnectFlight = undefined })
      return task
    },

    async resumeConnection() {
      const { selectedDevice, connection } = get()
      if (selectedDevice === undefined) return
      if (connection.phase === 'offline') {
        if (connection.retryable === false) return
        await get().reconnect()
        return
      }
      if (connection.phase !== 'connected') return
      const generation = runtime.connectionGeneration
      const healthy = await runtime.connection.checkHealth()
      const current = get()
      if (current.selectedDevice?.deviceId !== selectedDevice.deviceId) return
      // onClose may have invalidated the generation while the probe was in
      // flight. Resume must still recover that newly confirmed offline state.
      if (current.connection.phase === 'offline') {
        if (current.connection.retryable === false) return
        await get().reconnect()
        return
      }
      if (generation !== runtime.connectionGeneration || current.connection.phase !== 'connected') return
      if (!healthy) {
        console.info('[dsh-remote] Resume health check failed; reconnecting')
        await get().reconnect()
      }
    },

    async refreshConnectionNetworkDetails() {
      if (get().connection.phase !== 'connected') return
      const details = await runtime.connection.getNetworkDetails().catch(() => undefined)
      if (details !== undefined && get().connection.phase === 'connected') {
        set(state => ({
          connectionNetworkDetails: details,
          connection: { ...state.connection, stats: runtime.connection.getStats() ?? state.connection.stats },
        }))
      }
    },

    async disconnect() {
      runtime.pendingDirectConnect = undefined
      runtime.flushPendingMuxFrames()
      ++runtime.connectionGeneration
      ++runtime.sessionLoadGeneration
      runtime.reconnectFlight = undefined
      runtime.clearPendingMuxFrames()
      await runtime.closeActiveCodexStream(false)
      await runtime.closeActiveCursorStream(false)
      await runtime.connection.close()
      runtime.codexModelSelections.clear()
      set({
        connection: disconnected,
        connectionStage: undefined,
        connectionProbeOrder: [],
        connectionNetworkDetails: undefined,
        selectedDevice: undefined,
        hostDescriptor: undefined,
        codexAvailable: false,
        cursorAvailable: false,
        antigravityAvailable: false,
        piAvailable: false,
        opencodeAvailable: false,
        claudeAvailable: false,
        workspaceCatalog: undefined,
        workspaces: [],
        archivedSessionIds: [],
        sessions: [],
        selectedSession: undefined,
        currentWorkSessionIds: [],
        sessionLifecycles: {},
        sessionProjectionSeqs: {},
        sessionModels: undefined,
        historyHasMore: false,
        historyLoadingOlder: false,
        oldestLoadedSeq: undefined,
      })
    },

    setOffline() {
      if (get().connection.phase !== 'disconnected') {
        runtime.flushPendingMuxFrames()
        ++runtime.sessionLoadGeneration
        runtime.clearPendingMuxFrames()
        set({
          connection: { phase: 'offline', stats: { mode: 'Disconnected', connected: false }, error: zhCN.runtime.networkUnavailable,
            ...(get().connection.retryable === false ? { retryable: false } : {}) },
          codexAvailable: false,
          busyAction: undefined,
          cursorAvailable: false,
          antigravityAvailable: false,
          piAvailable: false,
          opencodeAvailable: false,
          claudeAvailable: false,
        })
      }
    },
  }
}
