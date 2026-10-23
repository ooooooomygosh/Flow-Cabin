package cn.flowcabin.app;
import androidx.media3.common.C;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
/** Decoder PCM measurement only. No inferred tempo and no audio capture permission. */
@androidx.media3.common.util.UnstableApi
public final class CabinPcmEnergy implements TeeAudioProcessor.AudioBufferSink {
    private volatile double energy;
    private volatile long measuredAt;
    private int encoding;
    @Override public void flush(int sampleRate, int channelCount, int encoding) { this.encoding = encoding; energy = 0; measuredAt = 0; }
    static double rms(ByteBuffer pcm, int encoding) {
        ByteBuffer read = pcm.duplicate().order(ByteOrder.LITTLE_ENDIAN); double sum = 0; int count = 0;
        while (read.remaining() >= (encoding == C.ENCODING_PCM_FLOAT ? 4 : 2)) {
            double value = encoding == C.ENCODING_PCM_FLOAT ? read.getFloat() : encoding == C.ENCODING_PCM_16BIT ? read.getShort() / 32768.0 : 0;
            if (!Double.isFinite(value)) value = 0; sum += value * value; count++;
        }
        return count == 0 ? 0 : Math.min(1, Math.sqrt(sum / count));
    }
    @Override public void handleBuffer(ByteBuffer pcm) { energy = rms(pcm, encoding); measuredAt = android.os.SystemClock.elapsedRealtime(); }
    double current() { return android.os.SystemClock.elapsedRealtime() - measuredAt < 400 ? energy : 0; }
}
