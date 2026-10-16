import test from 'node:test';
import assert from 'node:assert/strict';
import { reducedMotion, reducedMotionFrom, onReducedMotionChange } from './motion-preference.mjs';

function fakeWindow({ media = false, desktop = false } = {}) {
  const listeners = new Set(), dataset = desktop ? { desktopReduceMotion: 'true' } : {};
  const list = { get matches() { return media; }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  return { win: { matchMedia: () => list, document: { documentElement: { dataset } } }, setMedia(value) { media = value; listeners.forEach((fn) => fn()); }, listeners };
}
test('either the OS preference or the desktop flag reduces motion', () => {
  assert.equal(reducedMotionFrom({}), false);
  assert.equal(reducedMotionFrom({ media: true }), true);
  assert.equal(reducedMotionFrom({ desktop: true }), true);
  assert.equal(reducedMotion(fakeWindow().win), false);
  assert.equal(reducedMotion(fakeWindow({ media: true }).win), true);
  assert.equal(reducedMotion(fakeWindow({ desktop: true }).win), true);
  assert.equal(reducedMotion(undefined), false);
});
test('subscribers hear the current value and each change once; the last unsubscribe detaches', () => {
  const fake = fakeWindow(), seen = [];
  const off = onReducedMotionChange((value) => seen.push(value), fake.win);
  fake.setMedia(true); fake.setMedia(true); fake.setMedia(false);
  assert.deepEqual(seen, [false, true, false]);
  off(); assert.equal(fake.listeners.size, 0);
});
