import AppKit
import Foundation
import SwiftUI
@preconcurrency import WebKit

struct AppNavigationPolicy: Sendable {
    func allows(_ url: URL) -> Bool {
        url.scheme == "ideatiles" && url.host == "app" && url.user == nil && url.password == nil && url.port == nil
    }
}

struct BridgeMessageOriginPolicy: Sendable {
    func allows(isMainFrame: Bool, sourceURL: URL?) -> Bool {
        isMainFrame && sourceURL.map(AppNavigationPolicy().allows) == true
    }
}

enum AppContentSecurityPolicy {
    static let contentSecurityPolicy = [
        "default-src 'self'",
        "base-uri 'self'",
        "connect-src 'self' https://ideatiles.app wss://ideatiles.app",
        "form-action 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https://ideatiles.app data: blob:",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
    ].joined(separator: "; ")

    static let contentBlockerRules = #"""
    [
      {"trigger":{"url-filter":"^https?://.*","unless-domain":["ideatiles.app"]},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^wss?://.*","unless-domain":["ideatiles.app"]},"action":{"type":"block"}}
    ]
    """#
}

@MainActor
fileprivate final class AppNavigationDelegate: NSObject, WKNavigationDelegate {
    private let policy = AppNavigationPolicy()

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if policy.allows(url) { return .allow }
        if navigationAction.navigationType == .linkActivated,
           url.scheme == "https" || url.scheme == "http" {
            NSWorkspace.shared.open(url)
        }
        return .cancel
    }
}

@MainActor
fileprivate final class MacScriptMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    let dispatcher: BridgeDispatcher

    init(dispatcher: BridgeDispatcher) { self.dispatcher = dispatcher }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        guard BridgeMessageOriginPolicy().allows(
            isMainFrame: message.frameInfo.isMainFrame,
            sourceURL: message.frameInfo.request.url
        ) else {
            replyHandler(nil, "Native bridge messages are accepted only from the Idea Tiles main frame.")
            return
        }
        let data: Data
        if JSONSerialization.isValidJSONObject(message.body),
           let encoded = try? JSONSerialization.data(withJSONObject: message.body) {
            data = encoded
        } else {
            data = Data("null".utf8)
        }
        Task {
            let responseData = await dispatcher.dispatch(data)
            let response = try? JSONSerialization.jsonObject(with: responseData)
            replyHandler(response, nil)
        }
    }
}

@MainActor
final class MacRuntime {
    let repository: ArtifactRepository
    fileprivate let dispatcher: BridgeDispatcher
    fileprivate let messageHandler: MacScriptMessageHandler
    fileprivate let schemeHandler: BundleSchemeHandler
    fileprivate let navigationDelegate = AppNavigationDelegate()

    init() throws {
        guard let resourceRoot = Bundle.main.url(forResource: "WebApp", withExtension: nil) else {
            throw ResourceServingError.missingResource
        }
        let repository = try ArtifactRepository.applicationSupport()
        let router = NativeBridgeRouter(repository: repository) { manifest in
            let boardPayload = try? await repository.boardPayload(id: manifest.provenance.sourceBoardId)
            return try await FilePanelService.export(manifest, boardPayload: boardPayload)
        }
        let dispatcher = BridgeDispatcher(operation: router.execute)
        self.repository = repository
        self.dispatcher = dispatcher
        messageHandler = MacScriptMessageHandler(dispatcher: dispatcher)
        schemeHandler = BundleSchemeHandler(root: resourceRoot)
    }

    func importPackage() async {
        do {
            guard let package = try await FilePanelService.openPackage() else { return }
            _ = try await repository.saveBoard(
                id: package.boardID,
                title: "Imported Idea Tiles Board",
                payload: package.boardPayload
            )
            _ = try await repository.saveArtifact(package.manifest, payloads: package.payloads)
        } catch {
            let alert = NSAlert(error: error)
            alert.messageText = "The Idea Tiles package could not be imported."
            alert.runModal()
        }
    }
}

struct AppWebView: NSViewRepresentable {
    let runtime: MacRuntime

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(runtime.schemeHandler, forURLScheme: "ideatiles")
        let contentController = WKUserContentController()
        contentController.addUserScript(WKUserScript(
            source: MacBridgeBootstrap.javaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))
        contentController.addScriptMessageHandler(
            runtime.messageHandler,
            contentWorld: .page,
            name: "ideaTilesBridge"
        )
        configuration.userContentController = contentController

        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "app.ideatiles.main.network-allowlist-v1",
            encodedContentRuleList: AppContentSecurityPolicy.contentBlockerRules
        ) { ruleList, _ in
            if let ruleList { contentController.add(ruleList) }
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = runtime.navigationDelegate
        webView.allowsMagnification = true
        webView.load(URLRequest(url: URL(string: "ideatiles://app/index.html")!))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}

    static func dismantleNSView(_ webView: WKWebView, coordinator: Void) {
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "ideaTilesBridge", contentWorld: .page)
    }
}
