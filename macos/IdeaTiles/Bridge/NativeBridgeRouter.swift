import AppKit
import Foundation
import UniformTypeIdentifiers

struct NativeBridgeRouter: Sendable {
    typealias Exporter = @Sendable (ArtifactManifest) async throws -> Bool

    let repository: ArtifactRepository
    let generationCoordinator: ArtifactGenerationCoordinator?
    let generationPreferences: (any GenerationPreferencesStoring)?
    let credentialStore: (any CredentialStoring)?
    let exporter: Exporter

    init(
        repository: ArtifactRepository,
        generationCoordinator: ArtifactGenerationCoordinator? = nil,
        generationPreferences: (any GenerationPreferencesStoring)? = nil,
        credentialStore: (any CredentialStoring)? = nil,
        exporter: @escaping Exporter
    ) {
        self.repository = repository
        self.generationCoordinator = generationCoordinator
        self.generationPreferences = generationPreferences
        self.credentialStore = credentialStore
        self.exporter = exporter
    }

    func execute(_ request: ValidatedRPCRequest) async throws -> JSONValue {
        switch request.method {
        case .getCapabilities:
            return Self.capabilities
        case .generateArtifact:
            guard let generationCoordinator else { throw NativeRPCError.notConfigured }
            do {
                let generated = try await generationCoordinator.generate(ArtifactGenerationRequest(params: request.params))
                return try jsonValue(generated)
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as GenerationServiceError {
                throw generationError(error)
            } catch let error as ImagePlaygroundServiceError {
                throw imageError(error)
            }
        case .cancelArtifact:
            guard let requestID = request.params["requestId"]?.stringValue else { throw invalidParameters() }
            return .object(["cancelled": .bool(await generationCoordinator?.cancel(requestID: requestID) ?? false)])
        case .saveArtifact:
            let manifest = try manifest(from: request.params)
            let saved = try await repository.saveArtifact(manifest)
            return try jsonValue(saved)
        case .exportArtifact:
            let manifest = try manifest(from: request.params)
            _ = try await repository.saveArtifact(manifest)
            return .object(["exported": .bool(try await exporter(manifest))])
        case .attachImage:
            guard let artifactID = request.params["artifactId"]?.stringValue,
                  let fileValue = request.params["file"]
            else { throw invalidParameters() }
            let fileData = try JSONEncoder().encode(fileValue)
            let file = try ArtifactFile.decode(data: fileData)
            let saved = try await repository.attachImage(artifactID: artifactID, file: file)
            return try jsonValue(saved)
        case .getGenerationSettings:
            guard let generationPreferences else { throw NativeRPCError.notConfigured }
            return try jsonValue(await generationPreferences.load())
        case .setGenerationSettings:
            guard let generationPreferences else { throw NativeRPCError.notConfigured }
            let settings = try generationSettings(from: request.params)
            do {
                let validated = try settings.validated()
                try await generationPreferences.save(validated)
                return try jsonValue(validated)
            } catch {
                throw invalidParameters()
            }
        case .credentialStatus:
            guard let credentialStore else { throw NativeRPCError.notConfigured }
            do {
                let statuses = try await CredentialStatusService(store: credentialStore).statuses()
                return .object([
                    "configured": .object([
                        "gemini": .bool(statuses[.gemini] ?? false),
                        "anthropic": .bool(statuses[.anthropic] ?? false),
                        "openai": .bool(statuses[.openAI] ?? false),
                        "xai": .bool(statuses[.xAI] ?? false),
                        "mistral": .bool(statuses[.mistral] ?? false),
                    ]),
                ])
            } catch {
                throw credentialError()
            }
        case .setCredential:
            guard let credentialStore else { throw NativeRPCError.notConfigured }
            let (provider, credential) = try credentialMutation(from: request.params, requiresValue: true)
            guard let credential else { throw invalidParameters() }
            do {
                try await credentialStore.set(credential, for: provider)
                return .object(["provider": .string(provider.rawValue), "configured": .bool(true)])
            } catch {
                throw credentialError()
            }
        case .removeCredential:
            guard let credentialStore else { throw NativeRPCError.notConfigured }
            let (provider, _) = try credentialMutation(from: request.params, requiresValue: false)
            do {
                try await credentialStore.removeCredential(for: provider)
                return .object(["provider": .string(provider.rawValue), "configured": .bool(false)])
            } catch {
                throw credentialError()
            }
        }
    }

    static let capabilities: JSONValue = .object([
        "bridgeVersion": .number(1),
        "nativeMac": .bool(true),
        "features": .object([
            "artifactGeneration": .bool(true),
            "artifactPersistence": .bool(true),
            "artifactExport": .bool(true),
            "imagePlayground": .bool(true),
            "keychain": .bool(true),
            "staticPreview": .bool(true),
        ]),
    ])

    private func manifest(from params: [String: JSONValue]) throws -> ArtifactManifest {
        guard let value = params["manifest"] else { throw invalidParameters() }
        do { return try ArtifactManifest.decode(data: JSONEncoder().encode(value)) }
        catch { throw invalidParameters() }
    }

    private func jsonValue(_ manifest: ArtifactManifest) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: manifest.encoded())
    }

    private func jsonValue<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    private func generationSettings(from params: [String: JSONValue]) throws -> GenerationSettings {
        guard let value = params["settings"] else { throw invalidParameters() }
        do { return try JSONDecoder().decode(GenerationSettings.self, from: JSONEncoder().encode(value)) }
        catch { throw invalidParameters() }
    }

    private func credentialMutation(
        from params: [String: JSONValue],
        requiresValue: Bool
    ) throws -> (GenerationProvider, String?) {
        guard let providerName = params["provider"]?.stringValue,
              let provider = GenerationProvider(rawValue: providerName),
              provider.requiresCredential
        else { throw invalidParameters() }
        if requiresValue {
            guard let credential = params["credential"]?.stringValue,
                  !credential.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  credential.utf8.count <= 16_384
            else { throw invalidParameters() }
            return (provider, credential)
        }
        return (provider, nil)
    }

    private func invalidParameters() -> NativeRPCError {
        NativeRPCError(code: "invalidParameters", message: "The request parameters are invalid.", retryable: false)
    }

    private func credentialError() -> NativeRPCError {
        NativeRPCError(
            code: "credentialStoreError",
            message: "The provider credential could not be updated.",
            retryable: true
        )
    }

    private func generationError(_ error: GenerationServiceError) -> NativeRPCError {
        switch error {
        case .modelUnavailable:
            NativeRPCError(code: "modelUnavailable", message: error.localizedDescription, retryable: true)
        case .missingCredential:
            NativeRPCError(code: "missingCredential", message: error.localizedDescription, retryable: false)
        case .timeout:
            NativeRPCError(code: "modelTimeout", message: error.localizedDescription, retryable: true)
        case .providerFailure:
            NativeRPCError(code: "providerError", message: error.localizedDescription, retryable: true)
        case .invalidConfiguration:
            NativeRPCError(code: "invalidConfiguration", message: error.localizedDescription, retryable: false)
        case .invalidResponse:
            NativeRPCError(code: "invalidProviderResponse", message: error.localizedDescription, retryable: true)
        }
    }

    private func imageError(_ error: ImagePlaygroundServiceError) -> NativeRPCError {
        switch error {
        case .unavailable:
            NativeRPCError(code: "imagePlaygroundUnavailable", message: error.localizedDescription, retryable: true)
        case .cancelled:
            NativeRPCError(code: "cancelled", message: error.localizedDescription, retryable: true)
        case .presentationUnavailable:
            NativeRPCError(code: "imagePlaygroundPresentation", message: error.localizedDescription, retryable: true)
        case .invalidImage:
            NativeRPCError(code: "invalidImage", message: error.localizedDescription, retryable: false)
        }
    }
}

@MainActor
enum FilePanelService {
    static let packageType = UTType(exportedAs: "app.ideatiles.package", conformingTo: .package)

    static func export(_ manifest: ArtifactManifest, boardPayload: Data? = nil) async throws -> Bool {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [packageType]
        panel.nameFieldStringValue = sanitizedFilename(manifest.title) + ".ideatiles"
        panel.canCreateDirectories = true
        guard await panel.begin() == .OK, var url = panel.url else { return false }
        if url.pathExtension.lowercased() != "ideatiles" { url.appendPathExtension("ideatiles") }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        try IdeaTilesPackageCodec().export(manifest: manifest, boardPayload: boardPayload, to: url)
        return true
    }

    static func openPackage() async throws -> ImportedIdeaTilesPackage? {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [packageType]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        guard await panel.begin() == .OK, let url = panel.url else { return nil }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        return try IdeaTilesPackageCodec().importContents(at: url)
    }

    private static func sanitizedFilename(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/:\\").union(.controlCharacters)
        let cleaned = value.components(separatedBy: invalid).joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "Idea Tiles Artifact" : String(cleaned.prefix(120))
    }
}
