import CryptoKit
import AppKit
import Foundation
import FoundationModels
import Security
import Testing
@testable import IdeaTiles

@Suite("Native generation provider policy")
struct NativeGenerationPolicyTests {
    @Test("Apple is the default provider and an unavailable model never falls back")
    func appleDoesNotFallBack() async throws {
        let preferences = InMemoryGenerationPreferences()
        let apple = FakeTextGenerator(result: .failure(GenerationServiceError.modelUnavailable(.modelNotReady)))
        let cloud = FakeCloudGenerator(result: .success("must not run"))
        let engine = GenerationEngine(
            preferences: preferences,
            credentials: InMemoryCredentialStore(),
            appleGenerator: apple,
            cloudGenerator: cloud
        )

        #expect(await preferences.load().provider == .apple)
        await #expect(throws: GenerationServiceError.self) {
            try await engine.generate(prompt: "Board context")
        }
        #expect(await cloud.callCount == 0)
    }

    @Test("an explicitly selected cloud provider is the only provider invoked")
    func explicitCloudSelection() async throws {
        let preferences = InMemoryGenerationPreferences(settings: .init(
            provider: .openAI, model: "gpt-test", ollamaBaseURL: nil
        ))
        let credentials = InMemoryCredentialStore(values: [.openAI: "secret-value"])
        let cloud = FakeCloudGenerator(result: .success("# Result"))
        let engine = GenerationEngine(
            preferences: preferences,
            credentials: credentials,
            appleGenerator: FakeTextGenerator(result: .success("apple")),
            cloudGenerator: cloud
        )

        #expect(try await engine.generate(prompt: "Board context").content == "# Result")
        let invocation = try #require(await cloud.lastInvocation)
        #expect(invocation.provider == .openAI)
        #expect(invocation.model == "gpt-test")
        #expect(invocation.credential == "secret-value")
    }

    @Test("the native model deadline is shorter than the bridge deadline and cancels work")
    func nativeDeadline() async throws {
        #expect(GenerationDeadlines.foundationModels < GenerationDeadlines.bridge)
        let probe = CancellationProbeGenerator()
        let generator = DeadlineTextGenerator(base: probe, timeout: .milliseconds(20))

        await #expect(throws: GenerationServiceError.timeout) {
            try await generator.generate(prompt: "slow", model: nil)
        }
        #expect(await probe.wasCancelled)
    }
}

@Suite("Foundation Models production mapping")
struct FoundationModelsMappingTests {
    @Test("maps every availability state through the production adapter")
    func availability() {
        #expect(FoundationModelsErrorMapper.availability(.available) == .available)
        #expect(FoundationModelsErrorMapper.availability(.unavailable(.deviceNotEligible)) == .deviceNotEligible)
        #expect(FoundationModelsErrorMapper.availability(.unavailable(.appleIntelligenceNotEnabled)) == .appleIntelligenceNotEnabled)
        #expect(FoundationModelsErrorMapper.availability(.unavailable(.modelNotReady)) == .modelNotReady)
    }

    @Test("maps framework generation failures to actionable safe categories")
    func generationErrors() {
        let context = LanguageModelSession.GenerationError.Context(debugDescription: "must not escape")
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.exceededContextWindowSize(context)
        ) == .contextWindowExceeded)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.guardrailViolation(context)
        ) == .safetyRefusal)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.refusal(.init(transcriptEntries: []), context)
        ) == .safetyRefusal)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.rateLimited(context)
        ) == .rateLimited)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.concurrentRequests(context)
        ) == .concurrentRequest)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.assetsUnavailable(context)
        ) == .modelUnavailable(.modelNotReady))
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.unsupportedLanguageOrLocale(context)
        ) == .unsupportedLanguage)
        #expect(FoundationModelsErrorMapper.map(
            LanguageModelSession.GenerationError.decodingFailure(context)
        ) == .invalidResponse)
        #expect(FoundationModelsErrorMapper.map(TestMapperError()) == .invalidResponse)
    }
}

private struct TestMapperError: Error {}

