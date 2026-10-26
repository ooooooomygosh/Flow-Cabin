import assert from 'node:assert/strict';
import test from 'node:test';
import { LABS_KEY, LAB_IDS, hasEvidence, isLabEnabled, readLabs, setLabEnabled } from './features.mjs';

function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null, getItem: (k) => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('new installs keep every lab feature off', () => {
  const storage = memory();
  const labs = readLabs(storage);
  assert.deepEqual(Object.keys(labs).sort(), [...LAB_IDS].sort());
  assert.ok(LAB_IDS.every((id) => labs[id] === false));
  assert.ok(storage.getItem(LABS_KEY));
});

test('existing data keeps a feature on after the upgrade', () => {
  const storage = memory({ 'album-circle-study-v1:local-owner': '{"cards":[1]}', 'flow-cabin-pair-device': '{"id":"x"}', 'flow-cabin-letters-v1': '[]' });
  assert.equal(hasEvidence('study', storage), true);
  assert.equal(hasEvidence('devices', storage), true);
  assert.equal(hasEvidence('letters', storage), false, 'an empty list is not evidence');
  const labs = readLabs(storage);
  assert.equal(labs.study, true);
  assert.equal(labs.letters, false);
});

test('a saved choice wins over evidence and survives reads', () => {
  const storage = memory({ 'album-circle-study-v1:local-owner': '{"cards":[1]}' });
  setLabEnabled('study', false, storage);
  assert.equal(isLabEnabled('study', storage), false);
  setLabEnabled('postcard', true, storage);
  assert.equal(isLabEnabled('postcard', storage), true);
  assert.throws(() => setLabEnabled('nope', true, storage));
});
