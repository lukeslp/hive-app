import Foundation
import SwiftData

@Model
final class BoardMetadataRecord {
    @Attribute(.unique) var id: String
    var title: String
    var payloadRelativePath: String
    var createdAt: Date
    var updatedAt: Date

    init(id: String, title: String, payloadRelativePath: String, now: Date) {
        self.id = id
        self.title = title
        self.payloadRelativePath = payloadRelativePath
        self.createdAt = now
        self.updatedAt = now
    }
}

@Model
final class ArtifactMetadataRecord {
    @Attribute(.unique) var id: String
    var boardID: String
    var title: String
    var kind: String
    var manifestRelativePath: String
    var createdAt: Date
    var updatedAt: Date

    init(id: String, boardID: String, title: String, kind: String, manifestRelativePath: String, now: Date) {
        self.id = id
        self.boardID = boardID
        self.title = title
        self.kind = kind
        self.manifestRelativePath = manifestRelativePath
        self.createdAt = now
        self.updatedAt = now
    }
}

struct BoardSnapshot: Sendable, Equatable {
    let id: String
    let title: String
}

enum ArtifactPersistenceError: Error, Equatable {
    case invalidIdentifier
    case missingArtifact
    case missingContent
    case sizeMismatch
    case checksumMismatch
}

actor ArtifactRepository {
    private let root: URL
    private let container: ModelContainer

    init(root: URL, inMemory: Bool = false) throws {
        self.root = root.standardizedFileURL
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let schema = Schema([BoardMetadataRecord.self, ArtifactMetadataRecord.self])
        let configuration: ModelConfiguration
        if inMemory {
            configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        } else {
            configuration = ModelConfiguration(
                "IdeaTilesMetadata",
                schema: schema,
                url: self.root.appending(path: "Metadata.store")
            )
        }
        container = try ModelContainer(for: schema, configurations: [configuration])
    }

    static func applicationSupport() throws -> ArtifactRepository {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appending(path: "IdeaTiles", directoryHint: .isDirectory)
        return try ArtifactRepository(root: base)
    }

    func saveBoard(id requestedID: String?, title: String, payload: Data) throws -> BoardSnapshot {
        let id = requestedID ?? "board:\(UUID().uuidString.lowercased())"
        guard RPCRequestValidator.isStableID(id) else { throw ArtifactPersistenceError.invalidIdentifier }
        let relativePath = "Boards/\(id)/board.json"
        let url = root.appending(path: relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try payload.write(to: url, options: [.atomic, .completeFileProtection])

        let context = ModelContext(container)
        let matchingID = id
        let descriptor = FetchDescriptor<BoardMetadataRecord>(predicate: #Predicate { $0.id == matchingID })
        let now = Date()
        if let record = try context.fetch(descriptor).first {
            record.title = title
            record.payloadRelativePath = relativePath
            record.updatedAt = now
        } else {
            context.insert(BoardMetadataRecord(id: id, title: title, payloadRelativePath: relativePath, now: now))
        }
        try context.save()
        return BoardSnapshot(id: id, title: title)
    }

    func boardPayload(id: String) throws -> Data {
        let context = ModelContext(container)
        let matchingID = id
        let descriptor = FetchDescriptor<BoardMetadataRecord>(predicate: #Predicate { $0.id == matchingID })
        guard let record = try context.fetch(descriptor).first else { throw ArtifactPersistenceError.missingArtifact }
        return try Data(contentsOf: root.appending(path: record.payloadRelativePath))
    }

    func saveArtifact(_ manifest: ArtifactManifest, payloads suppliedPayloads: [String: Data] = [:]) throws -> ArtifactManifest {
        guard RPCRequestValidator.isStableID(manifest.id), RPCRequestValidator.isStableID(manifest.provenance.sourceBoardId) else {
            throw ArtifactPersistenceError.invalidIdentifier
        }
        let artifactRoot = root.appending(path: "Boards/\(manifest.provenance.sourceBoardId)/Artifacts/\(manifest.id)")
        var payloads: [String: Data] = [:]
        for file in manifest.files {
            try RelativeArtifactPath.validate(file.path)
            let data: Data
            if let supplied = suppliedPayloads[file.path] {
                data = supplied
            } else if file.content != nil {
                data = try file.payloadData()
            } else {
                let existing = artifactRoot.appending(path: "files/\(file.path)")
                guard FileManager.default.fileExists(atPath: existing.path) else { throw ArtifactPersistenceError.missingContent }
                data = try Data(contentsOf: existing)
            }
            try ArtifactIntegrity.validate(file, data: data)
            payloads[file.path] = data
        }

        let artifactsRoot = artifactRoot.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: artifactsRoot, withIntermediateDirectories: true)
        let staging = artifactsRoot.appending(path: ".\(manifest.id).\(UUID().uuidString).staging", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        var stagingCommitted = false
        defer { if !stagingCommitted { try? FileManager.default.removeItem(at: staging) } }
        for file in manifest.files {
            guard let data = payloads[file.path] else { throw ArtifactPersistenceError.missingContent }
            let destination = staging.appending(path: "files/\(file.path)")
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: destination, options: [.atomic, .completeFileProtection])
        }
        let manifestURL = artifactRoot.appending(path: "manifest.json")
        try manifest.withoutInlineContent().encoded().write(
            to: staging.appending(path: "manifest.json"),
            options: [.atomic, .completeFileProtection]
        )

        let context = ModelContext(container)
        let boardID = manifest.provenance.sourceBoardId
        let boardDescriptor = FetchDescriptor<BoardMetadataRecord>(predicate: #Predicate { $0.id == boardID })
        let now = Date()
        if try context.fetch(boardDescriptor).isEmpty {
            let boardRelativePath = "Boards/\(boardID)/board.json"
            let boardURL = root.appending(path: boardRelativePath)
            if !FileManager.default.fileExists(atPath: boardURL.path) {
                try Data(#"{"schemaVersion":1}"#.utf8).write(to: boardURL, options: .atomic)
            }
            context.insert(BoardMetadataRecord(id: boardID, title: "Idea Tiles Board", payloadRelativePath: boardRelativePath, now: now))
        }
        let artifactID = manifest.id
        let artifactDescriptor = FetchDescriptor<ArtifactMetadataRecord>(predicate: #Predicate { $0.id == artifactID })
        let relativeManifest = pathRelativeToRoot(manifestURL)
        if let record = try context.fetch(artifactDescriptor).first {
            record.boardID = boardID
            record.title = manifest.title
            record.kind = manifest.kind
            record.manifestRelativePath = relativeManifest
            record.updatedAt = now
        } else {
            context.insert(ArtifactMetadataRecord(
                id: artifactID, boardID: boardID, title: manifest.title, kind: manifest.kind,
                manifestRelativePath: relativeManifest, now: now
            ))
        }
        let backup = artifactsRoot.appending(path: ".\(manifest.id).\(UUID().uuidString).backup", directoryHint: .isDirectory)
        let hadExisting = FileManager.default.fileExists(atPath: artifactRoot.path)
        var didSwap = false
        do {
            if hadExisting {
                _ = try FileManager.default.replaceItemAt(
                    artifactRoot,
                    withItemAt: staging,
                    backupItemName: backup.lastPathComponent,
                    options: .withoutDeletingBackupItem
                )
            } else {
                try FileManager.default.moveItem(at: staging, to: artifactRoot)
            }
            stagingCommitted = true
            didSwap = true
            try context.save()
        } catch {
            if didSwap {
                try? FileManager.default.removeItem(at: artifactRoot)
                if hadExisting { try? FileManager.default.moveItem(at: backup, to: artifactRoot) }
            }
            throw error
        }
        if hadExisting { try? FileManager.default.removeItem(at: backup) }
        return manifest
    }

    func loadArtifact(id: String) throws -> ArtifactManifest {
        let context = ModelContext(container)
        let matchingID = id
        let descriptor = FetchDescriptor<ArtifactMetadataRecord>(predicate: #Predicate { $0.id == matchingID })
        guard let record = try context.fetch(descriptor).first else { throw ArtifactPersistenceError.missingArtifact }
        let manifest = try ArtifactManifest.decode(data: Data(contentsOf: root.appending(path: record.manifestRelativePath)))
        var payloads: [String: Data] = [:]
        for file in manifest.files {
            let data = try Data(contentsOf: payloadURL(artifactID: id, boardID: record.boardID, path: file.path))
            try ArtifactIntegrity.validate(file, data: data)
            payloads[file.path] = data
        }
        return try manifest.hydratingPayloads(payloads)
    }

    func attachImage(artifactID: String, file: ArtifactFile) throws -> ArtifactManifest {
        var manifest = try loadArtifact(id: artifactID)
        manifest.files.removeAll { $0.id == file.id || $0.path == file.path }
        manifest.files.append(file)
        return try saveArtifact(manifest)
    }

    func payloadURL(artifactID: String, path: String) -> URL {
        let context = ModelContext(container)
        let matchingID = artifactID
        let descriptor = FetchDescriptor<ArtifactMetadataRecord>(predicate: #Predicate { $0.id == matchingID })
        let boardID = (try? context.fetch(descriptor).first?.boardID) ?? "missing"
        return payloadURL(artifactID: artifactID, boardID: boardID, path: path)
    }

    func artifactCount() throws -> Int {
        try ModelContext(container).fetchCount(FetchDescriptor<ArtifactMetadataRecord>())
    }

    func boardCount() throws -> Int {
        try ModelContext(container).fetchCount(FetchDescriptor<BoardMetadataRecord>())
    }

    private func payloadURL(artifactID: String, boardID: String, path: String) -> URL {
        root.appending(path: "Boards/\(boardID)/Artifacts/\(artifactID)/files/\(path)")
    }

    private func pathRelativeToRoot(_ url: URL) -> String {
        String(url.path.dropFirst(root.path.count + 1))
    }
}
