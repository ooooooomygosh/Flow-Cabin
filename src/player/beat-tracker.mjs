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
  const period = () => 60000 / (bpm || DEFAULT_BPM);
  const at = (back) => curve[(head - 1 - back + size * 2) % size];

  function estimate(time) {
    if (filled < size * .6) return;
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
    confident = variance > 1e-6 && best / variance > .12;
    if (!confident || !bestLag) return;
    const found = 60000 / (exactLag * step);
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

  return {
    push(time, bass) {
      const level = Math.max(0, Math.min(1, Number(bass) || 0));
      const flux = previous === null ? 0 : Math.max(0, level - previous);
      previous = level;
      // Running statistics of the onset strength pick out the strong hits.
      mean += (flux - mean) * .02; spread += (Math.abs(flux - mean) - spread) * .02;
      // The curve is kept on a fixed 20 ms grid, whatever the frame rate.
      const slot = Math.floor(time / step);
      if (slotAt === -Infinity) slotAt = slot;
      if (slot > slotAt) {
        for (let gap = Math.min(size, slot - slotAt); gap > 0; gap--) { curve[head] = gap === Math.min(size, slot - slotAt) ? slotMax : 0; head = (head + 1) % size; filled = Math.min(size, filled + 1); }
        slotAt = slot; slotMax = 0;
      }
      slotMax = Math.max(slotMax, flux);
      if (time - lastEstimate > 1000) { lastEstimate = time; estimate(time); }
      // Keep beatAt on the most recent predicted beat, then lean it towards a strong onset.
      const length = period();
      if (!Number.isFinite(beatAt)) beatAt = time;
      while (time - beatAt >= length) beatAt += length;
      if (bpm && flux > mean + spread * 2.5 && flux > .02) {
        const offset = time - beatAt, error = offset > length / 2 ? offset - length : offset;
        if (Math.abs(error) < length * .2) beatAt += error * .35;
      }
    },
    state() { return { bpm: bpm ? Math.round(bpm * 10) / 10 : 0, beatAt, confident: Boolean(bpm) && confident }; },
    reset() { curve.fill(0); head = 0; filled = 0; previous = null; bpm = 0; pending = 0; pendingCount = 0; beatAt = -Infinity; confident = false; mean = 0; spread = 0; slotAt = -Infinity; lastEstimate = -Infinity; }
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