@Suite("Native provider credentials")
struct NativeCredentialTests {
    @Test("credential status exposes presence without exposing secret values")
    func statusOnly() async throws {
        let store = InMemoryCredentialStore(values: [.anthropic: "sk-private"])
        let service = CredentialStatusService(store: store)

        let statuses = try await service.statuses()

        #expect(statuses[.anthropic] == true)
        #expect(statuses[.gemini] == false)
        let encoded = String(data: try JSONEncoder().encode(statuses), encoding: .utf8) ?? ""
        #expect(!encoded.contains("sk-private"))
    }

    @Test("Keychain status mapping treats only not-found as absence")
    func keychainStatusMapping() async throws {
        let access = FakeKeychainAccess()
        let store = KeychainCredentialStore(service: "test", access: access)
        access.setRead(status: errSecItemNotFound, data: nil)
        #expect(try await store.credential(for: .openAI) == nil)
        #expect(try await store.containsCredential(for: .openAI) == false)

        access.setRead(status: errSecAuthFailed, data: nil)
        await #expect(throws: CredentialStoreError.self) {
            try await store.credential(for: .openAI)
        }
        await #expect(throws: CredentialStoreError.self) {
            try await store.containsCredential(for: .openAI)
        }

        access.setRemoveStatus(errSecItemNotFound)
        try await store.removeCredential(for: .openAI)
    }
}

@MainActor
@Suite("Native generation settings")
struct NativeGenerationSettingsTests {
    @Test("settings save an explicit provider/model and transfer a credential only to the vault")
    func savesSettingsAndCredential() async throws {
        let preferences = InMemoryGenerationPreferences()
        let credentials = InMemoryCredentialStore()
        let model = GenerationSettingsViewModel(preferences: preferences, credentials: credentials)
        await model.load()

        model.provider = .anthropic
        model.model = "claude-test"
        model.credentialEntry = "private-key"
        try await model.save()

        #expect(await preferences.load().provider == .anthropic)
        #expect(await preferences.load().model == "claude-test")
        #expect(await credentials.credential(for: .anthropic) == "private-key")
        #expect(model.credentialEntry.isEmpty)
        #expect(model.credentialConfigured)
    }

    @Test(arguments: [
        GenerationSettings(provider: .ollama, model: "gemma3:4b", ollamaBaseURL: "https://example.com"),
        GenerationSettings(provider: .ollama, model: "gemma3:4b", ollamaBaseURL: "http://127.0.0.1:11434/path"),
        GenerationSettings(provider: .gemini, model: "org/model", ollamaBaseURL: nil),
        GenerationSettings(provider: .openAI, model: String(repeating: "é", count: 65), ollamaBaseURL: nil),
        GenerationSettings(provider: .apple, model: "not-the-system-model", ollamaBaseURL: nil),
        GenerationSettings(provider: .ollama, model: "username/../model", ollamaBaseURL: "http://127.0.0.1:11434"),
        GenerationSettings(provider: .ollama, model: "user\0name/model", ollamaBaseURL: "http://127.0.0.1:11434"),
    ])
    func rejectsContractParityViolations(_ settings: GenerationSettings) {
        #expect(throws: GenerationServiceError.self) { try settings.validated() }
    }

    @Test(arguments: [
        GenerationSettings(provider: .ollama, model: "username/model:latest", ollamaBaseURL: "http://127.0.0.1:11434"),
        GenerationSettings(provider: .ollama, model: "hf.co/username/repository:Q4_K_M", ollamaBaseURL: "http://127.0.0.1:11434"),
        GenerationSettings(provider: .openAI, model: "organization/model:release", ollamaBaseURL: nil),
    ])
    func acceptsProviderSpecificModelNames(_ settings: GenerationSettings) throws {
        #expect(try settings.validated() == settings)
    }

    @Test("validation returns the same trimmed model as the TypeScript contract")
    func returnsCanonicalModel() throws {
        let settings = GenerationSettings(provider: .openAI, model: "  organization/model  ", ollamaBaseURL: nil)

        #expect(try settings.validated().model == "organization/model")
    }
}

