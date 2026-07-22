import AppKit
import Foundation
import UniformTypeIdentifiers

struct NativeBridgeRouter: Sendable {
    typealias Exporter = @Sendable (ArtifactManifest) async throws -> Bool

    let repository: ArtifactRepository
    let exporter: Exporter

    init(repository: ArtifactRepository, exporter: @escaping Exporter) {
        self.repository = repository
        self.exporter = exporter
    }

    func execute(_ request: ValidatedRPCRequest) async throws -> JSONValue {
        switch request.method {
        case .getCapabilities:
            return Self.capabilities
        case .generateArtifact:
            throw NativeRPCError.notConfigured
        case .cancelArtifact:
            return .object(["cancelled": .bool(false)])
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
        }
    }

    static let capabilities: JSONValue = .object([
        "bridgeVersion": .number(1),
        "nativeMac": .bool(true),
        "features": .object([
            "artifactGeneration": .bool(true),
            "artifactPersistence": .bool(true),
            "artifactExport": .bool(true),
            "imagePlayground": .bool(false),
            "keychain": .bool(false),
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

    private func invalidParameters() -> NativeRPCError {
        NativeRPCError(code: "invalidParameters", message: "The request parameters are invalid.", retryable: false)
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
