package cn.flowcabin.app;

import android.content.Context;
import android.webkit.WebResourceResponse;
import com.caoccao.javet.annotations.V8Function;
import com.caoccao.javet.interop.NodeRuntime;
import com.caoccao.javet.interop.V8Host;
import com.caoccao.javet.node.modules.NodeModuleModule;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** One private Node worker per app process. No service address/token enters the renderer. */
public final class CabinMusic {
    private static CabinMusic instance;
    public static synchronized CabinMusic get(Context context) { if (instance == null) instance = new CabinMusic(context.getApplicationContext()); return instance; }
    private final Context context;
    private final CountDownLatch ready = new CountDownLatch(1);
    private final String token;
    private volatile int port;
    private volatile boolean failed;
    private CabinMusic(Context context) {
        this.context = context; byte[] random = new byte[32]; new SecureRandom().nextBytes(random); token = android.util.Base64.encodeToString(random, android.util.Base64.NO_WRAP);
        new Thread(this::run, "cabin-portable-music").start();
    }
    private void copyAssets(String assetPath, File destination) throws IOException {
        String[] children = context.getAssets().list(assetPath);
        if (children != null && children.length > 0) { destination.mkdirs(); for (String child : children) copyAssets(assetPath + "/" + child, new File(destination, child)); }
        else { destination.getParentFile().mkdirs(); try (InputStream input = context.getAssets().open(assetPath); OutputStream output = new FileOutputStream(destination)) { byte[] chunk = new byte[16384]; int size; while ((size = input.read(chunk)) != -1) output.write(chunk, 0, size); } }
    }
    private void run() {
        try {
            // Versioned code is replaceable; credentials live separately and are never overwritten.
            String fingerprint; try (InputStream input = context.getAssets().open("cabin-backend/runtime-id.txt")) { byte[] value = new byte[64]; int count = input.read(value); fingerprint = new String(value, 0, Math.max(count,0), StandardCharsets.UTF_8).trim(); }
            if (!fingerprint.matches("[a-f0-9]{20}")) throw new IOException("Invalid runtime identifier");
            File code = new File(context.getNoBackupFilesDir(), "music-runtime-" + BuildConfig.VERSION_CODE + "-" + fingerprint);
            if (!new File(code, ".ready").exists()) { copyAssets("cabin-backend", code); new File(code, ".ready").createNewFile(); }
            File data = new File(context.getNoBackupFilesDir(), "music-account"), cache = new File(context.getCacheDir(), "music-node"); data.mkdirs(); cache.mkdirs();
            JSONObject options = new JSONObject().put("directory", data.getAbsolutePath()).put("cache", cache.getAbsolutePath()).put("token", token);
            try (NodeRuntime runtime = V8Host.getNodeInstance().createV8Runtime()) {
                // Trusted, packaged Node dependencies use Function() internally
                // (e.g. Express/depd). This does not relax the renderer's CSP.
                runtime.allowEval(true);
                runtime.getNodeModule(NodeModuleModule.class).setRequireRootDirectory(code);
                runtime.getGlobalObject().bind(new CabinCredentials()); runtime.getGlobalObject().bind(this);
                runtime.getExecutor("globalThis.cabinOptions=" + options + ";").executeVoid();
                runtime.getExecutor("require('./main.cjs')").executeVoid(); runtime.await();
            }
        } catch (Throwable error) { failed = true; ready.countDown(); android.util.Log.e("FlowCabin", "Embedded music runtime could not start: " + error.getClass().getSimpleName()); }
    }
    @V8Function(name = "cabinReady") public void started(int port) { this.port = port; ready.countDown(); }
    @V8Function(name = "cabinFailed") public void failure(String reason) { failed = true; ready.countDown(); }
    public void awaitReady() throws Exception { if (!ready.await(40, TimeUnit.SECONDS) || failed || port == 0) throw new IOException("手机音乐服务未能启动，请重新打开应用；当前设备需要 64 位 Android。"); }
    private HttpURLConnection open(String path, String body, String range) throws Exception {
        awaitReady(); HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port + path).openConnection();
        connection.setConnectTimeout(5000); connection.setReadTimeout(25000); connection.setInstanceFollowRedirects(false); connection.setRequestProperty("x-cabin-native-token", token);
        if (range != null && range.matches("bytes=\\d*-\\d*")) connection.setRequestProperty("Range", range);
        if (body != null) { connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); try (OutputStream output = connection.getOutputStream()) { output.write(body.getBytes(StandardCharsets.UTF_8)); } }
        return connection;
    }
    public JSONObject request(String path, String body) throws Exception {
        HttpURLConnection connection = open(path, body, null);
        try { int status = connection.getResponseCode(); InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) throw new IOException("音源服务未返回数据。");
            ByteArrayOutputStream output = new ByteArrayOutputStream(); try (stream) { byte[] chunk = new byte[8192]; int size; while ((size = stream.read(chunk)) != -1) { if (output.size() + size > 8 * 1024 * 1024) throw new IOException("响应过大。"); output.write(chunk, 0, size); } }
            JSONObject result = new JSONObject(output.toString("UTF-8")); if (status >= 400 || result.has("error")) throw new IOException(result.optString("error", "音源请求失败。")); return result;
        } finally { connection.disconnect(); }
    }
    public WebResourceResponse audio(String path, String range) throws Exception {
        if (!path.matches("/audio/[a-f0-9]{48}")) throw new IOException("Invalid audio path");
        HttpURLConnection connection = open("/music" + path, null, range); int status = connection.getResponseCode();
        InputStream source = status < 400 ? connection.getInputStream() : connection.getErrorStream(); if (source == null) { connection.disconnect(); throw new IOException("No audio"); }
        InputStream stream = new FilterInputStream(source) { @Override public void close() throws IOException { try { super.close(); } finally { connection.disconnect(); } } };
        Map<String, String> headers = new HashMap<>(); for (String name : new String[] { "Content-Length", "Content-Range", "Accept-Ranges", "Content-Type" }) { String value = connection.getHeaderField(name); if (value != null) headers.put(name, value); }
        headers.put("Cache-Control", "no-store"); return new WebResourceResponse(connection.getContentType() == null ? "audio/mpeg" : connection.getContentType().split(";")[0], null, status, status < 400 ? "OK" : "Unavailable", headers, stream);
    }
}
