'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTypingHook } = require('../typing-hook.cjs');
const { normalizeSettings, DEFAULT_SETTINGS } = require('../settings.cjs');

function fakeHook() {
  const listeners = {}; let started = 0, stopped = 0;
  return { listeners, get started() { return started; }, get stopped() { return stopped; },
    uIOhook: { on: (name, fn) => { (listeners[name] ||= []).push(fn); }, off: (name, fn) => { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); }, start: () => { started++; }, stop: () => { stopped++; } } };
}
function fakeMac() {
  return {
    granted: false, running: false, starts: 0, stops: 0, requests: 0, resets: 0, keyboard: 0, click: 0,
    preflight() { return this.granted; },
    request() { this.requests++; return this.granted; },
    start() { this.starts++; this.running = true; return true; },
    stop() { this.stops++; this.running = false; },
    status() { return { running: this.running, permission: this.granted }; },
    reset() { this.resets++; this.keyboard = 0; this.click = 0; },
    drain() { const value = { keyboard: this.keyboard, click: this.click }; this.keyboard = 0; this.click = 0; return value; }
  };
}
// Every way to inspect a keyboard or mouse event throws, including enumeration.
const sealedEvent = () => new Proxy({}, {
  get() { throw new Error('event content was read'); },
  has() { throw new Error('event content was inspected'); },
  ownKeys() { throw new Error('event content was enumerated'); },
  getOwnPropertyDescriptor() { throw new Error('event descriptor was read'); }
});

test('typing follow is on by default, missing values adopt it and explicit false wins', () => {
  assert.equal(DEFAULT_SETTINGS.typingFollow, true);
  assert.equal(normalizeSettings({}).typingFollow, true);
  assert.equal(normalizeSettings({ typingFollow: 'yes' }).typingFollow, false);
  assert.equal(normalizeSettings({ typingFollow: true }).typingFollow, true);
  assert.equal(normalizeSettings({ typingFollow: false }).typingFollow, false);
});

test('global hook: keydown and mousedown stay distinct, every event is counted, no content is read', () => {
  const native = fakeHook(), seen = []; let clock = 0, loads = 0;
  const hook = createTypingHook({ platform: 'win32', loadWindows: () => { loads++; return native; }, onActivity: (...args) => seen.push(args), now: () => clock });
  assert.equal(hook.status(), 'off'); assert.equal(loads, 0, 'nothing loads while the setting is off');
  assert.equal(hook.setEnabled(true), 'active');
  assert.equal(hook.setEnabled(true), 'active'); assert.equal(native.started, 1);
  assert.deepEqual(Object.keys(native.listeners), ['keydown', 'mousedown']);
  const fire = (name) => native.listeners[name].forEach((fn) => fn(sealedEvent()));
  fire('mousedown'); clock += 10; fire('keydown'); clock += 10; fire('keydown');
  clock += 10; fire('mousedown'); clock += 10; fire('mousedown');
  assert.deepEqual(seen, [
    [{ type: 'click', at: 0 }],
    [{ type: 'keyboard', at: 10 }],
    [{ type: 'keyboard', at: 20 }],
    [{ type: 'click', at: 30 }],
    [{ type: 'click', at: 40 }]
  ]);
  const stale = native.listeners.mousedown[0];
  assert.equal(hook.setEnabled(false), 'off'); assert.equal(native.stopped, 1);
  for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
  clock += 10; stale(sealedEvent()); assert.equal(seen.length, 5);
  hook.setEnabled(true); stale(sealedEvent()); assert.equal(seen.length, 5, 'old callbacks stay inert after restart');
  fire('mousedown'); assert.deepEqual(seen.at(-1), [{ type: 'click', at: clock }]);
  hook.stop(); hook.stop(); assert.equal(native.stopped, 2, 'stop is idempotent');
  for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
});

test('failed start or partial subscription removes both listeners, stops native hook and can retry', () => {
  for (const failAt of ['on', 'start']) {
    const native = fakeHook(), seen = []; let fail = true;
    const originalOn = native.uIOhook.on, originalStart = native.uIOhook.start;
    native.uIOhook.on = (name, fn) => { originalOn(name, fn); if (fail && failAt === 'on' && name === 'mousedown') throw new Error('registration failed'); };
    native.uIOhook.start = () => { originalStart(); if (fail && failAt === 'start') throw new Error('start failed'); };
    const hook = createTypingHook({ platform: 'linux', loadWindows: () => native, now: () => 1000, onActivity: (event) => seen.push(event) });
    assert.equal(hook.setEnabled(true), 'unavailable');
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0, failAt);
    assert.equal(native.stopped, 1);
    fail = false;
    assert.equal(hook.retry(), 'active');
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 1, 'retry does not accumulate listeners');
    native.listeners.mousedown[0](sealedEvent()); assert.deepEqual(seen, [{ type: 'click', at: 1000 }]);
    hook.stop();
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
    assert.equal(native.stopped, 2);
  }
});

