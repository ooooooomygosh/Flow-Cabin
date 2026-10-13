// The beat everything dances to in this window: { bpm, beatAt } where beatAt
// is any beat's time on the wall clock (Date.now ms), so the cabin and the
// desktop pet window share it. Without a detected beat it runs at a calm
// default tempo with a free phase.
import { DEFAULT_BPM } from './beat-tracker.mjs';

let beat = { bpm: DEFAULT_BPM, beatAt: 0, detected: false };
export function setBeat({ bpm, beatAt } = {}) {
  const tempo = Number(bpm), anchor = Number(beatAt);
  beat = tempo >= 40 && tempo <= 220 ? { bpm: tempo, beatAt: Number.isFinite(anchor) && anchor > 0 ? anchor : beat.beatAt, detected: Number.isFinite(anchor) && anchor > 0 } : { bpm: DEFAULT_BPM, beatAt: beat.beatAt, detected: false };
  return beat;
}
export const currentBeat = () => beat;
export const beatLength = (value = beat) => 60000 / (value.bpm || DEFAULT_BPM);
// Milliseconds since the most recent beat.
export function sinceBeat(now = Date.now(), value = beat) { const length = beatLength(value); return ((now - value.beatAt) % length + length) % length; }
