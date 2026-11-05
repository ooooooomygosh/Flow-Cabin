// One lamp lights the whole desk: every sheet, plate and letter throws its shadow
// away from the same point. The model is DEsk's (draw.c shadow_dir / shadowOffset,
// https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Lamp position as a fraction of the window (y < 0 is above the top edge), its height as a
// fraction of the window width, and the shadow-length clamps. Light comes from the window
// side of the room, high and to the left, so shadows fall down and to the right.
export const LAMP = Object.freeze({ x: 0.22, y: -0.32, h: 0.78, kmin: 0.10, kmax: 1.40 });
const BY_THEME = Object.freeze({
  seaside: { x: 0.30, y: -0.40 },
  'rain-train': { x: 0.12, y: -0.20 },
  starlight: { x: 0.50, y: -0.45 },
  greenhouse: { x: 0.55, y: -0.50 }
});
export const lampFor = (theme) => ({ ...LAMP, ...(BY_THEME[theme] || {}) });

// The shadow of something `lift` px above the desk whose centre is at (px, py), for a window
// of width w and height h. Returns the offset in px, pointing away from the lamp.
export function shadowOffset(px, py, w, h, lift, lamp = LAMP) {
  const lx = lamp.x * w, ly = lamp.y * h, height = lamp.h * w;
  const dx = px - lx, dy = py - ly, len = Math.hypot(dx, dy) || 1;
  const k = lift * clamp(len / height, lamp.kmin, lamp.kmax);
  return { x: (dx / len) * k, y: (dy / len) * k };
}

// How strongly the lamp shows: night is its time, a dimmed room (curtains, bedtime) turns it down.
export function lampStrength({ bucket = 'day', dim = false } = {}) {
  const base = { night: 1, dusk: 0.9, morning: 0.7, day: 0.55 }[bucket] ?? 0.6;
  return dim ? base * 0.45 : base;
}

// --sx / --sy: the shadow of a 1-px-high thing at the middle of the window. Elements
// multiply them by their own height: `box-shadow: calc(var(--sx) * 12) calc(var(--sy) * 12) ...`.
// --lamp-k is the strength (0..1) that scales shadow alpha.
export function installLamp({ theme = 'pixel', bucket = 'day', dim = false, width, height } = {}, root = globalThis.document?.documentElement) {
  if (!root) return null;
  const w = width ?? globalThis.innerWidth ?? 1440, h = height ?? globalThis.innerHeight ?? 900;
  const { x, y } = shadowOffset(w / 2, h / 2, w, h, 1, lampFor(theme));
  const strength = lampStrength({ bucket, dim });
  root.style.setProperty('--sx', x.toFixed(3));
  root.style.setProperty('--sy', y.toFixed(3));
  root.style.setProperty('--lamp-k', strength.toFixed(2));
  return { x, y, strength };
}
