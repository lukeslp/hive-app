/*
 * File Purpose: Bridge verified LiteRT-LM Gemma inference into the Capacitor app.
 * Primary Components: Model status/download, atomic private storage, and LiteRT-LM generation.
 * I/O: Accepts plugin calls; downloads a verified HTTPS model; returns status, progress, or text.
 */
package app.ideatiles.android

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

@CapacitorPlugin(name = "GemmaPlugin")
class GemmaPlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private val inferenceLock = Any()
    private var engine: Engine? = null
    private var engineTokenBudget: Int? = null
    private var verifiedModelFingerprint: Triple<String, Long, Long>? = null

    private val modelDirectory: File
        get() = File(context.noBackupFilesDir, "gemma-models")

    private val modelFile: File
        get() = File(modelDirectory, MODEL_FILE_NAME)

    private val verificationMarker: File
        get() = File(modelDirectory, "$MODEL_FILE_NAME.sha256")

    @PluginMethod
    fun isModelReady(call: PluginCall) {
        executor.execute {
            call.resolve(modelStatus())
        }
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        executor.execute {
            val expectedSha = ModelArtifactVerifier.normalizeSha256(BuildConfig.GEMMA_MODEL_SHA256)
            val configuredUrl = BuildConfig.GEMMA_MODEL_URL.trim()
            if (!BuildConfig.ALLOW_MODEL_DOWNLOAD || configuredUrl.isBlank() || expectedSha == null) {
                call.resolve(
                    failureResult(
                        "No verified model download is configured; cloud generation remains available.",
                    ),
                )
                return@execute
            }

            try {
                if (isVerifiedModel(expectedSha)) {
                    call.resolve(successResult())
                    return@execute
                }

                modelDirectory.mkdirs()
                val temporaryFile = File(modelDirectory, "$MODEL_FILE_NAME.download")
                temporaryFile.delete()
                downloadHttps(configuredUrl, temporaryFile)

                if (!ModelArtifactVerifier.matches(temporaryFile, expectedSha)) {
                    temporaryFile.delete()
                    call.resolve(failureResult("Downloaded model failed SHA-256 verification."))
                    return@execute
                }

                synchronized(inferenceLock) {
                    closeInference()
                    modelFile.delete()
                    verifiedModelFingerprint = null
                    check(temporaryFile.renameTo(modelFile)) {
                        "Could not atomically activate the verified model."
                    }
                    verificationMarker.writeText("$expectedSha\n")
                    verifiedModelFingerprint =
                        Triple(expectedSha, modelFile.length(), modelFile.lastModified())
                }
                call.resolve(successResult())
            } catch (error: Exception) {
                File(modelDirectory, "$MODEL_FILE_NAME.download").delete()
                call.resolve(failureResult("Model download unavailable: ${safeMessage(error)}"))
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

        val requestedTokens = min(4096, max(64, call.getInt("maxTokens", 2048) ?: 2048))

        executor.execute {
            val expectedSha = ModelArtifactVerifier.normalizeSha256(BuildConfig.GEMMA_MODEL_SHA256)
            if (expectedSha == null || !isVerifiedModel(expectedSha)) {
                call.reject("Verified on-device model is absent; use cloud fallback.")
                return@execute
            }

            try {
                val result = synchronized(inferenceLock) {
                    val totalTokenBudget = min(8192, max(4096, requestedTokens))
                    if (engine == null || engineTokenBudget != totalTokenBudget) {
                        closeInference()
                        engine = Engine(
                            EngineConfig(
                                modelPath = modelFile.absolutePath,
                                backend = Backend.CPU(),
                                maxNumTokens = totalTokenBudget,
                                cacheDir = context.cacheDir.absolutePath,
                            ),
                        ).also(Engine::initialize)
                        engineTokenBudget = totalTokenBudget
                    }
                    engine!!.createConversation().use { conversation ->
                        conversation.sendMessage(prompt).contents.contents
                            .filterIsInstance<Content.Text>()
                            .joinToString(separator = "") { it.text }
                            .trim()
                            .ifEmpty { error("LiteRT-LM returned no text.") }
                    }
                }
                call.resolve(JSObject().put("text", result))
            } catch (error: Exception) {
                synchronized(inferenceLock) {
                    closeInference()
                }
                call.reject("On-device inference failed: ${safeMessage(error)}", error)
            }
        }
    }

    private fun modelStatus(): JSObject {
        val expectedSha = ModelArtifactVerifier.normalizeSha256(BuildConfig.GEMMA_MODEL_SHA256)
        val ready = expectedSha != null && isVerifiedModel(expectedSha)
        return JSObject().apply {
            put("ready", ready)
            put("verified", ready)
            put("model", MODEL_ID)
            put("downloadAvailable", BuildConfig.ALLOW_MODEL_DOWNLOAD &&
                BuildConfig.GEMMA_MODEL_URL.isNotBlank() && expectedSha != null)
            put("cloudFallback", !ready)
            if (!ready) {
                put(
                    "reason",
                    if (expectedSha == null) {
                        "No verified on-device model is configured."
                    } else {
                        "The verified on-device model is not installed."
                    },
                )
            }
        }
    }

    private fun isVerifiedModel(expectedSha: String): Boolean {
        if (!modelFile.isFile || modelFile.length() <= 0L || !verificationMarker.isFile) return false
        val marker = ModelArtifactVerifier.normalizeSha256(verificationMarker.readText()) ?: return false
        if (marker != expectedSha) return false

        val currentFingerprint = Triple(expectedSha, modelFile.length(), modelFile.lastModified())
        if (verifiedModelFingerprint == currentFingerprint) return true

        if (!ModelArtifactVerifier.matches(modelFile, expectedSha)) {
            verificationMarker.delete()
            verifiedModelFingerprint = null
            return false
        }
        verifiedModelFingerprint = currentFingerprint
        return true
    }

    private fun downloadHttps(source: String, destination: File) {
        var current = URL(source)
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            require(current.protocol.equals("https", ignoreCase = true)) {
                "Model delivery requires HTTPS."
            }
            val connection = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                instanceFollowRedirects = false
                requestMethod = "GET"
                setRequestProperty("Accept", "application/octet-stream")
            }
            try {
                val status = connection.responseCode
                if (status in REDIRECT_CODES) {
                    check(redirectCount < MAX_REDIRECTS) { "Too many model download redirects." }
                    val location = connection.getHeaderField("Location")
                        ?: error("Model redirect omitted Location.")
                    current = URL(current, location)
                    return@repeat
                }
                check(status == HttpURLConnection.HTTP_OK) { "Model server returned HTTP $status." }
                val contentLength = connection.contentLengthLong
                check(contentLength <= 0L || contentLength <= MAX_MODEL_BYTES) {
                    "Model exceeds the supported download size."
                }
                check(contentLength <= 0L || modelDirectory.usableSpace >= contentLength + FREE_SPACE_MARGIN) {
                    "Not enough private storage for the model."
                }

                connection.inputStream.buffered().use { input ->
                    FileOutputStream(destination).buffered().use { output ->
                        val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
                        var downloaded = 0L
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (count == 0) continue
                            downloaded += count
                            check(downloaded <= MAX_MODEL_BYTES) {
                                "Model exceeds the supported download size."
                            }
                            output.write(buffer, 0, count)
                            notifyListeners(
                                "modelDownloadProgress",
                                JSObject().apply {
                                    put("bytesDownloaded", downloaded)
                                    put("totalBytes", contentLength)
                                },
                            )
                        }
                        output.flush()
                    }
                }
                return
            } finally {
                connection.disconnect()
            }
        }
        error("Model download did not complete.")
    }

    private fun successResult() = JSObject().apply {
        put("success", true)
        put("verified", true)
        put("model", MODEL_ID)
    }

    private fun failureResult(reason: String) = JSObject().apply {
        put("success", false)
        put("verified", false)
        put("cloudFallback", true)
        put("reason", reason)
    }

    private fun closeInference() {
        engine?.close()
        engine = null
        engineTokenBudget = null
    }

    private fun safeMessage(error: Exception): String =
        error.message?.take(180) ?: error.javaClass.simpleName

    override fun handleOnDestroy() {
        synchronized(inferenceLock) {
            closeInference()
        }
        executor.shutdownNow()
        super.handleOnDestroy()
    }

    private companion object {
        const val MODEL_ID = "gemma-3n-e2b-it-int4"
        const val MODEL_FILE_NAME = "$MODEL_ID.litertlm"
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 120_000
        const val DOWNLOAD_BUFFER_BYTES = 1024 * 1024
        const val MAX_REDIRECTS = 5
        const val MAX_MODEL_BYTES = 8L * 1024L * 1024L * 1024L
        const val FREE_SPACE_MARGIN = 256L * 1024L * 1024L
        val REDIRECT_CODES = setOf(301, 302, 303, 307, 308)
    }
}
