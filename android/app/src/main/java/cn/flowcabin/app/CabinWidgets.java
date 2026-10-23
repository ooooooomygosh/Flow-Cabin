package cn.flowcabin.app;
import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.SystemClock;
import android.widget.RemoteViews;

/** Both widgets read the service/alarm checkpoint, never placeholder JS state. */
public class CabinWidgets extends AppWidgetProvider {
    public static class Focus extends CabinWidgets { }
    static void refresh(Context c) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        for (Class<?> type : new Class<?>[]{CabinWidgets.class, Focus.class}) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(c, type));
            for (int id : ids) render(c, manager, id, type == Focus.class);
        }
    }
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { refresh(c); }
    static void render(Context c, AppWidgetManager manager, int id, boolean focus) {
        RemoteViews view = new RemoteViews(c.getPackageName(), R.layout.cabin_widget);
        PendingIntent open = PendingIntent.getActivity(c, id, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        view.setOnClickPendingIntent(R.id.widget_root, open);
        if (focus) {
            android.content.SharedPreferences saved = c.getSharedPreferences("cabin-focus", Context.MODE_PRIVATE);
            long ends = saved.getLong("endsAt", 0); boolean paused = saved.getBoolean("paused", false), running = ends > System.currentTimeMillis() && !paused;
            String phase = saved.getString("phase", "idle");
            view.setTextViewText(R.id.widget_title, "focus".equals(phase) ? "专注时光" : "idle".equals(phase) ? "准备开始" : "休息时光");
            view.setTextViewText(R.id.widget_status, paused ? "已暂停 · 点击回小屋" : running ? "慢慢来，时间还在走" : "回小屋开启下一轮");
            long remaining = running ? ends - System.currentTimeMillis() : paused ? saved.getLong("remaining", 0) : 0;
            view.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime() + remaining, null, running);
            view.setChronometerCountDown(R.id.widget_clock, true);
            view.setViewVisibility(R.id.widget_clock, android.view.View.VISIBLE);
        } else {
            android.content.SharedPreferences saved = c.getSharedPreferences("cabin-playback-v1", Context.MODE_PRIVATE);
            String title = saved.getString("title", "");
            view.setTextViewText(R.id.widget_title, title.isEmpty() || "null".equals(title) ? "还没有放上唱片" : title);
            view.setTextViewText(R.id.widget_status, saved.getBoolean("playing", false) ? "正在播放 · 点击回小屋" : "唱片已暂停 · 点击回小屋");
            view.setViewVisibility(R.id.widget_clock, android.view.View.GONE);
        }
        manager.updateAppWidget(id, view);
    }
}
