import test from 'node:test';
import assert from 'node:assert/strict';
import { catPanelPlace, createCatPanelTracker } from './cat-panel-place.mjs';
const overlaps = (c, p, s) => !(p.x + s.w <= c.left || p.x >= c.right || p.y + s.h <= c.top || p.y >= c.bottom);
test('cat panel never covers the cat', () => {
  const size = { w: 360, h: 480 };
  for (const [vw, vh, left] of [[1440, 900, 368], [1040, 700, 300], [600, 800, 200], [600, 800, 40], [400, 900, 100]]) {
    const cat = { left, right: left + 128, top: vh - 260, bottom: vh - 132 }, p = catPanelPlace(cat, size, { w: vw, h: vh });
    assert.ok(!overlaps(cat, p, size) || vw < 400, `${vw}x${vh} @${left}`);
  }
});

function fakeClock() {
  let t = 0, id = 0; const q = new Map();
  return {
    now: () => t,
    raf: (fn) => { q.set(++id, fn); return id; },
    caf: (i) => q.delete(i),
    tick(ms = 16) { t += ms; const fns = [...q.values()]; q.clear(); fns.forEach((f) => f()); },
    pending: () => q.size,
  };
}

test('tracker: a resize Event passed as ms still tracks for the default 1200ms', () => {
  const c = fakeClock(); let calls = 0;
  const { track } = createCatPanelTracker(() => { calls++; }, c);
  track({ type: 'resize' });
  for (let i = 0; i < 10; i++) c.tick(16);
  assert.ok(calls >= 10, `kept following, got ${calls} frames`);
  assert.equal(c.pending(), 1);
  for (let i = 0; i < 100; i++) c.tick(16);
  assert.equal(c.pending(), 0, 'stops after the window');
});

test('after window resize the panel follows the cat as it glides', () => {
  const c = fakeClock();
  const cat = { left: 900, right: 1028, top: 640, bottom: 768 };
  const size = { w: 360, h: 480 };
  let view = { w: 1440, h: 900 }, pos = null, placed = 0;
  const { track } = createCatPanelTracker(() => { placed++; pos = catPanelPlace(cat, size, view); }, c);
  const onResize = () => track();
  onResize({ type: 'resize' });
  view = { w: 1040, h: 700 }; cat.top = 440; cat.bottom = 568;
  for (let i = 0; i < 40; i++) { cat.left = Math.max(368, cat.left - 15); cat.right = cat.left + 128; c.tick(16); }
  assert.equal(cat.left, 368);
  assert.ok(placed >= 36, `re-placed every frame while gliding (${placed})`);
  assert.ok(!overlaps(cat, pos, size), `panel ${JSON.stringify(pos)} covers cat at ${cat.left}`);
  assert.equal(pos.x, cat.right + 12, 'panel sits 12px right of the cat');
});
