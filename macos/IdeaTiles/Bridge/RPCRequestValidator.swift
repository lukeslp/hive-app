import Foundation

enum RPCMethod: String, Sendable, CaseIterable {
    case getCapabilities = "platform.getCapabilities"
    case saveWorkspace = "workspace.saveBoard"
    case generateArtifact = "artifact.generate"
    case cancelArtifact = "artifact.cancel"
    case saveArtifact = "artifact.save"
    case exportArtifact = "artifact.export"
    case attachImage = "artifact.attachImage"
    case getGenerationSettings = "generation.settings.get"
    case setGenerationSettings = "generation.settings.set"
    case credentialStatus = "credentials.status"
    case setCredential = "credentials.set"
    case removeCredential = "credentials.remove"
    case beginAuthentication = "auth.signIn"
    case dreamerStatus = "dreamer.status"
    case dreamerProfile = "dreamer.profile"
    case dreamerRedeem = "dreamer.redeem"
    case dreamerRemove = "dreamer.remove"
    case dreamerRequestAccess = "dreamer.requestAccess"
}

struct ValidatedRPCRequest: Sendable, Equatable {
    let id: String
    let method: RPCMethod
    let params: [String: JSONValue]
}

enum RPCValidationError: Error, Equatable {
    case messageTooLarge
    case invalidJSON
    case invalidShape
    case invalidID
    case unknownMethod
    case invalidParameters
}

