import Foundation
import Testing
@testable import IdeaTiles

@Suite("Dreamer managed access")
struct DreamerAccessTests {
    @Test("Dreamer selection invokes only managed access and preserves the curated target")
    func explicitDreamerSelection() async throws {
        let preferences = DreamerMemoryPreferences(settings: GenerationSettings(
            provider: .dreamer, model: "automatic", ollamaBaseURL: nil
        ))
        let managed = FakeDreamerAccess()
        let cloud = DreamerCloudProbe()
        let engine = GenerationEngine(
            preferences: preferences,
            credentials: DreamerMemoryVault(values: [.dreamer: "dm_managed"]),
            appleGenerator: DreamerTextProbe(),
            cloudGenerator: cloud,
            dreamer: managed
        )

        let result = try await engine.generate(prompt: "Board context")

        #expect(result.content == "Managed result")
        #expect(result.provider == .dreamer)
        #expect(result.model == "openai:gpt-5.6-luna")
        #expect(await cloud.callCount == 0)
        #expect(await managed.generationCount == 1)
    }

    @Test("redeem sends the invite only to the fixed endpoint and stores the returned token immediately")
    func redeemStoresToken() async throws {
        let transport = RecordingDreamerTransport(responses: [
            .json(200, #"{"access_token":"dm_one-time-secret","profile":{"label":"Luke's access","default_target":{"provider":"openai","model":"gpt-5.6-luna"},"policy":{"providers":["openai"],"models":["gpt-5.6-luna"],"capabilities":["text"]},"quota":{"daily_limit":100,"daily_used":4,"daily_remaining":96,"reset_at":"2026-07-22T00:00:00Z"},"status":"active"}}"#)
        ])
        let vault = DreamerMemoryVault()
        let service = DreamerAccessService(transport: transport, credentials: vault)

        let profile = try await service.redeem(inviteCode: "di_privatecode")

        #expect(profile.defaultTarget.provider == "openai")
        #expect(profile.defaultTarget.model == "gpt-5.6-luna")
        #expect(try await vault.credential(for: .dreamer) == "dm_one-time-secret")
        let request = try #require(await transport.requests.first)
        #expect(request.url?.absoluteString == "https://api.dr.eamer.dev/v2/access/redeem")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(String(data: try #require(request.httpBody), encoding: .utf8)?.contains("di_privatecode") == true)
        #expect(!String(describing: profile).contains("dm_one-time-secret"))
    }

    @Test("profile and generation use the fixed gateway in order with the curated target")
    func profileThenGenerate() async throws {
        let profile = #"{"label":"Friends","default_target":{"provider":"xai","model":"grok-4.5"},"policy":{"providers":["xai"],"models":["grok-4.5"],"capabilities":["text"]},"quota":{"daily_limit":20,"daily_used":2,"daily_remaining":18,"reset_at":"2026-07-22T00:00:00Z"},"status":"active"}"#
        let response = #"{"status":"completed","provider":"xai","model":"grok-4.5","fallback_used":false,"output":[{"type":"message","content":[{"type":"output_text","text":"Curated result"}]}]}"#
        let transport = RecordingDreamerTransport(responses: [.json(200, profile), .json(200, response)])
        let vault = DreamerMemoryVault(values: [.dreamer: "dm_managed"])
        let service = DreamerAccessService(transport: transport, credentials: vault)

        let generated = try await service.generate(prompt: "Board context")

        #expect(generated.content == "Curated result")
        #expect(generated.provider == "xai")
        #expect(generated.model == "grok-4.5")
        let requests = await transport.requests
        #expect(requests.map { $0.url?.absoluteString } == [
            "https://api.dr.eamer.dev/v2/profile",
            "https://api.dr.eamer.dev/v2/responses",
        ])
        #expect(requests.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == "Bearer dm_managed" })
        let requestBody = try #require(requests.last?.httpBody)
        let body = try #require(try JSONSerialization.jsonObject(with: requestBody) as? [String: Any])
        #expect(body["provider"] as? String == "xai")
        #expect(body["model"] as? String == "grok-4.5")
        #expect(body["stream"] as? Bool == false)
        #expect(body["fallback"] == nil)
    }

    @Test("profile and status never expose the managed token")
    func noSecretBoundary() async throws {
        let profile = #"{"label":"Friends","default_target":{"provider":"openai","model":"gpt-5.6-luna"},"policy":{"providers":["openai"],"models":["gpt-5.6-luna"],"capabilities":["text"]},"quota":{"daily_limit":20,"daily_used":2,"daily_remaining":18,"reset_at":"2026-07-22T00:00:00Z"},"status":"active"}"#
        let transport = RecordingDreamerTransport(responses: [.json(200, profile)])
        let vault = DreamerMemoryVault(values: [.dreamer: "dm_private"])
        let service = DreamerAccessService(transport: transport, credentials: vault)

        let status = try await service.status(refreshProfile: true)
        let encoded = String(decoding: try JSONEncoder().encode(status), as: UTF8.self)

        #expect(status.configured)
        #expect(status.profile?.quota.dailyRemaining == 18)
        #expect(!encoded.contains("dm_private"))
        #expect(!encoded.contains("token"))
        #expect(encoded.contains("defaultTarget"))
        #expect(encoded.contains("dailyRemaining"))
        #expect(!encoded.contains("default_target"))
    }

    @Test(arguments: [
        (400, DreamerAccessFailure.invalidInvite),
        (401, DreamerAccessFailure.invalidInvite),
        (403, DreamerAccessFailure.revoked),
        (409, DreamerAccessFailure.replayedInvite),
        (410, DreamerAccessFailure.expiredInvite),
        (429, DreamerAccessFailure.throttled),
    ])
    func mapsSafeGatewayFailures(statusCode: Int, expected: DreamerAccessFailure) async {
        let transport = RecordingDreamerTransport(responses: [
            .json(statusCode, #"{"code":"safe_code","message":"internal detail must not escape"}"#)
        ])
        let service = DreamerAccessService(transport: transport, credentials: DreamerMemoryVault())

        await #expect(throws: DreamerAccessError.failure(expected)) {
            try await service.redeem(inviteCode: "di_invitetest")
        }
    }

    @Test("missing access and transport failures are explicit and do not fall back")
    func missingAndOffline() async {
        let malformed = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: []),
            credentials: DreamerMemoryVault()
        )
        await #expect(throws: DreamerAccessError.failure(.invalidInvite)) {
            try await malformed.redeem(inviteCode: "invite_private")
        }

        let missing = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: []),
            credentials: DreamerMemoryVault()
        )
        await #expect(throws: DreamerAccessError.failure(.notConfigured)) {
            try await missing.generate(prompt: "test")
        }

        let offline = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: [.failure(URLError(.notConnectedToInternet))]),
            credentials: DreamerMemoryVault(values: [.dreamer: "dm_managed"])
        )
        await #expect(throws: DreamerAccessError.failure(.offline)) {
            try await offline.generate(prompt: "test")
        }

        let quota = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: [.json(429, #"{"code":"rate_limit"}"#)]),
            credentials: DreamerMemoryVault(values: [.dreamer: "dm_managed"])
        )
        await #expect(throws: DreamerAccessError.failure(.quotaExceeded)) {
            try await quota.profile()
        }
    }

    @Test("redirected, oversized, and timed-out responses fail closed")
    func transportBoundaries() async {
        let vault = DreamerMemoryVault(values: [.dreamer: "dm_managed"])
        let redirected = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: [
                .jsonAt(200, #"{}"#, URL(string: "https://example.com/profile")!)
            ]),
            credentials: vault
        )
        await #expect(throws: DreamerAccessError.failure(.invalidResponse)) {
            try await redirected.profile()
        }

        let oversized = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: [
                .json(200, String(repeating: "x", count: ProviderTransportLimits.maximumResponseBytes + 1))
            ]),
            credentials: vault
        )
        await #expect(throws: DreamerAccessError.failure(.responseTooLarge)) {
            try await oversized.profile()
        }

        let timedOut = DreamerAccessService(
            transport: RecordingDreamerTransport(responses: [.failure(URLError(.timedOut))]),
            credentials: vault
        )
        await #expect(throws: DreamerAccessError.failure(.timeout)) {
            try await timedOut.profile()
        }
    }

    @Test("native RPC returns profile summaries but never managed credentials")
    func bridgeNoSecret() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = try ArtifactRepository(root: root, inMemory: true)
        let managed = FakeDreamerAccess()
        let router = NativeBridgeRouter(
            repository: repository,
            dreamer: managed,
            urlOpener: { $0 == DreamerEndpoints.requestAccess },
            exporter: { _ in true }
        )

        let redeemed = try await router.execute(ValidatedRPCRequest(
            id: "rpc:dreamer:redeem", method: .dreamerRedeem,
            params: ["inviteCode": .string("di_privatecode")]
        ))
        let encoded = String(decoding: try JSONEncoder().encode(redeemed), as: UTF8.self)
        #expect(encoded.contains("defaultTarget"))
        #expect(!encoded.contains("di_privatecode"))
        #expect(!encoded.contains("dm_private"))

        let opened = try await router.execute(ValidatedRPCRequest(
            id: "rpc:dreamer:request", method: .dreamerRequestAccess, params: [:]
        ))
        #expect(opened.objectValue?["opened"] == .bool(true))
    }
}

