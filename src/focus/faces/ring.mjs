// 像素番茄环: a round wooden plaque with 36 beads of the scene's material
// (brass, leaves, shells, stars, lamp amber) lighting clockwise through the
// round; the clock fills them by the minute of the hour. The time sits in a
// recessed dial in the middle.
import { BIG, SMALL, layoutText } from '../pixel-digits.mjs';
import { createRaster, fill, px, disc, text, mix } from '../raster.mjs';
import { stud } from './kit.mjs';
import { phaseGlow } from '../face-palette.mjs';

export const BEADS = 36;
const S = 81, C = 40, PLAQUE = 39, BEAD_R = 32, DIAL = 24;
export const size = () => ({ w: S, h: S });
// Bead centres, clockwise from 12 o'clock.
export const beadPoints = Array.from({ length: BEADS }, (_, i) => { const a = i / BEADS * Math.PI * 2 - Math.PI / 2; return [Math.round(C + Math.cos(a) * BEAD_R), Math.round(C + Math.sin(a) * BEAD_R)]; });
// 4×4 sprites: 1 shade, 2 base, 3 highlight, o outline.
const SPRITES = {
  round: ['.33.', '3322', '2221', '.11.'],
  leaf: ['..33', '.332', '3221', '21..'],
  star: ['.3..', '3332', '.22.', '.1..']
};
const spriteFor = (bead) => bead === 'leaf' ? SPRITES.leaf : bead === 'star' ? SPRITES.star : SPRITES.round;
function bead(r, x, y, sprite, ramp, outline) {
  const at = (i, j) => sprite[j]?.[i] && sprite[j][i] !== '.';
  if (outline) for (let j = -1; j <= 4; j++) for (let i = -1; i <= 4; i++) if (!at(i, j) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(i + dx, j + dy))) px(r, x - 2 + i, y - 2 + j, outline);
  sprite.forEach((row, j) => { for (let i = 0; i < 4; i++) { const k = row[i]; if (k !== '.') px(r, x - 2 + i, y - 2 + j, ramp[Number(k) - 1]); } });
}
export function lit(model) {
  if (model.mode === 'clock') return Math.floor((model.hour % 1) * BEADS);
  return Math.floor((model.progress ?? 0) * BEADS);
}
export function paint(model, pal) {
  const r = createRaster(S, S), glow = phaseGlow(pal, model.phase), light = (x, y) => -((x - C) + (y - C)) / Math.SQRT2;
  // the plaque: outline, wood with a lit upper-left rim and grain
  disc(r, C, C, PLAQUE, PLAQUE, pal.outline);
  disc(r, C, C, PLAQUE - 1, PLAQUE - 1, pal.wood[1], (x, y, d) => {
    const l = light(x, y) / PLAQUE;
    if (d > .9) { px(r, x, y, l > .25 ? pal.wood[3] : l < -.3 ? pal.wood[0] : pal.wood[2]); return false; }
    // turned wood: two lathe rings either side of the beads
    const rr = Math.round(Math.hypot(x - C, y - C));
    if (rr === BEAD_R - 4 || rr === BEAD_R + 4) { px(r, x, y, l > 0 ? pal.wood[0] : pal.wood[2]); return false; }
    return true;
  });
  // hour studs at 12 / 3 / 6 / 9
  for (const [x, y] of [[C - 1, 2], [S - 4, C - 1], [C - 1, S - 4], [2, C - 1]]) stud(r, x, y, 2, 2, pal.metal);
  // beads
  const on = lit(model), running = model.mode === 'clock' || model.running, sprite = spriteFor(pal.bead);
  const ramp = model.phase === 'shortBreak' || model.phase === 'longBreak' ? glow : pal.beads;
  beadPoints.forEach(([x, y], i) => {
    if (i < on || (i === on && running)) bead(r, x, y, sprite, i < on ? ramp : [ramp[2], ramp[2], pal.cream], pal.outline);
    else { fill(r, x - 1, y - 1, 2, 2, mix(pal.wood[0], pal.outline, .45)); fill(r, x - 1, y - 1, 2, 1, mix(pal.wood[0], pal.outline, .7)); px(r, x + 1, y, pal.wood[2]); px(r, x, y + 1, pal.wood[2]); px(r, x + 1, y + 1, pal.wood[3]); }
  });
  // the recessed dial
  disc(r, C, C, DIAL + 1, DIAL + 1, pal.outline);
  disc(r, C, C, DIAL, DIAL, pal.night[1], (x, y, d) => { if (d > .8) { const l = light(x, y); px(r, x, y, l > 0 ? mix(pal.night[1], pal.outline, .6) : pal.night[3]); return false; } return true; });
  const value = model.groups.join(':'), L = layoutText(value, BIG), ink = model.paused ? glow[0] : glow[2];
  const ty = model.mode === 'clock' && !model.small ? C - 6 : C - 8;
  text(r, value, BIG, C - Math.floor(L.width / 2), ty, ink, { shadow: pal.outline });
  if (model.small) { const s = layoutText(model.small, SMALL); text(r, model.small, SMALL, C - Math.floor(s.width / 2), C + 5, glow[1]); }
  else if (model.mode === 'timer') {
    // rounds of this set: filled, current (lit), still to come
    const n = Math.min(8, model.longEvery), done = model.round % n, w = n * 3 - 1, x0 = C - Math.floor(w / 2);
    for (let i = 0; i < n; i++) fill(r, x0 + i * 3, C + 7, 2, 2, i < done ? glow[1] : i === done && model.phase === 'focus' ? glow[2] : pal.night[3]);
  }
  return r;
}
export const face = { id: 'ring', size, paint, steps: BEADS };
