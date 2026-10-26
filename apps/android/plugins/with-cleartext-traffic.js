const { withAndroidManifest } = require('@expo/config-plugins')

/**
 * Direct-connect reaches LAN Hosts over plain ws://, which Android 9+ blocks
 * in release builds unless the manifest opts back into cleartext traffic.
 * Private addresses cannot get CA certificates, and every payload is
 * end-to-end encrypted (Noise) above the transport, so the plaintext
 * WebSocket carries ciphertext only.
 */
function withCleartextTraffic(config) {
  return withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application?.[0]
    if (application === undefined) throw new Error('Android application manifest entry is missing')
    application.$['android:usesCleartextTraffic'] = 'true'
    return config
  })
}

module.exports = withCleartextTraffic
