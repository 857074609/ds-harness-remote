interface ForegroundServiceModule {
  start(): void
  stop(): void
}

function nativeModule(): ForegroundServiceModule | undefined {
  // Keep Node/Vitest service tests independent from React Native's native
  // entrypoint. Metro resolves this require in the Android bundle.
  try {
    const reactNative = require('react-native') as { NativeModules?: Record<string, unknown> }
    return reactNative.NativeModules?.DshRemoteForegroundService as ForegroundServiceModule | undefined
  } catch {
    return undefined
  }
}

/** Platform boundary; development/web builds remain usable without the native module. */
export const foregroundService = {
  async start(): Promise<void> {
    const native = nativeModule()
    if (native === undefined) return
    native.start()
  },
  async stop(): Promise<void> {
    const native = nativeModule()
    if (native === undefined) return
    native.stop()
  },
}

