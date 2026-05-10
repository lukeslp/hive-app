import Capacitor

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
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FoundationModelsPlugin())

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
}
