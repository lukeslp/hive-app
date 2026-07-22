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
}
