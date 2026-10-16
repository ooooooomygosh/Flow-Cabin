import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundscapeController } from './lifecycle.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const fakePlayer = () => ({ starts: 0, disposals: 0, volume: null, duck: null, start() { this.starts++; }, dispose() { this.disposals++; }, setVolume(value) { this.volume = value; }, setDuck(value) { this.duck = value; } });
function fixture(options = {}) {
  const loads = [], updates = [], saved = [], timers = new Map(); let timerId = 0;
  const context = { state: 'running', closes: 0, close() { this.closes++; return Promise.resolve(); } };
  const ambience = { values: {}, stops: 0, set(id, volume) { this.values[id] = volume; }, setMaster(value) { this.master = value; }, stop() { this.stops++; } };
  const controller = createSoundscapeController({
    initialMix: { lofiOn: true }, createContext: () => context, createAmbience: () => ambience,
    loadPlayer(callbacks) { const pending = deferred(); loads.push({ ...pending, callbacks }); return pending.promise; },
    onChange: (state) => updates.push(state), persist: (mix) => saved.push(mix),
    schedule(fn) { const id = ++timerId; timers.set(id, fn); return id; }, cancel(id) { timers.delete(id); }, ...options
  });
  controller.activate();
  return { controller, loads, updates, saved, timers, context, ambience };
}

test('disable during load disposes late player without starting or publishing a section', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  f.controller.turnOff(); const count = f.updates.length;
  f.loads[0].callbacks.onSection({ seed: 1 });
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  assert.equal(player.starts, 0); assert.equal(player.disposals, 1);
  assert.equal(f.updates.length, count); assert.equal(f.controller.getState().lofiState, 'off');
});

test('unmount invalidates load, closes context and emits no late state', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  f.controller.dispose(); const count = f.updates.length;
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  assert.equal(player.starts, 0); assert.equal(player.disposals, 1);
  assert.equal(f.context.closes, 1); assert.equal(f.ambience.stops, 1); assert.equal(f.updates.length, count);
});

test('rapid off/on retains latest generation even when old load resolves last', async () => {
  const f = fixture(); await f.controller.toggle(); await flush();
  f.controller.toggle(); await f.controller.toggle(); await flush();
  assert.equal(f.loads.length, 2);
  const old = fakePlayer(), latest = fakePlayer();
  f.loads[1].resolve(latest); await flush(); f.loads[0].resolve(old); await flush();
  assert.equal(latest.starts, 1); assert.equal(latest.disposals, 0);
  assert.equal(old.starts, 0); assert.equal(old.disposals, 1);
  assert.equal(f.controller.getState().lofiState, 'playing');
});

test('volume and duck changes during loading apply latest values', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  f.controller.setMaster(.4); f.controller.setLofiVolume(.25); f.controller.setDucked(true);
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  assert.equal(player.volume, .1); assert.equal(player.duck, true); assert.equal(f.loads.length, 1);
});

test('skip timer is cancelled on disable and even an already queued callback cannot restart', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  f.controller.skipSection(); const callback = [...f.timers.values()][0];
  assert.equal(player.disposals, 1); f.controller.turnOff();
  assert.equal(f.timers.size, 0); callback(); await flush(); assert.equal(f.loads.length, 1);
});

test('repeated skip replaces timer and restarting uses current volume', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  f.loads[0].resolve(fakePlayer()); await flush();
  f.controller.skipSection(); f.controller.skipSection(); assert.equal(f.timers.size, 1);
  f.controller.setMaster(.5); assert.equal(f.loads.length, 1);
  [...f.timers.values()][0](); await flush(); assert.equal(f.loads.length, 2);
});

test('restore mix stops playback, normalizes and persists without auto-start', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  const restored = f.controller.replaceMix({ master: 8, lofiOn: true, tracks: { rain: .8 } }); await flush();
  assert.equal(restored.master, 1); assert.equal(f.controller.getState().enabled, false);
  assert.equal(f.ambience.values.rain, 0); assert.equal(player.disposals, 1);
  assert.equal(f.loads.length, 1); assert.deepEqual(f.saved.at(-1), restored);
});

test('restore cancels pending resume and pending player import', async () => {
  const resumed = deferred(); const f = fixture({ createContext: () => ({ state: 'suspended', resume: () => resumed.promise, close() {} }) });
  const start = f.controller.turnOn(); f.controller.replaceMix({ lofiOn: true });
  resumed.resolve(); await start; await flush(); assert.equal(f.controller.getState().enabled, false); assert.equal(f.loads.length, 0);
  const other = fixture(); await other.controller.turnOn(); await flush(); other.controller.replaceMix({ lofiOn: true });
  const stale = fakePlayer(); other.loads[0].resolve(stale); await flush(); assert.equal(stale.starts, 0); assert.equal(stale.disposals, 1);
});

