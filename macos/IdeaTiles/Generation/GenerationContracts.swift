import Foundation

enum GenerationProvider: String, Codable, CaseIterable, Sendable {
    case apple
    case gemini
    case anthropic
    case openAI = "openai"
    case xAI = "xai"
    case mistral
    case ollama

    var displayName: String {
        switch self {
        case .apple: "Apple Foundation Models"
        case .gemini: "Google Gemini"
        case .anthropic: "Anthropic Claude"
        case .openAI: "OpenAI"
        case .xAI: "xAI Grok"
        case .mistral: "Mistral"
        case .ollama: "Ollama"
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
        guard !model.isEmpty, model.utf8.count <= 128,
              !model.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
        else { throw GenerationServiceError.invalidConfiguration }
        if provider == .ollama {
            guard let ollamaBaseURL else { throw GenerationServiceError.invalidConfiguration }
            _ = try OllamaEndpoint(rawValue: ollamaBaseURL)
        }
        return GenerationSettings(provider: provider, model: model, ollamaBaseURL: ollamaBaseURL)
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

enum GenerationServiceError: Error, Equatable, LocalizedError, Sendable {
    case invalidConfiguration
    case missingCredential(GenerationProvider)
    case modelUnavailable(String)
    case invalidResponse
    case providerFailure(statusCode: Int)
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: "Generation settings are invalid."
        case .missingCredential(let provider): "A credential is required for \(provider.displayName)."
        case .modelUnavailable(let reason): "Apple Foundation Models is unavailable (\(reason))."
        case .invalidResponse: "The selected provider returned an invalid response."
        case .providerFailure(let status): "The selected provider returned HTTP \(status)."
        case .timeout: "Generation timed out."
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
    static let maximumCharacters = 16_000

    static func reduce(_ value: String) -> String {
        guard value.count > maximumCharacters else { return value }
        let marker = "\n\n[Context reduced by the native Mac host]\n\n"
        let available = maximumCharacters - marker.count
        let leading = available * 3 / 4
        let trailing = available - leading
        return String(value.prefix(leading)) + marker + String(value.suffix(trailing))
    }
}
