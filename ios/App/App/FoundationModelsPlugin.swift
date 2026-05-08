import Capacitor
import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Capacitor bridge for Apple's on-device LLM (Foundation Models, iOS 26+).
///
/// Mirrors the shape of the Android GemmaPlugin so the JS side can swap them
/// transparently. Returns `available: false` (instead of throwing) when the
/// framework or Apple Intelligence isn't available — the caller falls back
/// to the cloud LLM proxy.
@objc(FoundationModelsPlugin)
public class FoundationModelsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FoundationModelsPlugin"
    public let jsName = "FoundationModels"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            #if canImport(FoundationModels)
            let model = SystemLanguageModel.default
            switch model.availability {
            case .available:
                call.resolve(["available": true])
            case .unavailable(let reason):
                call.resolve([
                    "available": false,
                    "reason": String(describing: reason),
                ])
            }
            #else
            call.resolve([
                "available": false,
                "reason": "FoundationModels framework not in SDK at compile time",
            ])
            #endif
        } else {
            call.resolve([
                "available": false,
                "reason": "iOS < 26.0",
            ])
        }
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt") else {
            call.reject("Missing required field: prompt")
            return
        }
        let systemPrompt = call.getString("systemPrompt")
        let temperature = call.getDouble("temperature") ?? 0.7
        let maxTokens = call.getInt("maxTokens") ?? 1024

        if #available(iOS 26.0, *) {
            #if canImport(FoundationModels)
            Task {
                do {
                    let model = SystemLanguageModel.default
                    guard case .available = model.availability else {
                        call.reject("FoundationModels unavailable on this device")
                        return
                    }

                    let session: LanguageModelSession
                    if let sp = systemPrompt, !sp.isEmpty {
                        session = LanguageModelSession(instructions: Instructions { sp })
                    } else {
                        session = LanguageModelSession()
                    }

                    let options = GenerationOptions(
                        temperature: temperature,
                        maximumResponseTokens: maxTokens
                    )

                    // Hard-bound the Apple Intelligence call. Without this,
                    // a wedged framework (asset hydration, Apple Intelligence
                    // toggled mid-call, low-power throttle) leaves the JS
                    // side awaiting forever. The JS layer also bounds the
                    // round-trip independently — this is the second guard
                    // for the case where Capacitor's bridge swallows the
                    // rejection.
                    let response = try await Self.withTimeout(seconds: 15) {
                        try await session.respond(to: prompt, options: options)
                    }
                    call.resolve(["text": response.content])
                } catch is FoundationModelsTimeout {
                    call.reject("FoundationModels generation timed out after 15s")
                } catch {
                    call.reject("FoundationModels generation failed: \(error.localizedDescription)")
                }
            }
            #else
            call.reject("FoundationModels framework not in SDK at compile time")
            #endif
        } else {
            call.reject("iOS < 26.0; FoundationModels unavailable")
        }
    }

    /// Race an async throwing operation against a wall-clock deadline.
    /// First task to finish wins; the loser is cancelled. If the deadline
    /// task wins, the operation continues running (Swift can't preempt
    /// Apple's framework) but its eventual result is discarded — the
    /// promise to JS rejects on time. Only callable from the iOS 26+
    /// guarded path inside generate().
    @available(iOS 16.0, *)
    private static func withTimeout<T: Sendable>(
        seconds: Double,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(for: .seconds(seconds))
                throw FoundationModelsTimeout()
            }
            guard let result = try await group.next() else {
                throw FoundationModelsTimeout()
            }
            group.cancelAll()
            return result
        }
    }
}

private struct FoundationModelsTimeout: Error {}
