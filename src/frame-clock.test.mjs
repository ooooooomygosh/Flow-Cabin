import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameClock, backgroundState, nextMinimized } from './frame-clock.mjs';

// Fake display: rAF callbacks fire at the supplied timestamps.
function rig(maxFps) {
  let id = 0, pending = null, requests = 0, time = 0;
  const clock = createFrameClock({ request: (cb) => { requests++; pending = { id: ++id, cb }; return id; }, cancel: (key) => { if (pending?.id === key) pending = null; }, now: () => time, maxFps });
  const frame = (t) => { time = t; const p = pending; pending = null; p?.cb(t); };
  return { clock, frame, get pending() { return pending; }, get requests() { return requests; } };
}
function run(r, hz, ms = 1000, jitter = () => 0) {
  const step = 1000 / hz; let n = 0;
  for (let t = step; t <= ms; t = ++n * step + step + jitter(n)) r.frame(t);
}
const count = (hz, opts, setup, jitter) => {
  const r = rig(); let calls = 0; setup?.(r);
  r.clock.subscribe(() => calls++, opts); run(r, hz, 1000, jitter); return calls;
};
test('60 fps cap on 144 Hz, 120 Hz and jittery 60 Hz displays', () => {
  const a = count(144, { fps: 60 }), b = count(120, { fps: 60 });
  const c = count(60, { fps: 60 }, null, (n) => ((n * 7919) % 13 - 6) / 10);
  console.log('fps 144Hz', a, '120Hz', b, '60Hz jitter', c);
  assert.ok(a >= 58 && a <= 61, a); assert.ok(b >= 59 && b <= 61, b); assert.ok(c >= 58 && c <= 61, c);
});
test('subscriber fps below the display rate', () => {
  const n = count(144, { fps: 12 }); assert.ok(n >= 11 && n <= 13, n);
});
test('setMaxFps caps subscribers', () => {
  const n = count(144, { fps: 60 }, (r) => r.clock.setMaxFps(30)); assert.ok(n >= 29 && n <= 31, n);
});
test('one rAF chain for many subscribers; stops with the last one', () => {
  const r = rig(); const offs = [1, 2, 3].map(() => r.clock.subscribe(() => {}));
  assert.equal(r.requests, 1);
  for (let i = 1; i <= 5; i++) { r.frame(i * 16.7); assert.equal(r.requests, 1 + i); }
  offs.forEach((off) => off()); assert.equal(r.pending, null); assert.equal(r.clock.size, 0);
  r.clock.subscribe(() => {}); assert.ok(r.pending);
});
test('pause schedules nothing and resume restarts dt', () => {
  const r = rig(); const dts = []; r.clock.subscribe((t, dt) => dts.push(dt));
  r.frame(10); r.frame(27); r.clock.setPaused(true); assert.equal(r.pending, null); const before = r.requests;
  r.clock.setPaused(true); assert.equal(r.requests, before);
  r.clock.setPaused(false); assert.ok(r.pending); r.frame(60000);
  assert.ok(Math.abs(dts.at(-1) - 1 / 60) < 1e-9, dts.at(-1)); assert.ok(dts.every((d) => d <= .1));
});
test('a throwing subscriber does not stop others; unsubscribe inside a callback is safe', () => {
  const r = rig(); const original = console.error; let logged = 0; console.error = () => { logged++; };
  let good = 0, off; r.clock.subscribe(() => { throw new Error('boom'); });
  r.clock.subscribe(() => good++);
  off = r.clock.subscribe(() => off());
  for (let i = 1; i <= 4; i++) r.frame(i * 16.7);
  console.error = original;
  assert.equal(good, 4); assert.equal(logged, 1); assert.equal(r.clock.size, 2);
});
test('real focus loss never pauses; forwarded (untrusted) blur does until focus', () => {
  let m = nextMinimized(false, 'blur', true); assert.equal(backgroundState({ minimized: m }), false);
  m = nextMinimized(m, 'blur', false); assert.equal(backgroundState({ minimized: m }), true);
  assert.equal(backgroundState({ minimized: m, desktop: true }), false);
  assert.equal(nextMinimized(m, 'focus', false), false); assert.equal(nextMinimized(m, 'visible'), false);
});
test('document.hidden always pauses, including desktop surfaces', () => {
  assert.equal(backgroundState({ hidden: true, desktop: true }), true); assert.equal(backgroundState({}), false);
});