test('cleanup supports removeListener and continues when off or native stop throws', () => {
  for (const mode of ['removeListener-only', 'off-throws']) {
    const native = fakeHook(), removed = [];
    const remove = native.uIOhook.off;
    native.uIOhook.removeListener = (name, fn) => { removed.push(name); remove(name, fn); };
    native.uIOhook.off = mode === 'off-throws' ? () => { throw new Error('off failed'); } : undefined;
    native.uIOhook.stop = () => { throw new Error('stop failed'); };
    const hook = createTypingHook({ platform: 'linux', loadWindows: () => native, onActivity: () => {} });
    assert.equal(hook.setEnabled(true), 'active');
    assert.doesNotThrow(() => hook.stop());
    assert.equal(hook.status(), 'off'); assert.deepEqual(removed, ['keydown', 'mousedown']);
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
  }
});

test('macOS: Input Monitoring alone gates the listen-only tap; prompt, then start on retry', () => {
  const native = fakeMac(); let loads = 0; const intervals = [];
  const hook = createTypingHook({ platform: 'darwin', loadMac: () => { loads++; return native; }, exists: () => true, setIntervalFn: (fn) => { intervals.push(fn); return 1; }, clearIntervalFn: () => {}, onActivity: () => {} });
  assert.equal(hook.permission(), 'needs-permission');
  assert.equal(hook.setEnabled(true), 'needs-permission'); assert.equal(native.starts, 0, 'the tap does not start before the grant');
  assert.equal(hook.requestPermission(), 'needs-permission'); assert.equal(native.requests, 1, 'the system prompt is requested only by the user action');
  native.granted = true; assert.equal(hook.permission(), 'granted'); assert.equal(hook.retry(), 'active'); assert.equal(loads, 1);
  assert.equal(native.starts, 1); assert.equal(intervals.length, 1);
  hook.stop(); assert.equal(hook.status(), 'off'); assert.equal(native.stops, 1);
});

test('returning from Input Monitoring rebuilds an already running hook', () => {
  const native = fakeMac(); native.granted = true;
  const hook = createTypingHook({ platform: 'darwin', loadMac: () => native, exists: () => true, setIntervalFn: () => 1, clearIntervalFn: () => {}, onActivity: () => {} });
  assert.equal(hook.setEnabled(true), 'active');
  assert.equal(native.starts, 1);
  assert.equal(hook.restart(), 'active');
  assert.equal(native.stops, 1);
  assert.equal(native.starts, 2);
  hook.stop();
});

test('macOS: native drain reports exact pressed-key and click counts without event details', () => {
  const native = fakeMac(); native.granted = true; const seen = []; let clock = 100;
  const hook = createTypingHook({ platform: 'darwin', loadMac: () => native, exists: () => true, setIntervalFn: () => 1, clearIntervalFn: () => {}, now: () => ++clock, onActivity: (event) => seen.push(event) });
  hook.setEnabled(true);
  native.keyboard = 3; native.click = 2; hook.drain();
  assert.deepEqual(seen, [
    { type: 'keyboard', at: 101 }, { type: 'keyboard', at: 102 }, { type: 'keyboard', at: 103 },
    { type: 'click', at: 104 }, { type: 'click', at: 105 }
  ]);
  hook.drain(); assert.equal(seen.length, 5, 'draining an empty native queue is inert');
  hook.stop(); native.keyboard = 1; hook.drain(); assert.equal(seen.length, 5, 'stopped hooks ignore late native events');
});

test('a broken native module only disables the feature', () => {
  const logs = [];
  const hook = createTypingHook({ platform: 'linux', loadWindows: () => { throw new Error('no prebuild'); }, onActivity: () => {}, log: (...a) => logs.push(a) });
  assert.equal(hook.setEnabled(true), 'unavailable'); assert.equal(logs[0][0], 'typing-hook-error');
});