@Suite("Direct provider networking")
struct DirectProviderNetworkingTests {
    @Test(arguments: [
        (GenerationProvider.gemini, "https://generativelanguage.googleapis.com/v1beta/models/model-test:generateContent"),
        (.anthropic, "https://api.anthropic.com/v1/messages"),
        (.openAI, "https://api.openai.com/v1/chat/completions"),
        (.xAI, "https://api.x.ai/v1/chat/completions"),
        (.mistral, "https://api.mistral.ai/v1/chat/completions"),
    ])
    func fixedHTTPSRequests(provider: GenerationProvider, expectedURL: String) throws {
        let request = try DirectProviderRequestBuilder().makeRequest(
            provider: provider,
            model: "model-test",
            prompt: "hello",
            credential: "credential"
        )

        #expect(request.url?.absoluteString == expectedURL)
        #expect(request.url?.scheme == "https")
        #expect(request.httpMethod == "POST")
    }

    @Test("request construction applies provider-specific model safety")
    func providerSpecificModels() throws {
        let jsonBody = try DirectProviderRequestBuilder().makeRequest(
            provider: .openAI,
            model: "organization/model:release",
            prompt: "hello",
            credential: "credential"
        )
        let jsonData = try #require(jsonBody.httpBody)
        let jsonObject = try #require(JSONSerialization.jsonObject(with: jsonData) as? [String: Any])
        #expect(jsonObject["model"] as? String == "organization/model:release")

        #expect(throws: GenerationServiceError.invalidConfiguration) {
            try DirectProviderRequestBuilder().makeRequest(
                provider: .gemini,
                model: "organization/model",
                prompt: "hello",
                credential: "credential"
            )
        }

        let ollama = try DirectProviderRequestBuilder().makeRequest(
            provider: .ollama,
            model: "hf.co/username/repository:Q4_K_M",
            prompt: "hello",
            credential: nil,
            ollamaBaseURL: "http://127.0.0.1:11434"
        )
        let ollamaData = try #require(ollama.httpBody)
        let ollamaObject = try #require(JSONSerialization.jsonObject(with: ollamaData) as? [String: Any])
        #expect(ollamaObject["model"] as? String == "hf.co/username/repository:Q4_K_M")
    }

    @Test("a URLSession adapter can be tested without contacting a provider")
    func mockedURLProtocol() async throws {
        let recorder = MockURLProtocolRecorder(responseBody: #"{"choices":[{"message":{"content":"mocked"}}]}"#)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        MockURLProtocol.recorder = recorder
        defer { MockURLProtocol.recorder = nil }
        let client = DirectProviderClient(transport: URLSessionHTTPTransport(configuration: configuration))

        let value = try await client.generate(
            provider: .openAI, prompt: "hello", model: "gpt-test", credential: "key", ollamaBaseURL: nil
        )

        #expect(value == "mocked")
        #expect(recorder.request?.url?.absoluteString == "https://api.openai.com/v1/chat/completions")
    }

    @Test(arguments: [
        "http://example.com:11434",
        "https://192.168.1.8:11434",
        "http://user:pass@localhost:11434",
        "http://localhost:11434/path?query=1",
    ])
    func rejectsNonLoopbackOllama(_ raw: String) {
        #expect(throws: GenerationServiceError.self) {
            try OllamaEndpoint(rawValue: raw)
        }
    }

    @Test("Ollama accepts loopback endpoints and revalidates every redirect")
    func loopbackRedirects() throws {
        let endpoint = try OllamaEndpoint(rawValue: "http://127.0.0.1:11434")
        #expect(endpoint.chatURL.absoluteString == "http://127.0.0.1:11434/api/chat")
        let canonicalLocalhost = try OllamaEndpoint(rawValue: "http://localhost:11434")
        #expect(canonicalLocalhost.chatURL.absoluteString == "http://127.0.0.1:11434/api/chat")
        #expect(LoopbackRedirectPolicy.allows(
            from: endpoint.chatURL,
            to: URL(string: "http://localhost:11434/api/chat")!
        ))
        #expect(!LoopbackRedirectPolicy.allows(
            from: endpoint.chatURL,
            to: URL(string: "https://example.com/steal")!
        ))
    }

    @Test("the production transport rejects oversized declared and streamed cloud responses")
    func boundedCloudResponses() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let transport = URLSessionHTTPTransport(configuration: configuration)

        let declared = MockURLProtocolRecorder(
            responseBody: "{}",
            headers: ["Content-Length": "\(ProviderTransportLimits.maximumResponseBytes + 1)"]
        )
        MockURLProtocol.recorder = declared
        await #expect(throws: GenerationServiceError.responseTooLarge) {
            try await transport.data(for: URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!))
        }
        #expect(declared.wasStopped)

        let cumulative = MockURLProtocolRecorder(
            responseBody: String(repeating: "x", count: ProviderTransportLimits.maximumResponseBytes + 1)
        )
        MockURLProtocol.recorder = cumulative
        await #expect(throws: GenerationServiceError.responseTooLarge) {
            try await transport.data(for: URLRequest(url: URL(string: "http://127.0.0.1:11434/api/chat")!))
        }
        #expect(cumulative.wasStopped)
        MockURLProtocol.recorder = nil
    }

    @Test("oversized provider error bodies are rejected before status handling")
    func boundedErrorResponse() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        MockURLProtocol.recorder = MockURLProtocolRecorder(
            responseBody: String(repeating: "x", count: ProviderTransportLimits.maximumResponseBytes + 1),
            statusCode: 429
        )
        defer { MockURLProtocol.recorder = nil }
        let client = DirectProviderClient(transport: URLSessionHTTPTransport(configuration: configuration))

        await #expect(throws: GenerationServiceError.responseTooLarge) {
            try await client.generate(
                provider: .openAI, prompt: "hello", model: "gpt-test",
                credential: "key", ollamaBaseURL: nil
            )
        }
    }

    @Test("cancelling bounded streaming cancels the URL load")
    func transportCancellation() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let recorder = MockURLProtocolRecorder(responseBody: "{}", delay: 2)
        MockURLProtocol.recorder = recorder
        defer { MockURLProtocol.recorder = nil }
        let transport = URLSessionHTTPTransport(configuration: configuration)
        let task = Task {
            try await transport.data(for: URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!))
        }
        try await Task.sleep(for: .milliseconds(20))
        task.cancel()

        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(recorder.wasStopped)
    }
}

