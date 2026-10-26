import type { RemoteMessage } from '@dsh-remote/protocol'

export interface AuthenticatedPeerChannel {
  /**
   * Attestation supplied by the Noise/control-plane integration. Implementors
   * must expose this channel only after the Noise transcript and, depending on
   * the protocol, the Server membership OR the direct-connect password PSK for
   * this exact connection have been verified.
   */
  readonly security: {
    protocol: 'Noise_IK_25519_ChaChaPoly_SHA256' | 'Noise_XXpsk3_25519_ChaChaPoly_SHA256'
    connectionId: string
    /** Present for the relay-Server (IK) flow; absent for the serverless direct-connect (XXpsk3) flow. */
    membershipId?: string
    /** True when the peer was authenticated by a password-derived PSK instead of Server membership. */
    authenticatedByPassword?: boolean
  }
  readonly peerDeviceId: string
  readonly peerIdentityKey: string
  readonly mode?: 'LAN' | 'P2P' | 'TURN' | 'Relay'
  send(message: RemoteMessage): Promise<void>
  onMessage(handler: (message: RemoteMessage) => void): () => void
  close(code?: string): Promise<void>
}
