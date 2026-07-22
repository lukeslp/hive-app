import CryptoKit
import Foundation

enum ArtifactContractError: Error, Equatable {
    case invalidManifest
    case invalidIdentifier
    case invalidPath
    case invalidTimestamp
    case invalidContent
}

struct ArtifactChecksum: Codable, Sendable, Equatable {
    let algorithm: String
    var value: String
}

struct ArtifactFile: Codable, Sendable, Equatable {
    let id: String
    let path: String
    let mimeType: String
    let sizeBytes: Int
    var checksum: ArtifactChecksum
    let createdAt: String
    let updatedAt: String
    let encoding: String?
    var content: String?

    static func decode(data: Data) throws -> ArtifactFile {
        guard let raw = try? JSONSerialization.jsonObject(with: data), let object = raw as? [String: Any] else {
            throw ArtifactContractError.invalidManifest
        }
        try ArtifactShapeValidator.validateFile(object)
        do { return try JSONDecoder().decode(ArtifactFile.self, from: data) }
        catch { throw ArtifactContractError.invalidManifest }
    }

    func payloadData() throws -> Data {
        guard let content else { throw ArtifactContractError.invalidContent }
        switch encoding ?? "utf8" {
        case "utf8": return Data(content.utf8)
        case "base64":
            guard let data = Data(base64Encoded: content) else { throw ArtifactContractError.invalidContent }
            return data
        default: throw ArtifactContractError.invalidContent
        }
    }
}

enum ArtifactImagePayload {
    private static let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    static func decode(file: ArtifactFile) throws -> Data {
        guard file.mimeType == "image/png",
              file.encoding == "base64",
              file.checksum.algorithm == "sha256",
              let content = file.content,
              let data = Data(base64Encoded: content, options: []),
              !data.isEmpty,
              data.starts(with: pngSignature),
              data.count == file.sizeBytes
        else { throw ArtifactContractError.invalidContent }
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == file.checksum.value else { throw ArtifactContractError.invalidContent }
        return data
    }
}

struct ArtifactGeneratorDescriptor: Codable, Sendable, Equatable {
    let kind: String
    let name: String
    let model: String?
}

struct ArtifactProvenance: Codable, Sendable, Equatable {
    let sourceBoardId: String
    let sourceNodeIds: [String]
    let recipeId: String
    let generatedAt: String
    let generator: ArtifactGeneratorDescriptor
}

struct ArtifactManifest: Codable, Sendable, Equatable {
    let schemaVersion: Int
    let id: String
    let title: String
    let kind: String
    let recipeId: String
    let scope: JSONValue
    var files: [ArtifactFile]
    let provenance: ArtifactProvenance
    let sync: JSONValue
    let createdAt: String
    let updatedAt: String

    static func decode(data: Data) throws -> ArtifactManifest {
        guard data.count <= RPCRequestValidator.defaultMaximumBytes,
              let raw = try? JSONSerialization.jsonObject(with: data),
              let object = raw as? [String: Any]
        else { throw ArtifactContractError.invalidManifest }
        try ArtifactShapeValidator.validateManifest(object)
        do {
            return try JSONDecoder().decode(ArtifactManifest.self, from: data)
        } catch {
            throw ArtifactContractError.invalidManifest
        }
    }

    func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }

    func validate() throws {
        _ = try Self.decode(data: encoded())
    }

    func withoutInlineContent() -> ArtifactManifest {
        var copy = self
        for index in copy.files.indices { copy.files[index].content = nil }
        return copy
    }

    func hydratingPayloads(_ payloads: [String: Data]) throws -> ArtifactManifest {
        var copy = self
        for index in copy.files.indices {
            guard let data = payloads[copy.files[index].path] else { throw ArtifactPersistenceError.missingContent }
            switch copy.files[index].encoding ?? "utf8" {
            case "utf8":
                guard let value = String(data: data, encoding: .utf8) else { throw ArtifactContractError.invalidContent }
                copy.files[index].content = value
            case "base64": copy.files[index].content = data.base64EncodedString()
            default: throw ArtifactContractError.invalidContent
            }
        }
        return copy
    }
}