test('rapid toggle cancels pending context resume', async () => {
  const resumed = deferred(); const f = fixture({ createContext: () => ({ state: 'suspended', resume: () => resumed.promise, close() {} }) });
  const start = f.controller.toggle(); f.controller.toggle(); resumed.resolve(); await start; await flush();
  assert.equal(f.controller.getState().enabled, false); assert.equal(f.loads.length, 0);
});

test('context creation and resume failures are caught, exposed and retryable', async () => {
  let attempts = 0;
  const f = fixture({ createContext() { if (++attempts === 1) throw Error('unsupported'); return { state: 'running', close() {} }; } });
  await f.controller.turnOn(); assert.match(f.controller.getState().error, /音频/); assert.equal(f.controller.getState().enabled, false);
  await f.controller.turnOn(); assert.equal(f.controller.getState().enabled, true);
  const failed = fixture({ createContext: () => ({ state: 'suspended', resume: async () => { throw Error('denied'); }, close() {} }) });
  await failed.controller.turnOn(); assert.equal(failed.controller.getState().enabled, false); assert.match(failed.controller.getState().error, /音频/);
});

test('player start failure disposes partial player and reports an error', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush();
  const player = fakePlayer(); player.start = () => { throw Error('failed'); };
  f.loads[0].resolve(player); await flush(); assert.equal(player.disposals, 1); assert.equal(f.controller.getState().lofiState, 'off'); assert.match(f.controller.getState().error, /Lo-fi/);
});

test('strict-mode cleanup/reactivation permits a fresh start but rejects old work', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush(); f.controller.dispose(); f.controller.activate();
  await f.controller.turnOn(); await flush(); const old = fakePlayer(), next = fakePlayer();
  f.loads[0].resolve(old); f.loads[1].resolve(next); await flush(); assert.equal(old.starts, 0); assert.equal(next.starts, 1);
});

test('stale queued skip callback cannot clear a newer restart timer', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush(); f.loads[0].resolve(fakePlayer()); await flush();
  f.controller.skipSection(); const stale = [...f.timers.values()][0]; f.controller.skipSection();
  stale(); f.controller.setMaster(.2); await flush(); assert.equal(f.loads.length, 1);
  f.controller.turnOff(); assert.equal(f.timers.size, 0);
});

test('old rejected import cannot overwrite a replacement player state', async () => {
  const f = fixture(); await f.controller.turnOn(); await flush(); f.controller.turnOff(); await f.controller.turnOn(); await flush();
  f.loads[1].resolve(fakePlayer()); await flush(); f.loads[0].reject(Error('old failure')); await flush();
  assert.equal(f.controller.getState().lofiState, 'playing'); assert.equal(f.controller.getState().error, '');
});

test('restore reports persistence failure while stopping audio and retaining previous configuration', async () => {
  const storageError = new Error('QuotaExceededError');
  const f = fixture({ persist() { throw storageError; } });
  const original = f.controller.getState().mix;
  await f.controller.turnOn(); await flush();
  const player = fakePlayer(); f.loads[0].resolve(player); await flush();
  assert.throws(() => f.controller.replaceMix({ master: .2, lofiOn: true, tracks: { rain: .9 } }), (error) => error === storageError);
  await flush();
  assert.deepEqual(f.controller.getState().mix, original);
  assert.equal(f.controller.getState().enabled, false);
  assert.equal(f.controller.getState().lofiState, 'off');
  assert.equal(f.ambience.values.rain, 0);
  assert.equal(player.disposals, 1);
  assert.equal(f.loads.length, 1);
});

test('restore storage failure still invalidates a pending context resume', async () => {
  const resumed = deferred();
  const f = fixture({
    persist() { throw Error('storage unavailable'); },
    createContext: () => ({ state: 'suspended', resume: () => resumed.promise, close() {} })
  });
  const start = f.controller.turnOn();
  assert.throws(() => f.controller.replaceMix({ lofiOn: true }), /storage unavailable/);
  resumed.resolve(); await start; await flush();
  assert.equal(f.controller.getState().enabled, false); assert.equal(f.loads.length, 0);
});

test('turning sound off lets the ambience context sleep; turning it on cancels that', async () => {
  const calls = []; const f = fixture({ idleSuspend: () => ({ idle: () => calls.push('idle'), cancel: () => calls.push('cancel') }) });
  await f.controller.turnOn(); assert.deepEqual(calls, ['cancel']);
  f.controller.turnOff(); assert.deepEqual(calls, ['cancel', 'idle']);
  await f.controller.turnOn(); f.controller.dispose(); assert.deepEqual(calls, ['cancel', 'idle', 'cancel', 'idle', 'cancel']);
});
