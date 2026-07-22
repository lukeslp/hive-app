import Foundation

protocol HTTPTransporting: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

enum ProviderTransportLimits {
    // Provider text responses are expected to be tens of kilobytes. One MiB
    // leaves ample headroom while bounding success, redirect, and error bodies.
    static let maximumResponseBytes = 1_048_576
}

final class URLSessionHTTPTransport: HTTPTransporting, @unchecked Sendable {
    private let configuration: URLSessionConfiguration

    init(configuration: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration.copy() as! URLSessionConfiguration
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await BoundedHTTPDataLoader(configuration: configuration).load(request)
    }
}

private final class BoundedHTTPDataLoader: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private typealias Reply = CheckedContinuation<(Data, HTTPURLResponse), Error>

    private let configuration: URLSessionConfiguration
    private let lock = NSLock()
    private var continuation: Reply?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var response: HTTPURLResponse?
    private var buffer = Data()
    private var completed = false
    private var cancellationRequested = false

    init(configuration: URLSessionConfiguration) {
        self.configuration = configuration
    }

    func load(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let delegateQueue = OperationQueue()
                delegateQueue.maxConcurrentOperationCount = 1
                let session = URLSession(
                    configuration: configuration,
                    delegate: self,
                    delegateQueue: delegateQueue
                )
                let task = session.dataTask(with: request)
                let wasCancelled = lock.withLock {
                    self.continuation = continuation
                    self.session = session
                    self.task = task
                    return cancellationRequested
                }
                if wasCancelled || Task.isCancelled {
                    resolve(.failure(CancellationError()), cancellingTask: true)
                } else {
                    task.resume()
                }
            }
        } onCancel: {
            cancel()
        }
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void
    ) {
        guard let response = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            resolve(.failure(GenerationServiceError.invalidResponse), cancellingTask: true)
            return
        }
        guard response.expectedContentLength <= ProviderTransportLimits.maximumResponseBytes else {
            completionHandler(.cancel)
            resolve(.failure(GenerationServiceError.responseTooLarge), cancellingTask: true)
            return
        }
        lock.withLock { self.response = response }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let overflow = lock.withLock {
            if data.count > ProviderTransportLimits.maximumResponseBytes - buffer.count {
                return true
            }
            buffer.append(data)
            return false
        }
        if overflow {
            resolve(.failure(GenerationServiceError.responseTooLarge), cancellingTask: true)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            if (error as? URLError)?.code == .cancelled {
                resolve(.failure(CancellationError()), cancellingTask: false)
            } else {
                resolve(.failure(error), cancellingTask: false)
            }
            return
        }
        let result: Result<(Data, HTTPURLResponse), Error> = lock.withLock {
            guard let response else { return .failure(GenerationServiceError.invalidResponse) }
            return .success((buffer, response))
        }
        resolve(result, cancellingTask: false)
    }

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

    private func resolve(
        _ result: Result<(Data, HTTPURLResponse), Error>,
        cancellingTask: Bool
    ) {
        let state: (Reply?, URLSessionDataTask?, URLSession?) = lock.withLock {
            guard !completed else { return (nil, nil, nil) }
            completed = true
            let state = (continuation, task, session)
            continuation = nil
            task = nil
            session = nil
            return state
        }
        guard let continuation = state.0 else { return }
        if cancellingTask { state.1?.cancel() }
        if cancellingTask { state.2?.invalidateAndCancel() }
        else { state.2?.finishTasksAndInvalidate() }
        continuation.resume(with: result)
    }

    private func cancel() {
        let canResolve = lock.withLock {
            cancellationRequested = true
            return continuation != nil
        }
        if canResolve {
            resolve(.failure(CancellationError()), cancellingTask: true)
        }
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
        guard GenerationModelValidator.isValid(model, for: provider)
        else { throw GenerationServiceError.invalidConfiguration }
        if provider.requiresCredential, credential?.isEmpty != false {
            throw GenerationServiceError.missingCredential(provider)
        }

        let endpoint: URL
        switch provider {
        case .apple:
            throw GenerationServiceError.invalidConfiguration
        case .dreamer:
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
        case .dreamer:
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
        case .dreamer:
            return nil
        }
    }
}
