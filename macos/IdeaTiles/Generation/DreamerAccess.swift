import Foundation

enum DreamerEndpoints {
    static let redeem = URL(string: "https://api.dr.eamer.dev/v2/access/redeem")!
    static let profile = URL(string: "https://api.dr.eamer.dev/v2/profile")!
    static let responses = URL(string: "https://api.dr.eamer.dev/v2/responses")!
    static let requestAccess = URL(string: "https://dr.eamer.dev/code/api-access/")!
}

struct DreamerTarget: Codable, Equatable, Sendable {
    let provider: String
    let model: String
}

struct DreamerPolicySummary: Codable, Equatable, Sendable {
    let providers: [String]
    let models: [String]
    let capabilities: [String]
}

struct DreamerQuotaSummary: Codable, Equatable, Sendable {
    let dailyLimit: Int
    let dailyUsed: Int
    let dailyRemaining: Int
    let resetAt: String

    private enum GatewayKeys: String, CodingKey {
        case dailyLimit = "daily_limit", dailyUsed = "daily_used"
        case dailyRemaining = "daily_remaining", resetAt = "reset_at"
    }
    private enum BridgeKeys: String, CodingKey {
        case dailyLimit, dailyUsed, dailyRemaining, resetAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: GatewayKeys.self)
        dailyLimit = try values.decode(Int.self, forKey: .dailyLimit)
        dailyUsed = try values.decode(Int.self, forKey: .dailyUsed)
        dailyRemaining = try values.decode(Int.self, forKey: .dailyRemaining)
        resetAt = try values.decode(String.self, forKey: .resetAt)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: BridgeKeys.self)
        try values.encode(dailyLimit, forKey: .dailyLimit)
        try values.encode(dailyUsed, forKey: .dailyUsed)
        try values.encode(dailyRemaining, forKey: .dailyRemaining)
        try values.encode(resetAt, forKey: .resetAt)
    }
}

struct DreamerProfile: Codable, Equatable, Sendable {
    let label: String
    let defaultTarget: DreamerTarget
    let policy: DreamerPolicySummary
    let quota: DreamerQuotaSummary
    let status: String

    private enum GatewayKeys: String, CodingKey {
        case label, policy, quota, status
        case defaultTarget = "default_target"
    }
    private enum BridgeKeys: String, CodingKey {
        case label, defaultTarget, policy, quota, status
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: GatewayKeys.self)
        label = try values.decode(String.self, forKey: .label)
        defaultTarget = try values.decode(DreamerTarget.self, forKey: .defaultTarget)
        policy = try values.decode(DreamerPolicySummary.self, forKey: .policy)
        quota = try values.decode(DreamerQuotaSummary.self, forKey: .quota)
        status = try values.decode(String.self, forKey: .status)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: BridgeKeys.self)
        try values.encode(label, forKey: .label)
        try values.encode(defaultTarget, forKey: .defaultTarget)
        try values.encode(policy, forKey: .policy)
        try values.encode(quota, forKey: .quota)
        try values.encode(status, forKey: .status)
    }

    func validated() throws -> Self {
        guard !label.isEmpty, label.utf8.count <= 120,
              status == "active",
              Self.safeIdentifier(defaultTarget.provider, maximumBytes: 40),
              Self.safeIdentifier(defaultTarget.model, maximumBytes: 200),
              policy.providers.count <= 4,
              policy.models.count <= 64,
              policy.capabilities.count <= 32,
              policy.providers.allSatisfy({ Self.safeIdentifier($0, maximumBytes: 40) }),
              policy.models.allSatisfy({ Self.safeIdentifier($0, maximumBytes: 200) }),
              policy.capabilities.allSatisfy({ Self.safeIdentifier($0, maximumBytes: 80) }),
              policy.providers.contains(defaultTarget.provider),
              policy.models.contains(defaultTarget.model)
                || policy.models.contains("\(defaultTarget.provider):\(defaultTarget.model)"),
              policy.capabilities.contains("text"),
              quota.dailyLimit >= 0,
              quota.dailyUsed >= 0,
              quota.dailyRemaining >= 0,
              quota.dailyUsed <= quota.dailyLimit,
              quota.dailyRemaining <= quota.dailyLimit,
              quota.dailyRemaining == max(quota.dailyLimit - quota.dailyUsed, 0),
              ISO8601DateFormatter().date(from: quota.resetAt) != nil
        else { throw DreamerAccessError.failure(.invalidResponse) }
        return self
    }

    private static func safeIdentifier(_ value: String, maximumBytes: Int) -> Bool {
        !value.isEmpty && value.utf8.count <= maximumBytes
            && value.range(of: #"^[A-Za-z0-9][A-Za-z0-9._:/-]*$"#, options: .regularExpression) != nil
    }
}

