import Foundation

enum GenerationProvider: String, Codable, CaseIterable, Sendable {
    case apple
    case gemini
    case anthropic
    case openAI = "openai"
    case xAI = "xai"
    case mistral
    case ollama
    case dreamer

    var displayName: String {
        switch self {
        case .apple: "Apple Foundation Models"
        case .gemini: "Google Gemini"
        case .anthropic: "Anthropic Claude"
        case .openAI: "OpenAI"
        case .xAI: "xAI Grok"
        case .mistral: "Mistral"
        case .ollama: "Ollama"
        case .dreamer: "Dreamer"
        }
    }

    var defaultModel: String {
        switch self {
        case .apple: "system-language-model"
        case .gemini: "gemini-2.0-flash"
        case .anthropic: "claude-haiku-4-5-20251001"
        case .openAI: "gpt-5.6-luna"
        case .xAI: "grok-3-mini-fast"
        case .mistral: "mistral-small-latest"
        case .ollama: "gemma3:4b"
        case .dreamer: "automatic"
        }
    }

    var requiresCredential: Bool { self != .apple && self != .ollama }
}

struct GenerationSettings: Codable, Equatable, Sendable {
    let provider: GenerationProvider
    let model: String
    let ollamaBaseURL: String?

    static let `default` = GenerationSettings(
        provider: .apple,
        model: GenerationProvider.apple.defaultModel,
        ollamaBaseURL: nil
    )

    init(provider: GenerationProvider, model: String, ollamaBaseURL: String?) {
        self.provider = provider
        self.model = model
        self.ollamaBaseURL = ollamaBaseURL
    }

    func validated() throws -> GenerationSettings {
        let model = model.trimmingCharacters(in: .whitespacesAndNewlines)
        guard GenerationModelValidator.isValid(model, for: provider) else {
            throw GenerationServiceError.invalidConfiguration
        }
        if provider == .ollama {
            guard let ollamaBaseURL else { throw GenerationServiceError.invalidConfiguration }
            _ = try OllamaEndpoint(rawValue: ollamaBaseURL)
        }
        return GenerationSettings(provider: provider, model: model, ollamaBaseURL: ollamaBaseURL)
    }
}