struct RPCRequestValidator: Sendable {
    static let defaultMaximumBytes = 17 * 1_024 * 1_024
    static let maximumWorkspaceBytes = 16 * 1_024 * 1_024
    private static let stableID = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._:,-]{0,127}$")
    let maximumBytes: Int

    init(maximumBytes: Int = Self.defaultMaximumBytes) {
        self.maximumBytes = maximumBytes
    }

    func parse(_ data: Data) throws -> ValidatedRPCRequest {
        guard data.count <= maximumBytes else { throw RPCValidationError.messageTooLarge }
        let raw: Any
        do {
            raw = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        } catch {
            throw RPCValidationError.invalidJSON
        }
        guard let object = raw as? [String: Any],
              Set(object.keys) == ["id", "method", "params"],
              let id = object["id"] as? String,
              let methodName = object["method"] as? String,
              let rawParams = object["params"] as? [String: Any]
        else {
            throw RPCValidationError.invalidShape
        }
        guard Self.isStableID(id) else { throw RPCValidationError.invalidID }
        guard let method = RPCMethod(rawValue: methodName) else { throw RPCValidationError.unknownMethod }
        try validateParameters(rawParams, for: method)
        return ValidatedRPCRequest(
            id: id,
            method: method,
            params: try rawParams.mapValues(JSONValue.init(any:))
        )
    }

    static func isStableID(_ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return stableID.firstMatch(in: value, range: range)?.range == range
    }

    private func validateParameters(_ params: [String: Any], for method: RPCMethod) throws {
        switch method {
        case .getCapabilities, .getGenerationSettings, .credentialStatus,
             .dreamerStatus, .dreamerProfile, .dreamerRemove, .dreamerRequestAccess:
            guard params.isEmpty else { throw RPCValidationError.invalidParameters }
        case .dreamerRedeem:
            guard Set(params.keys) == ["inviteCode"],
                  let inviteCode = params["inviteCode"] as? String,
                  inviteCode == inviteCode.trimmingCharacters(in: .whitespacesAndNewlines),
                  inviteCode.utf8.count <= 256,
                  inviteCode.range(of: #"^di_[A-Za-z0-9_-]{7,253}$"#, options: .regularExpression) != nil
            else { throw RPCValidationError.invalidParameters }
        case .saveWorkspace:
            guard Set(params.keys) == ["boardId", "title", "envelope"],
                  let boardID = params["boardId"] as? String,
                  Self.isStableID(boardID),
                  let title = params["title"] as? String,
                  title == title.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty,
                  title.utf8.count <= 255,
                  let envelope = params["envelope"] as? [String: Any]
            else { throw RPCValidationError.invalidParameters }
            try validateWorkspaceEnvelope(envelope, boardID: boardID)
        case .setGenerationSettings:
            guard Set(params.keys) == ["settings"],
                  let settings = params["settings"] as? [String: Any]
            else { throw RPCValidationError.invalidParameters }
            try validateGenerationSettings(settings)
        case .setCredential:
            guard Set(params.keys) == ["provider", "credential"],
                  let providerName = params["provider"] as? String,
                  let provider = GenerationProvider(rawValue: providerName),
                  provider.requiresCredential,
                  provider != .dreamer,
                  let credential = params["credential"] as? String,
                  !credential.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  credential.trimmingCharacters(in: .whitespacesAndNewlines).utf8.count <= 16_384
            else { throw RPCValidationError.invalidParameters }
        case .removeCredential:
            guard Set(params.keys) == ["provider"],
                  let providerName = params["provider"] as? String,
                  let provider = GenerationProvider(rawValue: providerName),
                  provider.requiresCredential,
                  provider != .dreamer
            else { throw RPCValidationError.invalidParameters }
        case .beginAuthentication:
            guard Set(params.keys) == ["loginURL"],
                  let rawURL = params["loginURL"] as? String,
                  rawURL.utf8.count <= 4_096,
                  let url = URL(string: rawURL)
            else { throw RPCValidationError.invalidParameters }
            do { _ = try AuthenticationURLPolicy.validate(url) }
            catch { throw RPCValidationError.invalidParameters }
        case .cancelArtifact:
            guard Set(params.keys) == ["requestId"],
                  let requestID = params["requestId"] as? String,
                  Self.isStableID(requestID)
            else { throw RPCValidationError.invalidParameters }
        case .generateArtifact:
            let required: Set<String> = [
                "requestId", "sourceBoardId", "sourceNodeIds", "includedNodeCount",
                "originalNodeCount", "contextTruncated", "recipeId", "scope", "context",
            ]
            let optional: Set<String> = ["instructions", "capabilities"]
            guard required.isSubset(of: params.keys),
                  Set(params.keys).subtracting(required).isSubset(of: optional),
                  let requestID = params["requestId"] as? String,
                  let boardID = params["sourceBoardId"] as? String,
                  let recipeID = params["recipeId"] as? String,
                  Self.isStableID(requestID), Self.isStableID(boardID), Self.isStableID(recipeID),
                  let nodeIDs = params["sourceNodeIds"] as? [String], !nodeIDs.isEmpty,
                  nodeIDs.allSatisfy(Self.isStableID),
                  let scope = params["scope"] as? [String: Any],
                  let context = params["context"] as? String, !context.isEmpty,
                  let truncated = params["contextTruncated"] as? Bool,
                  let included = positiveInteger(params["includedNodeCount"]),
                  let original = positiveInteger(params["originalNodeCount"]),
                  included == nodeIDs.count, included <= original,
                  truncated || included == original
            else { throw RPCValidationError.invalidParameters }
            try validateScope(scope)
            if let instructions = params["instructions"] as? String, instructions.count > 8_000 {
                throw RPCValidationError.invalidParameters
            }
            if params["instructions"] != nil, !(params["instructions"] is String) {
                throw RPCValidationError.invalidParameters
            }
            if let capabilities = params["capabilities"] as? [String: Any] {
                try validateCapabilities(capabilities)
            } else if params["capabilities"] != nil {
                throw RPCValidationError.invalidParameters
            }
        case .saveArtifact, .exportArtifact:
            guard Set(params.keys) == ["manifest"], let manifest = params["manifest"] as? [String: Any] else {
                throw RPCValidationError.invalidParameters
            }
            do { _ = try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: manifest)) }
            catch { throw RPCValidationError.invalidParameters }
        case .attachImage:
            guard Set(params.keys) == ["artifactId", "targetNodeId", "file"],
                  let artifactID = params["artifactId"] as? String,
                  Self.isStableID(artifactID),
                  let targetNodeID = params["targetNodeId"] as? String,
                  Self.isStableID(targetNodeID),
                  let file = params["file"] as? [String: Any]
            else { throw RPCValidationError.invalidParameters }
            do { _ = try ArtifactFile.decode(data: JSONSerialization.data(withJSONObject: file)) }
            catch { throw RPCValidationError.invalidParameters }
        }
    }

    private func validateWorkspaceEnvelope(
        _ envelope: [String: Any],
        boardID: String
    ) throws {
        guard Set(envelope.keys) == ["format", "envelopeVersion", "workspace"],
              envelope["format"] as? String == "app.ideatiles.workspace-envelope",
              positiveInteger(envelope["envelopeVersion"]) == 1,
              let workspace = envelope["workspace"] as? [String: Any],
              Set(workspace.keys) == [
                "format", "schemaVersion", "id", "activeMode", "graph",
                "projections", "preferences", "metadata",
              ],
              workspace["format"] as? String == "app.ideatiles.workspace",
              positiveInteger(workspace["schemaVersion"]) == 1,
              let workspaceID = workspace["id"] as? String,
              Self.isStableID(workspaceID), workspaceID == boardID,
              let mode = workspace["activeMode"] as? String,
              ["tiles", "sphere"].contains(mode),
              let graph = workspace["graph"] as? [String: Any],
              Set(graph.keys) == ["nodes", "edges"],
              let nodes = graph["nodes"] as? [Any], nodes.count <= 4_096,
              let edges = graph["edges"] as? [Any], edges.count <= 32_768,
              let projections = workspace["projections"] as? [String: Any],
              Set(projections.keys) == ["tiles", "sphere"],
              let preferences = workspace["preferences"] as? [String: Any],
              Set(preferences.keys) == ["creativity"],
              boundedNumber(preferences["creativity"], minimum: 0, maximum: 1) != nil,
              let metadata = workspace["metadata"] as? [String: Any],
              Set(metadata.keys).isSubset(of: ["name", "createdAt", "source"])
        else { throw RPCValidationError.invalidParameters }
        if let name = metadata["name"] {
            guard let value = name as? String,
                  !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  value.utf8.count <= 255
            else { throw RPCValidationError.invalidParameters }
        }
        if let source = metadata["source"] {
            guard let value = source as? String,
                  ["ideaTiles", "brainSphere"].contains(value)
            else { throw RPCValidationError.invalidParameters }
        }
        if let createdAt = metadata["createdAt"], !(createdAt is String) {
            throw RPCValidationError.invalidParameters
        }
        try validateWorkspaceNodes(nodes)
        try validateWorkspaceEdges(edges)
        try validateWorkspaceProjections(projections)
        guard let encoded = try? JSONSerialization.data(withJSONObject: envelope),
              encoded.count <= Self.maximumWorkspaceBytes
        else { throw RPCValidationError.invalidParameters }
    }

    private func validateWorkspaceNodes(_ nodes: [Any]) throws {
        let required: Set<String> = [
            "id", "text", "type", "depth", "parentId", "isKeyTheme",
            "pinned", "artifactAttachments",
        ]
        let optional: Set<String> = [
            "description", "contextInfo", "hierarchyLevel", "wasInteracted",
            "clusterId", "isClusterRoot", "compatibility",
        ]
        let types: Set<String> = [
            "root", "concept", "action", "technical", "question", "risk", "default",
        ]
        for rawNode in nodes {
            guard let node = rawNode as? [String: Any],
                  required.isSubset(of: node.keys),
                  Set(node.keys).subtracting(required).isSubset(of: optional),
                  let id = node["id"] as? String, Self.isStableID(id),
                  let text = node["text"] as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  text.utf8.count <= 512,
                  let type = node["type"] as? String, types.contains(type),
                  boundedInteger(node["depth"], minimum: 0, maximum: 512) != nil,
                  node["isKeyTheme"] is Bool,
                  node["pinned"] is Bool,
                  let attachments = node["artifactAttachments"] as? [Any],
                  attachments.count <= 32
            else { throw RPCValidationError.invalidParameters }
            if !(node["parentId"] is NSNull) {
                guard let parentID = node["parentId"] as? String,
                      Self.isStableID(parentID)
                else { throw RPCValidationError.invalidParameters }
            }
            for key in ["description", "contextInfo"] {
                if let value = node[key], !(value is String) {
                    throw RPCValidationError.invalidParameters
                }
            }
            for attachment in attachments {
                guard let value = attachment as? [String: Any],
                      Set(value.keys) == ["artifactId", "fileId", "mimeType", "checksum"],
                      let artifactID = value["artifactId"] as? String,
                      let fileID = value["fileId"] as? String,
                      Self.isStableID(artifactID), Self.isStableID(fileID),
                      let mimeType = value["mimeType"] as? String,
                      !mimeType.isEmpty, mimeType.utf8.count <= 128,
                      let checksum = value["checksum"] as? [String: Any],
                      Set(checksum.keys) == ["algorithm", "value"],
                      checksum["algorithm"] as? String == "sha256",
                      let checksumValue = checksum["value"] as? String,
                      checksumValue.range(
                        of: "^[a-f0-9]{64}$",
                        options: .regularExpression
                      ) != nil
                else { throw RPCValidationError.invalidParameters }
            }
        }
    }

    private func validateWorkspaceEdges(_ edges: [Any]) throws {
        let kinds: Set<String> = ["hierarchy", "linkedContext", "related", "bridge"]
        for rawEdge in edges {
            guard let edge = rawEdge as? [String: Any],
                  Set(edge.keys) == ["sourceId", "targetId", "kind"],
                  let source = edge["sourceId"] as? String,
                  let target = edge["targetId"] as? String,
                  let kind = edge["kind"] as? String,
                  Self.isStableID(source), Self.isStableID(target), kinds.contains(kind)
            else { throw RPCValidationError.invalidParameters }
        }
    }

    private func validateWorkspaceProjections(_ projections: [String: Any]) throws {
        guard let tiles = projections["tiles"] as? [String: Any],
              Set(tiles.keys) == ["nodes", "viewport"],
              let tileNodes = tiles["nodes"] as? [String: Any],
              tileNodes.count <= 4_096,
              let viewport = tiles["viewport"] as? [String: Any],
              Set(viewport.keys) == ["x", "y", "zoom"],
              boundedNumber(viewport["x"], minimum: -1_000_000, maximum: 1_000_000) != nil,
              boundedNumber(viewport["y"], minimum: -1_000_000, maximum: 1_000_000) != nil,
              boundedNumber(viewport["zoom"], minimum: 0.05, maximum: 20) != nil
        else { throw RPCValidationError.invalidParameters }
        for (id, rawPosition) in tileNodes {
            guard Self.isStableID(id),
                  let position = rawPosition as? [String: Any],
                  Set(position.keys) == ["q", "r"],
                  boundedInteger(position["q"], minimum: -1_000_000, maximum: 1_000_000) != nil,
                  boundedInteger(position["r"], minimum: -1_000_000, maximum: 1_000_000) != nil
            else { throw RPCValidationError.invalidParameters }
        }

        guard let sphere = projections["sphere"] as? [String: Any],
              Set(sphere.keys) == ["nodes", "alignments", "camera", "subdivisions"],
              let sphereNodes = sphere["nodes"] as? [String: Any],
              sphereNodes.count <= 4_096,
              let alignments = sphere["alignments"] as? [Any],
              alignments.count <= 32_768,
              let camera = sphere["camera"] as? [String: Any],
              Set(camera.keys) == ["position", "target", "fov", "zoom"],
              validVector(camera["position"]), validVector(camera["target"]),
              boundedNumber(camera["fov"], minimum: 1, maximum: 179) != nil,
              boundedNumber(camera["zoom"], minimum: 0.05, maximum: 20) != nil,
              boundedInteger(sphere["subdivisions"], minimum: 1, maximum: 32) != nil
        else { throw RPCValidationError.invalidParameters }
        for (id, rawPosition) in sphereNodes {
            guard Self.isStableID(id),
                  let position = rawPosition as? [String: Any],
                  Set(position.keys) == ["tileIndex", "position"],
                  boundedInteger(position["tileIndex"], minimum: 0, maximum: 1_000_000) != nil,
                  validVector(position["position"])
            else { throw RPCValidationError.invalidParameters }
        }
        let categories: Set<String> = [
            "thematic", "causal", "complementary", "contrasting", "dependent",
        ]
        for rawAlignment in alignments {
            guard let alignment = rawAlignment as? [String: Any],
                  Set(alignment.keys) == ["sourceId", "targetId", "score", "reason", "category"],
                  let source = alignment["sourceId"] as? String,
                  let target = alignment["targetId"] as? String,
                  let reason = alignment["reason"] as? String,
                  let category = alignment["category"] as? String,
                  Self.isStableID(source), Self.isStableID(target),
                  !reason.isEmpty, reason.utf8.count <= 1_000,
                  categories.contains(category),
                  boundedNumber(alignment["score"], minimum: 0, maximum: 1) != nil
            else { throw RPCValidationError.invalidParameters }
        }
    }

    private func validVector(_ value: Any?) -> Bool {
        guard let values = value as? [Any], values.count == 3 else { return false }
        return values.allSatisfy {
            boundedNumber($0, minimum: -1_000_000, maximum: 1_000_000) != nil
        }
    }

    private func boundedNumber(_ value: Any?, minimum: Double, maximum: Double) -> Double? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite,
              number.doubleValue >= minimum,
              number.doubleValue <= maximum
        else { return nil }
        return number.doubleValue
    }

    private func boundedInteger(_ value: Any?, minimum: Int, maximum: Int) -> Int? {
        guard let number = boundedNumber(
            value,
            minimum: Double(minimum),
            maximum: Double(maximum)
        ), number.rounded() == number else { return nil }
        return Int(number)
    }

    private func validateScope(_ scope: [String: Any]) throws {
        guard let kind = scope["kind"] as? String else { throw RPCValidationError.invalidParameters }
        switch kind {
        case "board":
            guard Set(scope.keys) == ["kind"] else { throw RPCValidationError.invalidParameters }
        case "branch":
            guard Set(scope.keys) == ["kind", "rootNodeId"],
                  let id = scope["rootNodeId"] as? String, Self.isStableID(id)
            else { throw RPCValidationError.invalidParameters }
        case "selection":
            guard Set(scope.keys) == ["kind", "nodeIds"],
                  let ids = scope["nodeIds"] as? [String], !ids.isEmpty, ids.allSatisfy(Self.isStableID)
            else { throw RPCValidationError.invalidParameters }
        default: throw RPCValidationError.invalidParameters
        }
    }

    private func validateCapabilities(_ capabilities: [String: Any]) throws {
        guard Set(capabilities.keys) == ["bridgeVersion", "nativeMac", "features"],
              positiveInteger(capabilities["bridgeVersion"]) == 1,
              capabilities["nativeMac"] is Bool,
              let features = capabilities["features"] as? [String: Any],
              Set(features.keys) == [
                "artifactGeneration", "artifactPersistence", "artifactExport",
                "imagePlayground", "keychain", "staticPreview",
              ],
              features.values.allSatisfy({ $0 is Bool })
        else { throw RPCValidationError.invalidParameters }
    }

    private func validateGenerationSettings(_ settings: [String: Any]) throws {
        let required: Set<String> = ["provider", "model"]
        let optional: Set<String> = ["ollamaBaseURL"]
        guard required.isSubset(of: settings.keys),
              Set(settings.keys).subtracting(required).isSubset(of: optional),
              let providerName = settings["provider"] as? String,
              let provider = GenerationProvider(rawValue: providerName),
              let model = settings["model"] as? String
        else { throw RPCValidationError.invalidParameters }
        let baseURL: String?
        if let value = settings["ollamaBaseURL"] {
            guard let string = value as? String, string.utf8.count <= 2_048 else {
                throw RPCValidationError.invalidParameters
            }
            baseURL = string
        } else {
            baseURL = nil
        }
        do {
            _ = try GenerationSettings(provider: provider, model: model, ollamaBaseURL: baseURL).validated()
        } catch {
            throw RPCValidationError.invalidParameters
        }
    }

    private func positiveInteger(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue > 0,
              number.doubleValue <= 9_007_199_254_740_991
        else { return nil }
        return Int(number.doubleValue)
    }
}
