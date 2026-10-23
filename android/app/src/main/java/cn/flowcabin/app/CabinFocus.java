package cn.flowcabin.app;

import android.app.*;
import android.content.*;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

/** Wall-clock alarms survive a suspended WebView. One pending alarm per device. */
public final class CabinFocus extends BroadcastReceiver {
    static PendingIntent alarm(Context c) { return PendingIntent.getBroadcast(c, 720, new Intent(c, CabinFocus.class).setAction("cn.flowcabin.FOCUS_END"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE); }
    static void sync(Context c, JSONObject state) {
        JSONObject timer = state.optJSONObject("timer"), settings = state.optJSONObject("settings");
        long ends = timer == null || timer.optBoolean("paused") || "idle".equals(timer.optString("phase")) ? 0 : timer.optLong("endsAt");
        String phase = timer == null ? "idle" : timer.optString("phase", "idle");
        boolean notify = settings != null && settings.optBoolean("notify", true);
        android.content.SharedPreferences saved = c.getSharedPreferences("cabin-focus", Context.MODE_PRIVATE);
        boolean same = ends == saved.getLong("endsAt", 0) && notify == saved.getBoolean("notify", true);
        saved.edit().putLong("endsAt", ends).putString("phase", phase).putBoolean("paused", timer != null && timer.optBoolean("paused"))
            .putLong("remaining", timer == null ? 0 : timer.optLong("remaining")).putBoolean("notify", notify).apply();
        if (!same) {
            AlarmManager manager = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE); manager.cancel(alarm(c));
            if (notify && ends > System.currentTimeMillis()) manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ends, alarm(c));
        }
        CabinWidgets.refresh(c);
    }
    @Override public void onReceive(Context c, Intent intent) {
        android.content.SharedPreferences saved = c.getSharedPreferences("cabin-focus", Context.MODE_PRIVATE);
        long ends = saved.getLong("endsAt", 0);
        if (ends == 0 || ends > System.currentTimeMillis() || ends == saved.getLong("delivered", 0) || !saved.getBoolean("notify", true)) return;
        saved.edit().putLong("delivered", ends).apply();
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("cabin-focus", "专注与休息提醒", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(c, 721, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String title = "focus".equals(saved.getString("phase", "")) ? "专注完成" : "休息结束";
        if (Build.VERSION.SDK_INT < 33 || c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED)
            NotificationManagerCompat.from(c).notify(720, new NotificationCompat.Builder(c, "cabin-focus").setSmallIcon(R.drawable.cabin_notification).setContentTitle(title).setContentText("回小屋看看，慢慢开启下一轮。").setContentIntent(open).setAutoCancel(true).build());
        CabinWidgets.refresh(c);
    }
}
