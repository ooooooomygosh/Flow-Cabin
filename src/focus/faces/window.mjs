// 窗景时钟: the window becomes the clock. The sky outside follows the real
// time of day (dawn, day, dusk, night in stepped bands), the sun or moon rides
// an arc across both panes, the scene's own horizon sits at the bottom, and the
// time is frosted onto the glass: hours in the left pane, minutes in the right.
import { BIG, SMALL, layoutText, glyph } from '../pixel-digits.mjs';
import { createRaster, fill, px, get, disc, mix, colour } from '../raster.mjs';
import { hash, stud, rail } from './kit.mjs';
import { phaseGlow } from '../face-palette.mjs';

const PANE_W = 36, PANE_H = 46, FRAME = 4, MULLION = 3, CURTAIN = 8, ROD = 4, SILL = 5;
const WIN_W = PANE_W * 2 + MULLION + FRAME * 2, WIN_H = PANE_H + FRAME * 2;
const W = WIN_W + CURTAIN * 2, H = ROD + WIN_H + SILL;
const GX = CURTAIN + FRAME, GY = ROD + FRAME, GLASS_W = PANE_W * 2 + MULLION;
export const size = () => ({ w: W, h: H });
// A frosted sand timer stands in the right pane when only minutes show.
const SAND = { w: 7, h: 9, colonW: 2, glyphs: { h: ['#######', '.#...#.', '.##.##.', '..###..', '...#...', '..#.#..', '.#.#.#.', '.#####.', '#######'] } };

export const SKIES = Object.freeze({
  night: ['#0b1024', '#111a35', '#1a2546', '#25345a'],
  dawn: ['#34356a', '#6c5a8c', '#c9848a', '#f2bf8f'],
  day: ['#5b9bd0', '#77b0dc', '#9cc7e6', '#c4def0'],
  dusk: ['#262352', '#59396a', '#a9566c', '#ec9a6c']
});
export const skyAt = (hour) => hour < 5 || hour >= 20 ? 'night' : hour < 7 ? 'dawn' : hour < 17 ? 'day' : 'dusk';
// The sun (06–18) or the moon (18–06) along an arc over the glass: 0..1 across.
export function bodyAt(hour) {
  const sun = hour >= 6 && hour < 18, t = sun ? (hour - 6) / 12 : ((hour + 6) % 24) / 12;
  return { sun, x: GX + 3 + Math.round(t * (GLASS_W - 7)), y: GY + 4 + Math.round((1 - Math.sin(Math.PI * t)) * 7) };
}

