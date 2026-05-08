import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.dreamer.hexpand',
  appName: 'Hexpand',
  webDir: 'dist/public',
  // Force-forward all JS console levels (log/warn/info/debug) to the
  // native log. Capacitor 8's default for some configs hides log/info,
  // which is why our [AI] diagnostics didn't show up in Xcode's console.
  loggingBehavior: 'debug',
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
  },
};

export default config;
