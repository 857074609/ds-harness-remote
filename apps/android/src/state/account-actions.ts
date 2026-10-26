import * as Haptics from 'expo-haptics'
import { resolveAutoConnectDevice } from '../lib/auto-connect'
import { friendlyError } from '../lib/errors'
import { applyLanguagePreference } from '../locales/i18n'
import {
  clearCodexPermissionPresets,
  clearDirectConnect,
  clearLastConnectedDeviceId,
  clearLocalData,
  loadDefaultPermissionPreset,
  loadDirectConnect,
  loadFavoriteWorkspaces,
  loadCompactHistory,
  loadLanguagePreference,
  loadLastConnectedDeviceId,
  loadOrCreateIdentity,
  loadRecentWorkspaces,
  loadThemePreference,
  loadTypographyDensity,
  loadStatusBarVisible,
  loadTransportPreference,
  saveDefaultPermissionPreset,
  saveFavoriteWorkspaces,
  saveCompactHistory,
  saveLanguagePreference,
  saveRecentWorkspaces,
  saveThemePreference,
  saveTypographyDensity,
  saveStatusBarVisible,
} from '../services/storage'
import type { DirectConfig, RemoteDevice } from '../types'
import type { AppState, StoreAccess } from './store-state'
import { clearBrowseMemory } from '../services/browse-memory'
import { initialData } from './store-state'

type AccountActions = Pick<AppState,
  'bootstrap' | 'requireReauth' | 'consumePendingAutoConnect' | 'trustDevice' | 'forgetDevice' | 'resetLocalData' | 'signOut'>

