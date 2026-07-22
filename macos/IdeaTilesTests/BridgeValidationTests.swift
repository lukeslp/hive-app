import Foundation
import Testing
@testable import IdeaTiles

@Suite("Native RPC validation")
struct BridgeValidationTests {
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
    ])
    func rejectsInvalidSettingsAndCredentialRequests(_ json: String) {
        #expect(throws: RPCValidationError.self) {
            try RPCRequestValidator().parse(Data(json.utf8))
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
