import test from 'node:test';
import assert from 'node:assert/strict';
import { catPanelPlace } from './cat-panel-place.mjs';
const overlaps = (c, p, s) => !(p.x + s.w <= c.left || p.x >= c.right || p.y + s.h <= c.top || p.y >= c.bottom);
test('cat panel never covers the cat', () => {
  const size = { w: 360, h: 480 };
  for (const [vw, vh, left] of [[1440, 900, 368], [1040, 700, 300], [600, 800, 200], [600, 800, 40], [400, 900, 100]]) {
    const cat = { left, right: left + 128, top: vh - 260, bottom: vh - 132 }, p = catPanelPlace(cat, size, { w: vw, h: vh });
    assert.ok(!overlaps(cat, p, size) || vw < 400, `${vw}x${vh} @${left}`);
  }
});
