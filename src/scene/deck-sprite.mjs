// Front three-quarter pixel turntable that sits on the shelf top of every
// scene. Drawn on a 56×22 cell grid (1 cell = 4 art pixels of the 1448×1086
// scene), so it shares the room's pixel density. Pure: returns rect runs that
// SceneDeck renders as crisp SVG. Body fills are `var(--deck-N, default)`, so each
// scene re-grades the deck in scene-deck.css (DECK_PALETTES) without new markup.
// One light: the lamp sits top-left (highlights on top/left edges, shade bottom/right);
// --deck-16 is the scene's second light (fire, sea sky, starlight) on the back/right rim.
export const DECK_W = 56, DECK_H = 22;
export const DECK_COLOURS = Object.freeze({
  1: '#0d0805', // contact shadow (--px-shadow): only under the deck, never round it
  2: '#4a2a16', // walnut front
  3: '#6b3f22', // walnut front light
  4: '#2f1a0d', // walnut shade, and the wood's outline
  5: '#8a5530', // plinth top
  6: '#a8693b', // plinth top highlight
  7: '#8f8172', // platter rim (dull alloy: the label, not the rim, is the brightest pixel)
  8: '#5e5248', // platter rim shade
  9: '#d4a46b', // brass (--px-brass)
  10: '#ffd99c', // brass highlight
  11: '#1f1612', // platter mat
  12: '#3b2c22', // foot
  13: '#3a3631', // metal outline / headshell
  14: '#d9d2bf', // alloy lamp-side highlight
  15: '#a8743c', // brass shade (--px-accent-lo)
  16: '#ffb070', // rim light (per scene: fire, sky or starlight)
  17: '#7a4a29'  // plinth top grain
});
// Wood/plinth re-grades per scene (keys 2–6, 12, 17) plus the rim light 16; brass and
// alloy stay shared. Pixel and Amber keep the walnut defaults and the fire-side rim.
// Mirrored as CSS variables in scene-deck.css.
export const DECK_PALETTES = Object.freeze({
  'night-study': Object.freeze({ 16: '#9fb4d8' }),
  forest: Object.freeze({ 2: '#5a4a32', 3: '#6e5c3f', 4: '#3b3020', 5: '#7d6a48', 6: '#94805a', 12: '#2e261a', 16: '#d8e6a0', 17: '#6c5a3c' }),
  seaside: Object.freeze({ 2: '#9c8462', 3: '#b09774', 4: '#735f45', 5: '#bca684', 6: '#cfbc98', 12: '#5a4a36', 16: '#cfe2e8', 17: '#a8916f' }),
  starlight: Object.freeze({ 2: '#3d4660', 3: '#55607e', 4: '#262c3d', 5: '#6b7596', 6: '#8a93b0', 12: '#1e2333', 16: '#c2cbe8', 17: '#5c6585' })
});
export const deckPalette = (look) => ({ ...DECK_COLOURS, ...DECK_PALETTES[look] });
const DECK_VARS = Object.fromEntries(Object.entries(DECK_COLOURS).map(([key, hex]) => [key, `var(--deck-${key}, ${hex})`]));
const grid = () => Array.from({ length: DECK_H }, () => Array(DECK_W).fill(0));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < DECK_W && y >= 0 && y < DECK_H) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c); };
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / (rx + .35)) ** 2 + ((y - cy) / (ry + .35)) ** 2 <= 1;
const ellipse = (g, cx, cy, rx, ry, c) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    if (inEllipse(x, y, cx, cy, rx, ry)) put(g, x, y, c);
};
const METAL = new Set([7, 8, 13, 14]);
// Selective outline: an empty cell next to the art takes the darkest shade of what it
// touches (walnut shade for wood, gunmetal for alloy); only the line under the deck is
// the shared --px-shadow, so the deck sits in the room instead of being pasted on.
function outline(g) {
  const out = g.map((row) => [...row]);
  for (let y = 0; y < DECK_H; y++) for (let x = 0; x < DECK_W; x++) {
    if (g[y][x]) continue;
    const near = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => g[y + dy]?.[x + dx]).filter((c) => c > 1);
    if (!near.length) continue;
    out[y][x] = g[y - 1]?.[x] > 1 && !g[y + 1]?.[x] ? 1 : near.every((c) => METAL.has(c)) ? 13 : 4;
  }
  return out;
}
// Merge horizontal runs of one colour into rects: tiny DOM, crisp edges.
export function runs(g, palette = DECK_COLOURS) {
  const result = [];
  g.forEach((row, y) => { let x = 0; while (x < row.length) { const c = row[x]; let w = 1; while (x + w < row.length && row[x + w] === c) w++; if (c) result.push({ x, y, w, fill: palette[c] || c }); x += w; } });
  return result;
}
// Plinth: top plane rows 3–12 (back edge, top, lit front bevel), walnut front 13–18, feet 19.
export const PLINTH = Object.freeze({ x: 2, w: 52, top: 3, front: 13, bottom: 18 });
// 24×6 cells (4:1): reads as a round platter seen from just above, with a clear
// margin of plinth on every side (rim rows 4–11 inside the top plane 3–12).
export const PLATTER = Object.freeze({ cx: 19, cy: 7.5, rx: 12, ry: 3 });
const RIM = { rx: PLATTER.rx + 1, ry: PLATTER.ry + .4 };
function body() {
  const g = grid(), { x: px, w: pw, top, front, bottom } = PLINTH, right = px + pw - 1;
  rect(g, px, top, pw, front - top, 5); rect(g, px, top, pw, 1, 6); rect(g, px, front - 1, pw, 1, 6);   // top plane, back edge, lit front bevel
  for (const [x, y, w] of [[4, 5, 3], [35, 6, 5], [47, 9, 4], [6, 11, 4], [36, 11, 6], [49, 4, 3]]) rect(g, x, y, w, 1, 17); // grain
  rect(g, px, front, pw, bottom - front + 1, 2); rect(g, px, front, pw, 1, 3); rect(g, px, bottom, pw, 1, 4); // walnut front
  for (const [x, y, w] of [[16, 17, 4], [36, 14, 3], [40, 17, 3]]) rect(g, x, y, w, 1, 3);                 // front grain
  rect(g, px, top + 1, 1, bottom - top - 1, 6);                                                             // lamp-side edge
  rect(g, 40, top, right - 39, 1, 16); rect(g, right, top, 1, front - top, 16); rect(g, right, front, 1, bottom - front, 3); // rim light, back/right
  // Platter: shaded lip with strobe dots, alloy rim lit on the lamp side, rubber mat.
  const { cx, cy } = PLATTER;
  ellipse(g, cx, cy + .5, RIM.rx, RIM.ry, 8);
  for (let x = 0; x < DECK_W; x += 2) for (let y = 9; y < 12; y++) if (g[y][x] === 8 && !inEllipse(x, y, cx, cy, RIM.rx, RIM.ry)) put(g, x, y, 7);
  ellipse(g, cx, cy, RIM.rx, RIM.ry, 7);
  ellipse(g, cx, cy, PLATTER.rx, PLATTER.ry, 11);
  for (let y = 0; y < DECK_H; y++) for (let x = 0; x < cx; x++) if (g[y][x] === 7 && y <= cy && (x < cx - 6 || y < cy - 2)) put(g, x, y, 14);
  // Tonearm furniture: rest post, pivot plate with gimbal, cue lever (brass).
  rect(g, REST[0], REST[1] + 1, 1, 2, 8); put(g, REST[0], REST[1] + 1, 7);
  rect(g, PIVOT[0] - 2, PIVOT[1], 5, 2, 8); rect(g, PIVOT[0] - 2, PIVOT[1], 5, 1, 7); put(g, PIVOT[0] - 2, PIVOT[1], 14);
  put(g, 49, 6, 10); put(g, 49, 7, 15); rect(g, 48, 8, 3, 1, 8); put(g, 48, 8, 7);
  // Front face: two brass speed keys (33 / 45), start button, engraved name plate, LED, speed knob.
  for (const x of [5, 9]) { rect(g, x, 14, 3, 1, 10); rect(g, x, 15, 3, 1, 9); rect(g, x, 16, 3, 1, 15); }
  rect(g, 13, 15, 2, 1, 7); rect(g, 13, 16, 2, 1, 8);
  rect(g, 22, 15, 11, 2, 9); rect(g, 22, 15, 11, 1, 10); rect(g, 22, 16, 11, 1, 15); put(g, 26, 15, 15); put(g, 28, 15, 15);
  rect(g, 45, 15, 2, 1, 4);
  rect(g, 49, 14, 3, 3, 7); put(g, 49, 14, 14); put(g, 51, 16, 8); put(g, 50, 16, 8); put(g, 51, 15, 8); put(g, 51, 14, 0); put(g, 49, 16, 0);
  rect(g, 4, 19, 4, 1, 12); rect(g, 48, 19, 4, 1, 12); put(g, 4, 19, 3); put(g, 48, 19, 3);              // feet
  const lined = outline(g);
  // Contact shadow: the dark gap under the plinth between the feet, then a 50 % checker
  // cast toward the lower right (away from the lamp).
  for (let x = 8; x < 48; x++) if (!lined[19][x]) lined[19][x] = 1;
  return lined;
}
const PIVOT = [44, 4], REST = [44, 9];
export const DECK_BODY = Object.freeze(runs(body(), DECK_VARS));
export const DECK_SHADOW = Object.freeze(runs(Array.from({ length: DECK_H }, (_, y) => Array.from({ length: DECK_W }, (_, x) => y === 20 && x >= 5 && x <= 54 && (x + y) % 2 === 0 ? 1 : 0)), DECK_COLOURS));