@Suite("Artifact generation and cancellation")
struct ArtifactGenerationTests {
    @Test("generated artifacts have bounded prompts, checksums, and selected-provider provenance")
    func manifestIntegrity() async throws {
        let generator = FakeTextGenerator(result: .success("# Generated\n"))
        let engine = FixedGenerationEngine(provider: .apple, model: nil, generator: generator)
        let coordinator = ArtifactGenerationCoordinator(engine: engine)
        let request = try GenerationRequestFixture.request(context: String(repeating: "x", count: 40_000))

        let manifest = try await coordinator.generate(request)

        let file = try #require(manifest.files.first)
        let bytes = try file.payloadData()
        #expect(file.sizeBytes == bytes.count)
        #expect(file.checksum.value == SHA256.hash(data: bytes).hexString)
        #expect(manifest.provenance.generator.kind == "onDevice")
        #expect(manifest.provenance.generator.name == "Apple Foundation Models")
        #expect(await generator.lastPrompt?.utf8.count ?? .max <= NativeContextReducer.maximumUTF8Bytes)
    }

    @Test("Dreamer artifacts retain managed-service provenance")
    func dreamerManifestProvenance() async throws {
        let generator = FakeTextGenerator(result: .success("# Managed\n"))
        let coordinator = ArtifactGenerationCoordinator(
            engine: FixedGenerationEngine(provider: .dreamer, model: "openai:gpt-5.6-luna", generator: generator)
        )

        let manifest = try await coordinator.generate(GenerationRequestFixture.request())

        #expect(manifest.provenance.generator.kind == "dreamer")
        #expect(manifest.provenance.generator.name == "Dreamer")
        #expect(manifest.provenance.generator.model == "openai:gpt-5.6-luna")
    }

