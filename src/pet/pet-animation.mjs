import { FPS, frameAt, grooveFrame } from './pet-model.mjs';
import { currentBeat } from '../player/beat-clock.mjs';

// Wake at sprite boundaries, rather than on every display refresh. This keeps
// a 1–6 fps pixel animation cheap even when the picker shows all five pets.
// The caller supplies lifecycle state; this scheduler stays independent of the DOM.
export function startPetAnimation({
  pose = 'idle', reduceMotion = false, enabled = true, onFrame,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  // Grooving follows the song's beat (two sprite frames per beat), on the wall clock.
  beat = currentBeat, wallClock = () => Date.now(),
  // onFrame → React → canvas paint lands about one display frame later, so pick the frame one frame ahead.
  beatLead = 16,
  // One-shot actions (eat, hop) start on their first frame: frames count from `origin` (same clock as `now`).
  origin = 0,
}) {
  if (!enabled) return () => {};
  const safePose = Object.hasOwn(FPS, pose) ? pose : 'idle', fps = FPS[safePose];
  let timer, stopped = false, last = -1;
  const draw = () => {
    if (stopped) return;
    if (safePose === 'groove' && !reduceMotion) {
      const { index, wait } = grooveFrame(wallClock() + beatLead, beat());
      if (index !== last) { last = index; onFrame(index); }
      timer = setTimer(draw, Math.max(16, Math.ceil(wait)));
      return;
    }
    const time = now() - origin, index = reduceMotion ? 0 : frameAt(safePose, time);
    if (index !== last) { last = index; onFrame(index); }
    if (!reduceMotion && !stopped) {
      // Recompute against the clock each time: delayed background timers skip
      // missed frames rather than queueing a burst or accumulating drift.
      const current = now() - origin, nextBoundary = (Math.floor(current / 1000 * fps) + 1) * 1000 / fps;
      timer = setTimer(draw, Math.max(1, Math.ceil(nextBoundary - current)));
    }
  };
  draw();
  return () => { stopped = true; clearTimer(timer); };
}
