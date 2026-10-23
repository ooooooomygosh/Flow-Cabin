package cn.flowcabin.app;
import android.app.*;
import android.content.*;
import android.media.*;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
/** A single native output mixes all ambience. It never requests audio focus or creates a MediaSession. */
public final class CabinAmbienceService extends Service {
    static volatile boolean active, ducked, focusSuppressed;
    static volatile long renderedFrames;
    private android.os.PowerManager.WakeLock awake;
    private volatile boolean running;
    private Thread worker;
    private AudioTrack output;
    private final CabinAmbientMixer mixer = new CabinAmbientMixer();
    static JSONObject state(Context c) {
        try { return new JSONObject().put("enabled", active).put("ducked", ducked).put("mix", new JSONObject(c.getSharedPreferences("cabin-ambience",0).getString("mix","{}"))); }
        catch (Exception e) { return new JSONObject(); }
    }
    @Override public void onCreate() {
        super.onCreate();
        awake = ((android.os.PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "FlowCabin:ambience"); awake.acquire();
        NotificationManager manager = getSystemService(NotificationManager.class); manager.createNotificationChannel(new NotificationChannel("cabin-ambience", "小屋环境音", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 730, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, CabinAmbienceService.class).setAction("stop");
        PendingIntent pause = PendingIntent.getService(this, 731, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(730, new NotificationCompat.Builder(this,"cabin-ambience").setSmallIcon(R.drawable.cabin_notification).setContentTitle("小屋环境音正在陪你").setContentText("点击回小屋调整声音").setContentIntent(open).addAction(0,"暂停",pause).setOngoing(true).build());
    }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        try {
            JSONObject config = new JSONObject(intent.getStringExtra("config"));
            JSONObject selectedMix = config.optJSONObject("mix"); if (selectedMix == null) selectedMix = new JSONObject(); selectedMix.put("section", config.optInt("section", 0)); mixer.configure(selectedMix); ducked = config.optBoolean("ducked");
            getSharedPreferences("cabin-ambience",0).edit().putString("mix", mixer.mix.toString()).apply();
            if (!config.optBoolean("enabled")) { stopSelf(); return START_NOT_STICKY; }
            active = true;
            if (!running) {
                int size = Math.max(4096, AudioTrack.getMinBufferSize(CabinAmbientMixer.RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT));
                output = new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(CabinAmbientMixer.RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(size).setTransferMode(AudioTrack.MODE_STREAM).build();
                output.play(); running = true;
                worker = new Thread(() -> { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO); short[] data = new short[480];
                    try { while (running) { mixer.render(data, !focusSuppressed, ducked); int written = output.write(data,0,data.length,AudioTrack.WRITE_BLOCKING); if (written < 0) break; renderedFrames += written; } }
                    catch (Exception ignored) { } finally { active = false; if (running) stopSelf(); }
                }, "cabin-ambient-pcm"); worker.start();
            }
        } catch (Exception error) { active = false; stopSelf(); }
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        running = false; active = false;
        if (output != null) { try { output.pause(); output.flush(); } catch (Exception ignored) {} }
        if (worker != null) try { worker.join(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        if (output != null) output.release(); if (awake != null && awake.isHeld()) awake.release(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
