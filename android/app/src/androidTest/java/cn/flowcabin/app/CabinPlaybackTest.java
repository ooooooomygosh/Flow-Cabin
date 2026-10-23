package cn.flowcabin.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.ByteArrayInputStream;
import java.io.EOFException;
import java.io.InputStream;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class CabinPlaybackTest {
    @Test public void streamSeekingHandlesSourcesThatCannotSkip() throws Exception {
        InputStream stream = new ByteArrayInputStream(new byte[] { 1, 2, 3, 4 }) {
            @Override public long skip(long count) { return 0; }
        };
        CabinPlaybackService.skipFully(stream, 3);
        assertEquals(4, stream.read());
        try { CabinPlaybackService.skipFully(stream, 1); fail("Expected end of file"); }
        catch (EOFException expected) { }
    }
    @Test public void playlistRejectsArbitraryNetworkAndMalformedLocalSources() throws Exception {
        for (String uri : new String[] { "https://example.com/song.mp3", "file:///tmp/song.mp3", "content:///song" }) {
            try { CabinPlaybackService.item(new JSONObject().put("provider", "local").put("uri", uri)); fail("Expected URI rejection"); }
            catch (java.io.IOException expected) { }
        }
        try { CabinPlaybackService.item(new JSONObject().put("provider", "qq").put("id", "../outside")); fail("Expected ID rejection"); }
        catch (java.io.IOException expected) { }
        assertEquals("cabin://qq/003abc12345678", CabinPlaybackService.item(new JSONObject().put("provider", "qq").put("id", "003abc12345678")).mediaId);
    }
}
