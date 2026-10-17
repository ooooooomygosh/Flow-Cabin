import test from 'node:test';
import assert from 'node:assert/strict';
import { ICON_BITMAPS, bitmapPath, snapIconSize } from './pixel-icon-bitmaps.mjs';

test('every interface glyph is a 12 × 12 bitmap of whole pixels', () => {
  for (const [name, rows] of Object.entries(ICON_BITMAPS)) {
    assert.equal(rows.length, 12, `${name}: 12 rows`);
    for (const row of rows) assert.match(row, /^[.X]{12}$/, `${name}: ${row}`);
    assert(rows.join('').includes('X'), `${name} draws something`);
  }
});

test('glyphs are distinct, so one meaning never borrows another icon', () => {
  const seen = new Map();
  for (const [name, rows] of Object.entries(ICON_BITMAPS)) { const key = rows.join(''); assert(!seen.has(key), `${name} duplicates ${seen.get(key)}`); seen.set(key, name); }
});

test('runs merge into one rectangle per row; sizes snap to the 12-px grid', () => {
  assert.equal(bitmapPath(['.XX.', 'X..X']), 'M1 0h2v1h-2zM0 1h1v1h-1zM3 1h1v1h-1z');
  assert.deepEqual([12, 16, 20, 22, 24, 32, 42].map(snapIconSize), [12, 12, 12, 12, 24, 24, 36]);
  assert.equal(snapIconSize(), 12);
});
