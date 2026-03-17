package dev.dreamer.hexpand

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

import com.google.mediapipe.tasks.genai.llminference.LlmInference

import java.io.File

/**
 * Capacitor plugin wrapping Google MediaPipe LLM Inference API
 * for on-device Gemma 3n E4B generation.
 */
@CapacitorPlugin(name = "GemmaPlugin")
class GemmaPlugin : Plugin() {

    private var llmInference: LlmInference? = null

    private val modelDir: File
        get() = File(context.filesDir, "gemma-models")

    private val modelPath: String
        get() = File(modelDir, "gemma3n-e4b.task").absolutePath

    /**
     * Check if the model file has been downloaded to device storage.
     */
    @PluginMethod
    fun isModelReady(call: PluginCall) {
        val ready = File(modelPath).exists()
        val ret = JSObject()
        ret.put("ready", ready)
        call.resolve(ret)
    }

    /**
     * Download the Gemma model from a hosted URL to device storage.
     * In the PoC, we assume the model is sideloaded or pre-placed.
     * Production will download from dr.eamer.dev or Google Cloud Storage.
     */
    @PluginMethod
    fun downloadModel(call: PluginCall) {
        try {
            if (!modelDir.exists()) {
                modelDir.mkdirs()
            }

            // TODO: Implement actual download with progress reporting.
            // For PoC, the model file should be manually placed at:
            //   /data/data/dev.dreamer.hexpand/files/gemma-models/gemma3n-e4b.task
            //
            // Production implementation:
            //   val url = "https://dr.eamer.dev/models/gemma3n-e4b.task"
            //   Download with OkHttp, report progress via bridge events.

            val exists = File(modelPath).exists()
            val ret = JSObject()
            ret.put("success", exists)
            if (!exists) {
                ret.put("message", "Place model file at: $modelPath")
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Download failed: ${e.message}", e)
        }
    }

    /**
     * Run inference on the loaded model.
     */
    @PluginMethod
    fun generate(call: PluginCall) {
        val prompt = call.getString("prompt") ?: run {
            call.reject("Missing required parameter: prompt")
            return
        }
        val temperature = call.getFloat("temperature", 0.7f)!!
        val maxTokens = call.getInt("maxTokens", 2048)!!

        try {
            // Lazy-load the model on first inference
            if (llmInference == null) {
                if (!File(modelPath).exists()) {
                    call.reject("Model not found. Call downloadModel() first.")
                    return
                }

                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(maxTokens)
                    .setTemperature(temperature)
                    .build()

                llmInference = LlmInference.createFromOptions(context, options)
            }

            val result = llmInference!!.generateResponse(prompt)

            val ret = JSObject()
            ret.put("text", result)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Inference failed: ${e.message}", e)
        }
    }

    override fun handleOnDestroy() {
        llmInference?.close()
        llmInference = null
        super.handleOnDestroy()
    }
}
