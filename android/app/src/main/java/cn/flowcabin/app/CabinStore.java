package cn.flowcabin.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;

/** App-private data, independent of WebView cache/origin. Never drops data on upgrade. */
final class CabinStore extends SQLiteOpenHelper {
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    CabinStore(Context context) { this(context, "flow-cabin.db"); }
    CabinStore(Context context, String name) { super(context, name, null, 1, db -> { throw new android.database.sqlite.SQLiteDatabaseCorruptException("Cabin database is corrupt; file preserved for recovery"); }); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE entries (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported data version; existing cabin is preserved");
    }
    @Override public void onConfigure(SQLiteDatabase db) { db.execSQL("PRAGMA synchronous=FULL"); }
    static boolean allowed(String key) {
        return key != null && key.length() <= 240 && (key.startsWith("album-circle-") || key.startsWith("flow-cabin-") || key.equals("cabin.petPack.v1")) && !key.equals("flow-cabin-ai-key-v1");
    }
    synchronized JSONObject read() throws Exception {
        SQLiteDatabase db = getReadableDatabase(); JSONObject values = new JSONObject();
        try (Cursor cursor = db.rawQuery("SELECT key,value FROM entries", null)) {
            while (cursor.moveToNext()) values.put(cursor.getString(0), cursor.getString(1));
        }
        boolean initialized;
        try (Cursor cursor = db.rawQuery("SELECT value FROM meta WHERE key='initialized'", null)) { initialized = cursor.moveToFirst(); }
        return new JSONObject().put("entries", values).put("initialized", initialized);
    }
    synchronized void apply(JSONArray changes) throws Exception {
        if (changes == null || changes.length() > 10000) throw new IllegalArgumentException("Invalid storage transaction");
        for (int i = 0; i < changes.length(); i++) {
            JSONObject row = changes.getJSONObject(i);
            if (!allowed(row.getString("key")) || (!row.isNull("value") && !(row.get("value") instanceof String))) throw new IllegalArgumentException("Invalid storage key/value");
        }
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            for (int i = 0; i < changes.length(); i++) {
                JSONObject row = changes.getJSONObject(i); String key = row.getString("key");
                if (row.isNull("value")) db.delete("entries", "key=?", new String[] { key });
                else {
                    ContentValues value = new ContentValues(); value.put("key", key); value.put("value", row.getString("value"));
                    if (db.insertWithOnConflict("entries", null, value, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new android.database.sqlite.SQLiteException("Entry was not saved");
                }
            }
            try (Cursor cursor = db.rawQuery("SELECT COALESCE(SUM((length(key)+length(value))*2),0) FROM entries", null)) {
                cursor.moveToFirst(); if (cursor.getLong(0) > MAX_BYTES) throw new IllegalStateException("Cabin data exceeds 32 MB; original transaction retained");
            }
            ContentValues meta = new ContentValues(); meta.put("key", "initialized"); meta.put("value", "1");
            if (db.insertWithOnConflict("meta", null, meta, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new android.database.sqlite.SQLiteException("Initialization was not saved");
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
}
