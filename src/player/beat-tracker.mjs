// Finds the beat of what the deck is playing, from the analyser's bass band.
// Pure: `push(time, bass)` takes a timestamp (ms) and the low-frequency level
// (0..1) about 60 times a second; `state()` answers { bpm, beatAt, confident }
// where beatAt is the time (same clock) of the most recent beat.
//
// 1. Onset strength: how much the bass rose since the last sample (kick drums).
// 2. Tempo: autocorrelation of that onset curve over the last few seconds,
//    leaning towards 90–130 BPM, where most songs sit (and the half / double
//    tempo ambiguity is settled).
// 3. Phase: predicted beats are nudged towards strong onsets near them.
export const DEFAULT_BPM = 96;
const STEP_MS = 20, HISTORY_MS = 6000, MIN_BPM = 70, MAX_BPM = 170;

export function createBeatTracker({ step = STEP_MS, history = HISTORY_MS } = {}) {
  const size = Math.round(history / step), curve = new Float32Array(size);
  let head = 0, filled = 0, slotAt = -Infinity, slotMax = 0, previous = null, lastEstimate = -Infinity;
  let bpm = 0, pending = 0, pendingCount = 0, beatAt = -Infinity, confident = false, mean = 0, spread = 0;
  // Recent strong onsets (kick-like hits). Noise can produce these too; periodic() rejects incoherent hits.
  let onsets = [], lastOnset = -Infinity;
  const period = () => 60000 / (bpm || DEFAULT_BPM);
  const at = (back) => curve[(head - 1 - back + size * 2) % size];

  function estimate(time) {
    if (filled < size * .4) return;
    let best = 0, bestLag = 0, total = 0;
    for (let i = 0; i < filled; i++) total += at(i);
    const average = total / filled;
    const correlation = (lag) => { let sum = 0; for (let i = 0; i + lag < filled; i++) sum += (at(i) - average) * (at(i + lag) - average); return sum / (filled - lag); };
    for (let lag = Math.round(60000 / MAX_BPM / step); lag <= Math.round(60000 / MIN_BPM / step); lag++) {
      const tempo = 60000 / (lag * step), prior = Math.exp(-.5 * (Math.log2(tempo / 110) / .45) ** 2);
      const score = correlation(lag) * (.55 + .45 * prior);
      if (score > best) { best = score; bestLag = lag; }
    }
    // Between grid points: the peak of a parabola through the best lag and its neighbours.
    let exactLag = bestLag;
    if (bestLag) { const before = correlation(bestLag - 1), peak = correlation(bestLag), after = correlation(bestLag + 1), curve = before - 2 * peak + after; if (curve < 0) exactLag += Math.max(-.5, Math.min(.5, (before - after) / (2 * curve))); }
    let variance = 0;
    for (let i = 0; i < filled; i++) variance += (at(i) - average) ** 2;
    variance /= filled;
    // A short noise window can have a chance peak above .12 when we search many
    // lags. Require the unweighted peak to clear a sample-size-aware noise floor
    // as well; the tempo prior ranks candidates, but is not rhythmic evidence.
    const noiseFloor = 4 / Math.sqrt(filled - bestLag);
    // Sparse reads can move the correlation peak by a 20 ms bin. Across a
    // four-second phase check that error accumulates, rejecting real kicks.
    // Once acquired, refine the candidate with the existing onset grid before
    // testing it. Acquisition, correlation and periodicity gates stay required.
    const candidate = exactLag * step;
    const fitted = bpm && bestLag ? fitGrid(period()) : null;
    const candidateLength = fitted && Math.abs(fitted.length - candidate) / candidate < .05
      ? fitted.length : candidate;
    confident = bestLag > 0 && variance > 1e-6 && best / variance > .12
      && correlation(bestLag) / variance > noiseFloor && periodic(time, candidateLength);
    if (!confident || !bestLag) return;
    const found = 60000 / candidateLength;
    // A new tempo is believed only when it shows up twice in a row.
    if (!bpm || Math.abs(found - bpm) / bpm < .04) { bpm = bpm ? bpm + (found - bpm) * .3 : found; pendingCount = 0; }
    else if (pending && Math.abs(found - pending) / pending < .04 && ++pendingCount >= 2) { bpm = found; pendingCount = 0; }
    else { pending = found; pendingCount = 1; }
    // Phase: the offset whose every-beat comb collects the most onset energy.
    const lag = 60000 / bpm / step;
    let bestOffset = 0, bestSum = -1;
    for (let offset = 0; offset < lag; offset++) {
      let sum = 0;
      for (let back = offset; back < filled; back += lag) sum += at(Math.round(back));
      if (sum > bestSum) { bestSum = sum; bestOffset = offset; }
    }
    // `back` slots ago is a beat; slot 0 is the one being filled now.
    const comb = (slotAt - bestOffset - 1) * step + step / 2, length = 60000 / bpm;
    if (!Number.isFinite(beatAt)) { beatAt = comb; return; }
    let error = ((comb - beatAt) % length + length) % length; if (error > length / 2) error -= length;
    beatAt += Math.abs(error) > length * .15 ? error : error * .5;
  }

  // Onsets stop (a quiet passage, a sustained tone): drop confidence within 2 s.
  const periodicNow = () => onsets.length >= 4 && (lastPush - lastOnset) < 2000;
  let lastPush = -Infinity;
  function fitGrid(length) {
    const recent = onsets.filter((t) => lastPush - t < 6000); if (recent.length < 4) return null;
    // Anchor on the energy comb's beat so off-beat onsets (hi-hats, snares) are left out of the fit.
    const base = Number.isFinite(beatAt) ? beatAt : recent.at(-1), points = [];
    for (const t of recent) { const k = Math.round((t - base) / length); if (Math.abs(t - base - k * length) < length * .15) points.push([k, t]); }
    if (points.length < 4) return null;
    const n = points.length, mk = points.reduce((a, [k]) => a + k, 0) / n, mt = points.reduce((a, [, t]) => a + t, 0) / n;
    let num = 0, den = 0; for (const [k, t] of points) { num += (k - mk) * (t - mt); den += (k - mk) ** 2; }
    const fitted = den ? num / den : length; if (!(fitted > 60000 / 230 && fitted < 60000 / 40) || Math.abs(fitted - length) / length > .05) return null;
    const origin = mt - mk * fitted; let rms = 0; for (const [k, t] of points) rms += (t - origin - k * fitted) ** 2; rms = Math.sqrt(rms / n);
    if (rms > Math.max(15, fitted * .06)) return null;
    // The most recent grid beat at or before the latest sample.
    const lastBeat = origin + Math.floor((lastPush - origin) / fitted) * fitted;
    return { length: fitted, beatAt: lastBeat, rms };
  }
  // Gate: at least 4 strong onsets in the last 4 s, most of them spaced by whole beats or off-beats (half beats).
  function periodic(time, length) {
    const recent = onsets.filter((t) => time - t < 4000);
    if (recent.length < 4) return false;
    let fit = 0;
    for (let i = 1; i < recent.length; i++) { const half = length / 2, k = Math.max(1, Math.round((recent[i] - recent[i - 1]) / half)); if (k <= 8 && Math.abs(recent[i] - recent[i - 1] - k * half) < length * .12) fit++; }
    if (fit / (recent.length - 1) < .6) return false;
    // Adjacent gaps can each resemble half beats while their errors accumulate into
    // unrelated phases. Require the hits to share one half-beat grid across the window.
    // The circular mean treats kicks and off-beats alike and allows missing beats.
    let x = 0, y = 0;
    for (const onset of recent) { const phase = (onset - recent[0]) / length * Math.PI * 4; x += Math.cos(phase); y += Math.sin(phase); }
    return Math.hypot(x, y) / recent.length >= .75;
  }
  return {
    push(time, bass) {
      lastPush = time; const level = Math.max(0, Math.min(1, Number(bass) || 0));
      const flux = previous === null ? 0 : Math.max(0, level - previous);
      previous = level;
      // Running statistics of the onset strength pick out the strong hits.
      mean += (flux - mean) * .02; spread += (Math.abs(flux - mean) - spread) * .02;
      // Continuous noise has upper-tail excursions too. A percussive onset must
      // stand above the ongoing flux floor, not just its local spread.
      const strong = flux > .02 && flux > mean * 8 && flux > mean + spread * 2.5;
      // The curve is kept on a fixed 20 ms grid, whatever the frame rate.
      const slot = Math.floor(time / step);
      if (slotAt === -Infinity) slotAt = slot;
      if (slot > slotAt) {
        for (let gap = Math.min(size, slot - slotAt); gap > 0; gap--) { curve[head] = gap === Math.min(size, slot - slotAt) ? slotMax : 0; head = (head + 1) % size; filled = Math.min(size, filled + 1); }
        slotAt = slot; slotMax = 0;
      }
      slotMax = Math.max(slotMax, flux);
      if (strong && time - lastOnset > 80) { lastOnset = time; onsets.push(time); if (onsets.length > 32) onsets.shift(); }
      if (time - lastEstimate > 1000) { lastEstimate = time; estimate(time); }
      // Keep beatAt on the most recent predicted beat, then lean it towards a strong onset.
      const length = period();
      if (!Number.isFinite(beatAt)) beatAt = time;
      while (time - beatAt >= length) beatAt += length;
      if (bpm && strong) {
        const offset = time - beatAt, error = offset > length / 2 ? offset - length : offset;
        if (Math.abs(error) < length * .2) beatAt += error * .35;
      }
    },
    state() {
      const recent = onsets.length && periodicNow(), ok = Boolean(bpm) && confident && recent;
      // With clear onsets the grid is fitted to them (least squares over the last 6 s): tempo and
      // phase to a few ms, instead of the 20 ms autocorrelation grid.
      const fit = ok ? fitGrid(60000 / bpm) : null;
      if (fit) return { bpm: Math.round(60000 / fit.length * 100) / 100, beatAt: fit.beatAt, confident: true };
      return { bpm: bpm ? Math.round(bpm * 10) / 10 : 0, beatAt, confident: ok };
    },
    reset() { onsets = []; lastOnset = -Infinity; curve.fill(0); head = 0; filled = 0; previous = null; bpm = 0; pending = 0; pendingCount = 0; beatAt = -Infinity; confident = false; mean = 0; spread = 0; slotAt = -Infinity; lastEstimate = -Infinity; }
  };
}

// Bass level from an analyser's byte frequency frame: the bins under ~150 Hz.
export function bassLevel(frame, sampleRate = 48000, fftSize = 2048) {
  if (!frame?.length) return 0;
  const width = sampleRate / fftSize, from = Math.max(1, Math.floor(40 / width)), to = Math.max(from, Math.ceil(150 / width));
  let sum = 0;
  for (let i = from; i <= to && i < frame.length; i++) sum += frame[i];
  return sum / ((Math.min(to, frame.length - 1) - from + 1) * 255);
}
