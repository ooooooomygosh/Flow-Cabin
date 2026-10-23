package cn.flowcabin.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.LinkedHashSet;

@CapacitorPlugin(name = "CabinDevice")
public class CabinDevicePlugin extends Plugin {
    private CabinStore store;
    private final java.util.concurrent.ExecutorService work = java.util.concurrent.Executors.newFixedThreadPool(4);
    private final java.util.concurrent.ExecutorService storageWork = java.util.concurrent.Executors.newSingleThreadExecutor();
    @Override protected void handleOnDestroy() { work.shutdownNow(); storageWork.shutdown(); super.handleOnDestroy(); }
    @Override public void load() { store = new CabinStore(getContext()); }
    @PluginMethod public void startMusic(PluginCall call) {
        work.execute(() -> { try { CabinMusic.get(getContext()).awaitReady(); call.resolve(new JSObject().put("ready", true)); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    @PluginMethod public void musicRequest(PluginCall call) {
        String path = call.getString("path", "");
        if (!path.matches("/(config|quality|search|playlists|playlist|playlist/link|resolve|lyrics|track-cover|ma/players|ma/state|ma/control)(\\?[^#]*)?")) { call.reject("不支持此音源请求。"); return; }
        work.execute(() -> { try { call.resolve(new JSObject(CabinMusic.get(getContext()).request("/music" + path, call.getString("body")).toString())); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    @PluginMethod public void catalogRequest(PluginCall call) {
        String query = call.getString("query", ""); if (query.length() > 2400 || query.contains("#") || query.contains("\r") || query.contains("\n")) { call.reject("搜索条件无效。"); return; }
        work.execute(() -> { try { call.resolve(new JSObject(CabinMusic.get(getContext()).request("/catalog?" + query, null).toString())); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    @PluginMethod public void musicLogin(PluginCall call) {
        String provider = call.getString("provider", ""); if (!provider.equals("qq") && !provider.equals("netease")) { call.reject("不支持此平台。"); return; }
        startActivityForResult(call, new Intent(getContext(), MusicLoginActivity.class).putExtra("provider", provider), "musicLoggedIn");
    }
    @ActivityCallback private void musicLoggedIn(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("ok", false).put("cancelled", true)); return; }
        String provider = result.getData().getStringExtra("provider"), cookie = result.getData().getStringExtra("cookie");
        work.execute(() -> { try { JSObject body = new JSObject().put("provider", provider).put("cookie", cookie); call.resolve(new JSObject(CabinMusic.get(getContext()).request("/native/session", body.toString()).toString())); } catch (Exception e) { call.reject("登录凭据未能加密保存，请重试。"); } });
    }
    @PluginMethod public void musicLogout(PluginCall call) {
        String provider = call.getString("provider", ""); if (!provider.equals("qq") && !provider.equals("netease")) { call.reject("不支持此平台。"); return; }
        work.execute(() -> { try { CabinMusic.get(getContext()).request("/native/session", new JSObject().put("provider", provider).put("cookie", "").toString()); call.resolve(new JSObject().put("ok", true)); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    @PluginMethod public void loadData(PluginCall call) {
        storageWork.execute(() -> { try { call.resolve(new JSObject(store.read().toString())); } catch (Exception e) { call.reject("无法读取本机小屋数据库，原数据保持不变。"); } });
    }
    @PluginMethod public void saveData(PluginCall call) {
        storageWork.execute(() -> { try { store.apply(call.getArray("changes")); call.resolve(); } catch (Exception e) { call.reject("手机数据库写入失败，请检查剩余空间后重试。"); } });
    }
    @PluginMethod public void setImmersive(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (Boolean.TRUE.equals(call.getBoolean("enabled"))) controller.hide(WindowInsetsCompat.Type.systemBars()); else controller.show(WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }
    @PluginMethod public void saveFile(PluginCall call) {
        String name = call.getString("filename", "Flow-Cabin.json"), data = call.getString("data", "");
        if (name.length() > 180 || data.length() > 34 * 1024 * 1024 || !data.matches("[A-Za-z0-9+/]*={0,2}")) { call.reject("导出文件无效或过大。"); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream")); intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
        startActivityForResult(call, intent, "fileSaved");
    }
    @ActivityCallback private void fileSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { call.resolve(new JSObject().put("cancelled", true)); return; }
        work.execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new IllegalStateException(); stream.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT)); stream.flush(); call.resolve(new JSObject().put("cancelled", false));
            } catch (Exception e) { call.reject("文件未能保存到选定位置，请重试。"); }
        });
    }
    @PluginMethod public void pickMusic(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "musicPicked");
    }
    private String metadata(MediaMetadataRetriever reader, int key, String fallback) { String value = reader.extractMetadata(key); return value == null || value.trim().isEmpty() ? fallback : value; }
    @ActivityCallback private void musicPicked(PluginCall call, ActivityResult result) {
        if (call == null) return; Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) { call.resolve(new JSObject().put("tracks", new JSArray())); return; }
        LinkedHashSet<Uri> chosen = new LinkedHashSet<>();
        if (data.getClipData() != null) for (int i = 0; i < Math.min(200, data.getClipData().getItemCount()); i++) chosen.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) chosen.add(data.getData());
        work.execute(() -> {
            JSArray tracks = new JSArray();
            try {
                for (Uri uri : chosen) {
                    if (!"content".equals(uri.getScheme())) continue;
                    getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    String name = "本地歌曲";
                    try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) { if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0); }
                    JSObject track = new JSObject().put("uri", uri.toString()).put("name", name).put("title", name.replaceFirst("\\.[^.]+$", "")).put("artist", "未知歌手").put("album", "手机音乐");
                    MediaMetadataRetriever reader = new MediaMetadataRetriever();
                    try {
                        reader.setDataSource(getContext(), uri);
                        track.put("title", metadata(reader, MediaMetadataRetriever.METADATA_KEY_TITLE, track.getString("title")));
                        track.put("artist", metadata(reader, MediaMetadataRetriever.METADATA_KEY_ARTIST, "未知歌手"));
                        track.put("album", metadata(reader, MediaMetadataRetriever.METADATA_KEY_ALBUM, "手机音乐"));
                        track.put("year", metadata(reader, MediaMetadataRetriever.METADATA_KEY_YEAR, ""));
                        track.put("track", metadata(reader, MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER, "0").split("/")[0]);
                        track.put("duration", metadata(reader, MediaMetadataRetriever.METADATA_KEY_DURATION, "0"));
                        byte[] art = reader.getEmbeddedPicture();
                        if (art != null && art.length < 4 * 1024 * 1024) {
                            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(art, 0, art.length, bounds);
                            bounds.inJustDecodeBounds = false; bounds.inSampleSize = Math.max(1, Math.max(bounds.outWidth, bounds.outHeight) / 500);
                            Bitmap image = BitmapFactory.decodeByteArray(art, 0, art.length, bounds);
                            if (image != null) { ByteArrayOutputStream output = new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG, 75, output); image.recycle(); if (output.size() < 250000) track.put("cover", "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)); }
                        }
                    } catch (Exception ignored) { /* Untagged files remain importable by filename. */ }
                    finally { reader.release(); }
                    tracks.put(track);
                }
                call.resolve(new JSObject().put("tracks", tracks));
            } catch (Exception e) { call.reject("无法保留所选文件的访问权限，请从手机系统文件选择器重选。"); }
        });
    }
}
