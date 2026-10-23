package cn.flowcabin.app;
import android.content.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.media3.common.C;
import java.nio.*;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class CabinAudioTest {
 @Test public void cameraRejectsNonScanForeignOriginsAndMicrophone() {
   String video=android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE, audio=android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE;
   assertTrue(MainActivity.cameraRequestAllowed("https://localhost/",new String[]{video},true));
   assertFalse(MainActivity.cameraRequestAllowed("https://localhost/",new String[]{video},false));
   assertFalse(MainActivity.cameraRequestAllowed("https://example.com/",new String[]{video},true));
   assertFalse(MainActivity.cameraRequestAllowed("https://localhost/",new String[]{video,audio},true));
   assertFalse(MainActivity.cameraRequestAllowed("https://localhost/",new String[]{audio},true));
 }
 @Test public void pcmEnergyMeasuresDecodedSamplesWithoutConsumingBuffer() {
   ByteBuffer data=ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);data.putShort((short)16384).putShort((short)-16384).putShort((short)16384).putShort((short)-16384).flip();
   assertEquals(.5,CabinPcmEnergy.rms(data,C.ENCODING_PCM_16BIT),.0001);assertEquals(0,data.position());
   assertEquals(0,CabinPcmEnergy.rms(ByteBuffer.allocate(8),C.ENCODING_PCM_16BIT),0);
 }
 @Test public void nativeMixerSilenceAndMultiTrackOutputAreBounded() throws Exception {
   CabinAmbientMixer mixer=new CabinAmbientMixer();short[] data=new short[24000];
   mixer.render(data,false,false);for(short n:data)assertEquals(0,n);
   mixer.configure(new JSONObject("{\"master\":1,\"tracks\":{\"rain\":1,\"fire\":1,\"wind\":1,\"white\":1,\"vinyl\":1},\"lofiOn\":true}"));
   mixer.render(data,true,false);long sum=0;for(short n:data){sum+=Math.abs((int)n);assertTrue(Math.abs((int)n)<32767);}assertTrue(sum>10000);
   mixer.configure(new JSONObject("{\"master\":0}"));mixer.render(data,true,false);mixer.render(data,true,false);assertEquals(0,data[data.length-1]);
 }
 @Test public void backgroundServiceActuallyWritesAudioAndPauses() throws Exception {
   Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
   Intent launch=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);android.app.Activity activity=InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
   long before=CabinAmbienceService.renderedFrames;
   String mix="{\"master\":0.1,\"tracks\":{\"rain\":0.2,\"fire\":0.2}}";
   JSONObject config=new JSONObject().put("enabled",true).put("mix",new JSONObject(mix));
   androidx.core.content.ContextCompat.startForegroundService(c,new Intent(c,CabinAmbienceService.class).putExtra("config",config.toString()));
   long deadline=System.currentTimeMillis()+5000;while(CabinAmbienceService.renderedFrames<=before&&System.currentTimeMillis()<deadline)Thread.sleep(50);
   assertTrue(CabinAmbienceService.active);assertTrue(CabinAmbienceService.renderedFrames>before);
   InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.moveTaskToBack(true));
   long foregroundFrames=CabinAmbienceService.renderedFrames;Thread.sleep(250);assertTrue(CabinAmbienceService.renderedFrames>foregroundFrames);
   assertEquals(.1,new JSONObject(c.getSharedPreferences("cabin-ambience",0).getString("mix","{}")).getDouble("master"),.001);
   c.stopService(new Intent(c,CabinAmbienceService.class));deadline=System.currentTimeMillis()+2000;while(CabinAmbienceService.active&&System.currentTimeMillis()<deadline)Thread.sleep(50);assertFalse(CabinAmbienceService.active);
   Thread.sleep(100);long stoppedFrames=CabinAmbienceService.renderedFrames;Thread.sleep(100);assertEquals(stoppedFrames,CabinAmbienceService.renderedFrames);
   InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.startActivity(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
   Thread.sleep(200);
   config.getJSONObject("mix").put("master",.2);
   androidx.core.content.ContextCompat.startForegroundService(c,new Intent(c,CabinAmbienceService.class).putExtra("config",config.toString()));
   deadline=System.currentTimeMillis()+5000;while(CabinAmbienceService.renderedFrames<=stoppedFrames&&System.currentTimeMillis()<deadline)Thread.sleep(50);
   assertTrue(CabinAmbienceService.renderedFrames>stoppedFrames);assertEquals(.2,new JSONObject(c.getSharedPreferences("cabin-ambience",0).getString("mix","{}")).getDouble("master"),.001);
   c.stopService(new Intent(c,CabinAmbienceService.class));
 }
}
