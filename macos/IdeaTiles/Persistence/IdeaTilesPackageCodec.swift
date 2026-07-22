import CryptoKit
import Foundation

enum IdeaTilesPackageError: Error, Equatable {
    case invalidExtension
    case invalidPackage
    case unsafePath
    case symbolicLink
    case sizeLimitExceeded
    case entryLimitExceeded
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
    let payloads: [String: Data]
}

struct IdeaTilesPackageCodec: Sendable {
    let maximumTotalBytes: Int
    let maximumEntryBytes: Int
    let maximumEntries: Int
    private let directoryCommitter: @Sendable (URL, URL) throws -> Void

    init(
        maximumTotalBytes: Int = 100 * 1_024 * 1_024,
        maximumEntryBytes: Int = 25 * 1_024 * 1_024,
        maximumEntries: Int = 2_048,
        directoryCommitter: @escaping @Sendable (URL, URL) throws -> Void = Self.atomicReplace
    ) {
        self.maximumTotalBytes = maximumTotalBytes
        self.maximumEntryBytes = maximumEntryBytes
        self.maximumEntries = maximumEntries
        self.directoryCommitter = directoryCommitter
    }

    func export(
        manifest: ArtifactManifest,
        boardPayload: Data,
        payloads suppliedPayloads: [String: Data] = [:],
        to destination: URL
    ) throws {
        try manifest.validate()
        guard destination.pathExtension.lowercased() == "ideatiles" else { throw IdeaTilesPackageError.invalidExtension }

        let artifactBase = "artifacts/\(manifest.id)"
        let manifestPath = "\(artifactBase)/manifest.json"
        let boardPath = "boards/\(manifest.provenance.sourceBoardId)/board.json"
        let resolvedBoardPayload = boardPayload
        do {
            try RPCRequestValidator.validateWorkspaceEnvelopeData(
                resolvedBoardPayload,
                expectedBoardID: manifest.provenance.sourceBoardId
            )
        } catch {
            throw IdeaTilesPackageError.invalidPackage
        }
        let persistedManifest = manifest.withoutInlineContent()
        let index = PackageIndex(
            schemaVersion: 1,
            boardId: manifest.provenance.sourceBoardId,
            boardPath: boardPath,
            boardChecksum: sha256(resolvedBoardPayload),
            artifactId: manifest.id,
            artifactManifestPath: manifestPath
        )
        let entries = try packageEntries(
            manifest: manifest,
            persistedManifest: persistedManifest,
            index: index,
            boardPayload: resolvedBoardPayload,
            suppliedPayloads: suppliedPayloads
        )
        try validateEntryBudget(entries)

        let parent = destination.deletingLastPathComponent()
        let staging = parent.appending(path: ".\(destination.lastPathComponent).\(UUID().uuidString).partial", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: staging) } }
        for (path, data) in entries { try write(data, relativePath: path, root: staging) }

        try directoryCommitter(staging, destination)
        completed = true
    }

    func importPackage(at packageURL: URL) throws -> ArtifactManifest {
        try importContents(at: packageURL).manifest
    }

    func importContents(at packageURL: URL) throws -> ImportedIdeaTilesPackage {
        guard packageURL.pathExtension.lowercased() == "ideatiles" else { throw IdeaTilesPackageError.invalidExtension }
        try validateTree(at: packageURL)
        var totalRead = 0
        let indexData = try safeData(relativePath: "package.json", root: packageURL, totalRead: &totalRead)
        guard let rawIndex = try JSONSerialization.jsonObject(with: indexData) as? [String: Any],
              Set(rawIndex.keys) == ["schemaVersion", "boardId", "boardPath", "boardChecksum", "artifactId", "artifactManifestPath"],
              let version = rawIndex["schemaVersion"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1
        else { throw IdeaTilesPackageError.invalidPackage }
        let index = try JSONDecoder().decode(PackageIndex.self, from: indexData)
        guard RPCRequestValidator.isStableID(index.boardId), RPCRequestValidator.isStableID(index.artifactId) else {
            throw IdeaTilesPackageError.invalidPackage
        }
        try validatePackagePath(index.boardPath)
        try validatePackagePath(index.artifactManifestPath)
        guard index.boardPath == "boards/\(index.boardId)/board.json",
              index.artifactManifestPath == "artifacts/\(index.artifactId)/manifest.json",
              index.boardChecksum.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else { throw IdeaTilesPackageError.invalidPackage }

        let boardPayload = try safeData(relativePath: index.boardPath, root: packageURL, totalRead: &totalRead)
        guard sha256(boardPayload) == index.boardChecksum else { throw IdeaTilesPackageError.checksumMismatch }
        do {
            try RPCRequestValidator.validateWorkspaceEnvelopeData(boardPayload, expectedBoardID: index.boardId)
        } catch {
            throw IdeaTilesPackageError.invalidPackage
        }
        let manifest = try ArtifactManifest.decode(
            data: safeData(relativePath: index.artifactManifestPath, root: packageURL, totalRead: &totalRead)
        )
        guard manifest == manifest.withoutInlineContent(),
              manifest.id == index.artifactId,
              manifest.provenance.sourceBoardId == index.boardId
        else { throw IdeaTilesPackageError.invalidPackage }
        var payloads: [String: Data] = [:]
        for file in manifest.files {
            let data = try safeData(
                relativePath: "artifacts/\(manifest.id)/files/\(file.path)",
                root: packageURL,
                totalRead: &totalRead
            )
            do { try ArtifactIntegrity.validate(file, data: data) }
            catch { throw IdeaTilesPackageError.checksumMismatch }
            payloads[file.path] = data
        }
        return ImportedIdeaTilesPackage(boardID: index.boardId, boardPayload: boardPayload, manifest: manifest, payloads: payloads)
    }

    private func packageEntries(
        manifest: ArtifactManifest,
        persistedManifest: ArtifactManifest,
        index: PackageIndex,
        boardPayload: Data,
        suppliedPayloads: [String: Data]
    ) throws -> [String: Data] {
        var entries: [String: Data] = [
            "package.json": try JSONEncoder().encode(index),
            index.boardPath: boardPayload,
            index.artifactManifestPath: try persistedManifest.encoded(),
            "README.html": Data(Self.readme(title: manifest.title).utf8),
        ]
        for file in manifest.files {
            let data: Data
            if let supplied = suppliedPayloads[file.path] { data = supplied }
            else { data = try file.payloadData() }
            try ArtifactIntegrity.validate(file, data: data)
            entries["artifacts/\(manifest.id)/files/\(file.path)"] = data
        }
        return entries
    }

    private func validateTree(at root: URL) throws {
        let rootValues = try root.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
        guard rootValues.isSymbolicLink != true, rootValues.isDirectory == true else {
            throw rootValues.isSymbolicLink == true ? IdeaTilesPackageError.symbolicLink : .invalidPackage
        }
        let keys: Set<URLResourceKey> = [.isSymbolicLinkKey, .isRegularFileKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: Array(keys)) else {
            throw IdeaTilesPackageError.invalidPackage
        }
        var entryCount = 0
        var total = 0
        for case let url as URL in enumerator {
            entryCount += 1
            guard entryCount <= maximumEntries else { throw IdeaTilesPackageError.entryLimitExceeded }
            let values = try url.resourceValues(forKeys: keys)
            if values.isSymbolicLink == true { throw IdeaTilesPackageError.symbolicLink }
            if values.isRegularFile == true {
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                guard data.count <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
                total = try checkedTotal(total, adding: data.count)
            }
        }
    }

    private func safeData(relativePath: String, root: URL, totalRead: inout Int) throws -> Data {
        try validatePackagePath(relativePath)
        let resolvedRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let url = root.appending(path: relativePath).standardizedFileURL
        let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
        guard values.isSymbolicLink != true else { throw IdeaTilesPackageError.symbolicLink }
        let resolvedURL = url.resolvingSymlinksInPath()
        let prefix = resolvedRoot.path.hasSuffix("/") ? resolvedRoot.path : resolvedRoot.path + "/"
        guard resolvedURL.path.hasPrefix(prefix) else { throw IdeaTilesPackageError.unsafePath }
        guard values.isRegularFile == true else { throw IdeaTilesPackageError.invalidPackage }
        let data = try Data(contentsOf: resolvedURL, options: .mappedIfSafe)
        guard data.count <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
        totalRead = try checkedTotal(totalRead, adding: data.count)
        return data
    }

    private func validateEntryBudget(_ entries: [String: Data]) throws {
        var directories: Set<String> = []
        for path in entries.keys {
            var parent = (path as NSString).deletingLastPathComponent
            while !parent.isEmpty {
                directories.insert(parent)
                parent = (parent as NSString).deletingLastPathComponent
            }
        }
        guard entries.count + directories.count <= maximumEntries else { throw IdeaTilesPackageError.entryLimitExceeded }
        var total = 0
        for data in entries.values {
            guard data.count <= maximumEntryBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
            total = try checkedTotal(total, adding: data.count)
        }
    }

    private func checkedTotal(_ current: Int, adding count: Int) throws -> Int {
        let (total, overflow) = current.addingReportingOverflow(count)
        guard !overflow, total <= maximumTotalBytes else { throw IdeaTilesPackageError.sizeLimitExceeded }
        return total
    }

    private func write(_ data: Data, relativePath: String, root: URL) throws {
        try validatePackagePath(relativePath)
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

    private static func atomicReplace(_ staging: URL, _ destination: URL) throws {
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: destination.path) else {
            try fileManager.moveItem(at: staging, to: destination)
            return
        }
        let backupName = ".\(destination.lastPathComponent).\(UUID().uuidString).backup"
        _ = try fileManager.replaceItemAt(
            destination,
            withItemAt: staging,
            backupItemName: backupName,
            options: .withoutDeletingBackupItem
        )
        try? fileManager.removeItem(at: destination.deletingLastPathComponent().appending(path: backupName))
    }

    private static func readme(title: String) -> String {
        let escaped = title
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        return "<!doctype html><meta charset=\"utf-8\"><title>Idea Tiles Package</title><h1>\(escaped)</h1><p>This .ideatiles package was created by Idea Tiles.</p>"
    }
}