function sky(r, slot) {
  const ramp = SKIES[slot], band = PANE_H / 4;
  for (let y = 0; y < PANE_H; y++) {
    const b = Math.min(3, Math.floor(y / band)), next = Math.min(3, b + 1), edge = (b + 1) * band - y <= 1 && b < 3;
    for (let x = 0; x < GLASS_W; x++) px(r, GX + x, GY + y, edge && (x + y) % 2 ? ramp[next] : ramp[b]);
  }
}
// The scene's horizon along the bottom of the glass.
function horizon(r, pal, slot) {
  const base = GY + PANE_H, night = slot === 'night', dim = (c) => night ? mix(c, '#05070f', .55) : slot === 'day' ? c : mix(c, '#1a1030', .3);
  const kind = pal.horizon;
  if (kind === 'sea') {
    const sea = night ? ['#101c33', '#18294a'] : [dim('#2c5f80'), dim('#3e7b9c')];
    fill(r, GX, base - 11, GLASS_W, 11, sea[0]);
    for (let y = base - 11; y < base; y += 3) for (let x = 0; x < GLASS_W; x++) if (hash(x >> 1, y, 4) > .72) px(r, GX + x, y, sea[1]);
    fill(r, GX, base - 12, GLASS_W, 1, dim('#d8e6ea'));
    for (let x = 6; x < GLASS_W; x += 13) px(r, GX + x, base - 9 + (x % 3), dim('#e8f2f4'));
    // a small sailboat on the horizon
    const bx = GX + 48; fill(r, bx, base - 14, 1, 3, dim('#6b4a2e')); fill(r, bx + 1, base - 16, 3, 4, dim('#f3efe2')); fill(r, bx - 2, base - 12, 7, 1, dim('#4a3424'));
    return;
  }
  if (kind === 'roofs') {
    const roof = dim('#2a2438'), lit = phaseGlow(pal, 'focus')[2];
    let x = 0;
    while (x < GLASS_W) {
      const w = 7 + Math.floor(hash(x, 3, 8) * 8), h = 6 + Math.floor(hash(x, 5, 8) * 7);
      fill(r, GX + x, base - h, w, h, roof); fill(r, GX + x - 1, base - h - 1, w + 2, 1, dim('#3a3350'));
      if (hash(x, 7, 8) > .4) fill(r, GX + x + Math.floor(w / 2) - 1, base - h - 3, 2, 2, roof);
      for (let wy = base - h + 3; wy < base - 2; wy += 3) for (let wx = 2; wx < w - 2; wx += 3) if (hash(x + wx, wy, 9) > (night ? .55 : .9)) px(r, GX + x + wx, wy, night ? lit : dim('#8fa0b8'));
      x += w + 1;
    }
    return;
  }
  // pines (cabin scenes) or a denser forest
  const dense = kind === 'forest', far = dim(dense ? '#2d4a32' : '#2f4a4f'), near = dim(dense ? '#1f3a26' : '#1f3540'), snow = pal.snow ? dim('#e6eef4') : null;
  fill(r, GX, base - 3, GLASS_W, 3, snow || near);
  const tree = (cx, h, c) => { for (let j = 0; j < h; j++) { const half = Math.floor(j * .45) + (j % 3 === 2 ? 1 : 0); fill(r, GX + cx - half, base - 3 - h + j, half * 2 + 1, 1, c); if (snow && j % 3 === 0 && j) { px(r, GX + cx - half, base - 3 - h + j, snow); px(r, GX + cx + half, base - 3 - h + j, snow); } } if (snow) px(r, GX + cx, base - 3 - h, snow); };
  for (let i = 0, x = 3; x < GLASS_W; i++, x += dense ? 6 : 9) tree(x + Math.floor(hash(i, 1, 6) * 3), (dense ? 8 : 6) + Math.floor(hash(i, 2, 6) * 4), far);
  for (let i = 0, x = 7; x < GLASS_W; i++, x += dense ? 9 : 17) tree(x + Math.floor(hash(i, 3, 6) * 4), (dense ? 11 : 9) + Math.floor(hash(i, 4, 6) * 4), near);
}
// Digits frosted onto the glass: a darker cast one pixel down-right, then the
// strokes, the sky showing through them lighter.
function frost(r, value, f, cell, x, y, slot) {
  const L = layoutText(value, f, { cell, gap: cell }), day = slot === 'day', cells = [];
  for (const g of L.glyphs) glyph(g.ch, f).forEach((row, gy) => { for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) cells.push([x + g.x + gx * cell + i, y + gy * cell + j]); });
  for (const [X, Y] of cells) { const under = get(r, X + 1, Y + 1); if (under) px(r, X + 1, Y + 1, mix(under, day ? '#1f3a5c' : '#000000', day ? .45 : .4)); }
  for (const [X, Y] of cells) px(r, X, Y, mix(get(r, X, Y) || colour('#202838'), '#ffffff', day ? .9 : .74));
  return L.width;
}

