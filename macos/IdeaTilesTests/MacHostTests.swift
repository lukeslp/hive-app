import CryptoKit
import Foundation
import Testing
@testable import IdeaTiles

@Suite("Mac host bootstrap")
struct MacHostBootstrapTests {
    @Test("injects capabilities and services at document start")
    func bootstrapScript() {
        let source = MacBridgeBootstrap.javaScript(capabilities: .fullyAvailable)

        #expect(source.contains("Object.defineProperty(window, 'ideaTilesMac'"))
        #expect(source.contains("artifactStudioServices"))
        #expect(source.contains("artifact.generate"))
        #expect(source.contains("artifact.cancel"))
        #expect(source.contains("artifact.save"))
        #expect(source.contains("artifact.export"))
        #expect(source.contains("artifact.attachImage"))
        #expect(source.contains("generation.settings.get"))
        #expect(source.contains("generation.settings.set"))
        #expect(source.contains("credentials.status"))
        #expect(source.contains("credentials.set"))
        #expect(source.contains("credentials.remove"))
        #expect(source.contains("dreamer.status"))
        #expect(source.contains("dreamer.profile"))
        #expect(source.contains("dreamer.redeem"))
        #expect(source.contains("dreamer.remove"))
        #expect(source.contains("dreamer.requestAccess"))
        #expect(!source.contains("localStorage"))
        #expect(source.contains("bridgeVersion: 1"))
    }

    @Test("bootstrap and RPC expose the same runtime-derived capabilities")
    func runtimeCapabilitiesStayInSync() async throws {
        let capabilities = MacRuntimeCapabilities(
            artifactGeneration: true,
            artifactPersistence: true,
            artifactExport: true,
            imagePlayground: false,
            keychain: true,
            staticPreview: true
        )
        let source = MacBridgeBootstrap.javaScript(capabilities: capabilities)
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(
            repository: repository,
            capabilities: capabilities,
            exporter: { _ in true }
        )
        let result = try await router.execute(ValidatedRPCRequest(
            id: "rpc:capabilities:dynamic", method: .getCapabilities, params: [:]
        ))

        #expect(source.contains("imagePlayground: false"))
        #expect(result == capabilities.jsonValue)
        #expect(result.objectValue?["features"]?.objectValue?["imagePlayground"] == .bool(false))
    }

    @Test("main navigation stays on the private app origin")
    func navigationPolicy() {
        let policy = AppNavigationPolicy()

        #expect(policy.allows(URL(string: "ideatiles://app/index.html")!))
        #expect(!policy.allows(URL(string: "ideatiles://other/index.html")!))
        #expect(!policy.allows(URL(string: "https://ideatiles.app")!))
        #expect(!policy.allows(URL(filePath: "/tmp/index.html")))
    }

    @Test("accepts bridge messages only from the main private app frame")
    func messageOriginPolicy() {
        let policy = BridgeMessageOriginPolicy()

        #expect(policy.allows(isMainFrame: true, sourceURL: URL(string: "ideatiles://app/index.html")))
        #expect(!policy.allows(isMainFrame: false, sourceURL: URL(string: "ideatiles://app/index.html")))
        #expect(!policy.allows(isMainFrame: true, sourceURL: URL(string: "https://ideatiles.app")))
        #expect(!policy.allows(isMainFrame: true, sourceURL: URL(string: "ideatiles://other/index.html")))
    }

    @Test("main-app subresources allow only the canonical Idea Tiles API")
    func subresourcePolicy() throws {
        let rules = try #require(try JSONSerialization.jsonObject(with: Data(AppContentSecurityPolicy.contentBlockerRules.utf8)) as? [[String: Any]])
        #expect(rules.contains { rule in
            guard let trigger = rule["trigger"] as? [String: Any],
                  let excluded = trigger["unless-domain"] as? [String]
            else { return false }
            return excluded.contains("ideatiles.app")
        })
    }

    @Test("main network policy allows canonical API traffic and denies other origins")
    func behavioralSubresourcePolicy() throws {
        #expect(AppContentSecurityPolicy.allowsExternalRequest(try #require(URL(string: "https://ideatiles.app/api/generate"))))
        #expect(AppContentSecurityPolicy.allowsExternalRequest(try #require(URL(string: "wss://ideatiles.app/ws/collab/board"))))
        #expect(!AppContentSecurityPolicy.allowsExternalRequest(try #require(URL(string: "https://example.com/leak"))))
        #expect(!AppContentSecurityPolicy.allowsExternalRequest(try #require(URL(string: "https://api.ideatiles.app/generate"))))
        #expect(!AppContentSecurityPolicy.allowsExternalRequest(try #require(URL(string: "http://ideatiles.app/api/generate"))))
    }
}

@Suite("Native bridge routing")
struct NativeBridgeRouterTests {
    @Test("reports the Task 2 capability surface")
    func capabilities() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(
            repository: repository,
            capabilities: .fullyAvailable,
            exporter: { _ in true }
        )

        let result = try await router.execute(ValidatedRPCRequest(
            id: "rpc:capabilities", method: .getCapabilities, params: [:]
        ))
        let object = try #require(result.objectValue)
        let features = try #require(object["features"]?.objectValue)

