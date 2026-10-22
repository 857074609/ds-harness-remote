package io.github.liguobao.dshremote

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.*
import java.io.File
import java.util.concurrent.Executors

/** Publishes only completed, bounded app-cache transfers into system Downloads. */
class RemoteDownloadsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val pending = mutableSetOf<Uri>()
  private var closed = false
  override fun getName() = "DshRemoteDownloads"
  override fun getConstants(): Map<String, Any> = mapOf("supported" to (Build.VERSION.SDK_INT >= 29))

  @ReactMethod
  fun prepare(source: String, name: String, promise: Promise) {
    worker.execute {
      var target: Uri? = null
      try {
        check(Build.VERSION.SDK_INT >= 29)
        val sourceUri = Uri.parse(source)
        require(sourceUri.scheme == "file")
        val file = File(requireNotNull(sourceUri.path)).canonicalFile
        require(file.parentFile == context.cacheDir.canonicalFile && file.name.startsWith("workspace-download-"))
        require(file.isFile && file.length() <= 100L * 1024 * 1024)
        require(name.isNotBlank() && name != "." && name != ".." && !name.any { it == '/' || it == '\\' || it.code < 32 })
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, name)
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        target = requireNotNull(context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        file.inputStream().use { input ->
          requireNotNull(context.contentResolver.openOutputStream(target, "w")).use { output ->
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              total += count
              check(total <= 100L * 1024 * 1024)
              output.write(buffer, 0, count)
            }
          }
        }
        synchronized(pending) {
          check(!closed)
          pending.add(target)
        }
        promise.resolve(target.toString())
      } catch (_: Exception) {
        target?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        promise.reject("DOWNLOAD_FAILED", "Could not save file to Downloads")
      }
    }
  }

  @ReactMethod
  fun finish(value: String, publish: Boolean, promise: Promise) {
    worker.execute {
      val uri = Uri.parse(value)
      try {
        synchronized(pending) {
          require(pending.contains(uri))
          if (publish) {
            check(!closed)
            check(context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null) == 1)
          } else context.contentResolver.delete(uri, null, null)
          pending.remove(uri)
        }
        promise.resolve(null)
      } catch (_: Exception) {
        synchronized(pending) {
          if (pending.remove(uri)) runCatching { context.contentResolver.delete(uri, null, null) }
        }
        promise.reject("DOWNLOAD_FAILED", "Could not finalize download")
      }
    }
  }

  override fun invalidate() {
    synchronized(pending) {
      closed = true
      pending.forEach { runCatching { context.contentResolver.delete(it, null, null) } }
      pending.clear()
    }
    worker.shutdown()
    super.invalidate()
  }
}
