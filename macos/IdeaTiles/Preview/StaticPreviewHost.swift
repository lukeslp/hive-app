import Foundation
@preconcurrency import WebKit

struct PreviewSecurityPolicy: Sendable {
    static let contentSecurityPolicy = [
        "default-src 'self'",
        "base-uri 'none'",
        "connect-src 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
    ].joined(separator: "; ")

    static let contentBlockerRules = #"""
    [
      {"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^wss?://.*"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^ftp://.*"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^file://.*"},"action":{"type":"block"}}
    ]
    """#

    let sessionID: String

    init(sessionID: String) {
        self.sessionID = sessionID
    }

    func allows(_ url: URL) -> Bool {
        url.scheme == "ideatiles-preview" && url.host == sessionID && url.user == nil && url.password == nil && url.port == nil
    }
}

private final class PreviewSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private let policy: PreviewSecurityPolicy

    init(root: URL, policy: PreviewSecurityPolicy) {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
        self.policy = policy
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        do {
            guard task.request.httpMethod == nil || task.request.httpMethod == "GET",
                  let url = task.request.url, policy.allows(url)
            else { throw ResourceServingError.invalidOrigin }
            let encodedPath = url.path(percentEncoded: true)
            guard let decoded = encodedPath.removingPercentEncoding, !decoded.contains("\\") else {
                throw ResourceServingError.invalidPath
            }
            let relative = decoded == "/" || decoded.isEmpty ? "index.html" : String(decoded.drop(while: { $0 == "/" }))
            try RelativeArtifactPath.validate(relative)
            let candidate = root.appending(path: relative).standardizedFileURL.resolvingSymlinksInPath()
            let prefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
            guard candidate.path.hasPrefix(prefix) else { throw ResourceServingError.invalidPath }
            let values = try candidate.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { throw ResourceServingError.missingResource }
            var data = try Data(contentsOf: candidate, options: .mappedIfSafe)
            let mime = BundleResourceResolver.mimeType(for: candidate.pathExtension)
            if mime == "text/html" {
                guard var html = String(data: data, encoding: .utf8) else { throw ResourceServingError.missingResource }
                let meta = "<meta http-equiv=\"Content-Security-Policy\" content=\"\(Self.escapeAttribute(PreviewSecurityPolicy.contentSecurityPolicy))\">"
                if let head = html.range(of: "<head", options: .caseInsensitive),
                   let close = html[head.lowerBound...].firstIndex(of: ">") {
                    html.insert(contentsOf: meta, at: html.index(after: close))
                } else {
                    html = meta + html
                }
                data = Data(html.utf8)
            }
            let response = URLResponse(
                url: url,
                mimeType: mime,
                expectedContentLength: data.count,
                textEncodingName: mime.hasPrefix("text/") || mime.contains("json") ? "utf-8" : nil
            )
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            task.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    private static func escapeAttribute(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}

@MainActor
private final class PreviewNavigationDelegate: NSObject, WKNavigationDelegate {
    let policy: PreviewSecurityPolicy

    init(policy: PreviewSecurityPolicy) { self.policy = policy }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, policy.allows(url) else {
            return .cancel
        }
        return .allow
    }
}

@MainActor
final class StaticPreviewHost {
    let webView: WKWebView
    private let schemeHandler: PreviewSchemeHandler
    private let navigationDelegate: PreviewNavigationDelegate

    init(root: URL, sessionID: String = UUID().uuidString.lowercased()) async throws {
        let policy = PreviewSecurityPolicy(sessionID: sessionID)
        schemeHandler = PreviewSchemeHandler(root: root, policy: policy)
        navigationDelegate = PreviewNavigationDelegate(policy: policy)
        let configuration = Self.makeConfiguration()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "ideatiles-preview")
        let ruleList = try await Self.compileNetworkBlocker()
        configuration.userContentController.add(ruleList)
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = navigationDelegate
        webView.load(URLRequest(url: URL(string: "ideatiles-preview://\(sessionID)/index.html")!))
    }

    static func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController = WKUserContentController()
        return configuration
    }

    private static func compileNetworkBlocker() async throws -> WKContentRuleList {
        try await withCheckedThrowingContinuation { continuation in
            WKContentRuleListStore.default().compileContentRuleList(
                forIdentifier: "app.ideatiles.preview.network-block-v1",
                encodedContentRuleList: PreviewSecurityPolicy.contentBlockerRules
            ) { ruleList, error in
                if let ruleList { continuation.resume(returning: ruleList) }
                else { continuation.resume(throwing: error ?? ResourceServingError.invalidPath) }
            }
        }
    }
}
