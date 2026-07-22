import Foundation

protocol HTTPTransporting: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

enum ProviderTransportLimits {
    // Provider text responses are expected to be tens of kilobytes. One MiB
    // leaves ample headroom while bounding success, redirect, and error bodies.
    static let maximumResponseBytes = 1_048_576
}

final class URLSessionHTTPTransport: NSObject, HTTPTransporting, @unchecked Sendable {
    private let redirectDelegate: ProviderRedirectDelegate
    private let session: URLSession

    init(configuration: URLSessionConfiguration = .ephemeral) {
        redirectDelegate = ProviderRedirectDelegate()
        session = URLSession(configuration: configuration, delegate: redirectDelegate, delegateQueue: nil)
        super.init()
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else {
                throw GenerationServiceError.invalidResponse
            }
            if response.expectedContentLength > ProviderTransportLimits.maximumResponseBytes {
                throw GenerationServiceError.responseTooLarge
            }
            var data = Data()
            data.reserveCapacity(min(
                max(Int(response.expectedContentLength), 0),
                ProviderTransportLimits.maximumResponseBytes
            ))
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < ProviderTransportLimits.maximumResponseBytes else {
                    throw GenerationServiceError.responseTooLarge
                }
                data.append(byte)
            }
            return (data, response)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        }
    }
}

private final class ProviderRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        guard let source = task.currentRequest?.url ?? task.originalRequest?.url,
              let destination = request.url,
              LoopbackRedirectPolicy.allows(from: source, to: destination),
              let canonicalDestination = OllamaEndpoint.canonicalizedLoopbackURL(destination)
        else {
            completionHandler(nil)
            return
        }
        var canonicalRequest = request
        canonicalRequest.url = canonicalDestination
        completionHandler(canonicalRequest)
    }
}

struct OllamaEndpoint: Sendable, Equatable {
    let baseURL: URL
    let chatURL: URL

    init(rawValue: String) throws {
        guard let components = URLComponents(string: rawValue),
              let url = components.url,
              let canonicalURL = Self.canonicalizedLoopbackURL(url),
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              components.percentEncodedPath.isEmpty || components.percentEncodedPath == "/"
        else { throw GenerationServiceError.invalidConfiguration }
        baseURL = canonicalURL
        chatURL = canonicalURL.appending(path: "api/chat", directoryHint: .notDirectory)
    }

    static func isLoopbackURL(_ url: URL) -> Bool {
        guard url.scheme == "http" || url.scheme == "https",
              url.user == nil, url.password == nil,
              let host = url.host?.lowercased()
        else { return false }
        if host == "localhost" || host == "::1" { return true }
        let octets = host.split(separator: ".")
        return octets.count == 4
            && octets[0] == "127"
            && octets.allSatisfy { Int($0).map { (0...255).contains($0) } == true }
    }

    static func canonicalizedLoopbackURL(_ url: URL) -> URL? {
        guard isLoopbackURL(url), var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        if components.host?.lowercased() == "localhost" { components.host = "127.0.0.1" }
        return components.url
    }
}

enum LoopbackRedirectPolicy {
    static func allows(from source: URL, to destination: URL) -> Bool {
        OllamaEndpoint.isLoopbackURL(source) && OllamaEndpoint.isLoopbackURL(destination)
    }
}

struct DirectProviderRequestBuilder: Sendable {
    func makeRequest(
        provider: GenerationProvider,
        model: String,
        prompt: String,
        credential: String?,
        ollamaBaseURL: String? = nil
    ) throws -> URLRequest {
        guard !model.isEmpty, model.utf8.count <= 128,
              model.range(of: #"^[A-Za-z0-9._:-]+$"#, options: .regularExpression) != nil
        else { throw GenerationServiceError.invalidConfiguration }
        if provider.requiresCredential, credential?.isEmpty != false {
            throw GenerationServiceError.missingCredential(provider)
        }

        let endpoint: URL
        switch provider {
        case .apple:
            throw GenerationServiceError.invalidConfiguration
        case .gemini:
            endpoint = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent")!
        case .anthropic:
            endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
        case .openAI:
            endpoint = URL(string: "https://api.openai.com/v1/chat/completions")!
        case .xAI:
            endpoint = URL(string: "https://api.x.ai/v1/chat/completions")!
        case .mistral:
            endpoint = URL(string: "https://api.mistral.ai/v1/chat/completions")!
        case .ollama:
            guard let ollamaBaseURL else { throw GenerationServiceError.invalidConfiguration }
            endpoint = try OllamaEndpoint(rawValue: ollamaBaseURL).chatURL
        }

        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 25)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any]
        switch provider {
        case .gemini:
            request.setValue(credential, forHTTPHeaderField: "x-goog-api-key")
            body = [
                "contents": [["parts": [["text": prompt]]]],
                "generationConfig": ["maxOutputTokens": 4_096],
            ]
        case .anthropic:
            request.setValue(credential, forHTTPHeaderField: "x-api-key")
            request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = ["model": model, "messages": [["role": "user", "content": prompt]], "max_tokens": 4_096]
        case .openAI, .xAI, .mistral:
            guard let credential else { throw GenerationServiceError.missingCredential(provider) }
            request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
            let tokenKey = provider == .openAI ? "max_completion_tokens" : "max_tokens"
            body = ["model": model, "messages": [["role": "user", "content": prompt]], tokenKey: 4_096]
        case .ollama:
            body = [
                "model": model,
                "messages": [["role": "user", "content": prompt]],
                "stream": false,
                "options": ["num_predict": 4_096],
            ]
        case .apple:
            throw GenerationServiceError.invalidConfiguration
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }
}

struct DirectProviderClient: CloudTextGenerating, Sendable {
    let transport: any HTTPTransporting
    private let builder = DirectProviderRequestBuilder()

    func generate(
        provider: GenerationProvider,
        prompt: String,
        model: String,
        credential: String?,
        ollamaBaseURL: String?
    ) async throws -> String {
        let request = try builder.makeRequest(
            provider: provider,
            model: model,
            prompt: prompt,
            credential: credential,
            ollamaBaseURL: ollamaBaseURL
        )
        let (data, response) = try await transport.data(for: request)
        guard (200..<300).contains(response.statusCode) else {
            throw GenerationServiceError.providerFailure(statusCode: response.statusCode)
        }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let text = Self.text(from: object, provider: provider),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { throw GenerationServiceError.invalidResponse }
        return text
    }

    private static func text(from object: [String: Any], provider: GenerationProvider) -> String? {
        switch provider {
        case .gemini:
            return (((object["candidates"] as? [[String: Any]])?.first?["content"] as? [String: Any])?["parts"] as? [[String: Any]])?.first?["text"] as? String
        case .anthropic:
            return (object["content"] as? [[String: Any]])?.first?["text"] as? String
        case .openAI, .xAI, .mistral:
            return ((object["choices"] as? [[String: Any]])?.first?["message"] as? [String: Any])?["content"] as? String
        case .ollama:
            return (object["message"] as? [String: Any])?["content"] as? String
        case .apple:
            return nil
        }
    }
}
