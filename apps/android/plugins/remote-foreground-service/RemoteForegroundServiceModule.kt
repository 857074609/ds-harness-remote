package io.github.liguobao.dshremote

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RemoteForegroundServiceModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "DshRemoteForegroundService"

  @ReactMethod
  fun start() {
    RemoteForegroundService.start(context)
  }

  @ReactMethod
  fun stop() {
    RemoteForegroundService.stop(context)
  }
}

