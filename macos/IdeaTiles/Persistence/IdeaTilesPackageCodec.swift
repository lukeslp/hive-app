import Foundation
import CryptoKit

enum IdeaTilesPackageError: Error, Equatable {
    case invalidExtension
    case invalidPackage
    case unsafePath
    case symbolicLink
    case sizeLimitExceeded
    case checksumMismatch
}

private struct PackageIndex: Codable {
    let schemaVersion: Int
    let boardId: String
    let boardPath: String
    let boardChecksum: String
    let artifactId: String
    let artifactManifestPath: String
}

struct ImportedIdeaTilesPackage: Sendable, Equatable {
    let boardID: String
    let boardPayload: Data
    let manifest: ArtifactManifest
}

struct IdeaTilesPackageCodec: Sendable {
    let maximumTotalBytes: Int
    let maximumEntryBytes: Int

    init(maximumTotalBytes: Int = 100 * 1_024 * 1_024, maximumEntryBytes: Int = 25 * 1_024 * 1_024) {
        self.maximumTotalBytes = maximumTotalBytes
        self.maximumEntryBytes = maximumEntryBytes
    }

    func export(manifest: ArtifactManifest, boardPayload: Data? = nil, to destination: URL) throws {
        guard destination.pathExtension.lowercased() == "ideatiles" else { throw IdeaTilesPackageError.invalidExtension }
        for file in manifest.files {
            let data = try file.payloadData()
            try ArtifactIntegrity.validate(file, data: data)
            guard data.count <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
        }
        let parent = destination.deletingLastPathComponent()
        let staging = parent.appending(path: ".\(destination.lastPathComponent).\(UUID().uuidString).partial", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: staging) } }

        let artifactBase = "artifacts/\(manifest.id)"
        let manifestPath = "\(artifactBase)/manifest.json"
        let boardPath = "boards/\(manifest.provenance.sourceBoardId)/board.json"
        let resolvedBoardPayload = boardPayload ?? Data(#"{"schemaVersion":1,"id":"\#(manifest.provenance.sourceBoardId)"}"#.utf8)
        let index = PackageIndex(
            schemaVersion: 1,
            boardId: manifest.provenance.sourceBoardId,
            boardPath: boardPath,
            boardChecksum: sha256(resolvedBoardPayload),
            artifactId: manifest.id,
            artifactManifestPath: manifestPath
        )
        try write(try JSONEncoder().encode(index), relativePath: "package.json", root: staging)
        try write(resolvedBoardPayload, relativePath: boardPath, root: staging)
        try write(try manifest.encoded(), relativePath: manifestPath, root: staging)
        for file in manifest.files {
            try write(try file.payloadData(), relativePath: "\(artifactBase)/files/\(file.path)", root: staging)
        }
        try write(Data(Self.readme(title: manifest.title).utf8), relativePath: "README.html", root: staging)

        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: staging, to: destination)
        completed = true
    }

    func importPackage(at packageURL: URL) throws -> ArtifactManifest {
        try importContents(at: packageURL).manifest
    }

    func importContents(at packageURL: URL) throws -> ImportedIdeaTilesPackage {
        guard packageURL.pathExtension.lowercased() == "ideatiles" else { throw IdeaTilesPackageError.invalidExtension }
        try validateTree(at: packageURL)
        let indexData = try safeData(relativePath: "package.json", root: packageURL)
        guard let rawIndex = try JSONSerialization.jsonObject(with: indexData) as? [String: Any],
              Set(rawIndex.keys) == ["schemaVersion", "boardId", "boardPath", "boardChecksum", "artifactId", "artifactManifestPath"],
              (rawIndex["schemaVersion"] as? NSNumber)?.intValue == 1
        else { throw IdeaTilesPackageError.invalidPackage }
        let index = try JSONDecoder().decode(PackageIndex.self, from: indexData)
        guard RPCRequestValidator.isStableID(index.boardId), RPCRequestValidator.isStableID(index.artifactId) else {
            throw IdeaTilesPackageError.invalidPackage
        }
        try validatePackagePath(index.boardPath)
        try validatePackagePath(index.artifactManifestPath)
        let expectedBoardPath = "boards/\(index.boardId)/board.json"
        guard index.boardPath == expectedBoardPath,
              index.boardChecksum.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else { throw IdeaTilesPackageError.invalidPackage }
        let boardPayload = try safeData(relativePath: index.boardPath, root: packageURL)
        guard sha256(boardPayload) == index.boardChecksum else { throw IdeaTilesPackageError.checksumMismatch }
        let manifest = try ArtifactManifest.decode(data: safeData(relativePath: index.artifactManifestPath, root: packageURL))
        guard manifest.id == index.artifactId, manifest.provenance.sourceBoardId == index.boardId else {
            throw IdeaTilesPackageError.invalidPackage
        }
        for file in manifest.files {
            let data = try safeData(relativePath: "artifacts/\(manifest.id)/files/\(file.path)", root: packageURL)
            do { try ArtifactIntegrity.validate(file, data: data) }
            catch { throw IdeaTilesPackageError.checksumMismatch }
        }
        return ImportedIdeaTilesPackage(boardID: index.boardId, boardPayload: boardPayload, manifest: manifest)
    }

    private func validateTree(at root: URL) throws {
        let keys: [URLResourceKey] = [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys) else {
            throw IdeaTilesPackageError.invalidPackage
        }
        var total = 0
        for case let url as URL in enumerator {
            let values = try url.resourceValues(forKeys: Set(keys))
            if values.isSymbolicLink == true { throw IdeaTilesPackageError.symbolicLink }
            if values.isRegularFile == true {
                let size = values.fileSize ?? 0
                guard size <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
                total += size
                guard total <= maximumTotalBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
            }
        }
    }

    private func safeData(relativePath: String, root: URL) throws -> Data {
        try validatePackagePath(relativePath)
        let resolvedRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let url = root.appending(path: relativePath).standardizedFileURL.resolvingSymlinksInPath()
        let prefix = resolvedRoot.path.hasSuffix("/") ? resolvedRoot.path : resolvedRoot.path + "/"
        guard url.path.hasPrefix(prefix) else { throw IdeaTilesPackageError.unsafePath }
        let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard values.isSymbolicLink != true, values.isRegularFile == true else { throw IdeaTilesPackageError.symbolicLink }
        guard (values.fileSize ?? 0) <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
        return try Data(contentsOf: url, options: .mappedIfSafe)
    }

    private func write(_ data: Data, relativePath: String, root: URL) throws {
        try RelativeArtifactPath.validate(relativePath)
        let destination = root.appending(path: relativePath)
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: destination, options: [.atomic, .completeFileProtection])
    }

    private func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private func validatePackagePath(_ path: String) throws {
        do { try RelativeArtifactPath.validate(path) }
        catch { throw IdeaTilesPackageError.unsafePath }
    }

    private static func readme(title: String) -> String {
        let escaped = title
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        return "<!doctype html><meta charset=\"utf-8\"><title>Idea Tiles Package</title><h1>\(escaped)</h1><p>This .ideatiles package was created by Idea Tiles.</p>"
    }
}
