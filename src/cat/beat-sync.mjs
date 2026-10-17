// The cat's music motions on the room's beat clock (src/player/beat-clock.mjs, fed by
// `cabin:playback` bpm/beatAt). Pure helpers; the Web Animations live in RoomCat.
import { currentBeat, beatLength } from '../player/beat-clock.mjs';

// A real tempo to move to: a beat detected in the deck's audio (bpm + beatAt), or the generated
// lo-fi's own section tempo. Not the 96 BPM default, and not `estimated` energy (cross-origin /
// unanalysable audio broadcasts bpm 0, so the clock falls back to the default and `known` is false).
export const beatSynced = ({ playing = false, beat = currentBeat() } = {}) => Boolean(playing && (beat?.known ?? beat?.detected) && beat.bpm >= 40 && beat.bpm <= 220);
// Where a cycle of `beats` beats is at `now` (ms into the cycle), with beat k of the clock at 0.
export function cyclePhase(now, beat = currentBeat(), beats = 2) {
  const length = beatLength(beat), cycle = length * beats, since = now - beat.beatAt;
  return ((since % cycle) + cycle) % cycle;
}
// 2 frames per beat over a 4-frame strip (L, mid, R, mid): L on one beat, R on the next.
export function grooveFrameIndex(now, beat = currentBeat()) { return Math.floor(cyclePhase(now, beat, 2) / (beatLength(beat) / 2)) % 4; }
// Tail sway: one cycle = 2 beats, a peak (−/+) on every beat.
// Stepped every half beat like the sprites: −3° on beat k, 0 at k+½, +3° on beat k+1, 0 at k+1½.
const step = 'steps(1, end)';
export const SWAY_KEYS = [{ rotate: '-3deg', offset: 0, easing: step }, { rotate: '0deg', offset: .25, easing: step }, { rotate: '3deg', offset: .5, easing: step }, { rotate: '0deg', offset: .75, easing: step }, { rotate: '-3deg', offset: 1 }];
// Post-eat contented bounce: one per beat, up on the beat.
export const FULL_KEYS = [{ translate: '0 -4%', offset: 0, easing: step }, { translate: '0 0', offset: .5, easing: step }, { translate: '0 -4%', offset: 1 }];
// Groove strip: background-position across 4 frames, 2 beats per cycle.
// (background-size 400%: 0%, 33.3%, 66.7%, 100% are the four frames; steps(4, end) over 0%→133.3%.)
export const GROOVE_KEYS = [{ backgroundPosition: '0% 100%' }, { backgroundPosition: '133.333% 100%' }];
// Keeps one Web Animation on the beat: duration = beats × beat length, phase measured from the
// clock's stable anchor (beat parity never flips). Re-aligned only when the tempo really changed
// (> 0.5 %) or the phase drifted past `tolerance`; the beat clock itself smooths small corrections.
export function lockToBeat(animation, { now = Date.now(), beat = currentBeat(), beats = 2, tolerance = 12 } = {}) {
  const duration = beatLength(beat) * beats, timing = animation.effect.getTiming(), want = cyclePhase(now, beat, beats);
  if (Math.abs(Number(timing.duration) - duration) / duration > .005) { animation.effect.updateTiming({ duration }); animation.currentTime = want; return 0; }
  const at = ((Number(animation.currentTime) || 0) % duration + duration) % duration;
  const drift = Math.min(Math.abs(at - want), duration - Math.abs(at - want));
  if (drift > tolerance) animation.currentTime = want;
  return drift;
}
