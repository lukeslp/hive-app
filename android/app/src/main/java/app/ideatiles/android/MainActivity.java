/*
 * File Purpose: Host the Idea Tiles Capacitor WebView and register app-local plugins.
 * Primary Components: MainActivity, GemmaPlugin registration.
 * I/O: Receives Android lifecycle events and exposes native plugin calls to the WebView.
 */
package app.ideatiles.android;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AICorePlugin.class);
        registerPlugin(GemmaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
