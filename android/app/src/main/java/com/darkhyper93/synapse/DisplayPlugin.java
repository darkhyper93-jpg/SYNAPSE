package com.darkhyper93.synapse;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Reports the system font size so the game can pick its closest in-app text size (see MainActivity). */
@CapacitorPlugin(name = "Display")
public class DisplayPlugin extends Plugin {

    @PluginMethod
    public void getFontScale(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("fontScale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(ret);
    }
}
