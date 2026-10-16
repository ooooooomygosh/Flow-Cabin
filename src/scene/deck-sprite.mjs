// Front three-quarter pixel turntable that sits on the shelf top of every
// scene. Drawn on a 56×22 cell grid (1 cell = 4 art pixels of the 1448×1086
// scene), so it shares the room's pixel density. Pure: returns rect runs that
// SceneDeck renders as crisp SVG. Body fills are `var(--deck-N, default)`, so each
// scene re-grades the deck in scene-deck.css (DECK_PALETTES) without new markup.
export const DECK_W = 56, DECK_H = 22;
export const DECK_COLOURS = Object.freeze({
  1: '#0d0805', // outline (--px-shadow)
  2: '#4a2a16', // walnut front
  3: '#6b3f22', // walnut front light
  4: '#2f1a0d', // walnut shade
  5: '#8a5530', // plinth top
  6: '#a8693b', // plinth top highlight
  7: '#8f8172', // platter rim (dull alloy: the label, not the rim, is the brightest pixel)
  8: '#5e5248', // platter rim shade
  9: '#d4a46b', // brass strip (--brass)
  10: '#ffd99c', // brass highlight
  11: '#1f1612', // platter mat
  12: '#3b2c22', // foot
});
// Wood/plinth re-grades per scene (keys 2–6, 12); brass, rim and mat stay shared.
// Pixel and Amber keep the walnut defaults. Mirrored as CSS variables in scene-deck.css.
export const DECK_PALETTES = Object.freeze({
  forest: Object.freeze({ 2: '#5a4a32', 3: '#6e5c3f', 4: '#3b3020', 5: '#7d6a48', 6: '#94805a', 12: '#2e261a' }),
  seaside: Object.freeze({ 2: '#9c8462', 3: '#b09774', 4: '#735f45', 5: '#bca684', 6: '#cfbc98', 12: '#5a4a36' }),
  starlight: Object.freeze({ 2: '#3d4660', 3: '#55607e', 4: '#262c3d', 5: '#6b7596', 6: '#8a93b0', 12: '#1e2333' })
});
export const deckPalette = (look) => ({ ...DECK_COLOURS, ...DECK_PALETTES[look] });
const DECK_VARS = Object.fromEntries(Object.entries(DECK_COLOURS).map(([key, hex]) => [key, `var(--deck-${key}, ${hex})`]));
const grid = () => Array.from({ length: DECK_H }, () => Array(DECK_W).fill(0));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < DECK_W && y >= 0 && y < DECK_H) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c); };
const ellipse = (g, cx, cy, rx, ry, c) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    if (((x - cx) / (rx + .35)) ** 2 + ((y - cy) / (ry + .35)) ** 2 <= 1) put(g, x, y, c);
};
function outline(g) {
  const out = g.map((row) => [...row]);
  for (let y = 0; y < DECK_H; y++) for (let x = 0; x < DECK_W; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] > 1)) out[y][x] = 1;
  }
  return out;
}
// Merge horizontal runs of one colour into rects: tiny DOM, crisp edges.
export function runs(g, palette = DECK_COLOURS) {
  const result = [];
  g.forEach((row, y) => { let x = 0; while (x < row.length) { const c = row[x]; let w = 1; while (x + w < row.length && row[x + w] === c) w++; if (c) result.push({ x, y, w, fill: palette[c] || c }); x += w; } });
  return result;
}
// 32×8 cells (4:1): reads as a round platter seen from just above, not a 6:1 slot.
export const PLATTER = Object.freeze({ cx: 21, cy: 9, rx: 16, ry: 3.6 });
function body() {
  const g = grid();
  rect(g, 2, 5, 52, 8, 5); rect(g, 2, 5, 52, 1, 6); rect(g, 2, 12, 52, 1, 4); // plinth top, seen from just above
  ellipse(g, PLATTER.cx, PLATTER.cy + 1, PLATTER.rx + 1, PLATTER.ry + .6, 8); // rim shade (front lip)
  ellipse(g, PLATTER.cx, PLATTER.cy, PLATTER.rx + 1, PLATTER.ry + .6, 7);     // alloy rim
  ellipse(g, PLATTER.cx, PLATTER.cy, PLATTER.rx, PLATTER.ry, 11);             // rubber mat
  rect(g, 2, 13, 52, 6, 2); rect(g, 2, 13, 52, 1, 3); rect(g, 2, 18, 52, 1, 4); // walnut front
  for (const x of [9, 23, 31, 44]) rect(g, x, 14, 1, 3, 4);                     // grain
  rect(g, 6, 15, 9, 1, 9); put(g, 6, 15, 10);                                 // brass name plate
  rect(g, 46, 7, 4, 3, 12); rect(g, 46, 7, 4, 1, 8);                           // tonearm base
  rect(g, 49, 14, 3, 3, 8); put(g, 50, 14, 7);                                // speed knob
  rect(g, 4, 19, 4, 1, 12); rect(g, 48, 19, 4, 1, 12);                         // feet
  return outline(g);
}
export const DECK_BODY = Object.freeze(runs(body(), DECK_VARS));

// Record on the platter: vinyl body, a groove ring and the cover-coloured label.
export function recordRuns(vinyl = '#16110e', label = '#c9a47a') {
  const g = grid(), { cx, cy, rx, ry } = PLATTER;
  ellipse(g, cx, cy - .6, rx - 1, ry - .5, 'v');
  for (let a = 0; a < 360; a += 6) { const t = a * Math.PI / 180; put(g, cx + Math.cos(t) * (rx - 5), cy - .6 + Math.sin(t) * (ry - 1.6), 'g'); }
  ellipse(g, cx, cy - .6, 4.2, .9, 'l'); put(g, cx, cy - .6, 's');
  return runs(g, { v: vinyl, g: '#2c241f', l: label, s: '#e7dcc0' });
}
// Eight frames of the lamp's reflection travelling round the grooves.
export const SHEEN_FRAMES = Object.freeze(Array.from({ length: 8 }, (_, i) => {
  const g = grid(), { cx, cy, rx, ry } = PLATTER;
  for (const offset of [0, Math.PI]) {
    const t = i / 8 * Math.PI * 2 + offset;
    for (const r of [rx - 3, rx - 4]) put(g, cx + Math.cos(t) * r, cy - .6 + Math.sin(t) * (ry - 1.2), 'h');
  }
  return runs(g, { h: '#8f8172' });
}));

// Tonearm: pivot behind the plinth's right; frame 0 rests, frame 3 is on the record.
const PIVOT = [48, 4];
// The cartridge lands on the lead-in groove (≈ rx − 1 from the spindle), so the arm
// is a short dull stroke at the record's edge, not a bright slash across the deck.
export const HEADS = Object.freeze([[46, 11], [43, 11], [40, 10], [36, 9]]);
export const ARM_FRAMES = Object.freeze(HEADS.map(([hx, hy]) => {
  const g = grid(); let [x0, y0] = PIVOT; const [x1, y1] = [hx, hy];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (;;) { put(g, x0, y0, 'a'); put(g, x0 + 1, y0, 'a'); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  rect(g, hx - 1, hy, 3, 1, 'h'); rect(g, PIVOT[0], PIVOT[1] - 2, 3, 2, 'w');
  const lines = g.map((row, y) => row.map((c, x) => c || ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => typeof g[y + oy]?.[x + ox] === 'string') ? 'o' : 0)));
  return runs(lines, { a: 'var(--deck-arm, #b9b2a0)', h: '#3a3631', w: '#77746a', o: '#0d0805' });
}));