    @Test("context reduction is deterministic and preserves UTF-8 boundaries")
    func utf8ContextReduction() {
        let context = String(repeating: "🧩é", count: 10_000)
        let first = NativeContextReducer.reduce(context)
        let second = NativeContextReducer.reduce(context)

        #expect(first == second)
        #expect(first.utf8.count <= NativeContextReducer.maximumUTF8Bytes)
        #expect(first.contains("[Context reduced by the native Mac host]"))
    }

    @Test("artifact.cancel cancels the matching active generation")
    func activeCancellation() async throws {
        let generator = CancellationProbeGenerator()
        let coordinator = ArtifactGenerationCoordinator(
            engine: FixedGenerationEngine(provider: .apple, model: nil, generator: generator)
        )
        let request = try GenerationRequestFixture.request(requestID: "generation:cancel")

        let task = Task { try await coordinator.generate(request) }
        await generator.waitUntilStarted()
        #expect(await coordinator.cancel(requestID: "generation:cancel"))
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await generator.wasCancelled)
    }
}

@MainActor
@Suite("Image Playground artifacts")
struct ImagePlaygroundArtifactTests {
    @Test("availability and cancellation are surfaced")
    func availabilityAndCancellation() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let unavailable = ImageArtifactGenerator(
            presenter: FakeImagePresenter(isAvailable: false, result: .failure(ImagePlaygroundServiceError.unavailable)),
            repository: repository
        )
        await #expect(throws: ImagePlaygroundServiceError.unavailable) {
            try await unavailable.generate(GenerationRequestFixture.request(recipeID: "image-playground-artwork"))
        }

        let cancelled = ImageArtifactGenerator(
            presenter: FakeImagePresenter(isAvailable: true, result: .failure(ImagePlaygroundServiceError.cancelled)),
            repository: repository
        )
        await #expect(throws: ImagePlaygroundServiceError.cancelled) {
            try await cancelled.generate(GenerationRequestFixture.request(recipeID: "image-playground-artwork"))
        }
    }

    @Test("a completed image is normalized to PNG in a file-backed attachment-compatible artifact")
    func imagePersistence() async throws {
        let root = try TestDirectory.make()
        let imageURL = root.appending(path: "playground.jpg")
        let bitmap = try #require(NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: 2,
            pixelsHigh: 2,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 8,
            bitsPerPixel: 32
        ))
        let sourceBytes = try #require(bitmap.representation(using: .jpeg, properties: [:]))
        try sourceBytes.write(to: imageURL)
        let repository = try ArtifactRepository(root: root.appending(path: "Repository"), inMemory: true)
        try FileManager.default.removeItem(at: imageURL)
        let generator = ImageArtifactGenerator(
            presenter: FakeImagePresenter(isAvailable: true, result: .success(sourceBytes)),
            repository: repository
        )

        let manifest = try await generator.generate(
            GenerationRequestFixture.request(recipeID: "image-playground-artwork")
        )

        #expect(manifest.kind == "image")
        #expect(manifest.provenance.generator.kind == "imagePlayground")
        let file = try #require(manifest.files.first)
        #expect(file.mimeType == "image/png")
        let imageBytes = try file.payloadData()
        #expect(imageBytes != sourceBytes)
        #expect(Array(imageBytes.prefix(8)) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        #expect(file.checksum.value == SHA256.hash(data: imageBytes).hexString)
        #expect(try await repository.loadArtifact(id: manifest.id) == manifest)
        #expect(try Data(contentsOf: await repository.payloadURL(artifactID: manifest.id, path: file.path)) == imageBytes)
    }

    @Test("cancellation racing a committed image save removes the artifact before returning")
    func cancellationRollsBackCommittedImage() async throws {
        let root = try TestDirectory.make()
        let gate = PersistenceCommitGate()
        let repository = try ArtifactRepository(
            root: root,
            inMemory: true,
            metadataCommitter: { context in
                gate.markEntered()
                guard gate.waitForRelease() else {
                    throw PersistenceCommitGate.GateError.timedOut
                }
                try context.save()
            }
        )
        let bitmap = try #require(NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: 2,
            pixelsHigh: 2,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 8,
            bitsPerPixel: 32
        ))
        let png = try #require(bitmap.representation(using: .png, properties: [:]))
        let generator = ImageArtifactGenerator(
            presenter: FakeImagePresenter(isAvailable: true, result: .success(png)),
            repository: repository
        )
        let task = Task {
            try await generator.generate(
                GenerationRequestFixture.request(recipeID: "image-playground-artwork")
            )
        }

        #expect(await gate.waitUntilEntered())
        task.cancel()
        gate.open()

        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(try await repository.artifactCount() == 0)
        let artifactsRoot = root.appending(path: "Boards/board:1/Artifacts")
        let remaining = (try? FileManager.default.contentsOfDirectory(atPath: artifactsRoot.path)) ?? []
        #expect(remaining.filter { !$0.hasPrefix(".") }.isEmpty)
    }

    @Test("request lifecycle ignores stale completion and clears before returning completion")
    func imageLifecycle() throws {
        let lifecycle = ImagePlaygroundRequestLifecycle()
        let first = try lifecycle.begin()
        #expect(lifecycle.finish(id: UUID(), result: .failure(ImagePlaygroundServiceError.cancelled)) == nil)
        let completion = try #require(lifecycle.finish(id: first, result: .success(Data([1]))))
        #expect(!lifecycle.isActive)
        #expect(lifecycle.finish(id: first, result: .success(Data([2]))) == nil)
        #expect(try completion.get() == Data([1]))
    }
}

