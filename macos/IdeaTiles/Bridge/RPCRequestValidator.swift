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
    static let defaultMaximumBytes = 16_500_000
    static let maximumWorkspaceBytes = 16_000_000
    private static let stableID = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._:,-]{0,127}$")
    let maximumBytes: Int

    init(maximumBytes: Int = Self.defaultMaximumBytes) {
        self.maximumBytes = maximumBytes
    }

    func parse(_ data: Data) throws -> ValidatedRPCRequest {
        guard data.count <= maximumBytes else { throw RPCValidationError.messageTooLarge }
        // RPC adds the request and params containers around a workspace envelope.
        guard Self.hasAcceptableJSONDepth(data, maximumDepth: 66) else {
            throw RPCValidationError.invalidJSON
        }
        let root: JSONValue
        do {
            root = try JSONDecoder().decode(JSONValue.self, from: data)
        } catch {
            throw RPCValidationError.invalidJSON
        }
        guard case .object(let object) = root,
              Set(object.keys) == ["id", "method", "params"],
              case .string(let id)? = object["id"],
              case .string(let methodName)? = object["method"],
              case .object(let params)? = object["params"]
        else {
            throw RPCValidationError.invalidShape
        }
        let rawParams = params.mapValues(Self.foundationValue)
        guard Self.isStableID(id) else { throw RPCValidationError.invalidID }
        guard let method = RPCMethod(rawValue: methodName) else { throw RPCValidationError.unknownMethod }
        try validateParameters(rawParams, for: method)
        return ValidatedRPCRequest(
            id: id,
            method: method,
            params: params
        )
    }

    static func isStableID(_ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return stableID.firstMatch(in: value, range: range)?.range == range
    }

    static func validateWorkspaceEnvelopeData(_ data: Data, expectedBoardID: String) throws {
        guard data.count <= maximumWorkspaceBytes, hasAcceptableJSONDepth(data),
              let root = try? JSONDecoder().decode(JSONValue.self, from: data),
              case .object(let object) = root
        else { throw RPCValidationError.invalidParameters }
        let envelope = object.mapValues(foundationValue)
        try RPCRequestValidator().validateWorkspaceEnvelope(envelope, boardID: expectedBoardID)
    }

    private static func foundationValue(_ value: JSONValue) -> Any {
        switch value {
        case .object(let object): object.mapValues(foundationValue)
        case .array(let array): array.map(foundationValue)
        case .string(let string): string
        case .number(let number): NSNumber(value: number)
        case .bool(let boolean): NSNumber(value: boolean)
        case .null: NSNull()
        }
    }

    private static func hasAcceptableJSONDepth(_ data: Data, maximumDepth: Int = 64) -> Bool {
        var depth = 0
        var inString = false
        var escaped = false
        for byte in data {
            if inString {
                if escaped { escaped = false }
                else if byte == 0x5c { escaped = true }
                else if byte == 0x22 { inString = false }
            } else if byte == 0x22 {
                inString = true
            } else if byte == 0x7b || byte == 0x5b {
                depth += 1
                if depth > maximumDepth { return false }
            } else if byte == 0x7d || byte == 0x5d {
                depth -= 1
                if depth < 0 { return false }
            }
        }
        return depth == 0 && !inString
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
                  inviteCode.utf16.count <= 256,
                  inviteCode.range(of: #"^di_[A-Za-z0-9_-]{7,253}$"#, options: .regularExpression) != nil
            else { throw RPCValidationError.invalidParameters }
        case .saveWorkspace:
            guard Set(params.keys) == ["boardId", "title", "envelope"],
                  let boardID = params["boardId"] as? String,
                  Self.isStableID(boardID),
                  let title = params["title"] as? String,
                  title == title.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty,
                  title.utf16.count <= 255,
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
                  credential.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count <= 16_384
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
                  rawURL.utf16.count <= 4_096,
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
                  let truncated = jsonBoolean(params["contextTruncated"]),
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
                  hasCanonicalStringBoundaries(value),
                  !value.isEmpty,
                  value.utf16.count <= 255
            else { throw RPCValidationError.invalidParameters }
        }
        if let source = metadata["source"] {
            guard let value = source as? String,
                  ["ideaTiles", "brainSphere"].contains(value)
            else { throw RPCValidationError.invalidParameters }
        }
        if let createdAt = metadata["createdAt"] {
            guard let value = createdAt as? String, validISO8601(value)
            else { throw RPCValidationError.invalidParameters }
        }
        let nodeIDs = try validateWorkspaceNodes(nodes)
        try validateWorkspaceEdges(edges, nodeIDs: nodeIDs)
        try validateWorkspaceProjections(projections, nodeIDs: nodeIDs)
        guard let encoded = try? JSONSerialization.data(withJSONObject: envelope),
              encoded.count <= Self.maximumWorkspaceBytes
        else { throw RPCValidationError.invalidParameters }
    }

    private func validateWorkspaceNodes(_ nodes: [Any]) throws -> Set<String> {
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
        var nodeIDs = Set<String>()
        var parentIDs: [(String, String)] = []
        for rawNode in nodes {
            guard let node = rawNode as? [String: Any],
                  required.isSubset(of: node.keys),
                  Set(node.keys).subtracting(required).isSubset(of: optional),
                  let id = node["id"] as? String, Self.isStableID(id),
                  let text = node["text"] as? String,
                  hasCanonicalStringBoundaries(text),
                  !text.isEmpty,
                  text.utf16.count <= 512,
                  let type = node["type"] as? String, types.contains(type),
                  boundedInteger(node["depth"], minimum: 0, maximum: 512) != nil,
                  jsonBoolean(node["isKeyTheme"]) != nil,
                  jsonBoolean(node["pinned"]) != nil,
                  let attachments = node["artifactAttachments"] as? [Any],
                  attachments.count <= 32
            else { throw RPCValidationError.invalidParameters }
            guard nodeIDs.insert(id).inserted else { throw RPCValidationError.invalidParameters }
            if !(node["parentId"] is NSNull) {
                guard let parentID = node["parentId"] as? String,
                      Self.isStableID(parentID), parentID != id
                else { throw RPCValidationError.invalidParameters }
                parentIDs.append((id, parentID))
            }
            for key in ["description", "contextInfo"] {
                if let raw = node[key] {
                    guard let value = raw as? String, value.utf16.count <= 8_000
                    else { throw RPCValidationError.invalidParameters }
                }
            }
            if let hierarchy = node["hierarchyLevel"], boundedInteger(hierarchy, minimum: 1, maximum: 8) == nil {
                throw RPCValidationError.invalidParameters
            }
            for key in ["wasInteracted", "isClusterRoot"] where node[key] != nil && jsonBoolean(node[key]) == nil {
                throw RPCValidationError.invalidParameters
            }
            if let cluster = node["clusterId"] as? String, !Self.isStableID(cluster) {
                throw RPCValidationError.invalidParameters
            } else if node["clusterId"] != nil && !(node["clusterId"] is String) {
                throw RPCValidationError.invalidParameters
            }
            if let compatibility = node["compatibility"] {
                guard let value = compatibility as? [String: Any],
                      Set(value.keys).isSubset(of: ["tiles", "sphere"])
                else { throw RPCValidationError.invalidParameters }
                try validateCompatibility(value)
            }
            for attachment in attachments {
                guard let value = attachment as? [String: Any],
                      Set(value.keys) == ["artifactId", "fileId", "mimeType", "checksum"],
                      let artifactID = value["artifactId"] as? String,
                      let fileID = value["fileId"] as? String,
                      Self.isStableID(artifactID), Self.isStableID(fileID),
                      let mimeType = value["mimeType"] as? String,
                      !mimeType.isEmpty, mimeType.utf16.count <= 128,
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
        guard parentIDs.allSatisfy({ nodeIDs.contains($0.1) }) else {
            throw RPCValidationError.invalidParameters
        }
        return nodeIDs
    }

    private func validateWorkspaceEdges(_ edges: [Any], nodeIDs: Set<String>) throws {
        let kinds: Set<String> = ["hierarchy", "linkedContext", "related", "bridge"]
        var seen = Set<String>()
        for rawEdge in edges {
            guard let edge = rawEdge as? [String: Any],
                  Set(edge.keys) == ["sourceId", "targetId", "kind"],
                  let source = edge["sourceId"] as? String,
                  let target = edge["targetId"] as? String,
                  let kind = edge["kind"] as? String,
                  Self.isStableID(source), Self.isStableID(target), kinds.contains(kind),
                  source != target, nodeIDs.contains(source), nodeIDs.contains(target),
                  seen.insert("\(kind)\u{0}\(source)\u{0}\(target)").inserted
            else { throw RPCValidationError.invalidParameters }
        }
    }

    private func validateWorkspaceProjections(_ projections: [String: Any], nodeIDs: Set<String>) throws {
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
        var tileCoordinates = Set<String>()
        for (id, rawPosition) in tileNodes {
            guard Self.isStableID(id), nodeIDs.contains(id),
                  let position = rawPosition as? [String: Any],
                  Set(position.keys) == ["q", "r"],
                  let q = boundedInteger(position["q"], minimum: -1_000_000, maximum: 1_000_000),
                  let r = boundedInteger(position["r"], minimum: -1_000_000, maximum: 1_000_000),
                  tileCoordinates.insert("\(q),\(r)").inserted
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
        var tileIndices = Set<Int>()
        for (id, rawPosition) in sphereNodes {
            guard Self.isStableID(id), nodeIDs.contains(id),
                  let position = rawPosition as? [String: Any],
                  Set(position.keys) == ["tileIndex", "position"],
                  let tileIndex = boundedInteger(position["tileIndex"], minimum: 0, maximum: 1_000_000),
                  tileIndices.insert(tileIndex).inserted,
                  validVector(position["position"])
            else { throw RPCValidationError.invalidParameters }
        }
        let categories: Set<String> = [
            "thematic", "causal", "complementary", "contrasting", "dependent",
        ]
        var alignmentKeys = Set<String>()
        for rawAlignment in alignments {
            guard let alignment = rawAlignment as? [String: Any],
                  Set(alignment.keys) == ["sourceId", "targetId", "score", "reason", "category"],
                  let source = alignment["sourceId"] as? String,
                  let target = alignment["targetId"] as? String,
                  let reason = alignment["reason"] as? String,
                  let category = alignment["category"] as? String,
                  Self.isStableID(source), Self.isStableID(target),
                  source != target, nodeIDs.contains(source), nodeIDs.contains(target),
                  alignmentKeys.insert("\(source)\u{0}\(target)\u{0}\(category)").inserted,
                  hasCanonicalStringBoundaries(reason),
                  !reason.isEmpty,
                  reason.utf16.count <= 1_000,
                  categories.contains(category),
                  boundedNumber(alignment["score"], minimum: 0, maximum: 1) != nil
            else { throw RPCValidationError.invalidParameters }
        }
        guard nodeIDs.allSatisfy({ tileNodes[$0] != nil || sphereNodes[$0] != nil }) else {
            throw RPCValidationError.invalidParameters
        }
    }

    private func validateCompatibility(_ compatibility: [String: Any]) throws {
        if let rawTiles = compatibility["tiles"] {
            guard let tiles = rawTiles as? [String: Any], Set(tiles.keys).isSubset(of: [
                "clarifyingQuestion", "shouldAskClarifyingQuestion", "clarificationReasoning",
                "userInputCategory", "suggestedAnswers", "codeSnippet", "visualization", "isBridge",
                "bridgeTargetCluster", "imageAttachment",
            ]) else { throw RPCValidationError.invalidParameters }
            for key in ["clarifyingQuestion", "clarificationReasoning"] {
                if let raw = tiles[key] {
                    guard let value = raw as? String, value.utf16.count <= 8_000
                    else { throw RPCValidationError.invalidParameters }
                }
            }
            for key in ["shouldAskClarifyingQuestion", "isBridge"] where tiles[key] != nil && jsonBoolean(tiles[key]) == nil {
                throw RPCValidationError.invalidParameters
            }
            if let answers = tiles["suggestedAnswers"] as? [String] {
                guard answers.count <= 5, answers.allSatisfy({ $0.utf16.count <= 512 })
                else { throw RPCValidationError.invalidParameters }
            } else if tiles["suggestedAnswers"] != nil { throw RPCValidationError.invalidParameters }
            if let category = tiles["userInputCategory"] as? String,
               !["preference", "constraint", "situation", "goal"].contains(category) {
                throw RPCValidationError.invalidParameters
            } else if tiles["userInputCategory"] != nil && !(tiles["userInputCategory"] is String) {
                throw RPCValidationError.invalidParameters
            }
            if let rawTarget = tiles["bridgeTargetCluster"] {
                guard let target = rawTarget as? String, target.utf16.count <= 128
                else { throw RPCValidationError.invalidParameters }
            }
            if let snippet = tiles["codeSnippet"] { try validateCodeSnippet(snippet) }
            if let visualization = tiles["visualization"] { try validateVisualization(visualization) }
            if let attachment = tiles["imageAttachment"] {
                guard let image = attachment as? [String: Any],
                      Set(image.keys) == ["artifactId", "targetNodeId", "fileId", "mimeType", "dataURL", "checksum"],
                      let artifactID = image["artifactId"] as? String, Self.isStableID(artifactID),
                      let fileID = image["fileId"] as? String, Self.isStableID(fileID),
                      let targetNodeID = image["targetNodeId"] as? String,
                      !targetNodeID.isEmpty, targetNodeID.utf16.count <= 128,
                      image["mimeType"] as? String == "image/png",
                      let dataURL = image["dataURL"] as? String,
                      dataURL.utf16.count <= Self.maximumWorkspaceBytes,
                      dataURL.range(of: #"^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$"#, options: .regularExpression) != nil,
                      validChecksum(image["checksum"])
                else { throw RPCValidationError.invalidParameters }
            }
        }
        if let rawSphere = compatibility["sphere"] {
            guard let sphere = rawSphere as? [String: Any],
                  Set(sphere.keys).isSubset(of: ["hasDeepDive", "contextPrompt", "codeSnippet", "visualization"])
            else { throw RPCValidationError.invalidParameters }
            if sphere["hasDeepDive"] != nil && jsonBoolean(sphere["hasDeepDive"]) == nil {
                throw RPCValidationError.invalidParameters
            }
            if let raw = sphere["contextPrompt"] {
                guard let value = raw as? String, value.utf16.count <= 8_000
                else { throw RPCValidationError.invalidParameters }
            }
            if let snippet = sphere["codeSnippet"] { try validateCodeSnippet(snippet) }
            if let visualization = sphere["visualization"] { try validateVisualization(visualization) }
        }
    }

    private func validateCodeSnippet(_ raw: Any) throws {
        guard let snippet = raw as? [String: Any],
              Set(snippet.keys) == ["language", "code"],
              let language = snippet["language"] as? String, language.utf16.count <= 128,
              let code = snippet["code"] as? String, code.utf16.count <= 8_000
        else { throw RPCValidationError.invalidParameters }
    }

    private func validateVisualization(_ raw: Any) throws {
        guard let visualization = raw as? [String: Any],
              Set(visualization.keys).isSubset(of: ["type", "data", "config"]),
              Set(["type", "data"]).isSubset(of: visualization.keys),
              let type = visualization["type"] as? String,
              ["chart", "map", "timeline", "diagram"].contains(type)
        else { throw RPCValidationError.invalidParameters }
    }

    private func validChecksum(_ raw: Any?) -> Bool {
        guard let checksum = raw as? [String: Any],
              Set(checksum.keys) == ["algorithm", "value"],
              checksum["algorithm"] as? String == "sha256",
              let value = checksum["value"] as? String
        else { return false }
        return value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }

    private func validISO8601(_ value: String) -> Bool {
        let pattern = #"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-](\d{2}):(\d{2}))$"#
        guard let expression = try? NSRegularExpression(pattern: pattern),
              let match = expression.firstMatch(
                in: value,
                range: NSRange(value.startIndex..<value.endIndex, in: value)
              )
        else { return false }
        func integer(_ capture: Int) -> Int? {
            let range = match.range(at: capture)
            guard range.location != NSNotFound, let swiftRange = Range(range, in: value)
            else { return nil }
            return Int(value[swiftRange])
        }
        let second = integer(6) ?? 0
        guard let year = integer(1), year >= 0,
              let month = integer(2), (1...12).contains(month),
              let day = integer(3),
              let hour = integer(4), (0...23).contains(hour),
              let minute = integer(5), (0...59).contains(minute),
              (0...59).contains(second)
        else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let firstOfMonth = calendar.date(
            from: DateComponents(year: year, month: month, day: 1)
        ), let days = calendar.range(of: .day, in: .month, for: firstOfMonth),
           days.contains(day)
        else { return false }
        if value.last != "Z" {
            guard let offsetHour = integer(9), (0...23).contains(offsetHour),
                  let offsetMinute = integer(10), (0...59).contains(offsetMinute)
            else { return false }
        }
        return true
    }

    private func hasCanonicalStringBoundaries(_ value: String) -> Bool {
        guard let first = value.unicodeScalars.first,
              let last = value.unicodeScalars.last
        else { return false }
        return !isECMAScriptTrimCharacter(first) && !isECMAScriptTrimCharacter(last)
    }

    private func isECMAScriptTrimCharacter(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x0009...0x000D,
             0x0020, 0x00A0, 0x1680,
             0x2000...0x200A,
             0x2028, 0x2029, 0x202F,
             0x205F, 0x3000, 0xFEFF:
            true
        default:
            false
        }
    }

    private func jsonBoolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID()
        else { return nil }
        return number.boolValue
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
              jsonBoolean(capabilities["nativeMac"]) != nil,
              let features = capabilities["features"] as? [String: Any],
              Set(features.keys) == [
                "artifactGeneration", "artifactPersistence", "artifactExport",
                "imagePlayground", "keychain", "staticPreview",
              ],
              features.values.allSatisfy({ jsonBoolean($0) != nil })
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
            guard let string = value as? String, string.utf16.count <= 2_048 else {
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
