import test from 'node:test';
import assert from 'node:assert/strict';
import { createPositionStore, quantise } from './position-store.mjs';

test('throttles playhead writes by time and distance, never duration changes', () => {
  let time = 0; const store = createPositionStore({ now: () => time }), seen = [];
  store.subscribe((value) => seen.push(value.position));
  assert.equal(store.set(1, 200), true);
  time = 100; assert.equal(store.set(1.2), false, 'too soon');
  time = 300; assert.equal(store.set(1.03), false, 'too small');
  assert.equal(store.set(1.5), true);
  time = 310; assert.equal(store.set(1.6, 180), true, 'duration change always lands');
  time = 320; assert.equal(store.set(30, 180, { force: true }), true, 'a seek is shown at once');
  assert.deepEqual(seen, [1, 1.5, 1.6, 30]);
  assert.equal(store.position, 30); assert.equal(store.duration, 180);
});
test('reset clears the deck; identical writes and bad numbers are ignored; unsubscribe stops calls', () => {
  const store = createPositionStore(); let calls = 0; const off = store.subscribe(() => calls++);
  store.set(5, 10, { force: true }); store.set(5, 10, { force: true }); assert.equal(calls, 1);
  store.reset(); assert.deepEqual(store.get(), { position: 0, duration: 0 }); assert.equal(calls, 2);
  store.set(NaN, Infinity, { force: true }); assert.deepEqual(store.get(), { position: 0, duration: 0 }); assert.equal(calls, 2);
  off(); store.set(9, 9, { force: true }); assert.equal(calls, 2);
});
test('quantise floors to the step', () => {
  assert.equal(quantise(3.97, 1), 3); assert.equal(quantise(3.97), 3.97); assert.equal(quantise(undefined, 1), 0);
});