private actor RecordingDreamerTransport: HTTPTransporting {
    enum Reply: Sendable {
        case json(Int, String)
        case jsonAt(Int, String, URL)
        case failure(any Error & Sendable)
    }

    private var replies: [Reply]
    private(set) var requests: [URLRequest] = []

    init(responses: [Reply]) { replies = responses }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !replies.isEmpty else { throw URLError(.badServerResponse) }
        switch replies.removeFirst() {
        case .json(let status, let body):
            return (
                Data(body.utf8),
                HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            )
        case .jsonAt(let status, let body, let url):
            return (
                Data(body.utf8),
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            )
        case .failure(let error): throw error
        }
    }
}

private actor DreamerMemoryVault: CredentialStoring {
    private var values: [GenerationProvider: String]
    init(values: [GenerationProvider: String] = [:]) { self.values = values }
    func set(_ value: String, for provider: GenerationProvider) { values[provider] = value }
    func credential(for provider: GenerationProvider) -> String? { values[provider] }
    func containsCredential(for provider: GenerationProvider) -> Bool { values[provider] != nil }
    func removeCredential(for provider: GenerationProvider) { values.removeValue(forKey: provider) }
}

private actor DreamerMemoryPreferences: GenerationPreferencesStoring {
    private var settings: GenerationSettings
    init(settings: GenerationSettings) { self.settings = settings }
    func load() -> GenerationSettings { settings }
    func save(_ settings: GenerationSettings) { self.settings = settings }
}

