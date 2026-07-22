import Foundation
import FoundationModels

enum FoundationModelAvailability: Equatable, Sendable {
    case available
    case deviceNotEligible
    case appleIntelligenceNotEnabled
    case modelNotReady

    var unavailableReason: FoundationModelUnavailableReason? {
        switch self {
        case .available: nil
        case .deviceNotEligible: .deviceNotEligible
        case .appleIntelligenceNotEnabled: .appleIntelligenceNotEnabled
        case .modelNotReady: .modelNotReady
        }
    }
}

enum FoundationModelsErrorMapper {
    static func availability(_ value: SystemLanguageModel.Availability) -> FoundationModelAvailability {
        switch value {
        case .available: .available
        case .unavailable(.deviceNotEligible): .deviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled): .appleIntelligenceNotEnabled
        case .unavailable(.modelNotReady): .modelNotReady
        @unknown default: .modelNotReady
        }
    }

    static func map(_ error: Error) -> GenerationServiceError {
        guard let error = error as? LanguageModelSession.GenerationError else {
            return .invalidResponse
        }
        switch error {
        case .exceededContextWindowSize: return GenerationServiceError.contextWindowExceeded
        case .assetsUnavailable: return GenerationServiceError.modelUnavailable(.modelNotReady)
        case .guardrailViolation, .refusal: return GenerationServiceError.safetyRefusal
        case .rateLimited: return GenerationServiceError.rateLimited
        case .concurrentRequests: return GenerationServiceError.concurrentRequest
        case .unsupportedLanguageOrLocale: return GenerationServiceError.unsupportedLanguage
        case .unsupportedGuide, .decodingFailure: return GenerationServiceError.invalidResponse
        @unknown default: return GenerationServiceError.invalidResponse
        }
    }
}

struct FoundationModelsTextGenerator: TextGenerating, Sendable {
    var availability: FoundationModelAvailability {
        FoundationModelsErrorMapper.availability(SystemLanguageModel.default.availability)
    }

    func generate(prompt: String, model: String?) async throws -> String {
        guard availability == .available else {
            throw GenerationServiceError.modelUnavailable(availability.unavailableReason ?? .modelNotReady)
        }
        try Task.checkCancellation()
        let session = LanguageModelSession(
            model: .default,
            instructions: "Create the requested artifact from only the supplied Idea Tiles context. Return artifact content only. Never claim that software was installed, built, or executed."
        )
        do {
            let response = try await session.respond(to: prompt)
            try Task.checkCancellation()
            return response.content
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw FoundationModelsErrorMapper.map(error)
        }
    }
}

private enum DeadlineOutcome: Sendable {
    case success(String)
    case failure(GenerationServiceError)
    case cancelled
    case otherFailure
}

private final class DeadlineReply: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<DeadlineOutcome, Never>?
    private var outcome: DeadlineOutcome?
    private var operation: Task<Void, Never>?
    private var timer: Task<Void, Never>?

    func wait() async -> DeadlineOutcome {
        await withCheckedContinuation { continuation in
            lock.withLock {
                if let outcome { continuation.resume(returning: outcome) }
                else { self.continuation = continuation }
            }
        }
    }

    func install(operation: Task<Void, Never>, timer: Task<Void, Never>) {
        lock.withLock {
            if outcome == nil {
                self.operation = operation
                self.timer = timer
            } else {
                operation.cancel()
                timer.cancel()
            }
        }
    }

    func resolve(_ value: DeadlineOutcome, timedOut: Bool = false) {
        let continuation: CheckedContinuation<DeadlineOutcome, Never>? = lock.withLock {
            guard outcome == nil else { return nil }
            outcome = value
            let continuation = self.continuation
            self.continuation = nil
            if timedOut { operation?.cancel() } else { timer?.cancel() }
            operation = nil
            timer = nil
            return continuation
        }
        continuation?.resume(returning: value)
    }
}

struct DeadlineTextGenerator: TextGenerating, Sendable {
    let base: any TextGenerating
    let timeout: Duration

    func generate(prompt: String, model: String?) async throws -> String {
        let reply = DeadlineReply()
        let operation = Task {
            do { reply.resolve(.success(try await base.generate(prompt: prompt, model: model))) }
            catch let error as GenerationServiceError { reply.resolve(.failure(error)) }
            catch is CancellationError { reply.resolve(.cancelled) }
            catch { reply.resolve(.otherFailure) }
        }
        let timer = Task {
            do {
                try await Task.sleep(for: timeout)
                reply.resolve(.failure(.timeout), timedOut: true)
            } catch {}
        }
        reply.install(operation: operation, timer: timer)

        return try await withTaskCancellationHandler {
            switch await reply.wait() {
            case .success(let text): text
            case .failure(let error): throw error
            case .cancelled: throw CancellationError()
            case .otherFailure: throw GenerationServiceError.invalidResponse
            }
        } onCancel: {
            operation.cancel()
            timer.cancel()
            reply.resolve(.cancelled)
        }
    }
}

struct GenerationEngine: ArtifactTextGenerating, Sendable {
    let preferences: any GenerationPreferencesStoring
    let credentials: any CredentialStoring
    let appleGenerator: any TextGenerating
    let cloudGenerator: any CloudTextGenerating

    func generate(prompt: String) async throws -> GeneratedText {
        let settings = try await preferences.load().validated()
        if settings.provider == .apple {
            let text = try await appleGenerator.generate(prompt: prompt, model: settings.model)
            return GeneratedText(content: text, provider: .apple, model: settings.model)
        }

        let credential = try await credentials.credential(for: settings.provider)
        if settings.provider.requiresCredential, credential == nil {
            throw GenerationServiceError.missingCredential(settings.provider)
        }
        let text = try await cloudGenerator.generate(
            provider: settings.provider,
            prompt: prompt,
            model: settings.model,
            credential: credential,
            ollamaBaseURL: settings.ollamaBaseURL
        )
        return GeneratedText(content: text, provider: settings.provider, model: settings.model)
    }
}
