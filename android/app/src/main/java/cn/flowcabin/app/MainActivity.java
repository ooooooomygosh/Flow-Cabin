package cn.flowcabin.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(CabinDevicePlugin.class);
        super.onCreate(state);
    }
}
