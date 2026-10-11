const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createFullscreen } = require('../fullscreen.cjs');
function fixture() {
  const window = new EventEmitter(), calls = [], deferred = [], changes = [];
  Object.assign(window, { isFullScreen: () => false, isDestroyed: () => false, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), setFullScreen: on => calls.push(on) });
  const sink = { active: false, busy: false, exit: () => { calls.push('sink.exit'); sink.busy = sink.active = false; } };
  const control = createFullscreen({ window, getSink: () => sink, onChange: on => changes.push(on), defer: fn => deferred.push(fn) });
  const finish = on => { window.emit(on ? 'enter-full-screen' : 'leave-full-screen'); while (deferred.length) deferred.shift()(); };
  return { control, window, sink, calls, changes, finish };
}
test('native entry cancels pending sink before showing and waits for confirmation', () => {
  const f = fixture(); f.sink.busy = true; f.control.set(true);
  assert.deepEqual(f.calls, ['sink.exit', 'restore', 'show', true]);
  assert.equal(f.control.active, false); assert.deepEqual(f.changes, []);
  f.finish(true); assert.equal(f.control.active, true); assert.deepEqual(f.changes, [true]);
});
test('rapid toggle queues exit after asynchronous entry; repeated target is not reissued', () => {
  const f = fixture(); f.control.toggle(); f.control.toggle(); f.control.set(false);
  assert.deepEqual(f.calls.filter(x => typeof x === 'boolean'), [true]);
  f.finish(true); assert.deepEqual(f.calls.filter(x => typeof x === 'boolean'), [true, false]);
  f.finish(false); assert.equal(f.control.active, false); assert.equal(f.control.requested, false);
});
test('last request wins while leaving and system transitions synchronize state', () => {
  const f = fixture(); f.finish(true); f.control.toggle(); f.control.toggle();
  f.finish(false); assert.deepEqual(f.calls.filter(x => typeof x === 'boolean'), [false, true]);
  f.finish(true); f.finish(false); assert.equal(f.control.requested, false);
});
test('destroyed windows do not dispatch or get shown', () => {
  const f = fixture(); f.window.isDestroyed = () => true; f.control.toggle(); assert.deepEqual(f.calls, []);
});


test('system native entry cancels pending desktop sink before its late completion', () => {
  const f = fixture(); f.sink.busy = true; f.finish(true);
  assert.deepEqual(f.calls,['sink.exit']); assert.equal(f.sink.busy,false);
  assert.equal(f.control.active,true); assert.equal(f.control.requested,true);
});
test('a newer exit request keeps ownership when an older native entry completes', () => {
  const f = fixture(); f.control.set(true); f.sink.busy = true; f.control.set(false);
  f.finish(true); assert.equal(f.sink.busy,true); assert.equal(f.calls.includes('sink.exit'),false);
  assert.deepEqual(f.calls.filter(x=>typeof x === 'boolean'),[true,false]);
});
