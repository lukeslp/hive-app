import CryptoKit
import Foundation
import Testing
@testable import IdeaTiles

@Suite("SwiftData and file-backed artifact persistence")
struct ArtifactPersistenceTests {
    @Test("stores metadata separately and restores file-backed payloads")
    func savesAndLoadsArtifact() async throws {
        let root = try TestDirectory.make()
        let repository = try ArtifactRepository(root: root, inMemory: true)
        let manifest = try ArtifactFixture.manifest(content: "# Hello")

        let saved = try await repository.saveArtifact(manifest)
        let loaded = try await repository.loadArtifact(id: manifest.id)
        let payloadURL = await repository.payloadURL(artifactID: manifest.id, path: "index.md")

        #expect(saved.id == manifest.id)
        #expect(loaded == manifest)
        #expect(try String(contentsOf: payloadURL, encoding: .utf8) == "# Hello")
        #expect(try await repository.artifactCount() == 1)
        let persistedManifest = root.appending(path: "Boards/board:stable/Artifacts/artifact:1/manifest.json")
        let persistedJSON = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: persistedManifest)) as? [String: Any])
        let persistedFiles = try #require(persistedJSON["files"] as? [[String: Any]])
        #expect(persistedFiles.allSatisfy { $0["content"] == nil })
    }

    @Test("keeps a supplied board ID stable across atomic payload updates")
    func stableBoardIdentity() async throws {
        let root = try TestDirectory.make()
        let repository = try ArtifactRepository(root: root, inMemory: true)

        let first = try await repository.saveBoard(id: "board:stable", title: "Board", payload: Data("one".utf8))
        let second = try await repository.saveBoard(id: first.id, title: "Renamed", payload: Data("two".utf8))

        #expect(first.id == "board:stable")
        #expect(second.id == first.id)
        #expect(try await repository.boardPayload(id: first.id) == Data("two".utf8))
        #expect(try await repository.boardCount() == 1)
    }

    @Test("rejects content whose declared checksum does not match")
    func rejectsChecksumMismatch() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        var manifest = try ArtifactFixture.manifest(content: "real")
        manifest.files[0].checksum.value = String(repeating: "0", count: 64)

        await #expect(throws: ArtifactPersistenceError.self) {
            try await repository.saveArtifact(manifest)
        }
    }

    @Test("a failed multi-file overwrite preserves the complete prior artifact")
    func failedOverwritePreservesPriorArtifact() async throws {
        let root = try TestDirectory.make()
        let repository = try ArtifactRepository(root: root, inMemory: true)
        let original = try ArtifactFixture.manifest(contents: ["one.md": "original one", "two.md": "original two"])
        _ = try await repository.saveArtifact(original)

        var replacement = try ArtifactFixture.manifest(contents: ["one.md": "replacement one", "two.md": "replacement two"])
        replacement.files[1].checksum.value = String(repeating: "0", count: 64)

        await #expect(throws: ArtifactPersistenceError.self) {
            try await repository.saveArtifact(replacement)
        }

        let reloaded = try await repository.loadArtifact(id: original.id)
        #expect(reloaded == original)
        for file in original.files {
            let payloadURL = await repository.payloadURL(artifactID: original.id, path: file.path)
            #expect(try Data(contentsOf: payloadURL) == file.payloadData())
        }
    }

    @Test("reopens metadata from an explicit disk store")
    func reopensDiskStore() async throws {
        let root = try TestDirectory.make()
        let manifest = try ArtifactFixture.manifest(content: "restart")

        do {
            let repository = try ArtifactRepository(root: root)
            _ = try await repository.saveArtifact(manifest)
        }

        #expect(FileManager.default.fileExists(atPath: root.appending(path: "Metadata.store").path))
        let reopened = try ArtifactRepository(root: root)
        #expect(try await reopened.loadArtifact(id: manifest.id) == manifest)
        #expect(try await reopened.artifactCount() == 1)
    }
}

