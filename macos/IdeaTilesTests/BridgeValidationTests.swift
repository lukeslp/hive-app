import Foundation
import Testing
@testable import IdeaTiles

@Suite("Native RPC validation")
struct BridgeValidationTests {
    @Test("preserves JSON numeric zero and one separately from booleans")
    func preservesJSONScalarTypes() throws {
        let raw = try #require(
            JSONSerialization.jsonObject(with: Data(#"{"zero":0,"one":1,"false":false,"true":true}"#.utf8))
                as? [String: Any]
        )
        let encoded = try JSONEncoder().encode(JSONValue(any: raw))
        let roundTripped = try #require(
            JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )

        #expect(CFGetTypeID(try #require(roundTripped["zero"] as? NSNumber)) != CFBooleanGetTypeID())
        #expect(CFGetTypeID(try #require(roundTripped["one"] as? NSNumber)) != CFBooleanGetTypeID())
        #expect(roundTripped["false"] as? Bool == false)
        #expect(roundTripped["true"] as? Bool == true)
    }

    @Test("workspace validation matches JavaScript string limits and semantic references")
    func validatesWorkspaceSemantics() throws {
        var request = workspaceSaveRequest()
        var params = try #require(request["params"] as? [String: Any])
        var envelope = try #require(params["envelope"] as? [String: Any])
        var workspace = try #require(envelope["workspace"] as? [String: Any])
        let emojiText = String(repeating: "🧠", count: 256) // 512 UTF-16 code units
        let node: [String: Any] = [
            "id": "tile:0:0", "text": emojiText, "type": "root", "depth": 0,
            "parentId": NSNull(), "isKeyTheme": false, "pinned": false,
            "artifactAttachments": [],
        ]
        workspace["graph"] = ["nodes": [node], "edges": []]
        var projections = try #require(workspace["projections"] as? [String: Any])
        var tiles = try #require(projections["tiles"] as? [String: Any])
        tiles["nodes"] = ["tile:0:0": ["q": 0, "r": 0]]
        projections["tiles"] = tiles
        workspace["projections"] = projections
        envelope["workspace"] = workspace
        params["envelope"] = envelope
        request["params"] = params
        _ = try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: request))

        for mutation in [
            "date", "compatibility", "attachment", "danglingEdge", "danglingParent",
            "duplicateNode", "duplicateEdge", "duplicatePosition",
        ] {
            var invalid = workspace
            switch mutation {
            case "date":
                invalid["metadata"] = ["createdAt": "not-a-date"]
            case "compatibility":
                var malformedNode = node
                malformedNode["compatibility"] = ["tiles": ["codeSnippet": ["language": "swift"]]]
                invalid["graph"] = ["nodes": [malformedNode], "edges": []]
            case "attachment":
                var malformedNode = node
                malformedNode["compatibility"] = ["tiles": ["imageAttachment": [
                    "artifactId": "artifact:1", "targetNodeId": "tile:0:0",
                    "fileId": "file:1", "mimeType": "image/png",
                    "dataURL": "data:image/png;base64,AA==",
                    "checksum": ["algorithm": "sha256", "value": "bad"],
                ]]]
                invalid["graph"] = ["nodes": [malformedNode], "edges": []]
            case "danglingEdge":
                invalid["graph"] = [
                    "nodes": [node],
                    "edges": [["sourceId": "tile:0:0", "targetId": "tile:missing", "kind": "related"]],
                ]
            case "danglingParent":
                var dangling = node
                dangling["parentId"] = "tile:missing"
                invalid["graph"] = ["nodes": [dangling], "edges": []]
            case "duplicateNode":
                invalid["graph"] = ["nodes": [node, node], "edges": []]
            case "duplicateEdge":
                var second = node
                second["id"] = "tile:1:0"
                let edge = ["sourceId": "tile:0:0", "targetId": "tile:1:0", "kind": "related"]
                invalid["graph"] = ["nodes": [node, second], "edges": [edge, edge]]
                var invalidProjections = projections
                var invalidTiles = try #require(invalidProjections["tiles"] as? [String: Any])
                invalidTiles["nodes"] = [
                    "tile:0:0": ["q": 0, "r": 0],
                    "tile:1:0": ["q": 1, "r": 0],
                ]
                invalidProjections["tiles"] = invalidTiles
                invalid["projections"] = invalidProjections
            default:
                var second = node
                second["id"] = "tile:1:0"
                invalid["graph"] = ["nodes": [node, second], "edges": []]
                var invalidProjections = projections
                var invalidTiles = try #require(invalidProjections["tiles"] as? [String: Any])
                invalidTiles["nodes"] = [
                    "tile:0:0": ["q": 0, "r": 0],
                    "tile:1:0": ["q": 0, "r": 0],
                ]
                invalidProjections["tiles"] = invalidTiles
                invalid["projections"] = invalidProjections
            }
            var invalidEnvelope = envelope
            invalidEnvelope["workspace"] = invalid
            var invalidParams = params
            invalidParams["envelope"] = invalidEnvelope
            var invalidRequest = request
            invalidRequest["params"] = invalidParams
            #expect(throws: RPCValidationError.self) {
                try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: invalidRequest))
            }
        }
    }

    @Test("rejects excessive JSON nesting before value conversion")
    func rejectsExcessiveJSONDepth() {
        let nested = String(repeating: "[", count: 65) + "0" + String(repeating: "]", count: 65)
        let data = Data(#"{"id":"rpc:1","method":"platform.getCapabilities","params":{"nested":\#(nested)}}"#.utf8)
        #expect(throws: RPCValidationError.invalidJSON) {
            try RPCRequestValidator().parse(data)
        }
    }

    @Test("accepts only a bounded canonical workspace envelope")
    func validatesWorkspacePersistence() throws {
        let valid = workspaceSaveRequest()
        _ = try RPCRequestValidator().parse(try JSONSerialization.data(withJSONObject: valid))

        var extra = valid
        var extraParams = try #require(extra["params"] as? [String: Any])
        extraParams["unexpected"] = true
        extra["params"] = extraParams
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(try JSONSerialization.data(withJSONObject: extra))
        }

        var malformed = valid
        var malformedParams = try #require(malformed["params"] as? [String: Any])
        var envelope = try #require(malformedParams["envelope"] as? [String: Any])
        envelope["format"] = "untrusted.workspace"
        malformedParams["envelope"] = envelope
        malformed["params"] = malformedParams
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(try JSONSerialization.data(withJSONObject: malformed))
        }

        var mismatched = valid
        var mismatchedParams = try #require(mismatched["params"] as? [String: Any])
        mismatchedParams["boardId"] = "board:different"
        mismatched["params"] = mismatchedParams
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(try JSONSerialization.data(withJSONObject: mismatched))
        }

        var malformedProjection = valid
        var projectionParams = try #require(malformedProjection["params"] as? [String: Any])
        var projectionEnvelope = try #require(projectionParams["envelope"] as? [String: Any])
        var workspace = try #require(projectionEnvelope["workspace"] as? [String: Any])
        var projections = try #require(workspace["projections"] as? [String: Any])
        var tiles = try #require(projections["tiles"] as? [String: Any])
        tiles["nodes"] = ["tile:0:0": ["q": "zero", "r": 0]]
        projections["tiles"] = tiles
        workspace["projections"] = projections
        projectionEnvelope["workspace"] = workspace
        projectionParams["envelope"] = projectionEnvelope
        malformedProjection["params"] = projectionParams
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(
                try JSONSerialization.data(withJSONObject: malformedProjection)
            )
        }
    }

    @Test("accepts a strictly shaped capabilities request")
    func acceptsCapabilities() throws {
        let request = try RPCRequestValidator().parse(Data(#"{"id":"rpc:1","method":"platform.getCapabilities","params":{}}"#.utf8))

        #expect(request.id == "rpc:1")
        #expect(request.method == .getCapabilities)
    }

    @Test(arguments: [
        #"{"id":"rpc:settings:get","method":"generation.settings.get","params":{}}"#,
        #"{"id":"rpc:settings:set","method":"generation.settings.set","params":{"settings":{"provider":"ollama","model":"gemma3:4b","ollamaBaseURL":"http://127.0.0.1:11434"}}}"#,
        #"{"id":"rpc:credentials:status","method":"credentials.status","params":{}}"#,
        #"{"id":"rpc:credentials:set","method":"credentials.set","params":{"provider":"openai","credential":"secret-value"}}"#,
        #"{"id":"rpc:credentials:remove","method":"credentials.remove","params":{"provider":"openai"}}"#,
        #"{"id":"rpc:dreamer:status","method":"dreamer.status","params":{}}"#,
        #"{"id":"rpc:dreamer:profile","method":"dreamer.profile","params":{}}"#,
        #"{"id":"rpc:dreamer:redeem","method":"dreamer.redeem","params":{"inviteCode":"di_privatecode"}}"#,
        #"{"id":"rpc:dreamer:remove","method":"dreamer.remove","params":{}}"#,
        #"{"id":"rpc:dreamer:request","method":"dreamer.requestAccess","params":{}}"#,
        #"{"id":"rpc:auth","method":"auth.signIn","params":{"loginURL":"https://ideatiles.app/api/oauth/native-start"}}"#,
    ])
    func acceptsSettingsAndCredentialRequests(_ json: String) throws {
        _ = try RPCRequestValidator().parse(Data(json.utf8))
    }

    @Test(arguments: [
        #"{"id":"rpc:settings:set","method":"generation.settings.set","params":{"settings":{"provider":"unknown","model":"model"}}}"#,
        #"{"id":"rpc:settings:set","method":"generation.settings.set","params":{"settings":{"provider":"apple","model":"","extra":true}}}"#,
        #"{"id":"rpc:credentials:set","method":"credentials.set","params":{"provider":"apple","credential":"secret-value"}}"#,
        #"{"id":"rpc:credentials:set","method":"credentials.set","params":{"provider":"openai","credential":""}}"#,
        #"{"id":"rpc:credentials:remove","method":"credentials.remove","params":{"provider":"ollama"}}"#,
        #"{"id":"rpc:credentials:set","method":"credentials.set","params":{"provider":"dreamer","credential":"dm_private"}}"#,
        #"{"id":"rpc:credentials:remove","method":"credentials.remove","params":{"provider":"dreamer"}}"#,
        #"{"id":"rpc:dreamer:redeem","method":"dreamer.redeem","params":{"inviteCode":""}}"#,
        #"{"id":"rpc:dreamer:redeem","method":"dreamer.redeem","params":{"inviteCode":"invite_private"}}"#,
        #"{"id":"rpc:dreamer:redeem","method":"dreamer.redeem","params":{"inviteCode":"invite","extra":true}}"#,
    ])
    func rejectsInvalidSettingsAndCredentialRequests(_ json: String) {
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(Data(json.utf8))
        }
    }

    @Test("validates the hosted callback before opening the native auth sheet")
    func validatesAuthenticationURL() throws {
        let valid = URL(string: "https://ideatiles.app/api/oauth/native-start")!
        #expect(try AuthenticationURLPolicy.validate(valid) == valid)

        for invalid in [
            "http://ideatiles.app/api/oauth/native-start",
            "https://ideatiles.app/api/oauth/native-start?next=evil",
            "https://user:password@ideatiles.app/api/oauth/native-start",
        ] {
            #expect(throws: AuthenticationError.self) {
                try AuthenticationURLPolicy.validate(URL(string: invalid)!)
            }
        }
    }

    @Test(arguments: [
        #"{"id":"rpc:1","method":"unknown","params":{}}"#,
        #"{"id":"../bad","method":"platform.getCapabilities","params":{}}"#,
        #"{"id":"rpc:1","method":"platform.getCapabilities","params":{},"extra":true}"#,
        #"{"id":"rpc:1","method":"artifact.cancel","params":{}}"#,
        #"{"id":"rpc:1","method":"artifact.cancel","params":{"requestId":"request:1","extra":true}}"#,
    ])
    func rejectsInvalidRequests(_ json: String) {
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(Data(json.utf8))
        }
    }

    @Test("requires the semantic target node for image attachment")
    func validatesImageAttachmentTarget() throws {
        let manifest = try ArtifactFixture.manifest(content: "strict")
        let file = try #require(manifest.files.first)
        let rawFile = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(file)) as? [String: Any])
        let valid: [String: Any] = [
            "id": "rpc:attach",
            "method": "artifact.attachImage",
            "params": ["artifactId": manifest.id, "targetNodeId": "0,0", "file": rawFile],
        ]
        _ = try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: valid))

        let invalid: [String: Any] = [
            "id": "rpc:attach:missing",
            "method": "artifact.attachImage",
            "params": ["artifactId": manifest.id, "file": rawFile],
        ]
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: invalid))
        }
    }

    @Test("rejects messages over the byte cap before decoding")
    func rejectsOversize() {
        let validator = RPCRequestValidator(maximumBytes: 32)
        let data = Data(#"{"id":"rpc:1","method":"platform.getCapabilities","params":{}}"#.utf8)

        #expect(throws: RPCValidationError.self) {
            try validator.parse(data)
        }
    }

    @Test("rejects inconsistent generation provenance before dispatch")
    func rejectsInconsistentGeneration() throws {
        let request: [String: Any] = [
            "id": "rpc:generate",
            "method": "artifact.generate",
            "params": [
                "requestId": "request:1",
                "sourceBoardId": "board:1",
                "sourceNodeIds": ["0,0"],
                "includedNodeCount": 2,
                "originalNodeCount": 1,
                "contextTruncated": false,
                "recipeId": "recipe:brief",
                "scope": ["kind": "board", "extra": true],
                "context": "context",
            ],
        ]

        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: request))
        }
    }

    @Test("rejects unknown nested artifact manifest fields before dispatch")
    func rejectsLooseManifest() throws {
        let manifest = try ArtifactFixture.manifest(content: "strict")
        var rawManifest = try #require(try JSONSerialization.jsonObject(with: manifest.encoded()) as? [String: Any])
        rawManifest["unexpected"] = true
        let request: [String: Any] = [
            "id": "rpc:save",
            "method": "artifact.save",
            "params": ["manifest": rawManifest],
        ]

        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(JSONSerialization.data(withJSONObject: request))
        }
    }
}

