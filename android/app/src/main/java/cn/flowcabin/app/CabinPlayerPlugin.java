package cn.flowcabin.app;

import android.content.ComponentName;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.common.MediaItem;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

@CapacitorPlugin(name = "CabinPlayer")
@androidx.media3.common.util.UnstableApi
public final class CabinPlayerPlugin extends Plugin {
    private ListenableFuture<MediaController> future;
    private MediaController player;
    private boolean destroyed;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() { public void run() { if (player != null) notifyListeners("state", snapshot()); handler.postDelayed(this, 250); } };
    private void withPlayer(PluginCall call, Runnable task) {
        handler.post(() -> {
            if (destroyed) { call.reject("播放器已关闭。"); return; }
            if (player != null) { try { task.run(); } catch (Exception e) { call.reject("播放器操作失败。"); } return; }
            if (future == null) future = new MediaController.Builder(getContext(), new SessionToken(getContext(), new ComponentName(getContext(), CabinPlaybackService.class))).buildAsync();
            future.addListener(() -> { if (destroyed) { call.reject("播放器已关闭。"); return; } try { if (player == null) { player = future.get(); handler.post(ticker); } task.run(); } catch (Exception e) { call.reject("原生播放器未能连接。"); } }, ContextCompat.getMainExecutor(getContext()));
        });
    }
    private JSObject snapshot() {
        MediaItem item = player.getCurrentMediaItem();
        return new JSObject().put("playing", player.isPlaying()).put("status", player.getPlayerError() != null ? "error" : player.getPlaybackState() == 4 ? "ended" : player.getPlaybackState() == 2 ? "buffering" : player.isPlaying() ? "playing" : "paused")
            .put("position", player.getCurrentPosition() / 1000.0).put("duration", player.getDuration() == C.TIME_UNSET ? 0 : player.getDuration() / 1000.0)
            .put("repeat", player.getRepeatMode() == Player.REPEAT_MODE_ONE ? "one" : player.getRepeatMode() == Player.REPEAT_MODE_ALL ? "all" : "off").put("shuffle", player.getShuffleModeEnabled())
            .put("recordId", item == null || item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("recordId", "")).put("trackIndex", item == null || item.mediaMetadata.extras == null ? 0 : item.mediaMetadata.extras.getInt("trackIndex", 0))
            .put("index", player.getCurrentMediaItemIndex()).put("mediaId", item == null ? "" : item.mediaId).put("title", item == null ? "" : String.valueOf(item.mediaMetadata.title))
            .put("error", player.getPlayerError() == null ? "" : "播放中断，请检查音源授权或文件权限后重试。");
    }
    @PluginMethod public void state(PluginCall call) { withPlayer(call, () -> call.resolve(snapshot())); }
    @PluginMethod public void queue(PluginCall call) {
        JSArray queue = call.getArray("items", new JSArray());
        if (queue.length() == 0 || queue.length() > 500) { call.reject("队列需包含 1–500 首歌曲。"); return; }
        final ArrayList<MediaItem> items = new ArrayList<>();
        try { for (int i = 0; i < queue.length(); i++) items.add(CabinPlaybackService.item(queue.getJSONObject(i))); }
        catch (Exception e) { call.reject(e.getMessage()); return; }
        int index = call.getInt("index", 0); if (index < 0 || index >= items.size()) { call.reject("无效的播放位置。"); return; }
        withPlayer(call, () -> { player.pause(); player.setMediaItems(items, index, Math.max(0, (long)(call.getDouble("position", 0.0) * 1000))); player.prepare(); if (call.getBoolean("play", true)) player.play(); call.resolve(snapshot()); });
    }
    @PluginMethod public void command(PluginCall call) { withPlayer(call, () -> {
        switch (call.getString("action", "")) {
            case "shuffle": player.setShuffleModeEnabled(call.getBoolean("enabled", false)); break;
            case "repeat": String mode = call.getString("mode", "off"); player.setRepeatMode("one".equals(mode) ? Player.REPEAT_MODE_ONE : "all".equals(mode) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF); break;
            case "play": if (player.getPlaybackState() == androidx.media3.common.Player.STATE_IDLE) player.prepare(); player.play(); break;
            case "pause": player.pause(); break;
            case "stop": player.stop(); player.clearMediaItems(); break;
            case "next": player.seekToNextMediaItem(); break;
            case "previous": player.seekToPreviousMediaItem(); break;
            case "seek": player.seekTo(Math.max(0, (long)(call.getDouble("value", 0.0) * 1000))); break;
            case "volume": player.setVolume((float)Math.max(0, Math.min(1, call.getDouble("value", 1.0)))); break;
            case "rate": player.setPlaybackSpeed((float)Math.max(.5, Math.min(2, call.getDouble("value", 1.0)))); break;
            default: call.reject("不支持此播放操作。"); return;
        }
        call.resolve(snapshot());
    }); }
    @Override protected void handleOnPause() { handler.removeCallbacks(ticker); super.handleOnPause(); }
    @Override protected void handleOnResume() { handler.removeCallbacks(ticker); if (player != null) handler.post(ticker); super.handleOnResume(); }
    @Override protected void handleOnDestroy() { destroyed = true; handler.removeCallbacksAndMessages(null); if (future != null) MediaController.releaseFuture(future); player = null; super.handleOnDestroy(); }
}