export function createAccountActions({ set, get }: StoreAccess): AccountActions {
  let accountGeneration = 0
  let accountChanges = 0
  let effects: Promise<unknown> = Promise.resolve()

  // Storage writes are serialized so a stale account generation can never
  // publish over a newer one mid-write.
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = effects.then(operation)
    effects = next.catch(() => undefined)
    return next
  }

  async function change<T>(operation: () => Promise<T>): Promise<T> {
    const generation = ++accountGeneration
    ++accountChanges
    set({ refreshing: false, pendingAutoConnectDeviceId: undefined })
    try {
      return await exclusive(operation)
    } finally {
      --accountChanges
    }
  }

  function directDevice(account: string): RemoteDevice {
    return {
      deviceId: 'direct',
      name: account,
      platform: 'direct',
      identityKey: '',
      membershipId: '',
      online: true,
      trusted: true,
    }
  }

  const actions: AccountActions = {
    async bootstrap() {
      set({ bootPhase: 'loading', error: undefined, pendingAutoConnectDeviceId: undefined, reauthRequired: false })
      try {
        const [direct, identity, transportPreference, languagePreference, themePreference, typographyDensity, statusBarVisible, favoriteWorkspaces, recentWorkspaces, lastConnectedDeviceId, defaultPermissionPreset, compactHistory] = await Promise.all([
          loadDirectConnect(),
          loadOrCreateIdentity(),
          loadTransportPreference(),
          loadLanguagePreference(),
          loadThemePreference(),
          loadTypographyDensity(),
          loadStatusBarVisible(),
          loadFavoriteWorkspaces(),
          loadRecentWorkspaces(),
          loadLastConnectedDeviceId(),
          loadDefaultPermissionPreset(),
          loadCompactHistory(),
        ])
        const language = applyLanguagePreference(languagePreference)
        const config: DirectConfig | undefined = direct === undefined ? undefined : {
          baseUrl: `direct://${direct.host}:${direct.port}`,
          host: direct.host,
          port: direct.port,
          account: direct.account,
        }
        set({
          config,
          identity,
          account: config?.account,
          devices: direct === undefined ? [] : [directDevice(direct.account)],
          transportPreference,
          languagePreference,
          language,
          themePreference,
          typographyDensity,
          statusBarVisible,
          compactHistory,
          defaultPermissionPreset,
          favoriteWorkspaces,
          recentWorkspaces,
          lastConnectedDeviceId,
        })
        set({ bootPhase: 'ready' })
      } catch (error) {
        set({ bootPhase: 'error', error: friendlyError(error) })
      }
    },

    async requireReauth(message) {
      await get().disconnect()
      // Stored direct credentials stay on disk: the Host password may simply
      // have changed; the sign-in screen prefills the rest for a quick retry.
      set({
        account: undefined,
        pendingAutoConnectDeviceId: undefined,
        refreshing: false,
        busyAction: undefined,
        reauthRequired: true,
        error: message,
      })
    },

    async trustDevice(device) {
      // Direct mode authenticates via the password PSK; "trust" only marks the
      // local device row so existing UI affordances keep working.
      set(state => ({
        devices: state.devices.map(item => item.deviceId === device.deviceId ? { ...item, trusted: true } : item),
      }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      return true
    },

    consumePendingAutoConnect() {
      const deviceId = get().pendingAutoConnectDeviceId
      if (deviceId !== undefined) set({ pendingAutoConnectDeviceId: undefined })
      return deviceId
    },

    async forgetDevice(deviceId) {
      const connected = get().selectedDevice?.deviceId === deviceId
      if (connected) await get().disconnect()
      await clearDirectConnect()
      await clearCodexPermissionPresets(deviceId)
      const clearedLast = get().lastConnectedDeviceId === deviceId
      if (clearedLast) await clearLastConnectedDeviceId()
      const favoriteWorkspaces = get().favoriteWorkspaces.filter(item => item.deviceId !== deviceId)
      if (favoriteWorkspaces.length !== get().favoriteWorkspaces.length) {
        await saveFavoriteWorkspaces(favoriteWorkspaces)
      }
      const recentWorkspaces = get().recentWorkspaces.filter(item => item.deviceId !== deviceId)
      if (recentWorkspaces.length !== get().recentWorkspaces.length) {
        await saveRecentWorkspaces(recentWorkspaces)
      }
      set(state => ({
        devices: state.devices.filter(device => device.deviceId !== deviceId),
        config: undefined,
        account: undefined,
        favoriteWorkspaces,
        recentWorkspaces,
        lastConnectedDeviceId: clearedLast ? undefined : state.lastConnectedDeviceId,
        pendingAutoConnectDeviceId: state.pendingAutoConnectDeviceId === deviceId
          ? undefined
          : state.pendingAutoConnectDeviceId,
        busyAction: undefined,
      }))
      return true
    },

    async resetLocalData() {
      await get().disconnect()
      await clearBrowseMemory()
      await clearLocalData()
      const identity = await loadOrCreateIdentity()
      const language = applyLanguagePreference('system')
      set({
        ...initialData(),
        identity,
        languagePreference: 'system',
        language,
        themePreference: 'system',
        typographyDensity: 'compact',
        statusBarVisible: true,
        compactHistory: false,
        defaultPermissionPreset: 'default',
        lastConnectedDeviceId: undefined,
        pendingAutoConnectDeviceId: undefined,
        reauthRequired: false,
        bootPhase: 'ready',
      })
    },

    async signOut() {
      const { languagePreference, themePreference, typographyDensity, statusBarVisible, defaultPermissionPreset, compactHistory } = get()
      await get().disconnect()
      await clearBrowseMemory()
      await clearLocalData()
      await saveLanguagePreference(languagePreference)
      await saveThemePreference(themePreference)
      await saveTypographyDensity(typographyDensity)
      await saveStatusBarVisible(statusBarVisible)
      await saveCompactHistory(compactHistory)
      await saveDefaultPermissionPreset(defaultPermissionPreset)
      const nextIdentity = await loadOrCreateIdentity()
      set({
        ...initialData(),
        identity: nextIdentity,
        lastConnectedDeviceId: undefined,
        pendingAutoConnectDeviceId: undefined,
        reauthRequired: false,
        bootPhase: 'ready',
      })
    },
  }

  return {
    ...actions,
    bootstrap: async () => {
      const generation = accountGeneration + 1
      await change(() => actions.bootstrap())
      if (generation === accountGeneration && get().bootPhase === 'ready' && !get().reauthRequired && accountChanges === 0) {
        set({ pendingAutoConnectDeviceId: resolveAutoConnectDevice(get().devices, get().lastConnectedDeviceId)?.deviceId })
      }
    },
    requireReauth: message => change(() => actions.requireReauth(message)),
    trustDevice: device => change(() => actions.trustDevice(device)),
    forgetDevice: deviceId => change(() => actions.forgetDevice(deviceId)),
    signOut: () => change(() => actions.signOut()),
    resetLocalData: () => change(() => actions.resetLocalData()),
  }
}
