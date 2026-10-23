package cn.flowcabin.app;

import android.content.*;
import android.graphics.*;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CabinHome21Test {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private byte[] avatar() throws Exception {try(InputStream input=context().getAssets().open("public/pet-art/v21/fox/avatar-256.png")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=input.read(bytes))!=-1)out.write(bytes,0,n);return out.toByteArray();}}
    @Test public void importedWidgetAvatarSurvivesReloadAndBuiltinSelectionClearsIt() throws Exception {
        Context c=context();byte[] bytes=avatar();
        CabinWidgets.saveCompanion(c,"fox","scarf",Base64.encodeToString(bytes,Base64.NO_WRAP));
        assertTrue(c.getSharedPreferences("cabin-companion",0).getBoolean("imported",false));
        Bitmap saved=BitmapFactory.decodeFile(new File(c.getFilesDir(),"companion-avatar.png").getPath());assertEquals(256,saved.getWidth());saved.recycle();
        CabinWidgets.saveCompanion(c,"bear","bow","");
        assertFalse(c.getSharedPreferences("cabin-companion",0).getBoolean("imported",true));assertEquals("bear",c.getSharedPreferences("cabin-companion",0).getString("pet",""));
        try{CabinWidgets.saveCompanion(c,"cat","","bad-data");fail("Invalid avatar accepted");}catch(Exception expected){}
        assertEquals("bear",c.getSharedPreferences("cabin-companion",0).getString("pet",""));
        CabinWidgets.saveCompanion(c,"cat","","");
    }
    @Test public void widgetFocusCommandRequiresLocalPendingIntentAndIsConsumedOnce() {
        Context c=context();Intent intent=new Intent().putExtra("cabinWidgetAction","focus-toggle");
        assertFalse(CabinWidgets.acceptIntent(c,intent));intent.putExtra("cabinWidgetToken",CabinWidgets.token(c));assertTrue(CabinWidgets.acceptIntent(c,intent));assertFalse(CabinWidgets.acceptIntent(c,intent));
        c.getSharedPreferences("cabin-widget",0).edit().remove("command").commit();
    }
    @Test public void importedPetUsesPrivateBackendAndStreamsSameOriginAtlas() throws Exception {
        Context c=context();CabinMusic music=CabinMusic.get(c);byte[] png=avatar();String id="android-test-pet";
        JSONObject value=new JSONObject().put("version",1).put("id",id).put("name","测试伙伴").put("author","Flow Cabin tests").put("license","CC0")
            .put("media",new JSONObject().put("type","spritesheet").put("data",Base64.encodeToString(png,Base64.NO_WRAP)).put("width",256).put("height",256).put("frameWidth",256).put("frameHeight",256))
            .put("animations",new JSONObject().put("idle",new JSONObject().put("frames",new JSONArray().put(0)).put("fps",1)));
        music.request("/pets/remove",new JSONObject().put("id",id).toString());
        try{
            assertEquals(id,music.request("/pets/packs",value.toString()).getJSONObject("pack").getString("id"));
            JSONObject exported=music.request("/pets/packs/"+id+"/export",null);assertTrue(exported.toString().contains("测试伙伴"));
            android.webkit.WebResourceResponse response=music.petMedia("/pets/packs/"+id+"/atlas.png");assertEquals("image/png",response.getMimeType());
            try(InputStream input=response.getData()){assertEquals(137,input.read());assertEquals(80,input.read());}
            try{music.petMedia("/pets/packs/../atlas.png");fail("Traversal accepted");}catch(IOException expected){}
        }finally{music.request("/pets/remove",new JSONObject().put("id",id).toString());}
    }
}
