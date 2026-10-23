package cn.flowcabin.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.ShuffleOrder;
import androidx.media3.common.Timeline;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

/** Owns playback independently of the Activity/WebView. Only stable track IDs are persisted. */
@androidx.media3.common.util.UnstableApi
public final class CabinPlaybackService extends MediaSessionService {
    private ExoPlayer player;
    static final CabinPcmEnergy energy = new CabinPcmEnergy();
    private MediaSession session;
    private boolean settingShuffle;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private SharedPreferences saved;
    private final Runnable checkpoint = new Runnable() { public void run() { save(); timer.postDelayed(this, 5000); } };
    @Override public void onCreate() {
        super.onCreate(); saved = getSharedPreferences("cabin-playback-v1", MODE_PRIVATE);
        player = new ExoPlayer.Builder(this, new androidx.media3.exoplayer.DefaultRenderersFactory(this) {
            @Override protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(android.content.Context context, boolean floatOutput, boolean playbackParams) {
                return new androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context).setAudioProcessors(new androidx.media3.common.audio.AudioProcessor[]{new androidx.media3.exoplayer.audio.TeeAudioProcessor(energy)}).build();
            }
        })
            .setMediaSourceFactory(new DefaultMediaSourceFactory(() -> new CabinSource()))
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_LOCAL).build();
        PendingIntent launch = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(launch).setCallback(new MediaSession.Callback() {
            @Override public MediaSession.ConnectionResult onConnect(MediaSession mediaSession, MediaSession.ControllerInfo controller) {
                MediaSession.ConnectionResult result = MediaSession.Callback.super.onConnect(mediaSession, controller);
                if (getPackageName().equals(controller.getPackageName())) return result;
                // Lock screen/headsets can control the existing queue, never inject arbitrary sources.
                Player.Commands commands = result.availablePlayerCommands.buildUpon().remove(Player.COMMAND_SET_MEDIA_ITEM).remove(Player.COMMAND_CHANGE_MEDIA_ITEMS).build();
                return new MediaSession.ConnectionResult.AcceptedResultBuilder(mediaSession).setAvailablePlayerCommands(commands).build();
            }
        }).build();
        try {
            JSONArray queue = new JSONArray(saved.getString("queue", "[]")); ArrayList<MediaItem> items = new ArrayList<>();
            for (int i = 0; i < queue.length(); i++) items.add(item(queue.getJSONObject(i)));
            if (!items.isEmpty()) { player.setMediaItems(items, Math.max(0, Math.min(saved.getInt("index", 0), items.size() - 1)), Math.max(0, saved.getLong("position", 0))); player.prepare(); }
        } catch (Exception ignored) { /* Preserve the saved queue for diagnostics; never autoplay after restart. */ }
        player.setRepeatMode(saved.getInt("repeat", Player.REPEAT_MODE_OFF));
        player.setShuffleModeEnabled(saved.getBoolean("shuffle", false));
        player.setPlayWhenReady(false);
        player.addListener(new Player.Listener() {
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) CabinAmbienceService.focusSuppressed = true;
                else if (ready) CabinAmbienceService.focusSuppressed = false;
            }
            @Override public void onPlaybackSuppressionReasonChanged(int reason) { CabinAmbienceService.focusSuppressed = reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE; }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                // 待播 is consumed album by album. At the final album repeat-all
                // loops that album, never resurrecting already consumed albums.
                int index = player.getCurrentMediaItemIndex();
                if (item == null || item.mediaMetadata.extras == null || index <= 0) return;
                String id = item.mediaMetadata.extras.getString("recordId", "");
                int start = index;
                while (start > 0) {
                    Bundle previous = player.getMediaItemAt(start - 1).mediaMetadata.extras;
                    if (previous == null || !id.equals(previous.getString("recordId", ""))) break;
                    start--;
                }
                if (start > 0) player.removeMediaItems(0, start);
            }
            @Override public void onTimelineChanged(Timeline timeline, int reason) { if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) shuffleWithinAlbums(); }
            @Override public void onEvents(Player source, Player.Events events) { save(); }
        });
        shuffleWithinAlbums();
        timer.post(checkpoint);
    }
    // Keep 待播 albums in order. Random mode shuffles each album's own tracks,
    // with the explicitly selected current song at the head of its group.
    private void shuffleWithinAlbums() {
        if (settingShuffle) return;
        java.util.LinkedHashMap<String, java.util.ArrayList<Integer>> groups = new java.util.LinkedHashMap<>();
        for (int i = 0; i < player.getMediaItemCount(); i++) {
            Bundle extras = player.getMediaItemAt(i).mediaMetadata.extras;
            String group = extras == null ? "" : extras.getString("recordId", "");
            if (!groups.containsKey(group)) groups.put(group, new java.util.ArrayList<>());
            groups.get(group).add(i);
        }
        int[] order = new int[player.getMediaItemCount()]; int offset = 0;
        for (java.util.ArrayList<Integer> indices : groups.values()) {
            int current = player.getCurrentMediaItemIndex(); boolean selected = indices.remove(Integer.valueOf(current));
            java.util.Collections.shuffle(indices);
            if (selected) order[offset++] = current;
            for (int i : indices) order[offset++] = i;
        }
        settingShuffle = true;
        try { player.setShuffleOrder(new ShuffleOrder.DefaultShuffleOrder(order, System.nanoTime())); } finally { settingShuffle = false; }
    }
    public static MediaItem item(JSONObject value) throws Exception {
        String provider = value.optString("provider"), id = value.optString("id"), uri;
        if (provider.equals("local")) {
            uri = value.optString("uri"); if (!uri.startsWith("content://") || Uri.parse(uri).getAuthority() == null || Uri.parse(uri).getAuthority().isEmpty()) throw new IOException("无效的本地歌曲。");
        } else {
            if (!(provider.equals("qq") || provider.equals("netease")) || !id.matches("[a-zA-Z0-9]{1,64}")) throw new IOException("无效的平台曲目。");
            uri = "cabin://" + provider + "/" + id;
        }
        Bundle extras = new Bundle(); extras.putString("recordId", value.optString("recordId")); extras.putInt("trackIndex", value.optInt("trackIndex", 0));
        return new MediaItem.Builder().setMediaId(uri).setUri(uri).setMediaMetadata(new MediaMetadata.Builder()
            .setExtras(extras).setTitle(value.optString("title", "歌曲")).setArtist(value.optString("artist")).setAlbumTitle(value.optString("album")).build()).build();
    }
    private void save() {
        if (player == null) return;
        try {
            JSONArray queue = new JSONArray();
            for (int i = 0; i < player.getMediaItemCount(); i++) {
                MediaItem item = player.getMediaItemAt(i); Uri uri = Uri.parse(item.mediaId);
                JSONObject value = new JSONObject().put("provider", "content".equals(uri.getScheme()) ? "local" : uri.getHost()).put("id", uri.getLastPathSegment())
                    .put("recordId", item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("recordId", "")).put("trackIndex", item.mediaMetadata.extras == null ? i : item.mediaMetadata.extras.getInt("trackIndex", i))
                    .put("title", item.mediaMetadata.title).put("artist", item.mediaMetadata.artist).put("album", item.mediaMetadata.albumTitle);
                if ("content".equals(uri.getScheme())) value.put("uri", uri.toString()); queue.put(value);
            }
            saved.edit().putString("queue", queue.toString()).putInt("index", player.getCurrentMediaItemIndex()).putLong("position", player.getCurrentPosition())
                .putInt("repeat", player.getRepeatMode()).putBoolean("shuffle", player.getShuffleModeEnabled())
                .putString("title", String.valueOf(player.getMediaMetadata().title)).putBoolean("playing", player.isPlaying()).apply();
            CabinWidgets.refresh(this);
        } catch (Exception ignored) { }
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) { return session; }
    @Override public void onDestroy() { timer.removeCallbacksAndMessages(null); if (player != null) player.pause(); save(); if (session != null) session.release(); if (player != null) player.release(); super.onDestroy(); }

    static void skipFully(InputStream source, long position) throws IOException {
        while (position > 0) {
            long count = source.skip(position);
            if (count > 0) position -= count;
            else if (source.read() == -1) throw new java.io.EOFException("音频定位超出文件长度。");
            else position--;
        }
    }

    /** Resolves an entitled platform source on the loader thread; tokens never cross the JS bridge. */
    private final class CabinSource extends BaseDataSource {
        private InputStream stream; private HttpURLConnection connection; private Uri uri; private long remaining; private boolean opened;
        CabinSource() { super(true); }
        @Override public long open(DataSpec spec) throws IOException {
            transferInitializing(spec); uri = spec.uri;
            try {
                if ("content".equals(uri.getScheme())) {
                    stream = getContentResolver().openInputStream(uri); if (stream == null) throw new IOException("本地文件不可读。");
                    skipFully(stream, spec.position);
                    remaining = spec.length;
                } else {
                    if (!"cabin".equals(uri.getScheme()) || !("qq".equals(uri.getHost()) || "netease".equals(uri.getHost())) || !String.valueOf(uri.getLastPathSegment()).matches("[a-zA-Z0-9]{1,64}")) throw new IOException("不支持的歌曲地址。");
                    CabinMusic backend = CabinMusic.get(CabinPlaybackService.this);
                    JSONObject input = new JSONObject().put("provider", uri.getHost()).put("id", uri.getLastPathSegment());
                    JSONObject result = backend.request("/music/resolve", input.toString());
                    String path = result.optString("audioPath").replaceFirst("^/desktop-music", "");
                    connection = backend.mediaConnection(path, spec.position);
                    int status = connection.getResponseCode();
                    if (status != HttpURLConnection.HTTP_OK && status != HttpURLConnection.HTTP_PARTIAL) throw new IOException("音频读取失败。");
                    stream = connection.getInputStream();
                    // Some upstreams ignore Range and return the whole file. ExoPlayer still expects bytes at spec.position.
                    long skipped = status == HttpURLConnection.HTTP_OK ? spec.position : 0;
                    skipFully(stream, skipped);
                    long available = connection.getContentLengthLong();
                    remaining = spec.length != C.LENGTH_UNSET ? spec.length : available < 0 ? C.LENGTH_UNSET : Math.max(0, available - skipped);
                }
                opened = true; transferStarted(spec); return remaining;
            } catch (Exception error) { close(); throw new IOException("无法打开歌曲，请检查授权或文件权限。", error); }
        }
        @Override public int read(byte[] data, int offset, int length) throws IOException {
            if (length == 0) return 0; if (remaining == 0) return C.RESULT_END_OF_INPUT;
            int count = stream.read(data, offset, remaining == C.LENGTH_UNSET ? length : (int)Math.min(length, remaining));
            if (count < 0) return C.RESULT_END_OF_INPUT; if (remaining != C.LENGTH_UNSET) remaining -= count; bytesTransferred(count); return count;
        }
        @Override public Uri getUri() { return uri; }
        @Override public void close() throws IOException { try { if (stream != null) stream.close(); } finally { stream = null; if (connection != null) connection.disconnect(); connection = null; if (opened) { opened = false; transferEnded(); } } }
    }
}
