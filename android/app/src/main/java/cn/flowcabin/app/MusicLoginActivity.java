package cn.flowcabin.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.*;

/** Official HTTPS pages in a separate process/profile, with no native JS bridge. */
public class MusicLoginActivity extends Activity {
    private static boolean profileSet;
    private WebView web;
    private String provider;
    private boolean finished;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable poll = new Runnable() { @Override public void run() { if (!finished) { check(); handler.postDelayed(this, 1200); } } };
    private boolean allowed(Uri uri) {
        String host = uri.getHost(); if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getPort() != -1) return false;
        for (String domain : "qq".equals(provider) ? new String[]{"qq.com"} : new String[]{"163.com", "netease.com"}) if (host.equals(domain) || host.endsWith("." + domain)) return true;
        return false;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); provider = getIntent().getStringExtra("provider"); if (!"qq".equals(provider) && !"netease".equals(provider)) { finish(); return; }
        if (!profileSet) { WebView.setDataDirectorySuffix("cabin-platform-login"); profileSet = true; }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(35,26,20));
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> { androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()); view.setPadding(safe.left, safe.top, safe.right, safe.bottom); return insets; });
        LinearLayout bar = new LinearLayout(this); bar.setGravity(android.view.Gravity.CENTER_VERTICAL); TextView title = new TextView(this); title.setText("qq".equals(provider) ? "QQ 音乐官方登录" : "网易云音乐官方登录"); title.setTextColor(Color.WHITE); title.setTextSize(16); title.setGravity(android.view.Gravity.CENTER_VERTICAL); bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        Button close = new Button(this); close.setText("取消"); close.setOnClickListener(view -> complete(null)); bar.addView(close); root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(52 * getResources().getDisplayMetrics().density)));
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1)); setContentView(root);
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true); web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false); web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); web.getSettings().setSupportMultipleWindows(false);
        // Keep the same official browser login route as Portable; mobile landing
        // pages otherwise replace sign-in with an app-install prompt.
        web.getSettings().setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        web.getSettings().setUseWideViewPort(true); web.getSettings().setLoadWithOverviewMode(true);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !allowed(request.getUrl()); }
            @Override public void onPageFinished(WebView view, String url) { check(); }
        });
        CookieManager.getInstance().removeAllCookies(value -> { CookieManager.getInstance().flush(); web.loadUrl("qq".equals(provider) ? "https://y.qq.com/n/ryqq/profile" : "https://music.163.com/#/login"); handler.postDelayed(poll, 1200); });
        handler.postDelayed(() -> complete(null), 10 * 60 * 1000);
    }
    private void check() {
        if (finished) return; LinkedHashMap<String,String> cookies = new LinkedHashMap<>();
        String[] origins = "qq".equals(provider) ? new String[]{"https://qq.com", "https://y.qq.com", "https://qqmusic.qq.com", "https://u.y.qq.com", "https://ssl.ptlogin2.qq.com"} : new String[]{"https://music.163.com", "https://interface.music.163.com"};
        for (String origin : origins) { String text = CookieManager.getInstance().getCookie(origin); if (text != null) for (String part : text.split(";")) { int at = part.indexOf('='); if (at > 0) cookies.put(part.substring(0,at).trim(), part.substring(at+1).trim()); } }
        boolean valid;
        if ("qq".equals(provider)) { String uin = cookies.getOrDefault("uin", cookies.getOrDefault("qqmusic_uin", cookies.getOrDefault("wxuin", ""))).replaceAll("\\D", ""); valid = !uin.isEmpty() && (nonempty(cookies, "qm_keyst") || nonempty(cookies, "qqmusic_key") || nonempty(cookies, "music_key") || nonempty(cookies, "wxskey")); }
        else valid = nonempty(cookies, "MUSIC_U");
        if (valid) { StringBuilder text = new StringBuilder(); for (Map.Entry<String,String> entry : cookies.entrySet()) { if (text.length() > 0) text.append("; "); text.append(entry.getKey()).append('=').append(entry.getValue()); } if (text.length() <= 16384) complete(text.toString()); }
    }
    private boolean nonempty(Map<String,String> values, String key) { return !values.getOrDefault(key, "").isEmpty(); }
    private void complete(String cookie) {
        if (finished) return; finished = true; handler.removeCallbacksAndMessages(null);
        // Retain only the Keystore-encrypted app credential, not a second plaintext WebView cookie database.
        CookieManager.getInstance().removeAllCookies(value -> { CookieManager.getInstance().flush(); if (cookie != null) setResult(RESULT_OK, new Intent().putExtra("provider", provider).putExtra("cookie", cookie)); else setResult(RESULT_CANCELED); finish(); });
    }
    @Override public void onBackPressed() { complete(null); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); if (web != null) { web.stopLoading(); web.clearCache(true); web.destroy(); } super.onDestroy(); }
}
