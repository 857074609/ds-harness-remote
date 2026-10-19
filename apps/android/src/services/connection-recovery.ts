import type { ConnectionPhase, TransportPreference } from '../types'

interface RecoveryState {
  connection: { phase: ConnectionPhase; stats: { mode: string }; retryable?: boolean }
  selectedDevice?: { deviceId: string }
  reauthRequired: boolean
  transportPreference: TransportPreference
}

const RETRY_DELAYS_MS = [1_000, 3_000, 8_000]

/** Recover a previously connected Host while visible; never replay a mutation. */
export class ForegroundConnectionRecovery {
  private active = false
  private hostId?: string
  private armed = false
  private attempts = 0
  private lastMode = 'Disconnected'
  private timer?: ReturnType<typeof setTimeout>
  private inFlight = false

  constructor(
    private readonly read: () => RecoveryState,
    private readonly reconnect: (options: { forceRelay?: boolean }) => Promise<boolean>,
  ) {}

  setActive(active: boolean): void {
    this.active = active
    this.update()
  }

  update(): void {
    const state = this.read()
    const hostId = state.selectedDevice?.deviceId
    if (hostId !== this.hostId || state.connection.phase === 'disconnected' || state.reauthRequired) {
      this.cancelTimer()
      this.hostId = hostId
      this.armed = false
      this.attempts = 0
    }
    if (state.reauthRequired) return
    if (state.connection.phase === 'connected') {
      this.armed = true
      this.lastMode = state.connection.stats.mode
      if (!this.inFlight) this.attempts = 0
    }
    if (!this.active || !this.armed || hostId === undefined || state.connection.phase !== 'offline'
      || state.connection.retryable === false) {
      this.cancelTimer()
      return
    }
    if (this.timer !== undefined || this.inFlight || this.attempts >= RETRY_DELAYS_MS.length) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      // Recheck after the delay: logout, manual connection or a Host change
      // must not be overtaken by an old recovery callback.
      const current = this.read()
      if (!this.active || current.selectedDevice?.deviceId !== hostId
        || current.connection.phase !== 'offline' || current.connection.retryable === false || current.reauthRequired) return
      this.attempts += 1
      const forceRelay = current.transportPreference === 'auto'
        && (this.lastMode !== 'Relay' || this.attempts > 1)
      this.inFlight = true
      void this.reconnect({ ...(forceRelay ? { forceRelay: true } : {}) })
        .catch(() => false)
        .finally(() => {
          this.inFlight = false
          this.update()
        })
    }, RETRY_DELAYS_MS[this.attempts])
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }
}
