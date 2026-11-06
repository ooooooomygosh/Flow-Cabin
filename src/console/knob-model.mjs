// The console's fluted knob: how an angle on the dial and a volume on the slider turn into each
// other. The dial sweeps 2.30 rad either side of straight up, a 264-degree arc with a dead zone
// at the bottom, as DEsk's volume knob does (draw.c cc_face_knob, https://github.com/fyzugx/DEsk,
// MIT, (c) 2026 The DEsk authors). The value is the *slider* position, the perceptual one the
// player already uses (src/player/volume-curve.mjs: sliderToGain turns it into amplitude), so the
// knob, the old slider and the wheel all agree about what "6" means.
import { VOLUME_STEP } from '../player/volume-curve.mjs';

export const KNOB_SWEEP_RAD = 2.30;
export const KNOB_SWEEP_DEG = KNOB_SWEEP_RAD * 180 / Math.PI;
export const KNOB_DETENTS = 10; // a click every tenth, as on a stepped scale 0..10
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

// Degrees clockwise from straight up for a value 0..1 (0 sits at the lower left, 1 at the lower right).
export const valueToAngle = (value) => -KNOB_SWEEP_DEG + 2 * KNOB_SWEEP_DEG * clamp(value);
export const angleToValue = (deg) => clamp((Number(deg) + KNOB_SWEEP_DEG) / (2 * KNOB_SWEEP_DEG));

// The angle of a point seen from the knob's centre, in degrees clockwise from up, (-180, 180].
export function pointerAngle(cx, cy, x, y) {
  const deg = Math.atan2(x - cx, -(y - cy)) * 180 / Math.PI;
  return deg <= -180 ? 180 : deg;
}
// Dragging turns the knob by however far the pointer went round, so grabbing it anywhere does not
// make it jump, and the dead zone at the bottom cannot flip 0 to 10 in one move.
export function dragValue(value, previousAngle, angle) {
  let delta = angle - previousAngle;
  if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
  return clamp(clamp(value) + delta / (2 * KNOB_SWEEP_DEG));
}

// Which of the eleven marks (0..10) a value is nearest; a click is heard when this changes.
export const detentOf = (value) => Math.round(clamp(value) * KNOB_DETENTS);
export const crossedDetent = (from, to) => detentOf(from) !== detentOf(to);

// Keys on the focused knob: arrows nudge one step, Page keys a tenth, Home / End the ends.
export function keyValue(value, key, step = VOLUME_STEP) {
  const v = clamp(value), round = (n) => Math.round(clamp(n) * 100) / 100;
  switch (key) {
    case 'ArrowUp': case 'ArrowRight': return round(v + step);
    case 'ArrowDown': case 'ArrowLeft': return round(v - step);
    case 'PageUp': return round(v + .1);
    case 'PageDown': return round(v - .1);
    case 'Home': return 0;
    case 'End': return 1;
    default: return null;
  }
}

// The engraved scale: eleven marks, a number on every other one (0 2 4 6 8 10).
export const scaleMarks = (count = KNOB_DETENTS) => Array.from({ length: count + 1 }, (_, i) => {
  const value = i / count;
  return { i, value, deg: valueToAngle(value), major: i % 2 === 0, label: i % 2 === 0 ? String(i) : '' };
});
// A point on a circle of radius r around (cx, cy), at `deg` clockwise from up.
export const polar = (cx, cy, r, deg) => { const a = deg * Math.PI / 180; return { x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r }; };
