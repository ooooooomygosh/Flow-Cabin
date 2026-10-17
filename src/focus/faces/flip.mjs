// 琥珀翻页钟: a walnut desk clock with brass corners and cream digit cards.
// Cards flip with flip-math.mjs (gluqlo's squash-and-darken), only on change.
import { BIG, SMALL, layoutText } from '../pixel-digits.mjs';
import { createRaster, fill, px, get, blit, text, mix, colour } from '../raster.mjs';
import { flipFrame, leafRows } from '../flip-math.mjs';
import { panel, recess, stud, plate, led, rail } from './kit.mjs';
import { phaseGlow } from '../face-palette.mjs';

const BIG_CARD = { w: 22, h: 30, font: BIG, cell: 2 }, SMALL_CARD = { w: 14, h: 20, font: SMALL, cell: 2 };
const PAD = 7, TOP = 7, GAP = 2, COLON = 8, SECONDS_GAP = 5, BAND = 10;

// Card rectangles for a model: [{ x, y, w, h, ch, kind, index }] plus colon slots.
export function flipLayout(model) {
  const cards = [], colons = [];
  let x = PAD + 3, index = 0;
  model.groups.forEach((group, g) => {
    if (g) { colons.push(x - GAP + Math.floor((COLON + GAP - 2) / 2)); x += COLON; }
    for (const ch of group) { cards.push({ ...BIG_CARD, x, y: TOP + 3, ch, index: index++ }); x += BIG_CARD.w + GAP; }
  });
  x -= GAP;
  if (model.small) { x += SECONDS_GAP; for (const ch of model.small) { cards.push({ ...SMALL_CARD, x, y: TOP + 3 + BIG_CARD.h - SMALL_CARD.h, ch, index: index++, small: true }); x += SMALL_CARD.w + GAP; } x -= GAP; }
  return { cards, colons, w: x + 3 + PAD, h: TOP + 3 + BIG_CARD.h + 2 + 3 + BAND + 2 };
}
export const size = (model) => { const { w, h } = flipLayout(model); return { w, h }; };

// One card face (digit ch) as its own raster: lit top half, hinge, shaded bottom.
function card(spec, ch, pal) {
  const { w, h, font, cell } = spec, half = h / 2, r = createRaster(w, h), p = pal.paper;
  fill(r, 0, 0, w, half, p[3]); fill(r, 0, half, w, half, p[2]);
  fill(r, 0, 0, w, 1, p[4]); fill(r, w - 1, 1, 1, half - 1, p[2]); fill(r, w - 1, half, 1, half - 1, p[1]); fill(r, 0, h - 1, w, 1, p[1]);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px(r, x, y, 0);
  const layout = layoutText(ch, font, { cell });
  text(r, ch, font, Math.floor((w - layout.width) / 2), Math.floor((h - layout.height) / 2), pal.ink[0], { cell });
  return r;
}
// The split between the halves: a dark seam on the paper, ink stays ink, so a
// crossbar on the hinge row still reads; the top half casts one row of shadow.
function hinge(r, x, y, spec, pal, shadow) {
  const half = spec.h / 2, ink = colour(pal.ink[0]);
  for (let i = 0; i < spec.w; i++) {
    const seam = get(r, x + i, y + half), below = get(r, x + i, y + half + 1);
    if (seam) px(r, x + i, y + half, seam === ink ? pal.outline : pal.paper[0]);
    if (below && below !== ink && i > 0 && i < spec.w - 1) px(r, x + i, y + half + 1, shadow ? pal.paper[0] : pal.paper[1]);
  }
  stud(r, x - 1, y + half - 1, 1, 3, pal.metal); stud(r, x + spec.w, y + half - 1, 1, 3, pal.metal);
}

