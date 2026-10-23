package cn.flowcabin.app;

import android.app.*;
import android.content.*;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

/**
 * Wall-clock alarms survive a suspended WebView. One pending alarm per device.
 * The page mirrors every focus change here (Device.syncFocus); the alarm rings at the planned
 * end even when the WebView is frozen in the background, offers the next step as notification
 * buttons (handled by MainActivity → CabinWidgets.acceptIntent → the page), and, with
 * 自动开始休息, schedules the end of the break that the page will start at the same instant.
 */
public final class CabinFocus extends BroadcastReceiver {
    static final String CHANNEL = "cabin-focus-end";
    static final long MINUTE = 60000L;
    /** True while MainActivity is in front: the page chimes and shows the end itself. */
    static volatile boolean foreground;
    static PendingIntent alarm(Context c) { return PendingIntent.getBroadcast(c, 720, new Intent(c, CabinFocus.class).setAction("cn.flowcabin.FOCUS_END"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("cabin-focus", Context.MODE_PRIVATE); }
    static void sync(Context c, JSONObject state) {
        JSONObject timer = state.optJSONObject("timer"), settings = state.optJSONObject("settings");
        String phase = timer == null ? "idle" : timer.optString("phase", "idle");
        boolean paused = timer != null && timer.optBoolean("paused"), due = timer != null && timer.optBoolean("due");
        // An overtime round has already been announced: nothing more to wake up for.
        long ends = timer == null || paused || due || "idle".equals(phase) ? 0 : timer.optLong("endsAt");
        boolean notify = settings == null || settings.optBoolean("notify", true);
        SharedPreferences saved = prefs(c);
        long previous = saved.getLong("endsAt", 0), now = System.currentTimeMillis();
        // The page settled the phase a moment before the alarm fired (its timers still ran): the
        // end must still be announced before the new state replaces the alarm.
        if (previous > 0 && previous <= now && previous != ends && previous != saved.getLong("delivered", 0) && saved.getBoolean("notify", true)) {
            saved.edit().putLong("delivered", previous).apply();
            post(c, saved, false);
        }
        boolean same = ends == previous && notify == saved.getBoolean("notify", true);
        saved.edit().putLong("endsAt", ends).putString("phase", phase).putBoolean("paused", paused)
            .putLong("remaining", timer == null ? 0 : timer.optLong("remaining")).putBoolean("notify", notify)
            .putBoolean("autoBreak", settings == null || settings.optBoolean("autoBreak", true)).putBoolean("overtime", settings != null && settings.optBoolean("overtime", false))
            .putInt("round", timer == null ? 0 : timer.optInt("round", 0)).putInt("longEvery", settings == null ? 4 : Math.max(2, settings.optInt("longEvery", 4)))
            .putInt("shortMin", settings == null ? 5 : Math.max(1, settings.optInt("shortMin", 5))).putInt("longMin", settings == null ? 15 : Math.max(1, settings.optInt("longMin", 15))).apply();
        if (!same) schedule(c, notify ? ends : 0);
        CabinWidgets.refresh(c);
    }
    static void schedule(Context c, long ends) {
        AlarmManager manager = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE); manager.cancel(alarm(c));
        if (ends <= System.currentTimeMillis()) return;
        // Exact when the system allows it (Android 12+ asks for 闹钟和提醒); otherwise the
        // inexact idle-safe alarm, which Doze may delay by a few minutes.
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms();
        try {
            if (exact) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ends, alarm(c));
            else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ends, alarm(c));
        } catch (SecurityException denied) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ends, alarm(c));
        }
    }
    static PendingIntent action(Context c, String command, int code) {
        Intent intent = new Intent(c, MainActivity.class).putExtra("cabinWidgetAction", command).putExtra("cabinWidgetToken", CabinWidgets.token(c)).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 730 + code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    /** The end of the saved phase. `chained`: a break was started at the same moment. */
    static void post(Context c, SharedPreferences saved, boolean chained) {
        if (foreground) return;
        String phase = saved.getString("phase", "");
        boolean focus = "focus".equals(phase), overtime = focus && saved.getBoolean("overtime", false);
        String title, text;
        if (overtime) { title = "专注时间到"; text = "还在继续计时，想停下时点「结束本轮」。"; }
        else if (focus) { title = "专注完成"; text = chained ? "休息开始了，起来走走、喝口水吧。" : "辛苦啦，起来伸个懒腰吧。+1 小鱼干"; }
        else { title = "longBreak".equals(phase) ? "长休息结束" : "休息结束"; text = "准备好就开始下一轮专注。"; }
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "专注结束提醒", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("一轮专注或休息结束时响铃提醒，即使小屋在后台。"); channel.enableVibration(true);
        manager.createNotificationChannel(channel);
        PendingIntent open = PendingIntent.getActivity(c, 721, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(c, CHANNEL).setSmallIcon(R.drawable.cabin_notification).setContentTitle(title).setContentText(text)
            .setContentIntent(open).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_REMINDER).setPriority(NotificationCompat.PRIORITY_HIGH).setDefaults(NotificationCompat.DEFAULT_ALL);
        if (overtime) { builder.addAction(0, "结束本轮", action(c, "focus-end", 1)); builder.addAction(0, "再 5 分钟", action(c, "focus-extend", 2)); }
        else if (focus && !chained) { builder.addAction(0, "开始休息", action(c, "focus-break", 3)); builder.addAction(0, "跳过休息", action(c, "focus-next", 4)); }
        else if (focus) builder.addAction(0, "跳过休息", action(c, "focus-next", 4));
        else builder.addAction(0, "开始专注", action(c, "focus-next", 5));
        if (Build.VERSION.SDK_INT < 33 || c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED)
            NotificationManagerCompat.from(c).notify(720, builder.build());
    }
    @Override public void onReceive(Context c, Intent intent) {
        SharedPreferences saved = prefs(c);
        long ends = saved.getLong("endsAt", 0), now = System.currentTimeMillis();
        if (ends == 0 || ends > now + 1000 || ends == saved.getLong("delivered", 0) || !saved.getBoolean("notify", true)) return;
        saved.edit().putLong("delivered", ends).apply();
        String phase = saved.getString("phase", "");
        boolean chain = "focus".equals(phase) && !saved.getBoolean("overtime", false) && saved.getBoolean("autoBreak", true);
        long breakEnds = 0; String next = "";
        if (chain) {
            int round = saved.getInt("round", 0) + 1;
            next = round % Math.max(2, saved.getInt("longEvery", 4)) == 0 ? "longBreak" : "shortBreak";
            breakEnds = ends + Math.max(1, saved.getInt("longBreak".equals(next) ? "longMin" : "shortMin", 5)) * MINUTE;
        }
        post(c, saved, chain && breakEnds > now);
        // Mirror the page: 自动开始休息 starts the break at the planned end, so its end rings too.
        if (chain && breakEnds > now) {
            saved.edit().putString("phase", next).putLong("endsAt", breakEnds).putInt("round", saved.getInt("round", 0) + 1).apply();
            schedule(c, breakEnds);
        }
        CabinWidgets.refresh(c);
    }
}
