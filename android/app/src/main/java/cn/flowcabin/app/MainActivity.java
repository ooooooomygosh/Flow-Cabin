package cn.flowcabin.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private Insets safeInsets = Insets.NONE;
    private boolean imeVisible;

    @Override public void onCreate(Bundle state) {
        registerPlugin(CabinDevicePlugin.class);
        super.onCreate(state);
        configureEdgeToEdge();
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                publishInsets();
                ViewCompat.requestApplyInsets(getWindow().getDecorView());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && "/api/search".equals(uri.getPath()) && "GET".equals(request.getMethod())) {
                    try { String value = CabinMusic.get(MainActivity.this).request("/catalog?" + (uri.getEncodedQuery() == null ? "" : uri.getEncodedQuery()), null).toString(); return new WebResourceResponse("application/json", "UTF-8", new java.io.ByteArrayInputStream(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
                    catch (Exception error) { return new WebResourceResponse("application/json", "UTF-8", 503, "Unavailable", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream("{\"error\":\"音乐搜索暂不可用，请检查网络后重试。\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
                }
                if ("https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/desktop-music/audio/")) {
                    try { return CabinMusic.get(MainActivity.this).audio(uri.getPath().substring("/desktop-music".length()), request.getRequestHeaders().get("Range")); }
                    catch (Exception error) { return new WebResourceResponse("text/plain", "UTF-8", 503, "Unavailable", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0])); }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void configureEdgeToEdge() {
        // Own inset handling on every supported WebView, including Chromium <140.
        // Padding the whole decor leaves solid bars above/beside the illustration.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().setStatusBarContrastEnforced(false);
        getWindow().setNavigationBarContrastEnforced(false);
        WindowManager.LayoutParams attrs = getWindow().getAttributes();
        attrs.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
            ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(attrs);
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            safeInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            // Only the keyboard resizes the WebView. Scene backgrounds reach all
            // screen edges; CSS applies the safe area to interactive controls.
            view.setPadding(0, 0, 0, imeVisible ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
            publishInsets();
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setDisplayCutout(null).build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    private void publishInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        String js = "(()=>{const r=document.documentElement;if(!r)return;" +
            "const values={top:" + safeInsets.top / density + ",right:" + safeInsets.right / density +
            ",bottom:" + (imeVisible ? 0 : safeInsets.bottom / density) + ",left:" + safeInsets.left / density + "};" +
            "let changed=false;for(const [side,value] of Object.entries(values)){const key='--safe-area-inset-'+side,v=value+'px';" +
            "if(r.style.getPropertyValue(key)!==v){r.style.setProperty(key,v);changed=true;}}" +
            "if(r.dataset.nativeKeyboard!=='" + imeVisible + "'){r.dataset.nativeKeyboard='" + imeVisible + "';changed=true;}" +
            "if(changed)window.dispatchEvent(new Event('resize'));})();";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
