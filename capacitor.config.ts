import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.hexmind.ios',
  appName: 'Hexmind',
  webDir: 'dist/public',
  // Production: ship info/warn/error to the native log but suppress the
  // debug-level bridge chatter (`⚡️ To Native ->` plugin call traces and
  // JS↔native message bodies) that we used during the FoundationModels
  // dispatch bisect. Switch back to 'debug' for diagnostic sessions.
  loggingBehavior: 'production',
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
      backgroundColor: '#0a0a0a',
      showSpinner: true,
      iosSpinnerStyle: 'large',
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
