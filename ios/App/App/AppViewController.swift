import Capacitor
import WebKit

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Custom Capacitor bridge view controller. Exists to register app-local
/// plugins (Swift files in the App target, not from npm/SPM) with the
/// Capacitor bridge during initialization, plus a small set of native
/// boot-time tweaks that the JS layer can't do.
///
/// Without manual registration, the JS-side
/// `registerPlugin<FoundationModelsPlugin>("FoundationModels")` has nothing
/// to find on the native side — the bridge only auto-discovers plugins
/// loaded via SPM. App-local plugins must be registered manually in
/// `capacitorDidLoad()`.
///
/// Wired via `Main.storyboard` — the bridge view controller's class is set
/// to `App.AppViewController` instead of the default
/// `Capacitor.CAPBridgeViewController`.
public class AppViewController: CAPBridgeViewController {
    /// iPhone Duo: tells the page where the fold is (DuoBridge.swift plus the
    /// bundled duo-fold.js shim), so the board and the inspect pane each take a
    /// page on the inner screen held sideways.
    private var duo: DuoBridge?

    public override func capacitorDidLoad() {
        // Made here, on the web view's own configuration, before the first page
        // loads. A bridge made in `webViewConfiguration(for:)` never reaches the
        // page: Capacitor 8 swaps the user content controller after that hook.
        if let webView {
            duo = DuoBridge(configuration: webView.configuration)
            duo?.attach(to: webView)
        }
        bridge?.registerPluginInstance(FoundationModelsPlugin())

        #if DEBUG
        // Store screenshots only (scripts/capture-duo.sh): `-IdeaTilesShot <scene>`
        // picks a sample scene, so no taps are needed. The page honors it only when
        // its payload was built with VITE_IDEATILES_SHOWCASE_HOOK=1. Compiled out of Release.
        if let scene = UserDefaults.standard.string(forKey: "IdeaTilesShot"),
           scene.range(of: "^[a-z]+$", options: .regularExpression) != nil,
           let webView {
            webView.configuration.userContentController.addUserScript(WKUserScript(
                source: "window.__ideaTilesShowcase = '\(scene)';",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
            NSLog("IdeaTilesShot: %@", scene)
        }
        #endif

        // Pull-to-refresh on the WKWebView fires accidentally during the
        // expand-cascade animation when a user pans near the top edge.
        // The app has no refresh semantics — disable the bounce entirely.
        webView?.scrollView.bounces = false

        // Warm Apple Intelligence so the first user-tap on a fresh launch
        // doesn't pay the full cold-start cost (4-8s observed on real
        // hardware vs 1-2s warm). Best-effort and silent — if the model
        // is unavailable, off-device, or throws, the regular dispatch
        // path still works unwarmed.
        if #available(iOS 26.0, *) {
            #if canImport(FoundationModels)
            Task.detached(priority: .utility) {
                let model = SystemLanguageModel.default
                guard case .available = model.availability else { return }
                let session = LanguageModelSession()
                session.prewarm()
            }
            #endif
        }
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        duo?.refresh()
    }
}