        #expect(object["bridgeVersion"] == .number(1))
        #expect(features["artifactPersistence"] == .bool(true))
        #expect(features["staticPreview"] == .bool(true))
        #expect(features["keychain"] == .bool(true))
        #expect(features["imagePlayground"] == .bool(true))
    }

    @Test("returns an owned typed image handoff while preserving the saved artifact")
    func imageAttachmentHandoff() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(
            repository: repository,
            capabilities: .fullyAvailable,
            exporter: { _ in true }
        )
        let request = try ArtifactGenerationRequest(params: [
            "requestId": .string("request:image"),
            "sourceBoardId": .string("board:stable"),
            "sourceNodeIds": .array([.string("0,0")]),
            "includedNodeCount": .number(1),
            "originalNodeCount": .number(1),
            "contextTruncated": .bool(false),
            "recipeId": .string("image-playground-artwork"),
            "scope": .object(["kind": .string("selection"), "nodeIds": .array([.string("0,0")])]),
            "context": .string("A blue tile"),
        ])
        let manifest = try ArtifactManifestFactory().imageManifest(
            request: request,
            data: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        )
        _ = try await repository.saveArtifact(manifest)
        let file = try #require(manifest.files.first)
        let fileValue = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(file))

        let result = try await router.execute(ValidatedRPCRequest(
            id: "rpc:attach", method: .attachImage,
            params: [
                "artifactId": .string(manifest.id),
                "targetNodeId": .string("0,0"),
                "file": fileValue,
            ]
        ))

        #expect(result.objectValue?["artifactId"] == .string(manifest.id))
        #expect(result.objectValue?["targetNodeId"] == .string("0,0"))
        #expect(result.objectValue?["fileId"] == .string(file.id))
        #expect(result.objectValue?["mimeType"] == .string("image/png"))
        #expect(result.objectValue?["dataURL"] == .string("data:image/png;base64,iVBORw0KGgo="))
        #expect(result.objectValue?["checksum"]?.objectValue?["algorithm"] == .string("sha256"))
        #expect(result.objectValue?["checksum"]?.objectValue?["value"] == .string(file.checksum.value))
        #expect(try await repository.loadArtifact(id: manifest.id) == manifest)
    }

    @Test("canonical image attachment decoding rejects untrusted manifest representations")
    func attachmentIntegrity() throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01])
        #expect(try ArtifactImagePayload.decode(file: attachmentFile(data: png)) == png)

        #expect(throws: ArtifactContractError.self) {
            try ArtifactImagePayload.decode(file: attachmentFile(data: png, mimeType: "image/jpeg"))
        }
        #expect(throws: ArtifactContractError.self) {
            try ArtifactImagePayload.decode(file: attachmentFile(data: Data("not png".utf8), encoding: "utf8"))
        }
        #expect(throws: ArtifactContractError.self) {
            try ArtifactImagePayload.decode(file: attachmentFile(data: Data("not png".utf8)))
        }
        #expect(throws: ArtifactContractError.self) {
            var malformed = attachmentFile(data: Data([1]))
            malformed.content = "***not-base64***"
            _ = try ArtifactImagePayload.decode(file: malformed)
        }
        #expect(throws: ArtifactContractError.self) {
            var mismatched = attachmentFile(data: png)
            mismatched.checksum = ArtifactChecksum(algorithm: "sha256", value: String(repeating: "0", count: 64))
            _ = try ArtifactImagePayload.decode(file: mismatched)
        }
        #expect(throws: ArtifactContractError.self) {
            let wrongSize = attachmentFile(data: png, reportedSize: png.count + 1)
            _ = try ArtifactImagePayload.decode(file: wrongSize)
        }
    }

    @Test("returns a typed not-configured generation error")
    func generationBoundary() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(repository: repository, exporter: { _ in true })

        await #expect(throws: NativeRPCError.self) {
            try await router.execute(ValidatedRPCRequest(
                id: "rpc:generate", method: .generateArtifact, params: [:]
            ))
        }
    }

    @Test("maps actionable generation failures without leaking framework context")
    func actionableGenerationErrors() async throws {
        let cases: [(GenerationServiceError, String, Bool)] = [
            (.modelUnavailable(.deviceNotEligible), "modelUnavailable", false),
            (.modelUnavailable(.appleIntelligenceNotEnabled), "modelUnavailable", false),
            (.modelUnavailable(.modelNotReady), "modelUnavailable", true),
            (.contextWindowExceeded, "contextWindowExceeded", false),
            (.safetyRefusal, "modelRefusal", false),
            (.rateLimited, "modelRateLimited", true),
            (.unsupportedLanguage, "unsupportedLanguage", false),
            (.concurrentRequest, "modelBusy", true),
            (.responseTooLarge, "providerResponseTooLarge", false),
        ]
        let request = ValidatedRPCRequest(
            id: "rpc:generation:error",
            method: .generateArtifact,
            params: [
                "requestId": .string("request:error"),
                "sourceBoardId": .string("board:stable"),
                "sourceNodeIds": .array([.string("0,0")]),
                "includedNodeCount": .number(1),
                "originalNodeCount": .number(1),
                "contextTruncated": .bool(false),
                "recipeId": .string("brief"),
                "scope": .object(["kind": .string("board")]),
                "context": .string("private framework debug context"),
            ]
        )

        for (failure, expectedCode, retryable) in cases {
            let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
            let coordinator = ArtifactGenerationCoordinator(engine: FailingArtifactEngine(error: failure))
            let router = NativeBridgeRouter(
                repository: repository,
                generationCoordinator: coordinator,
                exporter: { _ in true }
            )
            do {
                _ = try await router.execute(request)
                Issue.record("Expected \(expectedCode)")
            } catch let error as NativeRPCError {
                #expect(error.code == expectedCode)
                #expect(error.retryable == retryable)
                #expect(!error.message.contains("private framework debug context"))
            }
        }
    }

    @Test("saves and exports validated manifests through native services")
    func saveAndExport() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let exportProbe = ExportProbe()
        let router = NativeBridgeRouter(repository: repository) { manifest in
            await exportProbe.record(manifest.id)
            return true
        }
        let manifest = try ArtifactFixture.manifest(content: "native")
        let manifestValue = try JSONDecoder().decode(JSONValue.self, from: manifest.encoded())
        let params: [String: JSONValue] = ["manifest": manifestValue]

        _ = try await router.execute(ValidatedRPCRequest(id: "rpc:save", method: .saveArtifact, params: params))
        let export = try await router.execute(ValidatedRPCRequest(id: "rpc:export", method: .exportArtifact, params: params))

        #expect(try await repository.loadArtifact(id: manifest.id) == manifest)
        #expect(export.objectValue?["exported"] == .bool(true))
        #expect(await exportProbe.artifactID == manifest.id)
    }

    @Test("routes settings and status-only credential operations")
    func settingsAndCredentials() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let preferences = TestGenerationPreferences()
        let credentials = TestCredentialStore()
        let router = NativeBridgeRouter(
            repository: repository,
            generationPreferences: preferences,
            credentialStore: credentials,
            exporter: { _ in true }
        )
        let settings: JSONValue = .object([
            "provider": .string("ollama"),
            "model": .string("gemma3:4b"),
            "ollamaBaseURL": .string("http://127.0.0.1:11434"),
        ])

        let saved = try await router.execute(ValidatedRPCRequest(
            id: "rpc:settings:set", method: .setGenerationSettings,
            params: ["settings": settings]
        ))
        _ = try await router.execute(ValidatedRPCRequest(
            id: "rpc:credentials:set", method: .setCredential,
            params: ["provider": .string("openai"), "credential": .string("secret-value")]
        ))
        let status = try await router.execute(ValidatedRPCRequest(
            id: "rpc:credentials:status", method: .credentialStatus, params: [:]
        ))
        let statusData = try JSONEncoder().encode(status)

        #expect(saved.objectValue?["provider"] == .string("ollama"))
        #expect(await preferences.load().provider == .ollama)
        #expect(status.objectValue?["configured"]?.objectValue?["openai"] == .bool(true))
        #expect(!String(decoding: statusData, as: UTF8.self).contains("secret-value"))

        let removed = try await router.execute(ValidatedRPCRequest(
            id: "rpc:credentials:remove", method: .removeCredential,
            params: ["provider": .string("openai")]
        ))
        #expect(removed.objectValue?["configured"] == .bool(false))
    }
}