export function paint(model, pal) {
  const r = createRaster(W, H), slot = skyAt(model.hour), glow = phaseGlow(pal, model.phase);
  // sky, stars / flakes, sun or moon, horizon
  sky(r, slot);
  if (slot === 'night' || slot === 'dusk') for (let i = 0; i < 26; i++) { const x = Math.floor(hash(i, 1, 21) * GLASS_W), y = Math.floor(hash(i, 2, 21) * (PANE_H - 16)); px(r, GX + x, GY + y, slot === 'night' ? (i % 5 ? '#c8cbe8' : '#ffffff') : '#e8c8d0'); if (i % 9 === 0 && slot === 'night') { px(r, GX + x - 1, GY + y, '#6a74a8'); px(r, GX + x + 1, GY + y, '#6a74a8'); px(r, GX + x, GY + y - 1, '#6a74a8'); px(r, GX + x, GY + y + 1, '#6a74a8'); } }
  const body = bodyAt(model.hour);
  if (body.sun) { disc(r, body.x, body.y, 3.6, 3.6, slot === 'day' ? '#fff3c4' : '#ffd9a0'); disc(r, body.x, body.y, 2.4, 2.4, slot === 'day' ? '#fffbe8' : '#fff0c8'); }
  else { const under = SKIES[slot][0]; disc(r, body.x, body.y, 3.4, 3.4, '#f1ecd4'); disc(r, body.x + 2, body.y - 1, 2.6, 2.6, under); px(r, body.x - 2, body.y + 1, '#cfc8ac'); }
  if (pal.snow) for (let i = 0; i < 18; i++) px(r, GX + Math.floor(hash(i, 7, 33) * GLASS_W), GY + Math.floor(hash(i, 8, 33) * (PANE_H - 6)), slot === 'day' ? '#ffffff' : '#dfe6f2');
  horizon(r, pal, slot);
  // the time, frosted: HH | MM either side of the mullion
  const [a, b = ''] = model.groups, dy = GY + 12;
  const half = (s, f, cell) => layoutText(s, f, { cell, gap: cell }).width;
  if (b) { frost(r, a, BIG, 2, GX + Math.floor((PANE_W - half(a, BIG, 2)) / 2), dy, slot); frost(r, b, BIG, 2, GX + PANE_W + MULLION + Math.floor((PANE_W - half(b, BIG, 2)) / 2), dy, slot); }
  else { frost(r, a, BIG, 2, GX + Math.floor((PANE_W - half(a, BIG, 2)) / 2), dy, slot); frost(r, 'h', SAND, 2, GX + PANE_W + MULLION + Math.floor((PANE_W - 14) / 2), dy + 2, slot); }
  if (model.small) frost(r, model.small, SMALL, 1, GX + GLASS_W - half(model.small, SMALL, 1) - 3, GY + 3, slot);
  // glass glints (top-left of each pane)
  for (const ox of [0, PANE_W + MULLION]) for (let i = 0; i < 4; i++) { px(r, GX + ox + 3 + i, GY + 6 - i, mix(get(r, GX + ox + 3 + i, GY + 6 - i), '#ffffff', .4)); px(r, GX + ox + 3 + i, GY + 9 - i, mix(get(r, GX + ox + 3 + i, GY + 9 - i), '#ffffff', .25)); }
  // frame and mullion (wood, lit from the top-left; glass gets the frame's shadow)
  const fx = CURTAIN, fy = ROD, wood = pal.wood;
  fill(r, fx, fy, WIN_W, FRAME, wood[2]); fill(r, fx, fy + WIN_H - FRAME, WIN_W, FRAME, wood[1]);
  fill(r, fx, fy, FRAME, WIN_H, wood[2]); fill(r, fx + WIN_W - FRAME, fy, FRAME, WIN_H, wood[1]);
  fill(r, fx, fy, WIN_W, 1, pal.outline); fill(r, fx, fy, 1, WIN_H, pal.outline); fill(r, fx + WIN_W - 1, fy, 1, WIN_H, pal.outline);
  fill(r, fx + 1, fy + 1, WIN_W - 2, 1, wood[3]); fill(r, fx + 1, fy + 1, 1, WIN_H - 2, wood[3]);
  fill(r, GX - 1, GY - 1, GLASS_W + 2, 1, pal.outline); fill(r, GX - 1, GY - 1, 1, PANE_H + 2, pal.outline); fill(r, GX + GLASS_W, GY - 1, 1, PANE_H + 1, wood[3]); fill(r, GX - 1, GY + PANE_H, GLASS_W + 2, 1, wood[3]);
  for (let x = 0; x < GLASS_W; x++) px(r, GX + x, GY, mix(get(r, GX + x, GY), '#000000', .35));
  const mx = GX + PANE_W;
  fill(r, mx, GY, MULLION, PANE_H, wood[2]); fill(r, mx, GY, 1, PANE_H, wood[3]); fill(r, mx + MULLION - 1, GY, 1, PANE_H, wood[0]);
  for (let y = 0; y < PANE_H; y++) px(r, mx + MULLION, GY + y, mix(get(r, mx + MULLION, GY + y), '#000000', .3));
  // sill, lit along its top; during a round it carries the progress rail
  const sy = fy + WIN_H;
  fill(r, fx - 2, sy, WIN_W + 4, SILL, pal.outline); fill(r, fx - 1, sy + 1, WIN_W + 2, SILL - 2, wood[2]); fill(r, fx - 1, sy + 1, WIN_W + 2, 1, wood[4] || wood[3]); fill(r, fx - 1, sy + SILL - 2, WIN_W + 2, 1, wood[0]);
  if (model.mode === 'timer' && model.progress !== null) rail(r, GX + 6, sy + 1, GLASS_W - 12, model.progress, glow, pal);
  // rod and curtains, tied back at two thirds
  fill(r, 1, 1, W - 2, 2, pal.metal[2]); fill(r, 1, 1, W - 2, 1, pal.metal[3]); fill(r, 1, 3, W - 2, 1, pal.outline);
  stud(r, 0, 0, 3, 4, pal.metal); stud(r, W - 3, 0, 3, 4, pal.metal);
  const cloth = pal.cloth, folds = [2, 1, 1, 0, 1, 2, 1, 0];
  for (const side of [0, 1]) {
    for (let y = ROD; y < H - SILL - 2; y++) {
      const tie = ROD + Math.round(WIN_H * .62), gather = y > tie - 6 && y < tie + 6 ? 2 : y >= tie + 6 ? 1 : 0, w = CURTAIN - gather;
      for (let i = 0; i < w; i++) { const x = side ? W - 1 - i : i; px(r, x, y, i === w - 1 ? pal.outline : cloth[folds[(i + (y > tie ? 1 : 0)) % folds.length]]); }
      if (y === tie) for (let i = 0; i < w; i++) px(r, side ? W - 1 - i : i, y, i === w - 1 ? pal.outline : pal.metal[2]);
    }
  }
  return r;
}
export const face = { id: 'window', size, paint, wall: true, steps: 64 };
