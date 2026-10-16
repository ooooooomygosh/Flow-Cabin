import test from 'node:test';
import assert from 'node:assert/strict';
import { lazySnapshot, sameInputs } from './lazy-snapshot.mjs';

test('builds on demand and reuses the value while the inputs are identical', () => {
  let builds = 0; const items = [1, 2];
  const snap = lazySnapshot(({ items: list, look }) => { builds++; return { look, count: list.length }; });
  assert.equal(snap.read(), null);
  snap.update({ items, look: 'pixel' }); snap.update({ items, look: 'pixel' }); assert.equal(builds, 0, 'renders alone build nothing');
  const first = snap.read(); assert.deepEqual(first, { look: 'pixel', count: 2 }); assert.equal(snap.read(), first); assert.equal(builds, 1);
  snap.update({ items, look: 'pixel' }); assert.equal(snap.read(), first); assert.equal(builds, 1);
  snap.update({ items: [...items], look: 'pixel' }); assert.notEqual(snap.read(), first); assert.equal(builds, 2);
});
test('sameInputs compares keys and identities', () => {
  assert.equal(sameInputs({ a: 1 }, { a: 1 }), true); assert.equal(sameInputs({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(sameInputs({ a: {} }, { a: {} }), false); assert.equal(sameInputs(null, { a: 1 }), false); assert.equal(sameInputs({ a: NaN }, { a: NaN }), true);
});
