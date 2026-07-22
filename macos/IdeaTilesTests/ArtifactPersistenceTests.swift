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

        #expect(imported.manifest == manifest)
        #expect(imported.boardID == "board:stable")
        #expect(imported.boardPayload == boardPayload)
        #expect(FileManager.default.fileExists(atPath: packageURL.appending(path: "README.html").path))
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
}
