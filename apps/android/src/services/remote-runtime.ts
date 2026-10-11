import { AndroidRemoteConnection } from './connection'
import type { AndroidConnectionOptions, MuxFrameHandler } from './connection'
import type { DeviceIdentity, RemoteDevice } from '../types'
import { foregroundService } from './foreground-service'

/** Owns the authenticated carrier independently from React screens. */
export class AndroidRemoteRuntime {
  private readonly client = new AndroidRemoteConnection()
  private foreground = false

  async connect(
    baseUrl: string,
    identity: DeviceIdentity,
    host: RemoteDevice,
    accessToken: string,
    onFrame: MuxFrameHandler,
    options: AndroidConnectionOptions = {},
  ): Promise<void> {
    await this.startForeground()
    try {
      await this.client.connect(baseUrl, identity, host, accessToken, onFrame, {
        ...options,
        onClose: () => {
          void this.stopForeground()
          options.onClose?.()
        },
      })
    } catch (error) {
      await this.stopForeground()
      throw error
    }
  }

  async refreshBackends(): Promise<void> { await this.client.refreshBackends() }
  requireProxy() { return this.client.requireProxy() }
  requireCodex() { return this.client.requireCodex() }
  requireSessionTools(sessionId?: string) { return this.client.requireSessionTools(sessionId) }
  hasCodex() { return this.client.hasCodex() }
  requireCursor() { return this.client.requireCursor() }
  hasCursor() { return this.client.hasCursor() }
  requireAntigravity() { return this.client.requireAntigravity() }
  hasAntigravity() { return this.client.hasAntigravity() }
  getStats() { return this.client.getStats() }
  getNetworkDetails() { return this.client.getNetworkDetails() }

  async close(): Promise<void> {
    await this.client.close()
    await this.stopForeground()
  }

  private async startForeground(): Promise<void> {
    if (this.foreground) return
    await foregroundService.start()
    this.foreground = true
  }

  private async stopForeground(): Promise<void> {
    if (!this.foreground) return
    this.foreground = false
    await foregroundService.stop()
  }
}

