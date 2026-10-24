package cn.flowcabin.app;
import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.SystemClock;
import android.widget.RemoteViews;

/** Both widgets read the service/alarm checkpoint, never placeholder JS state. */
public class CabinWidgets extends AppWidgetProvider {
    public static class Focus extends CabinWidgets { }
    static void saveCompanion(Context c,String pet,String accessory,String avatar) throws java.io.IOException {
        if(avatar.length()>700000)throw new java.io.IOException("Avatar too large");
        if(!avatar.isEmpty()){
            byte[] bytes=android.util.Base64.decode(avatar,android.util.Base64.DEFAULT);
            android.graphics.BitmapFactory.Options bounds=new android.graphics.BitmapFactory.Options();bounds.inJustDecodeBounds=true;
            android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
            if(bounds.outWidth<16||bounds.outWidth>512||bounds.outHeight<16||bounds.outHeight>512)throw new java.io.IOException("Invalid avatar");
            android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.length);
            if(bitmap==null)throw new java.io.IOException("Invalid avatar");
            android.util.AtomicFile file=new android.util.AtomicFile(new java.io.File(c.getFilesDir(),"companion-avatar.png"));
            java.io.FileOutputStream stream=file.startWrite();
            try{if(!bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream))throw new java.io.IOException("Avatar encode failed");file.finishWrite(stream);}catch(Exception error){file.failWrite(stream);throw new java.io.IOException(error);}finally{bitmap.recycle();}
        }
        if(!c.getSharedPreferences("cabin-companion",0).edit().putString("pet",pet).putString("accessory",accessory).putBoolean("imported",!avatar.isEmpty()).commit())throw new java.io.IOException("Companion save failed");
    }
    static String token(Context c) { android.content.SharedPreferences p=c.getSharedPreferences("cabin-widget",0);String value=p.getString("token","");if(value.isEmpty()){value=java.util.UUID.randomUUID().toString();p.edit().putString("token",value).commit();}return value; }
    // The focus widget's button and the focus-end notification's buttons (CabinFocus.post).
    static final java.util.List<String> ACTIONS=java.util.Arrays.asList("focus-toggle","focus-break","focus-next","focus-skip","focus-extend","focus-end");
    static boolean acceptIntent(Context c,Intent intent) { String action=intent==null?null:intent.getStringExtra("cabinWidgetAction");if(action==null || !token(c).equals(intent.getStringExtra("cabinWidgetToken")) || !ACTIONS.contains(action))return false;c.getSharedPreferences("cabin-widget",0).edit().putString("command",action).commit();intent.removeExtra("cabinWidgetAction");if(!"focus-toggle".equals(action))androidx.core.app.NotificationManagerCompat.from(c).cancel(720);return true; }
    @Override public void onReceive(Context c,Intent intent) {
        String action=intent.getAction();
        if(!"cn.flowcabin.WIDGET_PLAY".equals(action) && !"cn.flowcabin.WIDGET_NEXT".equals(action)){super.onReceive(c,intent);return;}
        final PendingResult pending=goAsync();
        final com.google.common.util.concurrent.ListenableFuture<androidx.media3.session.MediaController> future=new androidx.media3.session.MediaController.Builder(c,new androidx.media3.session.SessionToken(c,new ComponentName(c,CabinPlaybackService.class))).buildAsync();
        final java.util.concurrent.atomic.AtomicBoolean finished=new java.util.concurrent.atomic.AtomicBoolean(false);
        final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
        final Runnable finish=()->{if(finished.compareAndSet(false,true)){androidx.media3.session.MediaController.releaseFuture(future);pending.finish();}};
        handler.postDelayed(finish,8000);
        future.addListener(()->{if(finished.get())return;try{androidx.media3.session.MediaController player=future.get();if("cn.flowcabin.WIDGET_NEXT".equals(action))player.seekToNextMediaItem();else if(player.getPlayWhenReady())player.pause();else{player.prepare();player.play();}}catch(Exception ignored){}finally{handler.removeCallbacks(finish);finish.run();}},androidx.core.content.ContextCompat.getMainExecutor(c));
    }
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
        android.content.SharedPreferences companion=c.getSharedPreferences("cabin-companion",0);
        String pet=companion.getString("pet","cat"),accessory=companion.getString("accessory","");
        try(java.io.InputStream stream=companion.getBoolean("imported",false)?new java.io.FileInputStream(new java.io.File(c.getFilesDir(),"companion-avatar.png")):c.getAssets().open("public/pet-art/v21/"+pet+"/"+(accessory.isEmpty()?"":"equipped/"+accessory+"/")+"avatar-256.png")) { view.setImageViewBitmap(R.id.widget_pet,android.graphics.BitmapFactory.decodeStream(stream)); }catch(Exception ignored){}
        Intent primary=focus?new Intent(c,MainActivity.class).putExtra("cabinWidgetAction","focus-toggle").putExtra("cabinWidgetToken",token(c)):new Intent(c,CabinWidgets.class).setAction("cn.flowcabin.WIDGET_PLAY");
        view.setOnClickPendingIntent(R.id.widget_primary,focus?PendingIntent.getActivity(c,id+10000,primary,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT):PendingIntent.getBroadcast(c,id+10000,primary,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT));
        view.setOnClickPendingIntent(R.id.widget_next,PendingIntent.getBroadcast(c,id+20000,new Intent(c,CabinWidgets.class).setAction("cn.flowcabin.WIDGET_NEXT"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT));
        view.setViewVisibility(R.id.widget_next,focus?android.view.View.GONE:android.view.View.VISIBLE);
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
            view.setTextViewText(R.id.widget_primary,running?"暂停":"idle".equals(phase)?"开始专注":"继续");
        } else {
            android.content.SharedPreferences saved = c.getSharedPreferences("cabin-playback-v1", Context.MODE_PRIVATE);
            String title = saved.getString("title", "");
            view.setTextViewText(R.id.widget_title, title.isEmpty() || "null".equals(title) ? "还没有放上唱片" : title);
            view.setTextViewText(R.id.widget_status, saved.getBoolean("playing", false) ? "正在播放 · 点击回小屋" : "唱片已暂停 · 点击回小屋");
            view.setViewVisibility(R.id.widget_clock, android.view.View.GONE);
            view.setTextViewText(R.id.widget_primary,saved.getBoolean("playing",false)?"暂停":"播放");
        }
        manager.updateAppWidget(id, view);
    }
}