@Suite("Idea Tiles package validation")
struct IdeaTilesPackageTests {
    @Test("round-trips a validated artifact package with README")
    func roundTrip() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Example.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: "# Package")
        let codec = IdeaTilesPackageCodec()

        let boardPayload = Data(#"{"tiles":[{"id":"0,0"}]}"#.utf8)
        try codec.export(manifest: manifest, boardPayload: boardPayload, to: packageURL)
        let imported = try codec.importContents(at: packageURL)

        #expect(imported.manifest == manifest.withoutInlineContent())
        #expect(imported.payloads["index.md"] == Data("# Package".utf8))
        #expect(imported.boardID == "board:stable")
        #expect(imported.boardPayload == boardPayload)
        #expect(FileManager.default.fileExists(atPath: packageURL.appending(path: "README.html").path))
        let persistedManifest = packageURL.appending(path: "artifacts/artifact:1/manifest.json")
        let persistedJSON = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: persistedManifest)) as? [String: Any])
        let persistedFiles = try #require(persistedJSON["files"] as? [[String: Any]])
        #expect(persistedFiles.allSatisfy { $0["content"] == nil })
    }

    @Test(arguments: [InvalidIndexMutation.schemaVersion, .traversalPath])
    func rejectsInvalidSchemaAndPaths(mutation: InvalidIndexMutation) throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Invalid.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: "safe")
        let codec = IdeaTilesPackageCodec()
        try codec.export(manifest: manifest, to: packageURL)
        let indexURL = packageURL.appending(path: "package.json")
        var index = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: indexURL)) as? [String: Any])
        switch mutation {
        case .schemaVersion: index["schemaVersion"] = 2
        case .traversalPath: index["artifactManifestPath"] = "../escape.json"
        }
        try JSONSerialization.data(withJSONObject: index).write(to: indexURL, options: .atomic)

        #expect(throws: IdeaTilesPackageError.self) {
            try codec.importPackage(at: packageURL)
        }
    }

    enum InvalidIndexMutation: Sendable {
        case schemaVersion
        case traversalPath
    }

    @Test("rejects checksum tampering")
    func rejectsTampering() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Tampered.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: "safe")
        let codec = IdeaTilesPackageCodec()
        try codec.export(manifest: manifest, to: packageURL)
        try Data("changed".utf8).write(
            to: packageURL.appending(path: "artifacts/artifact:1/files/index.md"),
            options: .atomic
        )

        #expect(throws: IdeaTilesPackageError.self) {
            try codec.importPackage(at: packageURL)
        }
    }

    @Test("rejects symlinks anywhere in a package")
    func rejectsSymlinks() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Linked.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: "safe")
        let codec = IdeaTilesPackageCodec()
        try codec.export(manifest: manifest, to: packageURL)
        let link = packageURL.appending(path: "link")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: URL(filePath: "/tmp"))

        #expect(throws: IdeaTilesPackageError.self) {
            try codec.importPackage(at: packageURL)
        }
    }

    @Test("rejects packages over configured size limits")
    func rejectsOversizedPackage() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Large.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: String(repeating: "x", count: 1_024))
        try IdeaTilesPackageCodec().export(manifest: manifest, to: packageURL)

        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec(maximumTotalBytes: 128).importPackage(at: packageURL)
        }
    }

    @Test("imports payload files when manifest content is omitted")
    func importsFileBackedPayloads() async throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "FileBacked.ideatiles", directoryHint: .isDirectory)
        let manifest = try ArtifactFixture.manifest(content: "file-backed")
        let payloads = Dictionary(uniqueKeysWithValues: try manifest.files.map { ($0.path, try $0.payloadData()) })
        var fileBacked = manifest
        for index in fileBacked.files.indices { fileBacked.files[index].content = nil }

        try IdeaTilesPackageCodec().export(manifest: fileBacked, payloads: payloads, to: packageURL)
        let imported = try IdeaTilesPackageCodec().importContents(at: packageURL)

        #expect(imported.manifest == fileBacked)
        #expect(imported.payloads == payloads)

        let repository = try ArtifactRepository(root: root.appending(path: "Repository"), inMemory: true)
        _ = try await repository.saveArtifact(imported.manifest, payloads: imported.payloads)
        #expect(try await repository.loadArtifact(id: manifest.id) == manifest)
    }

    @Test("rejects a symbolic-link package root")
    func rejectsSymlinkRoot() throws {
        let root = try TestDirectory.make()
        let realPackage = root.appending(path: "Real.ideatiles", directoryHint: .isDirectory)
        try IdeaTilesPackageCodec().export(manifest: ArtifactFixture.manifest(content: "safe"), to: realPackage)
        let link = root.appending(path: "LinkedRoot.ideatiles")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: realPackage)

        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec().importContents(at: link)
        }
    }

    @Test("rejects packages over the configured entry-count limit")
    func rejectsTooManyEntries() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Many.ideatiles", directoryHint: .isDirectory)
        try IdeaTilesPackageCodec().export(manifest: ArtifactFixture.manifest(content: "safe"), to: packageURL)
        try Data().write(to: packageURL.appending(path: "extra"))

        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec(maximumEntries: 5).importContents(at: packageURL)
        }
    }

    @Test("applies entry and byte budgets while exporting")
    func rejectsOversizedExport() throws {
        let root = try TestDirectory.make()
        let manifest = try ArtifactFixture.manifest(content: "safe")

        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec(maximumEntries: 5).export(
                manifest: manifest,
                to: root.appending(path: "TooMany.ideatiles")
            )
        }
        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec(maximumEntryBytes: 16).export(
                manifest: manifest,
                boardPayload: Data(repeating: 1, count: 17),
                to: root.appending(path: "TooLarge.ideatiles")
            )
        }
        #expect(throws: IdeaTilesPackageError.self) {
            try IdeaTilesPackageCodec(maximumTotalBytes: 32).export(
                manifest: manifest,
                to: root.appending(path: "TooLargeTotal.ideatiles")
            )
        }
    }

    @Test("a failed replacement keeps the previous exported package")
    func failedExportPreservesPreviousPackage() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Existing.ideatiles", directoryHint: .isDirectory)
        let original = try ArtifactFixture.manifest(content: "original")
        try IdeaTilesPackageCodec().export(manifest: original, to: packageURL)

        var invalid = try ArtifactFixture.manifest(content: "replacement")
        invalid.files[0].checksum.value = String(repeating: "0", count: 64)
        #expect(throws: Error.self) {
            try IdeaTilesPackageCodec().export(manifest: invalid, to: packageURL)
        }

        #expect(try IdeaTilesPackageCodec().importPackage(at: packageURL) == original.withoutInlineContent())
    }

    @Test("a filesystem commit failure preserves the previous exported package")
    func commitFailurePreservesPreviousPackage() throws {
        let root = try TestDirectory.make()
        let packageURL = root.appending(path: "Committed.ideatiles", directoryHint: .isDirectory)
        let original = try ArtifactFixture.manifest(content: "original")
        try IdeaTilesPackageCodec().export(manifest: original, to: packageURL)
        let failingCodec = IdeaTilesPackageCodec(directoryCommitter: { _, _ in throw SimulatedCommitError.failed })

        #expect(throws: SimulatedCommitError.self) {
            try failingCodec.export(manifest: ArtifactFixture.manifest(content: "replacement"), to: packageURL)
        }

        #expect(try IdeaTilesPackageCodec().importPackage(at: packageURL) == original.withoutInlineContent())
    }
}