struct DreamerAccessStatus: Codable, Equatable, Sendable {
    let configured: Bool
    let profile: DreamerProfile?
}

enum DreamerAccessFailure: String, Codable, Error, Sendable {
    case notConfigured
    case invalidInvite
    case expiredInvite
    case replayedInvite
    case revoked
    case invalidAccess
    case quotaExceeded
    case throttled
    case offline
    case timeout
    case responseTooLarge
    case invalidResponse
    case serverUnavailable
}

enum DreamerAccessError: Error, Equatable, LocalizedError, Sendable {
    case failure(DreamerAccessFailure)

    var errorDescription: String? {
        switch self {
        case .failure(.notConfigured): "Enter a Dreamer invite code first."
        case .failure(.invalidInvite): "That Dreamer invite code is invalid."
        case .failure(.expiredInvite): "That Dreamer invite code has expired."
        case .failure(.replayedInvite): "That Dreamer invite code has already been used."
        case .failure(.revoked): "Dreamer access has been revoked."
        case .failure(.invalidAccess): "Dreamer access is no longer valid."
        case .failure(.quotaExceeded): "The Dreamer daily quota has been reached."
        case .failure(.throttled): "Too many Dreamer invite attempts. Try again later."
        case .failure(.offline): "Dreamer is unavailable while this Mac is offline."
        case .failure(.timeout): "Dreamer timed out."
        case .failure(.responseTooLarge): "Dreamer returned too much data."
        case .failure(.invalidResponse): "Dreamer returned an invalid response."
        case .failure(.serverUnavailable): "Dreamer is temporarily unavailable."
        }
    }
}

struct DreamerGeneratedText: Equatable, Sendable {
    let content: String
    let provider: String
    let model: String
}

protocol DreamerAccessProviding: Sendable {
    func redeem(inviteCode: String) async throws -> DreamerProfile
    func status(refreshProfile: Bool) async throws -> DreamerAccessStatus
    func profile() async throws -> DreamerProfile
    func generate(prompt: String) async throws -> DreamerGeneratedText
    func remove() async throws
}

