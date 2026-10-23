package cn.flowcabin.app;
import org.json.JSONObject;
/** Five independent procedural beds + a quiet chord layer, mixed before AudioTrack. */
public final class CabinAmbientMixer {
    static final int RATE = 24000;
    static float level(JSONObject value, String key, double fallback) { double n = value.optDouble(key, fallback); return (float)(Double.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback); }
    volatile JSONObject mix = new JSONObject();
    private final java.util.Random random = new java.util.Random();
    private static final int[][] CHORDS = {{48,55,59,64},{45,52,55,60},{50,57,60,65},{43,53,59,62}};
    private double brown, smooth, rainLow, time, gain;
    public void configure(JSONObject value) { mix = value == null ? new JSONObject() : value; }
    public void render(short[] out, boolean enabled, boolean ducked) {
        JSONObject cfg = mix, tracks = cfg.optJSONObject("tracks"); if (tracks == null) tracks = new JSONObject();
        float master = level(cfg, "master", .8), rain = level(tracks,"rain",.45), fire = level(tracks,"fire",0), wind = level(tracks,"wind",0), white = level(tracks,"white",0), vinyl = level(tracks,"vinyl",0);
        float lofi = cfg.optBoolean("lofiOn") ? level(cfg,"lofi",.55) * (ducked ? .3f : 1) : 0;
        for (int i = 0; i < out.length; i++) {
            double noise = random.nextDouble() * 2 - 1; brown = (brown + noise * .02) / 1.02; smooth += .08 * (noise - smooth); rainLow += .3 * (noise-rainLow);
            double crackle = random.nextDouble() < .0008 ? noise * .7 : 0;
            double sample = rain * (noise - rainLow) * .18 + fire * (brown * .9 + crackle) * (.7 + .3 * Math.sin(time * 2)) + wind * smooth * .4 * (.7 + .3 * Math.sin(time * .7)) + white * noise * .15 + vinyl * (crackle + noise * .008);
            // Soft Cmaj7 / Am7 / Dm7 / G7 chords, generated on the audio thread.
            int[] chord = CHORDS[((int)(time / (60.0/72*4)) + Math.max(0,cfg.optInt("section",0))) % 4]; double env = Math.exp(-(time % (60.0/72*4)) * .65);
            double beat = time / (60.0/72), beatPhase = beat % 1, eighth = (beat * 2) % 1;
            double kick = Math.sin(time * 2 * Math.PI * 52) * Math.exp(-beatPhase * 20) * (((int)beat % 4 == 0 || (int)beat % 4 == 2) ? .045 : 0);
            double snare = noise * Math.exp(-beatPhase * 28) * (((int)beat % 4 == 1 || (int)beat % 4 == 3) ? .025 : 0);
            sample += lofi * (kick + snare + (noise-rainLow) * Math.exp(-eighth * 30) * .012);
            for (int note : chord) sample += lofi * Math.sin(time * 2 * Math.PI * 440 * Math.pow(2,(note-69)/12.0)) * env * .022;
            gain += ((enabled ? master : 0) - gain) * .0008;
            out[i] = (short)(Math.max(-.92, Math.min(.92, sample * gain)) * 32767); time += 1.0/RATE;
        }
    }
}