const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return Number.isFinite(n) ? [n >> 16, (n >> 8) & 255, n & 255] : [22, 17, 14]; };
export const mix = (hex, toward, amount) => { const a = rgbOf(hex), b = rgbOf(toward); return toHex(a.map((v, i) => v + (b[i] - v) * amount)); };
// Record on the platter: vinyl with a lit groove band toward the lamp, a quiet
// track-gap ring, and the label in the cover's own colour (shaded underneath).
const luma = (hex) => { const [r, g, b] = rgbOf(hex); return r * .3 + g * .59 + b * .11; };
// A label darker than this vanishes into the vinyl at deck size; lift it toward paper.
export const liftLabel = (hex, min = 120) => { let out = hex; for (let i = 0; i < 6 && luma(out) < min; i++) out = mix(out, '#fff7e6', .18); return out; };
export function recordRuns(vinyl = '#16110e', label = '#c9a47a') {
  label = liftLabel(label);
  const g = grid(), { cx, rx, ry } = PLATTER, cy = PLATTER.cy - .4;
  ellipse(g, cx, cy, rx - 1, ry - .4, 'v');
  // Rotationally symmetric bands (never rotated, so no shimmer): a track gap and the lamp's lit arc.
  for (let y = 0; y < DECK_H; y++) for (let x = 0; x < DECK_W; x++) {
    if (g[y][x] !== 'v') continue;
    const r = Math.hypot((x - cx) / (rx - 1), (y - cy) / (ry - .4));
    if (r > .62 && r < .74) g[y][x] = 'g';
    else if (r > .8 && x < cx - 3 && y < cy) g[y][x] = 'h';
  }
  ellipse(g, cx, cy, 4, 1.5, 'l');
  for (let x = cx - 4; x <= cx + 4; x++) if (g[Math.round(cy) + 1]?.[x] === 'l') put(g, x, Math.round(cy) + 1, 'd');
  put(g, cx - 3, Math.round(cy) - 1, 'i'); put(g, cx - 2, Math.round(cy) - 1, 'i'); put(g, cx, Math.round(cy), 's');
  return runs(g, { v: vinyl, g: mix(vinyl, '#000000', .45), h: mix(vinyl, '#e4dfcc', .28), l: label, d: mix(label, '#0d0805', .35), i: mix(label, '#fff7e6', .45), s: '#e7dcc0' });
}
// Eight frames of the lamp's reflection travelling round the grooves.
export const SHEEN_FRAMES = Object.freeze(Array.from({ length: 8 }, (_, i) => {
  const g = grid(), { cx, rx, ry } = PLATTER, cy = PLATTER.cy - .4;
  for (const offset of [0, Math.PI]) {
    const t = i / 8 * Math.PI * 2 + offset;
    for (const r of [rx - 2.5, rx - 3.5]) put(g, cx + Math.cos(t) * r, cy + Math.sin(t) * (ry - 1), 'h');
  }
  return runs(g, { h: '#8f8172' });
}));