struct DreamerAccessService: DreamerAccessProviding, Sendable {
    private struct RedeemResponse: Decodable {
        let accessToken: String
        let profile: DreamerProfile
        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case profile
        }
    }

    let transport: any HTTPTransporting
    let credentials: any CredentialStoring

    func redeem(inviteCode: String) async throws -> DreamerProfile {
        let invite = inviteCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard invite.utf8.count <= 256,
              invite.range(of: #"^di_[A-Za-z0-9_-]{7,253}$"#, options: .regularExpression) != nil
        else {
            throw DreamerAccessError.failure(.invalidInvite)
        }
        var request = fixedRequest(url: DreamerEndpoints.redeem)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["invite_code": invite])
        let data = try await send(request, purpose: .redeem)
        guard let response = try? JSONDecoder().decode(RedeemResponse.self, from: data),
              response.accessToken.utf8.count <= 256,
              response.accessToken.range(of: #"^dm_[A-Za-z0-9_-]{7,253}$"#, options: .regularExpression) != nil
        else { throw DreamerAccessError.failure(.invalidResponse) }
        do { try await credentials.set(response.accessToken, for: .dreamer) }
        catch { throw DreamerAccessError.failure(.invalidAccess) }
        return try response.profile.validated()
    }

    func status(refreshProfile: Bool) async throws -> DreamerAccessStatus {
        guard try await credentials.containsCredential(for: .dreamer) else {
            return DreamerAccessStatus(configured: false, profile: nil)
        }
        return DreamerAccessStatus(configured: true, profile: refreshProfile ? try await profile() : nil)
    }

    func profile() async throws -> DreamerProfile {
        let token = try await managedToken()
        return try await profile(token: token)
    }

    private func profile(token: String) async throws -> DreamerProfile {
        let data = try await send(authenticatedRequest(url: DreamerEndpoints.profile, token: token), purpose: .authenticated)
        guard let value = try? JSONDecoder().decode(DreamerProfile.self, from: data) else {
            throw DreamerAccessError.failure(.invalidResponse)
        }
        return try value.validated()
    }

    func generate(prompt: String) async throws -> DreamerGeneratedText {
        let token = try await managedToken()
        let profile = try await profile(token: token)
        var request = authenticatedRequest(url: DreamerEndpoints.responses, token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "provider": profile.defaultTarget.provider,
            "model": profile.defaultTarget.model,
            "stream": false,
            "input": [[
                "type": "message",
                "role": "user",
                "content": [["type": "input_text", "text": prompt]],
            ]],
            "max_output_tokens": 4_096,
        ])
        let data = try await send(request, purpose: .authenticated)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["fallback_used"] as? Bool == false,
              object["provider"] as? String == profile.defaultTarget.provider,
              object["model"] as? String == profile.defaultTarget.model,
              let output = object["output"] as? [[String: Any]],
              let text = Self.outputText(output),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { throw DreamerAccessError.failure(.invalidResponse) }
        return DreamerGeneratedText(content: text, provider: profile.defaultTarget.provider, model: profile.defaultTarget.model)
    }

    func remove() async throws {
        try await credentials.removeCredential(for: .dreamer)
    }

    private enum RequestPurpose { case redeem, authenticated }

    private func send(_ request: URLRequest, purpose: RequestPurpose) async throws -> Data {
        do {
            let (data, response) = try await transport.data(for: request)
            guard data.count <= ProviderTransportLimits.maximumResponseBytes else {
                throw DreamerAccessError.failure(.responseTooLarge)
            }
            guard response.url == request.url else {
                throw DreamerAccessError.failure(.invalidResponse)
            }
            guard (200..<300).contains(response.statusCode) else {
                throw DreamerAccessError.failure(Self.failure(for: response.statusCode, purpose: purpose))
            }
            return data
        } catch let error as DreamerAccessError {
            throw error
        } catch let error as GenerationServiceError where error == .responseTooLarge {
            throw DreamerAccessError.failure(.responseTooLarge)
        } catch let error as URLError {
            switch error.code {
            case .timedOut: throw DreamerAccessError.failure(.timeout)
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
                throw DreamerAccessError.failure(.offline)
            default: throw DreamerAccessError.failure(.serverUnavailable)
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw DreamerAccessError.failure(.serverUnavailable)
        }
    }

    private func managedToken() async throws -> String {
        guard let token = try await credentials.credential(for: .dreamer),
              token.utf8.count <= 256,
              token.range(of: #"^dm_[A-Za-z0-9_-]{7,253}$"#, options: .regularExpression) != nil
        else { throw DreamerAccessError.failure(.notConfigured) }
        return token
    }

    private func fixedRequest(url: URL) -> URLRequest {
        URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 20)
    }

    private func authenticatedRequest(url: URL, token: String) -> URLRequest {
        var request = fixedRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func failure(for status: Int, purpose: RequestPurpose) -> DreamerAccessFailure {
        switch status {
        case 400, 422: purpose == .redeem ? .invalidInvite : .invalidResponse
        case 401: purpose == .redeem ? .invalidInvite : .invalidAccess
        case 403: .revoked
        case 409: .replayedInvite
        case 410: .expiredInvite
        case 429: purpose == .redeem ? .throttled : .quotaExceeded
        case 500...599: .serverUnavailable
        default: .invalidResponse
        }
    }

    private static func outputText(_ output: [[String: Any]]) -> String? {
        for item in output where item["type"] as? String == "message" {
            guard let parts = item["content"] as? [[String: Any]] else { continue }
            let text = parts.compactMap { part -> String? in
                guard part["type"] as? String == "output_text" else { return nil }
                return part["text"] as? String
            }.joined()
            if !text.isEmpty { return text }
        }
        return nil
    }
}