private actor ExportProbe {
    private(set) var artifactID: String?
    func record(_ id: String) { artifactID = id }
}

private actor TestGenerationPreferences: GenerationPreferencesStoring {
    private var settings = GenerationSettings.default
    func load() -> GenerationSettings { settings }
    func save(_ settings: GenerationSettings) { self.settings = settings }
}

private actor TestCredentialStore: CredentialStoring {
    private var values: [GenerationProvider: String] = [:]
    func set(_ value: String, for provider: GenerationProvider) { values[provider] = value }
    func credential(for provider: GenerationProvider) -> String? { values[provider] }
    func containsCredential(for provider: GenerationProvider) -> Bool { values[provider] != nil }
    func removeCredential(for provider: GenerationProvider) { values[provider] = nil }
}

private struct FailingArtifactEngine: ArtifactTextGenerating {
    let error: GenerationServiceError
    func generate(prompt: String) async throws -> GeneratedText { throw error }
}

private func attachmentFile(
    data: Data,
    mimeType: String = "image/png",
    encoding: String = "base64",
    reportedSize: Int? = nil
) -> ArtifactFile {
    let checksum = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return ArtifactFile(
        id: "file:attachment",
        path: "artwork.png",
        mimeType: mimeType,
        sizeBytes: reportedSize ?? data.count,
        checksum: ArtifactChecksum(algorithm: "sha256", value: checksum),
        createdAt: "2026-07-21T17:00:00Z",
        updatedAt: "2026-07-21T17:00:00Z",
        encoding: encoding,
        content: encoding == "base64" ? data.base64EncodedString() : String(decoding: data, as: UTF8.self)
    )
}
