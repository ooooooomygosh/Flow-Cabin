// 小盆栽: a terracotta pot on a little shelf. Through a focus round the seedling
// grows in 8 stages and flowers at the end; a break waters it; finished rounds
// of this set line up as tiny sprouts beside it. A chalk sign under the shelf
// carries the time.
import { BIG, SMALL, layoutText } from '../pixel-digits.mjs';
import { createRaster, fill, px, text, mix } from '../raster.mjs';
import { panel } from './kit.mjs';
import { phaseGlow } from '../face-palette.mjs';

export const STAGES = 8;
const W = 76, SHELF = 50, CX = 38;
export function stageOf(model) {
  if (model.mode === 'clock' || model.phase === 'shortBreak' || model.phase === 'longBreak') return STAGES - 1;
  return Math.min(STAGES - 1, Math.floor((model.progress ?? 0) * STAGES));
}
const signWidth = (model) => Math.max(34, layoutText(model.groups.join(':'), BIG).width + 10);
export const size = (model) => ({ w: Math.max(W, signWidth(model) + 4 + (model.small ? 28 : 0)), h: 78 });

function leaf(r, x, y, dir, pal, big) {
  const L = pal.leaf, pts = big
    ? [[3, -2, 3], [4, -2, 2], [5, -2, 1], [1, -1, 2], [2, -1, 3], [3, -1, 2], [4, -1, 2], [5, -1, 1], [6, -1, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1], [4, 0, 0], [5, 0, 0]]
    : [[1, 0, 1], [2, -1, 2], [3, -1, 2], [2, 0, 1], [3, -2, 3], [4, -1, 1]];
  for (const [dx, dy, c] of pts) px(r, x + dx * dir, y + dy, L[c]);
}
// The seed leaves: two rounded cotyledons either side of the stem at (x, y).
function cotyledons(r, x, y, pal) {
  const L = pal.leaf;
  for (const dir of [-1, 1]) {
    for (const [dx, dy, c] of [[1, 0, 1], [2, 0, 2], [3, 0, 2], [4, 0, 1], [2, 1, 0], [3, 1, 0], [1, -1, 2], [2, -1, 3], [3, -1, 3], [4, -1, 2], [5, -1, 1], [2, -2, 2], [3, -2, 3], [4, -2, 2], [5, 0, 0]]) px(r, x + dx * dir, y + dy, L[c]);
  }
}
// A cane stake with a raffia tie, and a seed tag pushed into the soil: the
// young plant's company until it flowers.
function stake(r, top, h, tieAt, pal) {
  for (let y = 0; y < h; y++) px(r, CX + 6, top - 1 - y, y % 5 === 4 ? pal.wood[1] : pal.wood[3]);
  px(r, CX + 6, top - h, pal.wood[2]);
  if (tieAt) for (let x = CX + 2; x <= CX + 5; x++) px(r, x, top - 1 - tieAt, pal.cloth[x % 2 ? 1 : 2]);
  const tx = CX - 11, ty = top - 8;
  fill(r, tx + 2, ty + 4, 1, 4, pal.wood[2]);
  fill(r, tx, ty, 5, 5, pal.outline); fill(r, tx + 1, ty + 1, 3, 3, pal.cream); px(r, tx + 2, ty + 2, pal.leaf[2]); px(r, tx + 1, ty + 3, mix(pal.cream, pal.outline, .3)); px(r, tx + 3, ty + 3, mix(pal.cream, pal.outline, .3));
}
function plant(r, stage, pal, top) {
  const L = pal.leaf, h = [3, 7, 11, 14, 17, 21, 24, 26][stage];
  if (stage < 6) stake(r, top, 15, stage >= 2 ? Math.min(h - 3, 9) : 0, pal);
  for (let y = 0; y < h; y++) { px(r, CX, top - 1 - y, L[1]); if (stage >= 2 && y < h - 3) px(r, CX + 1, top - 1 - y, L[0]); }
  // The seed leaves hold the young plant up and drop once it has true leaves.
  if (stage <= 3) cotyledons(r, CX, top - 1 - Math.min(h - 1, stage === 0 ? 2 : 3), pal);
  // True leaves alternate up the stem; from stage 3 each node also gets a smaller partner.
  for (let i = 0, y = 6; y < h - 2; i++, y += 4) {
    const side = i % 2 ? 1 : -1;
    leaf(r, CX + (side > 0 ? 1 : 0), top - 1 - y, side, pal, stage >= 2 && y < h - 5);
    if (stage >= 3 && y < h - 4) leaf(r, CX + (side > 0 ? 0 : 1), top - y, -side, pal, false);
  }
  const tip = top - 1 - h;
  if (stage === 0) { px(r, CX - 1, top, pal.wood[0]); return; }
  if (stage < 6) { px(r, CX - 1, tip, L[3]); px(r, CX + 1, tip, L[3]); px(r, CX, tip, L[2]); px(r, CX, tip - 1, L[3]); return; }
  const B = pal.bloom;
  if (stage === 6) { fill(r, CX - 1, tip - 1, 3, 2, B[0]); px(r, CX, tip - 2, B[1]); px(r, CX - 1, tip + 1, L[2]); px(r, CX + 1, tip + 1, L[2]); return; }
  for (const [dx, dy] of [[0, -3], [-1, -3], [1, -3], [-3, -1], [-3, 0], [3, -1], [3, 0], [-2, 2], [-1, 2], [2, 2], [1, 2], [-2, -2], [2, -2], [-2, 1], [2, 1]]) px(r, CX + dx, tip - 1 + dy, B[0]);
  for (const [dx, dy] of [[0, -2], [-1, -2], [-2, -1], [-2, 0], [1, -2], [2, -1], [2, 0], [-1, 1], [1, 1]]) px(r, CX + dx, tip - 1 + dy, B[1]);
  fill(r, CX - 1, tip - 2, 3, 3, pal.glow[1]); px(r, CX - 1, tip - 2, pal.glow[2]);
}
export function paint(model, pal) {
  const { w } = size(model), r = createRaster(w, 78), glow = phaseGlow(pal, model.phase), cx = Math.floor(w / 2), off = cx - CX;
  const sub = createRaster(W, 78);
  // pot: rim, body tapering down, soil
  const P = pal.pot, potTop = SHELF - 15;
  for (let y = 0; y < 13; y++) { const half = 9 - Math.floor(y / 4); fill(sub, CX - half - 1, potTop + 2 + y, half * 2 + 3, 1, pal.outline); fill(sub, CX - half, potTop + 2 + y, half * 2 + 1, 1, P[1]); px(sub, CX - half, potTop + 2 + y, P[2]); fill(sub, CX + half - 1, potTop + 2 + y, 2, 1, P[0]); }
  fill(sub, CX - 12, potTop - 1, 25, 4, pal.outline); fill(sub, CX - 11, potTop, 23, 2, P[2]); fill(sub, CX - 11, potTop + 1, 23, 1, P[1]); fill(sub, CX - 10, potTop, 20, 1, mix(P[2], '#ffffff', .25));
  fill(sub, CX - 9, potTop - 1, 19, 1, '#3b2414');
  plant(sub, stageOf(model), pal, potTop - 1);
  // a break waters the plant
  if (model.phase === 'shortBreak' || model.phase === 'longBreak') for (const [dx, dy] of [[-8, -20], [7, -14], [-5, -8], [9, -26]]) { px(sub, CX + dx, potTop + dy, pal.rest[2]); px(sub, CX + dx, potTop + dy + 1, pal.rest[1]); }
  // finished rounds of this set: tiny sprouts in a row on the left
  if (model.mode === 'timer') { const n = Math.min(8, model.longEvery), done = model.round % n; for (let i = 0; i < done; i++) { const x = 4 + i * 6; fill(sub, x, SHELF - 4, 4, 4, pal.outline); fill(sub, x + 1, SHELF - 3, 2, 3, P[1]); px(sub, x + 1, SHELF - 6, pal.leaf[2]); px(sub, x + 2, SHELF - 5, pal.leaf[1]); px(sub, x + 2, SHELF - 6, pal.leaf[3]); } }
  for (let y = 0; y < 78; y++) for (let x = 0; x < W; x++) { const v = sub.data[y * W + x]; if (v) r.data[y * w + x + off] = v; }
  // the shelf and its brackets
  panel(r, 0, SHELF, w, 6, pal, { grain: false });
  for (const bx of [8, w - 13]) { for (let j = 0; j < 4; j++) fill(r, bx + j, SHELF + 6 + j, 5 - j, 1, j === 3 ? pal.outline : pal.wood[0]); }
  // the chalk sign, hung on two strings
  const value = model.groups.join(':'), L = layoutText(value, BIG), sw = signWidth(model), sx = Math.floor((w - sw) / 2), sy = 61;
  fill(r, sx + 4, SHELF + 6, 1, sy - SHELF - 6, pal.metal[1]); fill(r, sx + sw - 5, SHELF + 6, 1, sy - SHELF - 6, pal.metal[1]);
  fill(r, sx, sy, sw, 17, pal.outline); fill(r, sx + 1, sy + 1, sw - 2, 15, pal.wood[2]); fill(r, sx + 1, sy + 1, sw - 2, 1, pal.wood[3]);
  fill(r, sx + 2, sy + 2, sw - 4, 13, pal.night[2]); fill(r, sx + 2, sy + 2, sw - 4, 1, pal.outline);
  text(r, value, BIG, sx + Math.floor((sw - L.width) / 2), sy + 3, model.paused ? mix(pal.cream, pal.night[2], .45) : pal.cream);
  if (model.mode === 'timer' && model.running) { px(r, sx + sw - 4, sy + 3, glow[2]); }
  if (model.small) { const s = layoutText(model.small, SMALL); text(r, model.small, SMALL, sx + sw + 3, sy + 7, glow[1], { shadow: pal.outline }); }
  return r;
}
export const face = { id: 'growth', size, paint, steps: STAGES };
