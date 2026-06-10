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
// MARK: - Generable schema for tile generation
//
// These mirror BRANCH_SET_SCHEMA in client/src/lib/branchSchema.ts. Keep
// them in sync. The Generable macro emits a JSON schema the
// FoundationModels framework uses for grammar-constrained decoding —
// the model literally cannot emit invalid enum values or arrays of the
// wrong length. This permanently fixes the schema-placeholder-leak
// class of bug (commits 139c4a0, 269a423) where the prompt's example
// strings could end up in the output verbatim.

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct GeneratedBranch: Codable {
    @Guide(description: "Short label, 2-4 words")
    var title: String

    @Guide(description: "Brief 1-2 sentence explanation")
    var description: String?

    @Guide(description: "Tile type", .anyOf(["concept", "action", "technical", "question", "risk"]))
    var type: String

    @Guide(description: "How richly this could expand, 1-5", .range(1...5))
    var complexity: Int

    @Guide(description: "true only for complexity 4-5; max 2 per generation")
    var autoExpand: Bool

    @Guide(description: "Set true ONLY when downstream branches depend on knowledge ONLY THE USER HAS — preferences, constraints, situation, goals. NEVER for facts the model could state itself.")
    var shouldAskClarifyingQuestion: Bool

    @Guide(description: "Question text. Only present when shouldAsk is true.")
    var clarifyingQuestion: String?

    @Guide(description: "Why user input is required. Only present when shouldAsk is true.")
    var clarificationReasoning: String?

    @Guide(description: "Only present when shouldAsk is true.", .anyOf(["preference", "constraint", "situation", "goal"]))
    var userInputCategory: String?

    @Guide(description: "0-5 short answers shown as tappable chips above the textbox. Empty array for purely open-ended questions.", .count(0...5))
    var suggestedAnswers: [String]?

    @Guide(description: "Existing node keys this branch conceptually links to.")
    var relatedTo: [String]?
}

@available(iOS 26.0, *)
@Generable
struct GeneratedBranchSet: Codable {
    @Guide(description: "Exactly 6 branches", .count(6))
    var branches: [GeneratedBranch]
}
#endif

@objc(FoundationModelsPlugin)
public class FoundationModelsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FoundationModelsPlugin"
    public let jsName = "FoundationModels"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateBranches", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            #if canImport(FoundationModels)
            let model = SystemLanguageModel.default
            switch model.availability {
            case .available:
                call.resolve(["available": true])
            case .unavailable(let reason):
                // `modelNotReady` is transient — model assets rehydrate
                // after reboot/OS update and availability flips to
                // .available on its own. The JS side must NOT latch
                // "unavailable" for the session on a transient reason,
                // or the UI tells the user Apple Intelligence is off
                // when it's merely warming up.
                let reasonName: String
                var transient = false
                switch reason {
                case .deviceNotEligible:
                    reasonName = "deviceNotEligible"
                case .appleIntelligenceNotEnabled:
                    reasonName = "appleIntelligenceNotEnabled"
                case .modelNotReady:
                    reasonName = "modelNotReady"
                    transient = true
                @unknown default:
                    // Unknown future reasons: assume transient so we
                    // re-probe rather than latch off permanently.
                    reasonName = String(describing: reason)
                    transient = true
                }
                call.resolve([
                    "available": false,
                    "reason": reasonName,
                    "transient": transient,
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
                    if case .unavailable(let reason) = model.availability {
                        // Include the reason: "modelNotReady" is a transient
                        // warm-up state, not a capability statement, and the
                        // JS layer keys off this string to re-probe instead
                        // of latching the session to cloud-only.
                        call.reject(
                            "FoundationModels unavailable: \(String(describing: reason))"
                        )
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
                    let text = try await Self.withTimeout(seconds: 15) {
                        let response = try await session.respond(to: prompt, options: options)
                        return response.content
                    }
                    call.resolve(["text": text])
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

    /// Grammar-constrained tile generation via @Generable.
    ///
    /// Where `generate` returns raw text (used by the merge synthesis path
    /// which has its own light schema), this returns a JSON-serialized
    /// `GeneratedBranchSet` — the framework guarantees the shape, the
    /// enum membership of `type` and `userInputCategory`, the
    /// 6-branch array length, and the 0-5 bound on suggestedAnswers.
    /// No prompt-text discipline can match this; the post-hoc validator
    /// in clarificationValidator.ts becomes a belt-and-suspenders check
    /// for SEMANTIC drift (factual questions disguised as user-knowledge),
    /// not for SHAPE drift (which is now impossible).
    ///
    /// The JS side wraps this via `tryOnDeviceBranchesFirst` and parses
    /// the returned `text` field as JSON. Same return shape as `generate`
    /// so the bridge contract stays uniform — only the call dispatch
    /// changes.
    @objc func generateBranches(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt") else {
            call.reject("Missing required field: prompt")
            return
        }
        let systemPrompt = call.getString("systemPrompt")
        let temperature = call.getDouble("temperature") ?? 0.7
        let maxTokens = call.getInt("maxTokens") ?? 2048

        if #available(iOS 26.0, *) {
            #if canImport(FoundationModels)
            Task {
                do {
                    let model = SystemLanguageModel.default
                    if case .unavailable(let reason) = model.availability {
                        // Include the reason: "modelNotReady" is a transient
                        // warm-up state, not a capability statement, and the
                        // JS layer keys off this string to re-probe instead
                        // of latching the session to cloud-only.
                        call.reject(
                            "FoundationModels unavailable: \(String(describing: reason))"
                        )
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

                    let result = try await Self.withTimeout(seconds: 15) {
                        let response = try await session.respond(
                            to: prompt,
                            generating: GeneratedBranchSet.self,
                            options: options
                        )
                        return response.content
                    }

                    // Encode the typed Swift value back to JSON for the JS
                    // bridge. Default JSONEncoder emits Optional fields as
                    // `null` when nil — JS-side parser handles both null
                    // and missing keys identically.
                    let jsonData = try JSONEncoder().encode(result)
                    guard let jsonString = String(data: jsonData, encoding: .utf8) else {
                        call.reject("FoundationModels: failed to encode BranchSet to JSON")
                        return
                    }
                    call.resolve(["text": jsonString])
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
