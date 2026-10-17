// The beat everything dances to in this window: { bpm, beatAt } where beatAt
// is a beat's time on the wall clock (Date.now ms), so the cabin and the
// desktop pet window share it. Without a real tempo it runs at a calm
// default tempo with a free phase (and the cat listens instead of dancing).
//
// The tracker re-estimates its beat every few frames, so raw beatAt values jitter
// and move to "the most recent beat" all the time. This clock keeps ONE anchor:
// - beat parity is stable: the anchor only ever moves by whole *pairs* of beats
//   (so beat k stays even/odd and 2-beat cycles complete), plus small corrections;
// - small phase errors are slewed in (a fraction per update), big sustained ones snap;
// - a new tempo (> 3 %) or `reset()` (track skip, seek) re-anchors at once.
import { DEFAULT_BPM } from './beat-tracker.mjs';

const TOLERANCE_MS = 8, SLEW = .2, SNAP_AFTER = 4;
// `known`: the tempo is real (a detected beat, or the generated lo-fi's own tempo), not the default.
let beat = { bpm: DEFAULT_BPM, beatAt: 0, detected: false, known: false }, far = 0;
const wrap = (value, length) => { let v = ((value % length) + length) % length; if (v > length / 2) v -= length; return v; };
// Moves `anchor` by a whole number of beat pairs to the pair nearest `now` (keeps parity).
const nearPair = (anchor, length, now) => anchor + Math.round((now - anchor) / (2 * length)) * 2 * length;

export function setBeat({ bpm, beatAt } = {}, now = Date.now()) {
  const tempo = Number(bpm), raw = Number(beatAt), hasPhase = Number.isFinite(raw) && raw > 0;
  if (!(tempo >= 40 && tempo <= 220)) { far = 0; beat = { bpm: DEFAULT_BPM, beatAt: 0, detected: false, known: false }; return beat; }
  const fresh = !beat.known || !beat.beatAt || Math.abs(tempo - beat.bpm) / beat.bpm > .03 || beat.detected !== hasPhase;
  if (!hasPhase) { far = 0; beat = { bpm: tempo, beatAt: fresh ? 0 : beat.beatAt, detected: false, known: true }; return beat; }
  if (fresh) { far = 0; beat = { bpm: tempo, beatAt: raw, detected: true, known: true }; return beat; }
  const length = 60000 / tempo, anchor = nearPair(beat.beatAt, 60000 / beat.bpm, now), error = wrap(raw - anchor, length);
  let next = anchor;
  if (Math.abs(error) > length / 4) { if (++far >= SNAP_AFTER) { next = anchor + error; far = 0; } } // a real phase change: snap once it persists
  else { far = 0; if (Math.abs(error) > TOLERANCE_MS) next = anchor + error * SLEW; }
  beat = { bpm: tempo, beatAt: next, detected: true, known: true };
  return beat;
}
// Track skip / seek: forget the phase so the next estimate anchors afresh.
export function resetBeat() { far = 0; beat = { bpm: DEFAULT_BPM, beatAt: 0, detected: false, known: false }; return beat; }
export const currentBeat = () => beat;
export const beatLength = (value = beat) => 60000 / (value.bpm || DEFAULT_BPM);
// Milliseconds since the most recent beat.
export function sinceBeat(now = Date.now(), value = beat) { const length = beatLength(value); return ((now - value.beatAt) % length + length) % length; }