private enum SimulatedCommitError: Error {
    case failed
}

enum ArtifactFixture {
    static func manifest(content: String) throws -> ArtifactManifest {
        let data = Data(content.utf8)
        let checksum = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let raw: [String: Any] = [
            "schemaVersion": 1,
            "id": "artifact:1",
            "title": "Test Artifact",
            "kind": "markdown",
            "recipeId": "recipe:brief",
            "scope": ["kind": "board"],
            "files": [[
                "id": "file:1",
                "path": "index.md",
                "mimeType": "text/markdown",
                "sizeBytes": data.count,
                "checksum": ["algorithm": "sha256", "value": checksum],
                "createdAt": "2026-07-21T17:00:00Z",
                "updatedAt": "2026-07-21T17:00:00Z",
                "encoding": "utf8",
                "content": content,
            ]],
            "provenance": [
                "sourceBoardId": "board:stable",
                "sourceNodeIds": ["0,0"],
                "recipeId": "recipe:brief",
                "generatedAt": "2026-07-21T17:00:00Z",
                "generator": ["kind": "onDevice", "name": "Test Generator"],
            ],
            "sync": [
                "status": "localOnly",
                "includeImages": false,
                "updatedAt": "2026-07-21T17:00:00Z",
            ],
            "createdAt": "2026-07-21T17:00:00Z",
            "updatedAt": "2026-07-21T17:00:00Z",
        ]
        return try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
    }

    static func manifest(contents: [String: String]) throws -> ArtifactManifest {
        let first = try #require(contents.sorted(by: { $0.key < $1.key }).first)
        var manifest = try manifest(content: first.value)
        manifest.files = contents.sorted(by: { $0.key < $1.key }).enumerated().map { index, entry in
            let data = Data(entry.value.utf8)
            return ArtifactFile(
                id: "file:\(index + 1)", path: entry.key, mimeType: "text/markdown", sizeBytes: data.count,
                checksum: ArtifactChecksum(algorithm: "sha256", value: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()),
                createdAt: "2026-07-21T17:00:00Z", updatedAt: "2026-07-21T17:00:00Z", encoding: "utf8", content: entry.value
            )
        }
        return manifest
    }
}