private actor FakeTextGenerator: TextGenerating {
    let result: Result<String, Error>
    private(set) var lastPrompt: String?

    init(result: Result<String, Error>) { self.result = result }

    func generate(prompt: String, model: String?) async throws -> String {
        lastPrompt = prompt
        return try result.get()
    }
}

private actor CancellationProbeGenerator: TextGenerating {
    private(set) var wasCancelled = false
    private var started = false

    func generate(prompt: String, model: String?) async throws -> String {
        started = true
        do {
            try await Task.sleep(for: .seconds(10))
            return "late"
        } catch is CancellationError {
            wasCancelled = true
            throw CancellationError()
        }
    }

    func waitUntilStarted() async {
        while !started { await Task.yield() }
    }
}

private actor FakeCloudGenerator: CloudTextGenerating {
    struct Invocation: Sendable {
        let provider: GenerationProvider
        let model: String
        let credential: String?
    }

    let result: Result<String, Error>
    private(set) var callCount = 0
    private(set) var lastInvocation: Invocation?

    init(result: Result<String, Error>) { self.result = result }

    func generate(
        provider: GenerationProvider,
        prompt: String,
        model: String,
        credential: String?,
        ollamaBaseURL: String?
    ) async throws -> String {
        callCount += 1
        lastInvocation = Invocation(provider: provider, model: model, credential: credential)
        return try result.get()
    }
}

private actor InMemoryCredentialStore: CredentialStoring {
    private var values: [GenerationProvider: String]
    init(values: [GenerationProvider: String] = [:]) { self.values = values }
    func set(_ value: String, for provider: GenerationProvider) { values[provider] = value }
    func credential(for provider: GenerationProvider) -> String? { values[provider] }
    func containsCredential(for provider: GenerationProvider) -> Bool { values[provider] != nil }
    func removeCredential(for provider: GenerationProvider) { values.removeValue(forKey: provider) }
}

private actor InMemoryGenerationPreferences: GenerationPreferencesStoring {
    private var settings: GenerationSettings
    init(settings: GenerationSettings = .default) { self.settings = settings }
    func load() -> GenerationSettings { settings }
    func save(_ settings: GenerationSettings) { self.settings = settings }
}

private final class FakeKeychainAccess: KeychainAccessing, @unchecked Sendable {
    private let lock = NSLock()
    private var readStatus: OSStatus = errSecSuccess
    private var readData: Data?
    private var removeStatus: OSStatus = errSecSuccess

