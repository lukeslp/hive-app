import Foundation

enum RPCMethod: String, Sendable, CaseIterable {
    case getCapabilities = "platform.getCapabilities"
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
    static let defaultMaximumBytes = 2 * 1_024 * 1_024
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
        case .getCapabilities, .getGenerationSettings, .credentialStatus:
            guard params.isEmpty else { throw RPCValidationError.invalidParameters }
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
                  let credential = params["credential"] as? String,
                  !credential.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  credential.utf8.count <= 16_384
            else { throw RPCValidationError.invalidParameters }
        case .removeCredential:
            guard Set(params.keys) == ["provider"],
                  let providerName = params["provider"] as? String,
                  let provider = GenerationProvider(rawValue: providerName),
                  provider.requiresCredential
            else { throw RPCValidationError.invalidParameters }
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
            guard Set(params.keys) == ["artifactId", "file"],
                  let artifactID = params["artifactId"] as? String,
                  Self.isStableID(artifactID), let file = params["file"] as? [String: Any]
            else { throw RPCValidationError.invalidParameters }
            do { _ = try ArtifactFile.decode(data: JSONSerialization.data(withJSONObject: file)) }
            catch { throw RPCValidationError.invalidParameters }
        }
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
              let model = settings["model"] as? String,
              !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              model.utf8.count <= 128,
              !model.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
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