enum GenerationModelValidator {
    static func isValid(_ model: String, for provider: GenerationProvider) -> Bool {
        guard !model.isEmpty, model.utf8.count <= 128 else { return false }
        switch provider {
        case .apple:
            return model == GenerationProvider.apple.defaultModel
        case .dreamer:
            return model == GenerationProvider.dreamer.defaultModel
        case .gemini:
            return matches(model, pattern: #"^[A-Za-z0-9][A-Za-z0-9._-]*$"#)
        case .ollama:
            let segments = model.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            guard !segments.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }),
                  let last = segments.last,
                  segments.dropLast().allSatisfy({ matches($0, pattern: #"^[A-Za-z0-9][A-Za-z0-9._-]*$"#) })
            else { return false }
            return matches(last, pattern: #"^[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$"#)
        case .anthropic, .openAI, .xAI, .mistral:
            return matches(model, pattern: #"^[A-Za-z0-9][A-Za-z0-9._:/-]*$"#)
        }
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
}

protocol GenerationPreferencesStoring: Sendable {
    func load() async -> GenerationSettings
    func save(_ settings: GenerationSettings) async throws
}

actor UserDefaultsGenerationPreferences: GenerationPreferencesStoring {
    private let defaults: UserDefaults
    private let key = "app.ideatiles.macos.generation.settings.v1"

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func load() -> GenerationSettings {
        guard let data = defaults.data(forKey: key),
              let value = try? JSONDecoder().decode(GenerationSettings.self, from: data),
              let validated = try? value.validated()
        else { return .default }
        return validated
    }

    func save(_ settings: GenerationSettings) throws {
        let validated = try settings.validated()
        defaults.set(try JSONEncoder().encode(validated), forKey: key)
    }
}

enum FoundationModelUnavailableReason: String, Equatable, Sendable {
    case deviceNotEligible
    case appleIntelligenceNotEnabled
    case modelNotReady
}

enum GenerationServiceError: Error, Equatable, LocalizedError, Sendable {
    case invalidConfiguration
    case missingCredential(GenerationProvider)
    case modelUnavailable(FoundationModelUnavailableReason)
    case invalidResponse
    case providerFailure(statusCode: Int)
    case timeout
    case responseTooLarge
    case contextWindowExceeded
    case safetyRefusal
    case rateLimited
    case unsupportedLanguage
    case concurrentRequest
    case dreamer(DreamerAccessFailure)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: "Generation settings are invalid."
        case .missingCredential(let provider): "A credential is required for \(provider.displayName)."
        case .modelUnavailable(let reason): "Apple Foundation Models is unavailable (\(reason.rawValue))."
        case .invalidResponse: "The selected provider returned an invalid response."
        case .providerFailure(let status): "The selected provider returned HTTP \(status)."
        case .timeout: "Generation timed out."
        case .responseTooLarge: "The selected provider returned too much data."
        case .contextWindowExceeded: "The selected context is too large for the on-device model."
        case .safetyRefusal: "The on-device model declined this request."
        case .rateLimited: "The on-device model is temporarily busy."
        case .unsupportedLanguage: "The on-device model does not support this language or locale."
        case .concurrentRequest: "The on-device model is already handling another request."
        case .dreamer(let failure): DreamerAccessError.failure(failure).localizedDescription
        }
    }
}

enum GenerationDeadlines {
    static let foundationModels: Duration = .seconds(15)
    static let bridge: Duration = .seconds(30)
}

struct ArtifactGenerationRequest: Sendable, Equatable {
    let requestID: String
    let sourceBoardID: String
    let sourceNodeIDs: [String]
    let recipeID: String
    let scope: JSONValue
    let context: String
    let instructions: String?

    init(params: [String: JSONValue]) throws {
        guard let requestID = params["requestId"]?.stringValue,
              let sourceBoardID = params["sourceBoardId"]?.stringValue,
              let recipeID = params["recipeId"]?.stringValue,
              let scope = params["scope"],
              let context = params["context"]?.stringValue,
              case .array(let rawNodeIDs) = params["sourceNodeIds"],
              !rawNodeIDs.isEmpty
        else { throw GenerationServiceError.invalidConfiguration }
        let sourceNodeIDs = rawNodeIDs.compactMap(\.stringValue)
        guard sourceNodeIDs.count == rawNodeIDs.count else {
            throw GenerationServiceError.invalidConfiguration
        }
        self.requestID = requestID
        self.sourceBoardID = sourceBoardID
        self.sourceNodeIDs = sourceNodeIDs
        self.recipeID = recipeID
        self.scope = scope
        self.context = context
        instructions = params["instructions"]?.stringValue
    }
}

protocol TextGenerating: Sendable {
    func generate(prompt: String, model: String?) async throws -> String
}

protocol CloudTextGenerating: Sendable {
    func generate(
        provider: GenerationProvider,
        prompt: String,
        model: String,
        credential: String?,
        ollamaBaseURL: String?
    ) async throws -> String
}

struct GeneratedText: Sendable, Equatable {
    let content: String
    let provider: GenerationProvider
    let model: String?
}

protocol ArtifactTextGenerating: Sendable {
    func generate(prompt: String) async throws -> GeneratedText
}

enum NativeContextReducer {
    // Task 1 already caps board context at 12,000 characters. This larger native
    // envelope preserves that complete provenance while bounding prompt overhead
    // and rejecting oversized/hostile bridge input deterministically.
    static let maximumUTF8Bytes = 16_000

    static func reduce(_ value: String) -> String {
        let bytes = Data(value.utf8)
        guard bytes.count > maximumUTF8Bytes else { return value }
        let marker = "\n\n[Context reduced by the native Mac host]\n\n"
        let available = maximumUTF8Bytes - marker.utf8.count
        let leading = available * 3 / 4
        let trailing = available - leading
        var prefix = Data(bytes.prefix(leading))
        while String(data: prefix, encoding: .utf8) == nil { prefix.removeLast() }
        var suffix = Data(bytes.suffix(trailing))
        while String(data: suffix, encoding: .utf8) == nil { suffix.removeFirst() }
        return String(decoding: prefix, as: UTF8.self) + marker + String(decoding: suffix, as: UTF8.self)
    }
}