    func setRead(status: OSStatus, data: Data?) {
        lock.withLock { readStatus = status; readData = data }
    }
    func setRemoveStatus(_ status: OSStatus) { lock.withLock { removeStatus = status } }
    func set(_ data: Data, service: String, account: String) -> OSStatus { errSecSuccess }
    func read(service: String, account: String, returnData: Bool) -> (OSStatus, Data?) {
        lock.withLock { (readStatus, returnData ? readData : nil) }
    }
    func remove(service: String, account: String) -> OSStatus { lock.withLock { removeStatus } }
}

private struct FixedGenerationEngine: ArtifactTextGenerating {
    let provider: GenerationProvider
    let model: String?
    let generator: any TextGenerating

    func generate(prompt: String) async throws -> GeneratedText {
        GeneratedText(
            content: try await generator.generate(prompt: prompt, model: model),
            provider: provider,
            model: model
        )
    }
}

@MainActor
private final class FakeImagePresenter: ImagePlaygroundPresenting {
    let isAvailable: Bool
    let result: Result<Data, Error>
    init(isAvailable: Bool, result: Result<Data, Error>) {
        self.isAvailable = isAvailable
        self.result = result
    }
    func createImage(concept: String) async throws -> Data { try result.get() }
}

private enum GenerationRequestFixture {
    static func request(
        requestID: String = "generation:1",
        recipeID: String = "brief",
        context: String = "[ROOT] Board context"
    ) throws -> ArtifactGenerationRequest {
        try ArtifactGenerationRequest(params: [
            "requestId": .string(requestID),
            "sourceBoardId": .string("board:1"),
            "sourceNodeIds": .array([.string("0,0")]),
            "includedNodeCount": .number(1),
            "originalNodeCount": .number(1),
            "contextTruncated": .bool(false),
            "recipeId": .string(recipeID),
            "scope": .object(["kind": .string("board")]),
            "context": .string(context),
        ])
    }
}

private extension SHA256.Digest {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}

private final class PersistenceCommitGate: @unchecked Sendable {
    enum GateError: Error { case timedOut }
    private let lock = NSLock()
    private let release = DispatchSemaphore(value: 0)
    private var entered = false

    func markEntered() { lock.withLock { entered = true } }
    func waitForRelease() -> Bool { release.wait(timeout: .now() + 2) == .success }
    func open() { release.signal() }

    func waitUntilEntered() async -> Bool {
        let deadline = ContinuousClock.now + .seconds(2)
        while !lock.withLock({ entered }) {
            if ContinuousClock.now >= deadline { return false }
            await Task.yield()
        }
        return true
    }
}

private final class MockURLProtocolRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private let responseBody: String
    private let statusCode: Int
    private let headers: [String: String]
    let delay: TimeInterval
    private var storedRequest: URLRequest?
    private var stopped = false
    var request: URLRequest? { lock.withLock { storedRequest } }
    var wasStopped: Bool { lock.withLock { stopped } }

    init(
        responseBody: String,
        statusCode: Int = 200,
        headers: [String: String] = [:],
        delay: TimeInterval = 0
    ) {
        self.responseBody = responseBody
        self.statusCode = statusCode
        self.headers = headers
        self.delay = delay
    }

    func markStopped() { lock.withLock { stopped = true } }

    func respond(to request: URLRequest) -> (HTTPURLResponse, Data) {
        lock.withLock { storedRequest = request }
        let response = HTTPURLResponse(url: request.url!, statusCode: statusCode, httpVersion: nil, headerFields: headers)!
        return (response, Data(responseBody.utf8))
    }
}

private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var storedRecorder: MockURLProtocolRecorder?
    static var recorder: MockURLProtocolRecorder? {
        get { lock.withLock { storedRecorder } }
        set { lock.withLock { storedRecorder = newValue } }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let recorder = Self.recorder else { return }
        let load: @Sendable () -> Void = { [weak self] in
            guard let self, !recorder.wasStopped else { return }
            let (response, data) = recorder.respond(to: self.request)
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if recorder.delay > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + recorder.delay, execute: load) }
        else { load() }
    }
    override func stopLoading() { Self.recorder?.markStopped() }
}