enum RelativeArtifactPath {
    static func validate(_ path: String) throws {
        guard !path.isEmpty, path.utf8.count <= 512,
              !path.hasPrefix("/"), !path.contains("\\"),
              !path.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
        else { throw ArtifactContractError.invalidPath }
        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        guard segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            throw ArtifactContractError.invalidPath
        }
    }
}

private enum ArtifactShapeValidator {
    private static let kinds = Set(["markdown", "codeBundle", "mermaid", "svg", "staticWeb", "image"])
    private static let generatorKinds = Set(["onDevice", "directProvider", "dreamer", "imagePlayground"])
    private static let syncStatuses = Set(["localOnly", "pending", "synced", "error"])
    private static let checksumPattern = try! NSRegularExpression(pattern: "^[a-f0-9]{64}$")

    static func validateManifest(_ object: [String: Any]) throws {
        try exactKeys(object, required: [
            "schemaVersion", "id", "title", "kind", "recipeId", "scope", "files",
            "provenance", "sync", "createdAt", "updatedAt",
        ])
        guard safeInteger(object["schemaVersion"], minimum: 1) == 1,
              let id = object["id"] as? String,
              let title = object["title"] as? String, !title.isEmpty, title.count <= 256,
              let kind = object["kind"] as? String, kinds.contains(kind),
              let recipeID = object["recipeId"] as? String,
              validID(id), validID(recipeID),
              let scope = object["scope"] as? [String: Any],
              let files = object["files"] as? [[String: Any]], !files.isEmpty,
              let provenance = object["provenance"] as? [String: Any],
              let sync = object["sync"] as? [String: Any],
              let createdAt = object["createdAt"] as? String,
              let updatedAt = object["updatedAt"] as? String
        else { throw ArtifactContractError.invalidManifest }
        try validateTimestamp(createdAt)
        try validateTimestamp(updatedAt)
        try validateScope(scope)
        try files.forEach(validateFile)
        guard Set(files.compactMap { $0["id"] as? String }).count == files.count,
              Set(files.compactMap { $0["path"] as? String }).count == files.count
        else { throw ArtifactContractError.invalidManifest }
        try validateProvenance(provenance)
        try validateSync(sync)
    }

    static func validateFile(_ file: [String: Any]) throws {
        try exactKeys(file, required: [
            "id", "path", "mimeType", "sizeBytes", "checksum", "createdAt", "updatedAt",
        ], optional: ["encoding", "content"])
        guard let id = file["id"] as? String, validID(id),
              let path = file["path"] as? String,
              let mime = file["mimeType"] as? String, !mime.isEmpty, mime.count <= 128,
              safeInteger(file["sizeBytes"], minimum: 0) != nil,
              let checksum = file["checksum"] as? [String: Any],
              let createdAt = file["createdAt"] as? String,
              let updatedAt = file["updatedAt"] as? String
        else { throw ArtifactContractError.invalidManifest }
        try RelativeArtifactPath.validate(path)
        try validateTimestamp(createdAt)
        try validateTimestamp(updatedAt)
        try exactKeys(checksum, required: ["algorithm", "value"])
        guard checksum["algorithm"] as? String == "sha256",
              let value = checksum["value"] as? String,
              regexMatches(checksumPattern, value)
        else { throw ArtifactContractError.invalidManifest }
        if let encodingValue = file["encoding"] {
            guard let encoding = encodingValue as? String, encoding == "utf8" || encoding == "base64" else {
                throw ArtifactContractError.invalidManifest
            }
        }
        if file["content"] != nil, !(file["content"] is String) { throw ArtifactContractError.invalidManifest }
    }