private func workspaceSaveRequest() -> [String: Any] {
    [
        "id": "rpc:workspace:save",
        "method": "workspace.saveBoard",
        "params": [
            "boardId": "board:stable",
            "title": "Native package seam",
            "envelope": [
                "format": "app.ideatiles.workspace-envelope",
                "envelopeVersion": 1,
                "workspace": [
                    "format": "app.ideatiles.workspace",
                    "schemaVersion": 1,
                    "id": "board:stable",
                    "activeMode": "tiles",
                    "graph": ["nodes": [], "edges": []],
                    "projections": [
                        "tiles": [
                            "nodes": [:],
                            "viewport": ["x": 0, "y": 0, "zoom": 1],
                        ],
                        "sphere": [
                            "nodes": [:],
                            "alignments": [],
                            "camera": [
                                "position": [0, 0, 15],
                                "target": [0, 0, 0],
                                "fov": 60,
                                "zoom": 1,
                            ],
                            "subdivisions": 4,
                        ],
                    ],
                    "preferences": ["creativity": 0.5],
                    "metadata": [:],
                ],
            ],
        ],
    ]
}

@Suite("Native RPC dispatcher")
struct BridgeDispatcherTests {
    @Test("returns exactly one method-tagged success envelope")
    func successEnvelope() async throws {
        let dispatcher = BridgeDispatcher { request in
            #expect(request.method == .getCapabilities)
            return .object(["bridgeVersion": .number(1)])
        }

        let response = await dispatcher.dispatch(Data(#"{"id":"rpc:1","method":"platform.getCapabilities","params":{}}"#.utf8))
        let object = try #require(try JSONSerialization.jsonObject(with: response) as? [String: Any])

        #expect(object["id"] as? String == "rpc:1")
        #expect(object["method"] as? String == "platform.getCapabilities")
        #expect(object["ok"] as? Bool == true)
    }

    @Test("rejects a duplicate ID while the original request is in flight")
    func rejectsDuplicate() async throws {
        let gate = AsyncGate()
        let dispatcher = BridgeDispatcher(timeout: .seconds(2)) { _ in
            await gate.wait()
            return .object([:])
        }
        let data = Data(#"{"id":"rpc:duplicate","method":"platform.getCapabilities","params":{}}"#.utf8)

        async let first = dispatcher.dispatch(data)
        await gate.waitUntilEntered()
        let duplicate = await dispatcher.dispatch(data)
        await gate.open()
        _ = await first

        #expect(try responseErrorCode(duplicate) == "duplicateRequest")
    }

    @Test("cancels timed-out work and returns a structured timeout")
    func timesOut() async throws {
        let cancellation = CancellationProbe()
        let dispatcher = BridgeDispatcher(timeout: .milliseconds(20)) { _ in
            do {
                try await Task.sleep(for: .seconds(5))
                return .object([:])
            } catch is CancellationError {
                await cancellation.markCancelled()
                throw CancellationError()
            }
        }
        let data = Data(#"{"id":"rpc:timeout","method":"platform.getCapabilities","params":{}}"#.utf8)

        let response = await dispatcher.dispatch(data)

        #expect(try responseErrorCode(response) == "timeout")
        #expect(await cancellation.wasCancelled)
    }

    @Test("returns a timeout without awaiting noncooperative work")
    func noncooperativeTimeoutReturnsPromptly() async throws {
        let gate = AsyncGate()
        let dispatcher = BridgeDispatcher(timeout: .milliseconds(20)) { _ in
            await gate.wait()
            return .object([:])
        }
        let data = Data(#"{"id":"rpc:stuck","method":"platform.getCapabilities","params":{}}"#.utf8)
        let clock = ContinuousClock()
        let started = clock.now

        let response = await dispatcher.dispatch(data)
        let elapsed = started.duration(to: clock.now)
        await gate.open()

        #expect(try responseErrorCode(response) == "timeout")
        #expect(elapsed < .milliseconds(200))
    }

    @Test("does not apply a computation timeout while an export panel is open")
    func exportIsNotComputationTimed() async throws {
        let dispatcher = BridgeDispatcher(timeout: .milliseconds(10)) { _ in
            try await Task.sleep(for: .milliseconds(30))
            return .object(["exported": .bool(false)])
        }
        let manifest = try ArtifactFixture.manifest(content: "panel")
        let manifestValue = try JSONDecoder().decode(JSONValue.self, from: manifest.encoded())
        let request = JSONValue.object([
            "id": .string("rpc:panel"), "method": .string("artifact.export"),
            "params": .object(["manifest": manifestValue]),
        ])

        let response = await dispatcher.dispatch(try JSONEncoder().encode(request))
        let object = try #require(try JSONSerialization.jsonObject(with: response) as? [String: Any])
        #expect(object["ok"] as? Bool == true)
    }

    @Test("does not apply a model-computation timeout while Image Playground is open")
    func imagePlaygroundIsNotComputationTimed() async throws {
        let dispatcher = BridgeDispatcher(timeout: .milliseconds(10)) { _ in
            try await Task.sleep(for: .milliseconds(30))
            return .object(["kind": .string("image")])
        }
        let request: [String: Any] = [
            "id": "rpc:image",
            "method": "artifact.generate",
            "params": [
                "requestId": "generation:image",
                "sourceBoardId": "board:1",
                "sourceNodeIds": ["0,0"],
                "includedNodeCount": 1,
                "originalNodeCount": 1,
                "contextTruncated": false,
                "recipeId": "image-playground-artwork",
                "scope": ["kind": "board"],
                "context": "visual context",
            ],
        ]

        let response = await dispatcher.dispatch(try JSONSerialization.data(withJSONObject: request))
        let object = try #require(try JSONSerialization.jsonObject(with: response) as? [String: Any])
        #expect(object["ok"] as? Bool == true)
    }

    @Test("does not apply a computation timeout while the authentication sheet is open")
    func authenticationSheetIsNotComputationTimed() async throws {
        let dispatcher = BridgeDispatcher(timeout: .milliseconds(10)) { _ in
            try await Task.sleep(for: .milliseconds(30))
            return .object(["authenticated": .bool(true)])
        }
        let data = Data(#"{"id":"rpc:auth:sheet","method":"auth.signIn","params":{"loginURL":"https://ideatiles.app/api/oauth/native-start"}}"#.utf8)

        let response = await dispatcher.dispatch(data)
        let object = try #require(try JSONSerialization.jsonObject(with: response) as? [String: Any])
        #expect(object["ok"] as? Bool == true)
    }
}

private func responseErrorCode(_ data: Data) throws -> String? {
    let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let error = try #require(object["error"] as? [String: Any])
    return error["code"] as? String
}

private actor AsyncGate {
    private var entered = false
    private var isOpen = false

    func wait() async {
        entered = true
        while !isOpen { await Task.yield() }
    }

    func waitUntilEntered() async {
        while !entered { await Task.yield() }
    }

    func open() { isOpen = true }
}

private actor CancellationProbe {
    private(set) var wasCancelled = false
    func markCancelled() { wasCancelled = true }
}
