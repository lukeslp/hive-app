/**
 * File Purpose: Configure the shared Capacitor shells for Idea Tiles.
 * Primary Components: Platform identity, native HTTP, and splash behavior.
 * I/O: Reads CAPACITOR_APP_ID during sync and emits native platform config.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID?.trim() || "app.hexmind.ios",
  appName: "Idea Tiles",
  webDir: "dist/public",
  // Production: ship info/warn/error to the native log but suppress the
  // debug-level bridge chatter (`⚡️ To Native ->` plugin call traces and
  // JS↔native message bodies) that we used during the FoundationModels
  // dispatch bisect. Switch back to 'debug' for diagnostic sessions.
  loggingBehavior: "production",
  // SwiftPM's named `.v26` platform constant requires PackageDescription 6.2.
  // Capacitor derives that constant from the Xcode deployment target during sync.
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: "6.2",
      },
    },
  },
  plugins: {
    // Patch fetch + XMLHttpRequest in the WebView to route through
    // native HTTP. Bypasses WKWebView's CORS entirely — the live
    // hivemind server's preflight response only includes
    // Access-Control-Allow-Origin (no -Methods or -Headers), so
    // browser CORS rejects the POST to /api/generate. Native HTTP
    // doesn't enforce CORS, so this works without changing the
    // production server.
    CapacitorHttp: {
      enabled: true,
    },
    // Splash plugin keeps the native LaunchScreen visible until JS calls
    // SplashScreen.hide() in main.tsx after React mounts. Without this,
    // the launch storyboard disappears the instant Capacitor mounts the
    // WKWebView, leaving a blank screen for the rest of the boot
    // (~7-16s on cold launch per Xcode console traces).
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      // Matches splash PNG fill from assets/sync_app_icon_from_master.py (corner
      // inference on the normalized icon master; regenerate if the master changes).
      // Covers the transient pre-image flash — Launch Screen assets match the logo.
      backgroundColor: "#c2cfe8",
      showSpinner: true,
      iosSpinnerStyle: "medium",
      spinnerColor: "#fbbf24",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
