package cn.flowcabin.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(CabinDevicePlugin.class);
        super.onCreate(state);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
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
}
