// The two VU meters: how a needle follows the playback energy (`cabin:playback`, 0..1, about 15 Hz,
// src/player/playback-signal.mjs). A real meter is a damped spring pulled towards the signal, so
// the needle swings a little past a sudden loud passage and settles; reduced motion makes it jump
// straight to the reading. The swing range is DEsk's cc_needle: -0.62..+0.62 rad about straight up
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors).
export const NEEDLE_SWEEP_RAD = 0.62;
export const NEEDLE_SWEEP_DEG = NEEDLE_SWEEP_RAD * 180 / Math.PI;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

// Degrees clockwise from up for a reading 0..1 (the needle may be drawn a hair past the ends).
export const readingToAngle = (reading) => -NEEDLE_SWEEP_DEG + 2 * NEEDLE_SWEEP_DEG * clamp(reading, -.05, 1.05);

// What the needle is pulled towards: music is dense in the middle, so the energy is curved to give
// the scale some use below half and keep loud passages off the pin.
export const targetFor = (energy) => { const e = clamp(energy); return clamp(Math.pow(e, .85) * .94, 0, 1); };

// One step of a damped spring: { pos, vel } -> { pos, vel }. zeta < 1 overshoots slightly (VU
// ballistics reach 99% in about 300 ms). Sub-steps keep it stable on a slow frame. Reduced motion
// jumps; no energy at all (paused) lets the needle fall home on the same spring.
export function needleStep(state, target, dt, { reduced = false, zeta = .72, omega = 15 } = {}) {
  const goal = clamp(target);
  if (reduced) return { pos: goal, vel: 0 };
  let pos = Number.isFinite(state?.pos) ? state.pos : 0, vel = Number.isFinite(state?.vel) ? state.vel : 0;
  let left = clamp(dt, 0, .25);
  while (left > 0) {
    const h = Math.min(left, 1 / 240);
    vel += (omega * omega * (goal - pos) - 2 * zeta * omega * vel) * h;
    pos += vel * h;
    left -= h;
  }
  // the pin at the top and the stop at the bottom
  if (pos > 1.04) { pos = 1.04; vel = Math.min(vel, 0); } else if (pos < -.03) { pos = -.03; vel = Math.max(vel, 0); }
  return { pos, vel };
}
export const needleSettled = (state, target, epsilon = .002) => Math.abs((state?.pos ?? 0) - clamp(target)) < epsilon && Math.abs(state?.vel ?? 0) < epsilon;

// The second meter reads peaks: a loud moment is held and let go slowly.
export const peakStep = (peak, energy, dt, decayPerSecond = .55) => Math.max(clamp(energy), clamp(peak) - decayPerSecond * clamp(dt, 0, .5));

// Scale ticks on the meter face: `count` divisions, every fifth long, red from `redFrom` up.
export const meterTicks = (count = 20, redFrom = .8) => Array.from({ length: count + 1 }, (_, i) => {
  const value = i / count;
  return { i, value, deg: readingToAngle(value), long: i % 5 === 0, red: value >= redFrom - 1e-9 };
});
