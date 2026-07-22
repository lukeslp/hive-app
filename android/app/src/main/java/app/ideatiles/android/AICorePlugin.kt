/*
 * File Purpose: Bridge ML Kit Prompt API access to Capacitor for Android AICore generation.
 * Primary Components: Model status, download progress, cancellable text generation.
 * I/O: Accepts plugin calls and returns AICore status, progress events, or generated text.
 */
package app.ideatiles.android

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name = "AICorePlugin")
class AICorePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val generationJobs = ConcurrentHashMap<String, Job>()

    /**
     * AICore client initialization is intentionally lazy. Per ML Kit guidance,
     * availability must be determined by checkStatus(), not client creation.
     */
    private val generativeModel by lazy { Generation.getClient() }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(statusResult(withContext(Dispatchers.IO) { generativeModel.checkStatus() }))
            } catch (error: Exception) {
                call.resolve(unavailableResult(safeMessage(error)))
            }
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        scope.launch {
            try {
                when (withContext(Dispatchers.IO) { generativeModel.checkStatus() }) {
                    FeatureStatus.AVAILABLE -> call.resolve(statusResult(FeatureStatus.AVAILABLE))
                    FeatureStatus.DOWNLOADING -> call.resolve(statusResult(FeatureStatus.DOWNLOADING))
                    FeatureStatus.UNAVAILABLE -> call.resolve(statusResult(FeatureStatus.UNAVAILABLE))
                    FeatureStatus.DOWNLOADABLE -> {
                        var completed = false
                        withContext(Dispatchers.IO) {
                            generativeModel.download().collect { update ->
                                when (update) {
                                    is DownloadStatus.DownloadStarted -> {
                                        notifyListeners("downloadProgress", JSObject().put("state", "started"))
                                    }
                                    is DownloadStatus.DownloadProgress -> {
                                        notifyListeners(
                                            "downloadProgress",
                                            JSObject()
                                                .put("state", "downloading")
                                                .put("bytesDownloaded", update.totalBytesDownloaded),
                                        )
                                    }
                                    DownloadStatus.DownloadCompleted -> {
                                        completed = true
                                        notifyListeners("downloadProgress", JSObject().put("state", "completed"))
                                    }
                                    is DownloadStatus.DownloadFailed -> {
                                        notifyListeners(
                                            "downloadProgress",
                                            JSObject()
                                                .put("state", "failed")
                                                .put("reason", safeMessage(update.e)),
                                        )
                                    }
                                }
                            }
                        }
                        call.resolve(
                            if (completed) statusResult(FeatureStatus.AVAILABLE)
                            else unavailableResult("AICore did not complete the model download."),
                        )
                    }
                    else -> call.resolve(unavailableResult("Unknown AICore status."))
                }
            } catch (error: Exception) {
                call.resolve(unavailableResult(safeMessage(error)))
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val prompt = call.getString("prompt")?.trim()
        if (prompt.isNullOrEmpty()) {
            call.reject("Missing required parameter: prompt")
            return
        }

        val requestId = call.getString("requestId")?.takeIf(String::isNotBlank) ?: UUID.randomUUID().toString()
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val status = withContext(Dispatchers.IO) { generativeModel.checkStatus() }
                if (status != FeatureStatus.AVAILABLE) {
                    call.reject("AICore model is not available: ${statusName(status)}")
                    return@launch
                }

                val response = withContext(Dispatchers.IO) { generativeModel.generateContent(prompt) }
                if (isActive) {
                    val text = response.candidates.firstOrNull()?.text?.trim()
                    if (text.isNullOrEmpty()) {
                        call.reject("AICore returned no text.")
                    } else {
                        call.resolve(JSObject().put("text", text).put("requestId", requestId))
                    }
                }
            } catch (_: CancellationException) {
                call.reject("AICore generation cancelled.")
            } catch (error: Exception) {
                call.reject("AICore generation failed: ${safeMessage(error)}", error)
            } finally {
                generationJobs.remove(requestId)
            }
        }
        generationJobs.put(requestId, job)?.cancel()
        job.start()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val requestId = call.getString("requestId")
        if (requestId.isNullOrBlank()) {
            call.reject("Missing required parameter: requestId")
            return
        }
        val job = generationJobs.remove(requestId)
        job?.cancel()
        call.resolve(JSObject().put("cancelled", job != null))
    }

    override fun handleOnDestroy() {
        generationJobs.values.forEach(Job::cancel)
        generationJobs.clear()
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun statusResult(status: Int): JSObject = JSObject().apply {
        val state = statusName(status)
        put("state", state)
        put("available", status == FeatureStatus.AVAILABLE)
        put("downloadable", status == FeatureStatus.DOWNLOADABLE)
        put("downloading", status == FeatureStatus.DOWNLOADING)
        put("model", "Gemini Nano via Android AICore")
        if (status == FeatureStatus.UNAVAILABLE) {
            put("reason", "Gemini Nano is unavailable on this Android device.")
        }
    }

    private fun unavailableResult(reason: String): JSObject = JSObject().apply {
        put("state", "unavailable")
        put("available", false)
        put("downloadable", false)
        put("downloading", false)
        put("model", "Gemini Nano via Android AICore")
        put("reason", reason)
    }

    private fun statusName(status: Int): String = when (status) {
        FeatureStatus.AVAILABLE -> "available"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        FeatureStatus.UNAVAILABLE -> "unavailable"
        else -> "unknown"
    }

    private fun safeMessage(error: Throwable): String =
        error.message?.take(180) ?: error.javaClass.simpleName
}
