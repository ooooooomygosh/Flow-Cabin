import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ARM_FRAMES, DECK_BODY, DECK_COLOURS, DECK_PALETTES, HEADS, PLATTER, deckPalette } from './deck-sprite.mjs';

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
test('platter reads round (≤ 4.5:1) and the brightest body pixel is not the rim', () => {
  assert.ok(PLATTER.rx / PLATTER.ry <= 4.5);
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11; };
  assert.ok(lum(DECK_COLOURS[7]) < lum(DECK_COLOURS[10]));
});
test('tonearm rests off the platter and lands on the record edge', () => {
  assert.equal(ARM_FRAMES.length, HEADS.length);
  const [hx, hy] = HEADS.at(-1), r = Math.hypot((hx - PLATTER.cx) / PLATTER.rx, (hy - PLATTER.cy) / PLATTER.ry);
  assert.ok(r > .8 && r < 1, `head at ${r.toFixed(2)} of the radius`);
  const [rx, ry] = HEADS[0]; assert.ok(Math.hypot((rx - PLATTER.cx) / PLATTER.rx, (ry - PLATTER.cy) / PLATTER.ry) > 1.3);
});
