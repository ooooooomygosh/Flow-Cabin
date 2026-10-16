import test from 'node:test';
import assert from 'node:assert/strict';
import { createDragGesture, nudgeDelta } from './drag-gesture.mjs';

function rig() {
  const log = [], frames = [];
  const gesture = createDragGesture({ schedule: (fn) => { frames.push(fn); return frames.length; }, unschedule: (id) => { frames[id - 1] = null; },
    onStart: (o) => log.push(['start', o]), onMove: (o, dx, dy) => log.push(['move', dx, dy]), onCommit: (o, dx, dy) => log.push(['commit', dx, dy]), onCancel: (o) => log.push(['cancel', o]) });
  const frame = () => { const pending = frames.splice(0); pending.forEach((fn) => fn?.()); };
  return { gesture, log, frame };
}
test('a click under the threshold neither moves nor commits', () => {
  const { gesture, log } = rig(); gesture.down(1, 10, 10, 'w'); gesture.move(1, 13, 12); assert.equal(gesture.up(1), false); assert.deepEqual(log, []);
});
test('moves are coalesced to one per frame and the release commits the last point', () => {
  const { gesture, log, frame } = rig(); gesture.down(1, 0, 0, 'w');
  gesture.move(1, 6, 0); gesture.move(1, 8, 1); gesture.move(1, 12, 2); frame();
  gesture.move(1, 20, 4); assert.equal(gesture.up(1), true); frame();
  assert.deepEqual(log, [['start', 'w'], ['move', 12, 2], ['move', 20, 4], ['commit', 20, 4]]);
});
test('pointercancel, lost capture or Escape restores; a foreign pointer is ignored', () => {
  const { gesture, log, frame } = rig(); gesture.down(1, 0, 0, 'w');
  assert.equal(gesture.move(2, 50, 50), false); gesture.move(1, 30, 0); assert.equal(gesture.cancel(2), false);
  assert.equal(gesture.cancel(), true); frame(); assert.deepEqual(log, [['start', 'w'], ['cancel', 'w']]); assert.equal(gesture.pending, false);
  assert.equal(gesture.up(1), false);
});
test('arrow nudges share one step: 16 px, Shift 64 px', () => {
  assert.deepEqual(nudgeDelta('ArrowLeft'), [-16, 0]); assert.deepEqual(nudgeDelta('ArrowDown', true), [0, 64]); assert.equal(nudgeDelta('Enter'), null);
});
