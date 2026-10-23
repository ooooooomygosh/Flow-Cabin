package cn.flowcabin.app;
import android.content.*;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.media3.session.*;
import androidx.media3.common.*;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class CabinSystemTest {
    @Test public void queueRetainsAlbumAndTrackIdentity() throws Exception {
        MediaItem item = CabinPlaybackService.item(new JSONObject().put("provider", "netease").put("id", "12345").put("recordId", "album-two").put("trackIndex", 8));
        assertEquals("album-two", item.mediaMetadata.extras.getString("recordId")); assertEquals(8, item.mediaMetadata.extras.getInt("trackIndex"));
    }
    @Test public void servicePersistsRealRepeatAndShuffle() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        final ListenableFuture<MediaController>[] future = new ListenableFuture[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> future[0] = new MediaController.Builder(c, new SessionToken(c, new ComponentName(c, CabinPlaybackService.class))).buildAsync());
        MediaController controller = future[0].get(10, TimeUnit.SECONDS);
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { controller.setRepeatMode(Player.REPEAT_MODE_ONE); controller.setShuffleModeEnabled(true); });
            long deadline = System.currentTimeMillis() + 5000;
            while (System.currentTimeMillis() < deadline && !c.getSharedPreferences("cabin-playback-v1", 0).getBoolean("shuffle", false)) Thread.sleep(50);
            assertTrue(c.getSharedPreferences("cabin-playback-v1", 0).getBoolean("shuffle", false));
            assertEquals(Player.REPEAT_MODE_ONE, c.getSharedPreferences("cabin-playback-v1", 0).getInt("repeat", -1));
            java.util.ArrayList<MediaItem> queue = new java.util.ArrayList<>();
            for (int i = 0; i < 4; i++) queue.add(CabinPlaybackService.item(new JSONObject().put("provider", "netease").put("id", "1234" + i).put("recordId", i < 2 ? "first" : "second").put("trackIndex", i % 2)));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { controller.setRepeatMode(Player.REPEAT_MODE_OFF); controller.setMediaItems(queue, 0, 0); });
            Thread.sleep(300);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { assertEquals(1, controller.getNextMediaItemIndex()); controller.seekToNextMediaItem(); });
            Thread.sleep(100);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(controller::seekToNextMediaItem);
            Thread.sleep(300);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { assertEquals(2, controller.getMediaItemCount()); assertEquals("second", controller.getCurrentMediaItem().mediaMetadata.extras.getString("recordId")); });
        } finally { InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { controller.stop(); controller.clearMediaItems(); controller.setRepeatMode(Player.REPEAT_MODE_OFF); controller.setShuffleModeEnabled(false); controller.release(); }); }
    }
    @Test public void focusPauseCancelsDeadlineAndDeliveryIsIdempotent() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        long ends = System.currentTimeMillis() + 60000;
        JSONObject state = new JSONObject().put("settings", new JSONObject().put("notify", true)).put("timer", new JSONObject().put("phase", "focus").put("endsAt", ends));
        CabinFocus.sync(c, state); assertEquals(ends, c.getSharedPreferences("cabin-focus", 0).getLong("endsAt", 0));
        state.getJSONObject("timer").put("paused", true).put("remaining", 60000); CabinFocus.sync(c, state);
        assertEquals(0, c.getSharedPreferences("cabin-focus", 0).getLong("endsAt", -1));
        new CabinFocus().onReceive(c, new Intent()); assertEquals(0, c.getSharedPreferences("cabin-focus", 0).getLong("delivered", 0));
        c.getSharedPreferences("cabin-focus", 0).edit().putLong("endsAt", 12).putLong("delivered", 12).apply();
        new CabinFocus().onReceive(c, new Intent()); assertEquals(12, c.getSharedPreferences("cabin-focus", 0).getLong("delivered", 0));
        CabinFocus.sync(c, new JSONObject());
    }
    @Test public void fiveLaunchersAndTwoWidgetsAreRegistered() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext(); PackageManager pm = c.getPackageManager();
        for (String pet : new String[]{"cat", "chick", "bunny", "bear", "fox"}) assertEquals(c.getPackageName() + ".MainActivity", pm.getActivityInfo(new ComponentName(c, c.getPackageName() + ".Launcher_" + pet), PackageManager.MATCH_DISABLED_COMPONENTS).targetActivity);
        for (Class<?> type : new Class<?>[]{CabinWidgets.class, CabinWidgets.Focus.class}) assertTrue(pm.getReceiverInfo(new ComponentName(c, type), PackageManager.GET_META_DATA).metaData.containsKey("android.appwidget.provider"));
    }
}
