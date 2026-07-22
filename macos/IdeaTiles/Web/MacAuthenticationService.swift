import AppKit
import Foundation
@preconcurrency import WebKit

enum AuthenticationError: Error, Equatable {
    case invalidLoginURL
    case alreadyPresenting
    case navigationFailed
}

enum AuthenticationURLPolicy {
    static let callbackURL = URL(string: "https://ideatiles.app/api/oauth/callback")!
    static let startURL = URL(string: "https://ideatiles.app/api/oauth/native-start")!

    static func validate(_ loginURL: URL) throws -> URL {
        guard loginURL == startURL
        else { throw AuthenticationError.invalidLoginURL }
        return loginURL
    }

    static func allowsNavigation(_ url: URL) -> Bool {
        url.scheme == "https" && url.host != nil && url.user == nil && url.password == nil
    }
}

@MainActor
enum MacAuthenticationService {
    private static var activeController: AuthenticationWindowController?

    static func signIn(loginURL: URL) async throws -> Bool {
        let validated = try AuthenticationURLPolicy.validate(loginURL)
        guard activeController == nil else { throw AuthenticationError.alreadyPresenting }
        return try await withCheckedThrowingContinuation { continuation in
            let controller = AuthenticationWindowController(loginURL: validated) { result in
                activeController = nil
                continuation.resume(with: result)
            }
            activeController = controller
            controller.present()
        }
    }
}

@MainActor
private final class AuthenticationWindowController: NSWindowController, WKNavigationDelegate, NSWindowDelegate {
    private let webView: WKWebView
    private let hostLabel = NSTextField(labelWithString: "ideatiles.app")
    private var completion: ((Result<Bool, Error>) -> Void)?
    private var sawCallback = false

    init(loginURL: URL, completion: @escaping (Result<Bool, Error>) -> Void) {
        let configuration = WKWebViewConfiguration()
        // The main app web view also uses the default store. Keeping the auth
        // sheet in that store makes the hosted HttpOnly session cookie
        // available to bundled-origin API requests without exposing it to JS.
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: configuration)
        self.completion = completion
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 760),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Sign in to Idea Tiles"
        hostLabel.alignment = .center
        hostLabel.font = .systemFont(ofSize: 12, weight: .medium)
        hostLabel.textColor = .secondaryLabelColor
        hostLabel.maximumNumberOfLines = 1
        let stack = NSStackView(views: [hostLabel, webView])
        stack.orientation = .vertical
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        hostLabel.setContentHuggingPriority(.required, for: .vertical)
        webView.setContentHuggingPriority(.defaultLow, for: .vertical)
        window.contentView = stack
        super.init(window: window)
        webView.navigationDelegate = self
        window.delegate = self
        webView.load(URLRequest(url: loginURL))
    }

    required init?(coder: NSCoder) { nil }

    func present() {
        window?.center()
        showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url,
              AuthenticationURLPolicy.allowsNavigation(url)
        else { return .cancel }
        hostLabel.stringValue = url.host ?? "Unknown site"
        if url.scheme == AuthenticationURLPolicy.callbackURL.scheme,
           url.host == AuthenticationURLPolicy.callbackURL.host,
           url.path == AuthenticationURLPolicy.callbackURL.path {
            sawCallback = true
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard sawCallback,
              let url = webView.url,
              url.scheme == "https",
              url.host == "ideatiles.app",
              url.path == "/"
        else { return }
        finish(.success(true))
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        finish(.failure(AuthenticationError.navigationFailed))
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        finish(.failure(AuthenticationError.navigationFailed))
    }

    func windowWillClose(_ notification: Notification) {
        finish(.success(false), closeWindow: false)
    }

    private func finish(_ result: Result<Bool, Error>, closeWindow: Bool = true) {
        guard let completion else { return }
        self.completion = nil
        webView.stopLoading()
        webView.navigationDelegate = nil
        if closeWindow { close() }
        completion(result)
    }
}
