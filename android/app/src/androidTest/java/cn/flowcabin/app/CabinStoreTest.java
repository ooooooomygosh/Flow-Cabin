package cn.flowcabin.app;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CabinStoreTest {
    private static final String NAME = "flow-cabin-qa-test.db";
    private Context context;
    private JSONArray edit(String key, Object value) throws Exception { return new JSONArray().put(new JSONObject().put("key", key).put("value", value)); }
    @Before public void before() { context = InstrumentationRegistry.getInstrumentation().getTargetContext(); context.deleteDatabase(NAME); }
    @After public void after() { context.deleteDatabase(NAME); }
    @Test public void dataAndDeletionSurviveClosingDatabase() throws Exception {
        CabinStore store = new CabinStore(context, NAME); assertFalse(store.read().getBoolean("initialized"));
        store.apply(edit("flow-cabin-web-collection-v1", "保存的唱片")); store.close();
        store = new CabinStore(context, NAME); assertEquals("保存的唱片", store.read().getJSONObject("entries").getString("flow-cabin-web-collection-v1"));
        store.apply(edit("flow-cabin-web-collection-v1", JSONObject.NULL)); store.close();
        store = new CabinStore(context, NAME); assertTrue(store.read().getBoolean("initialized")); assertEquals(0, store.read().getJSONObject("entries").length()); store.close();
    }
    @Test public void invalidTransactionPreservesPreviousDataAndRejectsApiKeys() throws Exception {
        CabinStore store = new CabinStore(context, NAME); store.apply(edit("flow-cabin-journal-v1", "日记"));
        JSONArray invalid = edit("flow-cabin-journal-v1", "不能写入").put(new JSONObject().put("key", "flow-cabin-ai-key-v1").put("value", "never persist"));
        try { store.apply(invalid); fail("Expected rejection"); } catch (IllegalArgumentException expected) { }
        assertEquals("日记", store.read().getJSONObject("entries").getString("flow-cabin-journal-v1")); assertFalse(store.read().getJSONObject("entries").has("flow-cabin-ai-key-v1")); store.close();
    }
    @Test public void corruptFileIsNotDeletedOrReplacedWithAnEmptyCabin() throws Exception {
        java.io.File file = context.getDatabasePath(NAME); file.getParentFile().mkdirs(); byte[] original = "corrupted-qa-data-preserve-me".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) { output.write(original); }
        CabinStore store = new CabinStore(context, NAME);
        try { store.read(); fail("Expected corruption failure"); } catch (android.database.sqlite.SQLiteException expected) { } finally { store.close(); }
        assertTrue(file.exists()); try (java.io.FileInputStream input = new java.io.FileInputStream(file)) { assertArrayEquals(original, input.readAllBytes()); }
    }
}
