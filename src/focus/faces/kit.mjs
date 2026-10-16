// Shared drawing pieces for the faces: one light from the top-left, hard
// outlines, 1-px rims, ramps instead of alpha.
import { fill, px, mix, colour } from '../raster.mjs';

// Deterministic 0..1 noise (grain, stars): same picture every paint.
export const hash = (x, y, seed = 0) => { let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// A wooden panel: outline, chamfered corners, lit top/left rim, shaded
// bottom/right, broken horizontal grain. ramp = wood (dark → light).
export function panel(r, x, y, w, h, pal, { ramp = pal.wood, seed = 1, grain = true } = {}) {
  fill(r, x, y, w, h, pal.outline);
  fill(r, x + 1, y + 1, w - 2, h - 2, ramp[1]);
  if (grain) for (let j = y + 3; j < y + h - 3; j++) {
    if (hash(0, j, seed) < .62) continue;
    let i = x + 2 + Math.floor(hash(j, 0, seed) * 6);
    while (i < x + w - 2) { const run = 5 + Math.floor(hash(i, j, seed) * 14); if (hash(i, j, seed + 7) < .55) fill(r, i, j, Math.min(run, x + w - 2 - i), 1, hash(i, j, seed + 3) < .75 ? ramp[0] : ramp[2]); i += run + 4 + Math.floor(hash(j, i, seed) * 9); }
  }
  fill(r, x + 1, y + 1, w - 2, 1, ramp[3]); fill(r, x + 1, y + 2, 1, h - 3, ramp[2]);
  fill(r, x + 1, y + h - 2, w - 2, 1, ramp[0]); fill(r, x + w - 2, y + 2, 1, h - 4, ramp[0]);
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) px(r, cx, cy, 0);
  px(r, x + 1, y + 1, pal.outline); px(r, x + w - 2, y + 1, pal.outline); px(r, x + 1, y + h - 2, pal.outline); px(r, x + w - 2, y + h - 2, pal.outline);
}
// A recess cut into a panel: deep shadow on the top/left walls, a lit lip at
// the bottom/right (the far walls face the lamp).
export function recess(r, x, y, w, h, pal, inner = pal.night[1]) {
  fill(r, x, y, w, h, inner);
  fill(r, x, y, w, 1, pal.outline); fill(r, x, y, 1, h, pal.outline);
  fill(r, x + 1, y + 1, w - 1, 1, mix(inner, pal.outline, .5));
  fill(r, x, y + h - 1, w, 1, pal.wood[3]); fill(r, x + w - 1, y, 1, h, pal.wood[3]);
  fill(r, x + 1, y + h, w, 1, pal.wood[2]);
}
// A metal stud / rivet / pin, w×h with a lit corner.
export function stud(r, x, y, w, h, ramp) {
  fill(r, x, y, w, h, ramp[2]); fill(r, x, y, w, 1, ramp[3]); fill(r, x + w - 1, y + 1, 1, h - 1, ramp[1]);
  if (h > 1) fill(r, x, y + h - 1, w, 1, ramp[1]); px(r, x, y, ramp[3]);
}
// A brass/silver plate with outline and bevel.
export function plate(r, x, y, w, h, ramp, outline) {
  fill(r, x, y, w, h, outline); fill(r, x + 1, y + 1, w - 2, h - 2, ramp[2]);
  fill(r, x + 1, y + 1, w - 2, 1, ramp[3]); fill(r, x + 1, y + h - 2, w - 2, 1, ramp[1]); fill(r, x + w - 2, y + 2, 1, h - 3, ramp[1]);
  px(r, x, y, 0); px(r, x + w - 1, y, 0); px(r, x, y + h - 1, 0); px(r, x + w - 1, y + h - 1, 0);
}
// A small pixel LED (2×2) in a ramp, or dark when off.
export function led(r, x, y, ramp, on, pal) {
  fill(r, x - 1, y - 1, 4, 4, pal.outline);
  if (on) { fill(r, x, y, 2, 2, ramp[1]); px(r, x, y, ramp[2]); } else fill(r, x, y, 2, 2, pal.night[3]);
}
// Segmented progress rail (3 lit, 1 gap): progress 0..1 across w.
export function rail(r, x, y, w, progress, ramp, pal) {
  fill(r, x - 1, y - 1, w + 2, 4, pal.outline); fill(r, x, y, w, 2, pal.night[1]);
  const lit = Math.round(Math.max(0, Math.min(1, progress)) * w);
  for (let i = 0; i < lit; i++) if (i % 4 !== 3) { px(r, x + i, y, ramp[2]); px(r, x + i, y + 1, ramp[1]); }
}
export const darkenTo = (target, t) => (c) => mix(c, target, t);
export { colour };