test('the source never logs or forwards key or mouse details', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'typing-hook.cjs'), 'utf8').replace(/\/\/.*$/gm, ''); // code only, not the comments
  assert.doesNotMatch(source, /keycode|rawcode|\.key\b|\.button\b|\.buttons\b|\.x\b|\.y\b|mousemove|mousewheel|'input'/i);
  const pkg = require('../package.json');
  assert.ok(pkg.build.asarUnpack.some((glob) => glob.includes('uiohook-napi')), 'native prebuilds stay outside the asar');
  assert.ok(pkg.build.asarUnpack.some((glob) => glob.includes('mac-input.node')), 'the macOS tap stays outside the asar');
  assert.ok(pkg.build.files.includes('typing-hook.cjs'));
  assert.ok(pkg.build.files.includes('input-stats.cjs'));
  assert.ok(pkg.build.files.includes('native/*.node'), 'each platform packages only the native modules it ships');
});

test('CompanionBridge fallback keeps keyboard and click separate, ignores Proxy content and cleans up', async () => {
  const {selectedPack}=await import('../../src/pet/imported-pack.mjs');
  const {createLivingPet,bindPetLife}=await import('../../src/pet/living-pet.mjs');
  const packStorage={getItem:()=>JSON.stringify({id:'qa-pack',media:{type:'spritesheet',width:32,height:32,frameWidth:32,frameHeight:32},animations:{idle:{frames:[0],fps:2}},url:'https://untrusted.invalid',data:'DO_NOT_RELAY'})};
  const source = fs.readFileSync(path.join(__dirname, '../../src/CompanionBridge.jsx'), 'utf8')
    .replace(/^import [^\n]*\n/gm, '').replace('export default function', 'function');
  const listeners = new Map(), effects = []; let clock = 1000;
  const window = {
    addEventListener(name, fn, capture) { const list = listeners.get(name) || []; list.push({ fn, capture }); listeners.set(name, list); },
    removeEventListener(name, fn, capture) { listeners.set(name, (listeners.get(name) || []).filter(entry => entry.fn !== fn || entry.capture !== capture)); }
  };
  vm.runInNewContext(`${source}\nCompanionBridge();`, {
    window, document:{documentElement:{dataset:{}}},createLivingPet,bindPetLife:machine=>bindPetLife(machine,window,()=>clock),readLife:()=>({resting:false}), Date: { now: () => clock }, useRef: current => ({ current }), useEffect: fn => effects.push(fn),
    useFocus: () => null, useSoundscape: () => null, PLAYBACK_EVENT: 'playback',
    currentFocusDisplay: () => 'scene', careForCompanion: () => null, selectedPack:()=>selectedPack(packStorage)
  });
  const cleanup = effects.map(fn => fn());
  const fire = name => listeners.get(name).forEach(({ fn }) => fn(sealedEvent()));
  const snapshot = () => window.albumCompanionSnapshot();
  assert.equal(snapshot().typingAt, 0); assert.equal(snapshot().clickAt, 0);
  assert.equal(snapshot().petPack.id,'qa-pack');assert.doesNotMatch(JSON.stringify(snapshot().petPack),/untrusted|DO_NOT_RELAY/);
  for (const name of ['keydown', 'pointerdown']) {
    assert.equal(listeners.get(name).length, 1); assert.equal(listeners.get(name)[0].capture, true);
  }
  fire('pointerdown'); assert.equal(snapshot().clickAt, 1000); assert.equal(snapshot().typingAt, 0);
  clock += 60; fire('keydown'); assert.equal(snapshot().typingAt, 1060);
  clock += 60; fire('keydown'); assert.equal(snapshot().typingAt, 1060, 'keyboard throttle holds for the same kind');
  clock += 60; fire('pointerdown'); assert.equal(snapshot().clickAt, 1180, 'click has its own throttle window');
  clock += 60; fire('pointerdown'); assert.equal(snapshot().clickAt, 1180);
  clock += 60; fire('pointerdown'); assert.equal(snapshot().clickAt, 1300);
  assert.equal(typeof snapshot().typingAt, 'number'); assert.equal(typeof snapshot().clickAt, 'number');
  assert.equal(Object.keys(snapshot()).some(key => /mouse|pointer|keycode|coordinate/i.test(key)), false);
  cleanup.forEach(fn => fn?.());
  for (const entries of listeners.values()) assert.equal(entries.length, 0);
  assert.equal(window.albumCompanionSnapshot, undefined);
});
