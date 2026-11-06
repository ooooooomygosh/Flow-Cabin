// How things on the desk move: underdamped springs, not cubic curves.
// The spring and its two presets are from DEsk's try-it page
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors, index.html).
// Everything here is plain functions; `installMotion()` is the one DOM touch.
import { reducedMotion } from '../motion-preference.mjs';

// Position of a spring released at 0 and heading for 1, at time u (0..1 of its length).
// Z is the damping ratio (<1 overshoots), Wn the natural frequency in rad per unit.
export function spring(u, Z, Wn) {
  if (u >= 1) return 1;
  if (u <= 0) return 0;
  const wd = Wn * Math.sqrt(1 - Z * Z);
  return 1 - Math.exp(-Z * Wn * u) * (Math.cos(wd * u) + (Z * Wn / wd) * Math.sin(wd * u));
}
export const drawerEase = (u) => spring(u, 0.80, 12);   // drawers, sheets, anything pulled out
export const lookEase = (u) => spring(u, 0.74, 8.5);    // the camera moving between corners

// CSS `linear()` easing sampled from a spring, so a transition can overshoot like the real thing.
export function springLinear(Z, Wn, steps = 40) {
  const stops = [];
  for (let i = 0; i <= steps; i++) stops.push(Number(spring(i / steps, Z, Wn).toFixed(4)));
  stops[steps] = 1;
  return `linear(${stops.join(', ')})`;
}
export const EASE_DRAWER = springLinear(0.80, 12);
export const EASE_LOOK = springLinear(0.74, 8.5);

// How brisk the desk is (DEsk: the drawer takes 0.47 / 0.62 / 0.90 s).
export const PACES = Object.freeze({ brisk: 0.76, normal: 1, gentle: 1.45 });
export const PACE_KEY = 'flow-cabin-motion-v1';
export function readPace(storage = globalThis.localStorage) {
  try { const value = storage?.getItem(PACE_KEY); return value in PACES ? value : 'normal'; } catch { return 'normal'; }
}
export function savePace(pace, storage = globalThis.localStorage) {
  if (!(pace in PACES)) return false;
  try { storage?.setItem(PACE_KEY, pace); } catch { return false; }
  installMotion();
  return true;
}
// Seconds for a move that takes `seconds` at the normal pace; reduced motion makes it a cut.
export const moveSeconds = (seconds, pace = readPace(), reduced = reducedMotion()) => reduced ? 0.0001 : seconds * PACES[pace];

// --pace, --ease-drawer and --ease-look on <html>; CSS multiplies its durations by --pace.
export function installMotion(root = globalThis.document?.documentElement) {
  if (!root) return;
  const pace = readPace();
  root.style.setProperty('--pace', String(PACES[pace]));
  root.style.setProperty('--ease-drawer', EASE_DRAWER);
  root.style.setProperty('--ease-look', EASE_LOOK);
  root.dataset.motionPace = pace;
}
