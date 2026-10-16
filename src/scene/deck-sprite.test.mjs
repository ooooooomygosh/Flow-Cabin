import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ARM_FRAMES, DECK_BODY, DECK_COLOURS, DECK_H, DECK_PALETTES, DECK_SHADOW, DECK_W, HEADS, PLATTER, PLINTH, deckPalette, recordRuns } from './deck-sprite.mjs';

const cells = (list) => { const g = Array.from({ length: DECK_H }, () => Array(DECK_W).fill(null)); for (const r of list) for (let i = 0; i < r.w; i++) g[r.y][r.x + i] = r.fill; return g; };
const key = (fill) => /^var\(--deck-(\d+),/.exec(fill || '')?.[1];

test('deck body fills are per-scene CSS variables over the walnut defaults', () => {
  for (const run of DECK_BODY) assert.match(run.fill, /^var\(--deck-\d+, #[\da-f]{6}\)$/);
  assert.deepEqual(deckPalette('pixel'), DECK_COLOURS);
  assert.equal(deckPalette('forest')[9], DECK_COLOURS[9], 'brass is shared');
  const css = readFileSync(new URL('./scene-deck.css', import.meta.url), 'utf8');
  for (const [look, palette] of Object.entries(DECK_PALETTES)) {
    const rule = css.match(new RegExp(`\\[data-room-look='${look}'\\] \\.scene-deck \\{ (--deck-[^}]+)\\}`))?.[1] || '';
    for (const [key, hex] of Object.entries(palette)) assert.ok(rule.includes(`--deck-${key}: ${hex};`), `${look} --deck-${key}`);
  }
});
test('every scene gets its own rim light, and it is not the plinth colour', () => {
  for (const look of ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight']) {
    const palette = deckPalette(look);
    for (const wood of [2, 3, 5, 6]) assert.notEqual(palette[16], palette[wood], `${look} rim vs wood ${wood}`);
  }
  assert.ok(cells(DECK_BODY).flat().some((fill) => key(fill) === '16'), 'the rim is drawn');
});
test('platter reads round (≤ 4.5:1), sits inside the plinth top with a margin, and the rim is not the brightest pixel', () => {
  assert.ok(PLATTER.rx / PLATTER.ry <= 4.5);
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11; };
  assert.ok(lum(DECK_COLOURS[7]) < lum(DECK_COLOURS[10]));
  const g = cells(DECK_BODY), platter = [];
  g.forEach((row, y) => row.forEach((fill, x) => { if (['7', '8', '11', '14'].includes(key(fill)) && Math.abs(x - PLATTER.cx) < PLATTER.rx + 3 && y < PLINTH.front + 1) platter.push([x, y]); }));
  const ys = platter.map(([, y]) => y), xs = platter.map(([x]) => x);
  assert.ok(Math.min(...ys) > PLINTH.top, 'plinth back edge stays whole above the platter');
  assert.ok(Math.max(...ys) < PLINTH.front - 1, 'plinth front bevel stays whole below the platter');
  assert.ok(Math.min(...xs) >= PLINTH.x + 2, 'margin on the left');
});
test('outlines are selective: the shared black only runs under the deck', () => {
  const g = cells(DECK_BODY);
  g.forEach((row, y) => row.forEach((fill, x) => { if (key(fill) === '1') assert.ok(y >= PLINTH.bottom, `black outline at ${x},${y}`); }));
  // The plinth's sides and back are outlined in the wood's own shade.
  assert.equal(key(g[8][PLINTH.x - 1]), '4'); assert.equal(key(g[PLINTH.top - 1][10]), '4');
  // A cast shadow sits under the deck, offset away from the top-left lamp.
  assert.ok(DECK_SHADOW.length > 10 && DECK_SHADOW.every((r) => r.y >= PLINTH.bottom + 1));
});
test('front face carries the controls: brass keys, a name plate and feet', () => {
  const front = cells(DECK_BODY).slice(PLINTH.front, PLINTH.bottom + 2).flat().map(key);
  assert.ok(front.filter((k) => k === '10').length >= 8, 'brass highlights');
  assert.ok(front.filter((k) => k === '12').length >= 6, 'feet');
});
test('tonearm: one arm length in every frame, rests off the platter and lands on the record edge', () => {
  assert.equal(ARM_FRAMES.length, HEADS.length);
  const [hx, hy] = HEADS.at(-1), r = Math.hypot((hx - PLATTER.cx) / PLATTER.rx, (hy - PLATTER.cy) / PLATTER.ry);
  assert.ok(r > .8 && r < 1, `head at ${r.toFixed(2)} of the radius`);
  const [rx, ry] = HEADS[0]; assert.ok(Math.hypot((rx - PLATTER.cx) / PLATTER.rx, (ry - PLATTER.cy) / PLATTER.ry) > 1.3);
  for (const frame of ARM_FRAMES) {
    const fills = new Set(frame.map((r) => r.fill));
    assert.ok(fills.has('var(--deck-14, #d9d2bf)') && fills.has('var(--deck-arm, #b9b2a0)'), 'lit tube, two tones');
    assert.ok(fills.has('#5e5248') && fills.has('#3a3631'), 'counterweight and headshell');
  }
});
test('the record label carries the cover colour, shaded underneath', () => {
  const runs = recordRuns('#16110e', '#c8496d'), fills = runs.map((r) => r.fill);
  assert.ok(fills.filter((f) => f === '#c8496d').reduce((n) => n + 1, 0) >= 2);
  assert.ok(fills.some((f) => f !== '#c8496d' && f.startsWith('#8')), 'a darker label shade');
});
