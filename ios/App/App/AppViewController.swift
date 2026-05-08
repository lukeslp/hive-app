import Capacitor

/// Custom Capacitor bridge view controller. Exists solely to register
/// app-local plugins (Swift files in the App target, not from npm/SPM)
/// with the Capacitor bridge during initialization.
///
/// Without this, the JS-side `registerPlugin<FoundationModelsPlugin>("FoundationModels")`
/// has nothing to find on the native side — the bridge only auto-discovers
/// plugins loaded via SPM. App-local plugins must be registered manually
/// in `capacitorDidLoad()`.
///
/// Wired via `Main.storyboard` — the bridge view controller's class is
/// set to `App.AppViewController` instead of the default
/// `Capacitor.CAPBridgeViewController`.
public class AppViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FoundationModelsPlugin())
    }
}
