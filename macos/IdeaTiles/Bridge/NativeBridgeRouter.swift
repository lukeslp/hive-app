import AppKit
import Foundation
import UniformTypeIdentifiers

struct NativeBridgeRouter: Sendable {
    typealias Exporter = @Sendable (ArtifactManifest) async throws -> Bool
    typealias Authenticator = @Sendable (URL) async throws -> Bool
    typealias URLOpener = @Sendable (URL) async -> Bool

    let repository: ArtifactRepository
    let generationCoordinator: ArtifactGenerationCoordinator?
    let generationPreferences: (any GenerationPreferencesStoring)?
    let credentialStore: (any CredentialStoring)?
    let capabilities: MacRuntimeCapabilities
    let exporter: Exporter
    let authenticator: Authenticator?
    let dreamer: (any DreamerAccessProviding)?
    let urlOpener: URLOpener?

    init(
        repository: ArtifactRepository,
        generationCoordinator: ArtifactGenerationCoordinator? = nil,
        generationPreferences: (any GenerationPreferencesStoring)? = nil,
        credentialStore: (any CredentialStoring)? = nil,
        capabilities: MacRuntimeCapabilities = .configured(
            artifactGeneration: false,
            imagePlayground: false,
            keychain: false
        ),
        authenticator: Authenticator? = nil,
        dreamer: (any DreamerAccessProviding)? = nil,
        urlOpener: URLOpener? = nil,
        exporter: @escaping Exporter
    ) {
        self.repository = repository
        self.generationCoordinator = generationCoordinator
        self.generationPreferences = generationPreferences
        self.credentialStore = credentialStore
        self.capabilities = capabilities
        self.authenticator = authenticator
        self.dreamer = dreamer
        self.urlOpener = urlOpener
        self.exporter = exporter
    }

    func execute(_ request: ValidatedRPCRequest) async throws -> JSONValue {
        switch request.method {
        case .getCapabilities:
            return capabilities.jsonValue
        case .saveWorkspace:
            guard let boardID = request.params["boardId"]?.stringValue,
                  let title = request.params["title"]?.stringValue,
                  let envelope = request.params["envelope"]
            else { throw invalidParameters() }
            let payload = try JSONEncoder().encode(envelope)
            guard payload.count <= RPCRequestValidator.maximumWorkspaceBytes
            else { throw invalidParameters() }
            let saved = try await repository.saveBoard(
                id: boardID,
                title: title,
                payload: payload
            )
            return .object([
                "boardId": .string(saved.id),
                "saved": .bool(true),
            ])
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
                  let targetNodeID = request.params["targetNodeId"]?.stringValue,
                  let fileValue = request.params["file"]
            else { throw invalidParameters() }
            let fileData = try JSONEncoder().encode(fileValue)
            let file = try ArtifactFile.decode(data: fileData)
            let saved = try await repository.loadArtifact(id: artifactID)
            guard let persisted = saved.files.first(where: { $0.id == file.id && $0.path == file.path })
            else { throw invalidParameters() }
            let payload: Data
            do { payload = try ArtifactImagePayload.decode(file: persisted) }
            catch { throw invalidParameters() }
            return .object([
                "artifactId": .string(artifactID),
                "targetNodeId": .string(targetNodeID),
                "fileId": .string(persisted.id),
                "mimeType": .string(persisted.mimeType),
                "dataURL": .string("data:\(persisted.mimeType);base64,\(payload.base64EncodedString())"),
                "checksum": .object([
                    "algorithm": .string(persisted.checksum.algorithm),
                    "value": .string(persisted.checksum.value),
                ]),
            ])
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
        case .beginAuthentication:
            guard let authenticator,
                  let rawURL = request.params["loginURL"]?.stringValue,
                  let url = URL(string: rawURL)
            else { throw NativeRPCError.notConfigured }
            do {
                return .object(["authenticated": .bool(try await authenticator(url))])
            } catch let error as AuthenticationError {
                switch error {
                case .invalidLoginURL:
                    throw invalidParameters()
                case .alreadyPresenting:
                    throw NativeRPCError(code: "authInProgress", message: "A sign-in window is already open.", retryable: true)
                case .navigationFailed:
                    throw NativeRPCError(code: "authFailed", message: "The sign-in page could not be loaded.", retryable: true)
                }
            }
        case .dreamerStatus:
            guard let dreamer else { throw NativeRPCError.notConfigured }
            do { return try jsonValue(try await dreamer.status(refreshProfile: true)) }
            catch let error as DreamerAccessError { throw dreamerError(error) }
        case .dreamerProfile:
            guard let dreamer else { throw NativeRPCError.notConfigured }
            do { return try jsonValue(try await dreamer.profile()) }
            catch let error as DreamerAccessError { throw dreamerError(error) }
        case .dreamerRedeem:
            guard let dreamer,
                  let inviteCode = request.params["inviteCode"]?.stringValue
            else { throw NativeRPCError.notConfigured }
            do {
                let profile = try await dreamer.redeem(inviteCode: inviteCode)
                return .object(["configured": .bool(true), "profile": try jsonValue(profile)])
            } catch let error as DreamerAccessError { throw dreamerError(error) }
        case .dreamerRemove:
            guard let dreamer else { throw NativeRPCError.notConfigured }
            do {
                try await dreamer.remove()
                return .object(["configured": .bool(false)])
            } catch let error as DreamerAccessError { throw dreamerError(error) }
            catch { throw credentialError() }
        case .dreamerRequestAccess:
            guard let urlOpener else { throw NativeRPCError.notConfigured }
            return .object(["opened": .bool(await urlOpener(DreamerEndpoints.requestAccess))])
        }
    }

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
              provider.requiresCredential,
              provider != .dreamer
        else { throw invalidParameters() }
        if requiresValue {
            guard let rawCredential = params["credential"]?.stringValue else {
                throw invalidParameters()
            }
            let credential = rawCredential.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !credential.isEmpty, credential.utf8.count <= 16_384
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
        case .modelUnavailable(let reason):
            NativeRPCError(
                code: "modelUnavailable",
                message: error.localizedDescription,
                retryable: reason == .modelNotReady
            )
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
        case .responseTooLarge:
            NativeRPCError(code: "providerResponseTooLarge", message: error.localizedDescription, retryable: false)
        case .contextWindowExceeded:
            NativeRPCError(code: "contextWindowExceeded", message: error.localizedDescription, retryable: false)
        case .safetyRefusal:
            NativeRPCError(code: "modelRefusal", message: error.localizedDescription, retryable: false)
        case .rateLimited:
            NativeRPCError(code: "modelRateLimited", message: error.localizedDescription, retryable: true)
        case .unsupportedLanguage:
            NativeRPCError(code: "unsupportedLanguage", message: error.localizedDescription, retryable: false)
        case .concurrentRequest:
            NativeRPCError(code: "modelBusy", message: error.localizedDescription, retryable: true)
        case .dreamer(let failure):
            dreamerError(.failure(failure))
        }
    }

    private func dreamerError(_ error: DreamerAccessError) -> NativeRPCError {
        guard case .failure(let failure) = error else {
            return NativeRPCError(code: "dreamerError", message: "Dreamer access failed.", retryable: false)
        }
        let retryable: Bool
        switch failure {
        case .offline, .timeout, .serverUnavailable, .throttled: retryable = true
        default: retryable = false
        }
        return NativeRPCError(code: "dreamer.\(failure.rawValue)", message: error.localizedDescription, retryable: retryable)
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
