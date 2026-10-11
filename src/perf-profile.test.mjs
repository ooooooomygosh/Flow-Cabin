import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLevel, hardwareHint, measuredFps } from './perf-profile.mjs';
test('performance level: explicit choice wins, auto uses probe then hardware', () => {
  assert.equal(resolveLevel('smooth', 'high', 'high'), 'low');
  assert.equal(resolveLevel('quality', 'low', 'low'), 'high');
  assert.equal(resolveLevel('auto', 'low', 'high'), 'low');
  assert.equal(resolveLevel('auto', '', 'low'), 'low');
  assert.equal(hardwareHint({ hardwareConcurrency: 4 }), 'low');
  assert.equal(hardwareHint({ hardwareConcurrency: 8, deviceMemory: 8 }), 'high');
  assert.equal(Math.round(measuredFps([0, 100, 200, 300])), 10);
});

import { applyPerformance, syncPerformance, startPerformanceProbe, PERFORMANCE_KEY, DETECTED_KEY } from './perf-profile.mjs';
test('open wallpaper follows storage mode changes and listeners are cleaned up', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map([[PERFORMANCE_KEY, 'smooth']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) } });
  try {
    const root = { dataset: {} }, win = Object.assign(new EventTarget(), { document: { documentElement: root } });
    applyPerformance(root); assert.equal(root.dataset.perf, 'low');
    const stop = syncPerformance(win);
    data.set(PERFORMANCE_KEY, 'quality'); win.dispatchEvent(Object.assign(new Event('storage'), { key: PERFORMANCE_KEY }));
    assert.equal(root.dataset.perf, 'high'); assert.equal(root.dataset.perfMode, 'quality');
    data.set(PERFORMANCE_KEY, 'auto'); data.set(DETECTED_KEY, 'high'); win.dispatchEvent(Object.assign(new Event('storage'), { key: PERFORMANCE_KEY }));
    assert.equal(root.dataset.perfMode, 'auto', 'mode changes even when level stays high');
    stop(); data.set(PERFORMANCE_KEY, 'smooth'); win.dispatchEvent(Object.assign(new Event('storage'), { key: PERFORMANCE_KEY })); assert.equal(root.dataset.perf, 'high');
  } finally { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
});
test('a background interruption cannot persist a false slow-hardware result', () => {
  let start, tick, cancelled = 0;
  const doc = Object.assign(new EventTarget(), { hidden: false, documentElement: { dataset: { perf: 'high' } } });
  const win = { document: doc, setTimeout: fn => { start = fn; return 1; }, clearTimeout() {}, requestAnimationFrame: fn => { tick = fn; return 7; }, cancelAnimationFrame: () => cancelled++ };
  const stop = startPerformanceProbe({ win }); start(); tick(0); tick(16);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); doc.hidden = false;
  tick(300000); assert.equal(doc.documentElement.dataset.perfMode, undefined); assert.equal(cancelled, 1); stop();
});