private actor DreamerCloudProbe: CloudTextGenerating {
    private(set) var callCount = 0
    func generate(
        provider: GenerationProvider, prompt: String, model: String,
        credential: String?, ollamaBaseURL: String?
    ) async throws -> String {
        callCount += 1
        return "Unexpected cloud result"
    }
}

private struct DreamerTextProbe: TextGenerating {
    func generate(prompt: String, model: String?) async throws -> String { "Unexpected Apple result" }
}

private actor FakeDreamerAccess: DreamerAccessProviding {
    private(set) var generationCount = 0

    func redeem(inviteCode: String) async throws -> DreamerProfile { try profileValue() }
    func status(refreshProfile: Bool) async throws -> DreamerAccessStatus {
        DreamerAccessStatus(configured: true, profile: refreshProfile ? try profileValue() : nil)
    }
    func profile() async throws -> DreamerProfile { try profileValue() }
    func generate(prompt: String) async throws -> DreamerGeneratedText {
        generationCount += 1
        return DreamerGeneratedText(content: "Managed result", provider: "openai", model: "gpt-5.6-luna")
    }
    func remove() async throws {}

    private func profileValue() throws -> DreamerProfile {
        try JSONDecoder().decode(DreamerProfile.self, from: Data(#"{"label":"Friends","default_target":{"provider":"openai","model":"gpt-5.6-luna"},"policy":{"providers":["openai"],"models":["gpt-5.6-luna"],"capabilities":["text"]},"quota":{"daily_limit":100,"daily_used":4,"daily_remaining":96,"reset_at":"2026-07-22T00:00:00Z"},"status":"active"}"#.utf8))
    }
}
