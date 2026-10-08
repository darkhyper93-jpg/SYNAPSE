package com.darkhyper93.synapse;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DisplayPlugin.class);
        super.onCreate(savedInstanceState);
        // By default the WebView multiplies every text by the system font size, on top of the game's
        // own text size (Settings > Text size), and the layouts overflow. Only the in-app size applies;
        // DisplayPlugin tells the game the system size so it can start from the closest in-app one.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setTextZoom(100);
        }
    }
}