    private static func validateScope(_ scope: [String: Any]) throws {
        guard let kind = scope["kind"] as? String else { throw ArtifactContractError.invalidManifest }
        switch kind {
        case "board": try exactKeys(scope, required: ["kind"])
        case "branch":
            try exactKeys(scope, required: ["kind", "rootNodeId"])
            guard let id = scope["rootNodeId"] as? String, validID(id) else { throw ArtifactContractError.invalidManifest }
        case "selection":
            try exactKeys(scope, required: ["kind", "nodeIds"])
            guard let ids = scope["nodeIds"] as? [String], !ids.isEmpty, ids.allSatisfy(validID) else {
                throw ArtifactContractError.invalidManifest
            }
        default: throw ArtifactContractError.invalidManifest
        }
    }

    private static func validateProvenance(_ provenance: [String: Any]) throws {
        try exactKeys(provenance, required: ["sourceBoardId", "sourceNodeIds", "recipeId", "generatedAt", "generator"])
        guard let boardID = provenance["sourceBoardId"] as? String, validID(boardID),
              let nodeIDs = provenance["sourceNodeIds"] as? [String], nodeIDs.allSatisfy(validID),
              let recipeID = provenance["recipeId"] as? String, validID(recipeID),
              let generatedAt = provenance["generatedAt"] as? String,
              let generator = provenance["generator"] as? [String: Any]
        else { throw ArtifactContractError.invalidManifest }
        try validateTimestamp(generatedAt)
        try exactKeys(generator, required: ["kind", "name"], optional: ["model"])
        guard let kind = generator["kind"] as? String, generatorKinds.contains(kind),
              let name = generator["name"] as? String, !name.isEmpty, name.count <= 128
        else { throw ArtifactContractError.invalidManifest }
        if let modelValue = generator["model"] {
            guard let model = modelValue as? String, !model.isEmpty, model.count <= 128 else {
                throw ArtifactContractError.invalidManifest
            }
        }
    }

    private static func validateSync(_ sync: [String: Any]) throws {
        try exactKeys(sync, required: ["status", "includeImages", "updatedAt"], optional: ["remoteId", "error"])
        guard let status = sync["status"] as? String, syncStatuses.contains(status),
              sync["includeImages"] is Bool,
              let updatedAt = sync["updatedAt"] as? String
        else { throw ArtifactContractError.invalidManifest }
        try validateTimestamp(updatedAt)
        if let remoteValue = sync["remoteId"] {
            guard let remote = remoteValue as? String, validID(remote) else { throw ArtifactContractError.invalidManifest }
        }
        if let errorValue = sync["error"] {
            guard let error = errorValue as? String, error.count <= 1_000 else { throw ArtifactContractError.invalidManifest }
        }
    }

    private static func exactKeys(_ object: [String: Any], required: Set<String>, optional: Set<String> = []) throws {
        guard required.isSubset(of: object.keys), Set(object.keys).subtracting(required).isSubset(of: optional) else {
            throw ArtifactContractError.invalidManifest
        }
    }

    private static func validID(_ value: String) -> Bool { RPCRequestValidator.isStableID(value) }

    private static func safeInteger(_ value: Any?, minimum: Int) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite,
              number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= Double(minimum),
              number.doubleValue <= 9_007_199_254_740_991
        else { return nil }
        return Int(number.doubleValue)
    }

    private static func validateTimestamp(_ value: String) throws {
        guard ISO8601DateFormatter().date(from: value) != nil else { throw ArtifactContractError.invalidTimestamp }
    }

    private static func regexMatches(_ regex: NSRegularExpression, _ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, range: range)?.range == range
    }
}

enum ArtifactIntegrity {
    static func validate(_ file: ArtifactFile, data: Data) throws {
        guard file.sizeBytes == data.count else { throw ArtifactPersistenceError.sizeMismatch }
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == file.checksum.value else { throw ArtifactPersistenceError.checksumMismatch }
    }
}