// anim: { frame, from: groups-string, cards: [changed indexes] } while flipping.
export function paint(model, pal, anim = null) {
  const L = flipLayout(model), r = createRaster(L.w, L.h), glow = phaseGlow(pal, model.phase);
  const cardTop = TOP + 3, cardsW = L.w - 2 * PAD, bodyH = L.h - 2;
  panel(r, 0, 0, L.w, bodyH, pal, { seed: 3 });
  for (const [fx] of [[5], [L.w - 12]]) { fill(r, fx, bodyH - 1, 7, 3, pal.outline); fill(r, fx + 1, bodyH - 1, 5, 2, pal.wood[0]); fill(r, fx + 1, bodyH - 1, 5, 1, pal.wood[2]); }
  // brass corner caps
  for (const [cx, cy, sx, sy] of [[2, 2, 1, 1], [L.w - 3, 2, -1, 1], [2, bodyH - 3, 1, -1], [L.w - 3, bodyH - 3, -1, -1]]) {
    for (let i = 0; i < 4; i++) { px(r, cx + i * sx, cy, pal.metal[i ? 2 : 3]); px(r, cx, cy + i * sy, pal.metal[i ? 2 : 3]); }
    px(r, cx + 3 * sx, cy, pal.metal[1]); px(r, cx, cy + 3 * sy, pal.metal[1]);
  }
  recess(r, PAD, TOP, cardsW, BIG_CARD.h + 7, pal);
  // the older cards' lips under each card, then the cards
  const from = anim ? anim.from : '', flipping = new Set(anim?.cards || []);
  for (const spec of L.cards) {
    fill(r, spec.x + 1, spec.y + spec.h, spec.w - 2, 1, pal.paper[1]); fill(r, spec.x + 2, spec.y + spec.h + 1, spec.w - 4, 1, pal.paper[0]);
    const to = card(spec, spec.ch, pal), half = spec.h / 2;
    if (!flipping.has(spec.index)) { blit(r, to, spec.x, spec.y); hinge(r, spec.x, spec.y, spec, pal, false); continue; }
    const old = card(spec, from[spec.index] ?? spec.ch, pal), f = flipFrame(anim.frame), rows = leafRows(half, f.scale);
    const shade = (c) => mix(c, pal.outline, (1 - f.light) * .7);
    blit(r, to, spec.x, spec.y, { sh: half });                                   // new top half, uncovered as the leaf falls
    blit(r, old, spec.x, spec.y + half, { sy: half, sh: half });                 // old bottom half until the leaf lands
    if (f.leaf === 'top') blit(r, old, spec.x, spec.y + half - rows, { sh: half, rows, map: shade });
    else blit(r, to, spec.x, spec.y + half, { sy: half, sh: half, rows, map: shade });
    hinge(r, spec.x, spec.y, spec, pal, f.scale < .5);
  }
  // colon studs: brass at rest, the phase colour while a round runs
  const studRamp = model.mode === 'timer' && model.running ? [pal.outline, glow[0], glow[1], glow[2]] : pal.metal;
  for (const cx of L.colons) { stud(r, cx, cardTop + 8, 2, 2, studRamp); stud(r, cx, cardTop + BIG_CARD.h - 10, 2, 2, studRamp); }
  // bottom band: a nameplate on the clock, a progress rail and LED during a round
  const bandY = TOP + BIG_CARD.h + 7 + 3;
  if (model.mode === 'timer') {
    rail(r, PAD + 8, bandY + 2, cardsW - 16, model.progress ?? 0, glow, pal);
    led(r, PAD + 3, bandY + 2, glow, model.running, pal); led(r, L.w - PAD - 5, bandY + 2, glow, model.running, pal);
  } else {
    const pw = Math.min(24, cardsW - 8), x0 = Math.floor((L.w - pw) / 2);
    plate(r, x0, bandY, pw, 6, pal.metal, pal.outline);
    px(r, x0 + 2, bandY + 2, pal.metal[0]); px(r, x0 + pw - 3, bandY + 2, pal.metal[0]);
    fill(r, x0 + 5, bandY + 3, pw - 10, 1, pal.metal[1]);
  }
  return r;
}
// Steps of the rail: one per lit segment pixel is plenty.
export const face = { id: 'flip', size, paint, flips: true, steps: 64 };
