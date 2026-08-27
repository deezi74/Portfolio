package com.ronnielynch.luna

import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.runBlocking

/**
 * A plain-Java-callable facade over llama.cpp's Kotlin/coroutines [InferenceEngine] (from
 * com.arm.aichat, vendored from llama.cpp's own examples/llama.android reference app), so
 * [LunaBrain] doesn't need to touch suspend functions or Flow directly. Both methods here block
 * the calling thread until done - LunaBrain already runs this off the main thread, same as its
 * Gemini HTTP calls, so that's the right shape for it to call into.
 */
class LocalLlm(context: Context) {

    companion object {
        // Shared across every LocalLlm instance, since AiChat.getInferenceEngine() itself
        // returns a process-wide singleton - this just keeps our "is it already loaded" check
        // in sync with that, whether LunaBrain was constructed by the Activity or the
        // always-listening service.
        @Volatile
        private var loadedPath: String? = null
        @Volatile
        private var loadedSystemPrompt: String? = null
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val engine: InferenceEngine = AiChat.getInferenceEngine(context)

    /**
     * Loads the model at [path] if it isn't already the one loaded, then applies
     * [systemPrompt] (pass null/empty to skip - e.g. a one-shot extraction prompt that doesn't
     * need one). Blocks the caller.
     *
     * The underlying engine (see InferenceEngineImpl.setSystemPrompt) only accepts a system
     * prompt ONCE, immediately after loadModel() - calling it again on an already-loaded model
     * throws "System prompt must be set RIGHT AFTER model loaded!", which is exactly what hit
     * on-device askers on their second question (Luna's local-file "ask" rebuilds the system
     * prompt - including the current knowledge-graph context - fresh every call). The only way
     * to give the model a new system prompt is to unload and reload it, so this reloads whenever
     * [path] OR [systemPrompt] differs from what's currently loaded (repeated questions with an
     * unchanged prompt stay fast - no reload) and is a no-op otherwise.
     */
    @Throws(Exception::class)
    fun loadModelIfNeeded(path: String, systemPrompt: String?) {
        if (loadedPath == path && loadedSystemPrompt == systemPrompt) return
        // A failed load leaves the underlying engine's state machine at Error, not back at
        // Initialized - if we don't reset it *every* time (not just when our own cache thinks
        // something is loaded), every retry after the first failure fails immediately with
        // "Cannot load model in Error!" instead of actually trying again. cleanUp() also covers
        // ModelReady (switching from a previously-successful model, or re-priming with a new
        // system prompt); it throws for Initialized/Uninitialized, which just means there's
        // nothing to reset - ignored.
        loadedPath = null
        loadedSystemPrompt = null
        runBlocking(scope.coroutineContext) {
            try {
                engine.cleanUp()
            } catch (ignored: Exception) {
            }
            engine.loadModel(path)
            if (!systemPrompt.isNullOrEmpty()) {
                engine.setSystemPrompt(systemPrompt)
            }
        }
        loadedPath = path
        loadedSystemPrompt = systemPrompt
    }

    /** Runs one prompt to completion and returns the full generated text. Blocks the caller. */
    @Throws(Exception::class)
    fun generate(userPrompt: String): String {
        return runBlocking(scope.coroutineContext) {
            val sb = StringBuilder()
            engine.sendUserPrompt(userPrompt).collect { token -> sb.append(token) }
            sb.toString()
        }
    }
}