// Tonearm: pivot at the plinth's back right; frame 0 rests on its post, frame 3 sits
// in the lead-in groove. Real arm geometry: one length, swung about the pivot and
// squashed by the platter's own ry/rx, so every frame is the same arm.
const ARM_LENGTH = 20.5, SWING = [0, 16, 32, 47];
export const HEADS = Object.freeze(SWING.map((deg) => { const t = deg * Math.PI / 180; return Object.freeze([Math.round(PIVOT[0] - Math.sin(t) * ARM_LENGTH), Math.round(PIVOT[1] + Math.cos(t) * ARM_LENGTH * PLATTER.ry / PLATTER.rx + 1)]); }));
function armFrame([hx, hy], deg) {
  const g = grid(), t = deg * Math.PI / 180;
  // Counterweight behind the pivot (ridged: lit cap, shaded body), then the gimbal.
  const wx = Math.round(PIVOT[0] + Math.sin(t) * 2.5), wy = PIVOT[1] - 2;
  rect(g, wx - 1, wy, 3, 2, 'w'); rect(g, wx - 1, wy, 3, 1, 'c'); put(g, wx - 1, wy + 1, 'k');
  put(g, PIVOT[0], PIVOT[1] - 1, 'p');
  // Tube: two cells thick, lit on the lamp side (top for a lying arm, left for a standing one).
  let [x0, y0] = PIVOT; const [x1, y1] = [hx, hy - 1], lying = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (;;) {
    if (lying) { put(g, x0, y0, 'h'); put(g, x0, y0 + 1, 'a'); } else { put(g, x0, y0, 'h'); put(g, x0 + 1, y0, 'a'); }
    if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
  // Headshell with a lit finger lift, cartridge under it.
  rect(g, hx - 1, hy - 1, 3, 1, 'h'); rect(g, hx - 1, hy, 3, 1, 's'); put(g, hx - 2, hy - 1, 'f'); put(g, hx, hy + 1, 'k');
  // Shadow-side outline only (below), so the arm stays light against the plinth.
  const lines = g.map((row, y) => row.map((c, x) => c || (typeof g[y - 1]?.[x] === 'string' && g[y - 1][x] !== 'k' ? 'o' : 0)));
  return runs(lines, { a: 'var(--deck-arm, #b9b2a0)', h: 'var(--deck-14, #d9d2bf)', w: '#5e5248', c: '#8f8172', k: '#1a1512', p: '#d4a46b', s: '#3a3631', f: '#ffd99c', o: '#3a3631' });
}
export const ARM_FRAMES = Object.freeze(HEADS.map((head, i) => armFrame(head, SWING[i])));
export const ARM_REST = REST;
