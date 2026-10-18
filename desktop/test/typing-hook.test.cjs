'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTypingHook, THROTTLE_MS } = require('../typing-hook.cjs');
const { normalizeSettings, DEFAULT_SETTINGS } = require('../settings.cjs');

function fakeHook() {
  const listeners = {}; let started = 0, stopped = 0;
  return { listeners, get started() { return started; }, get stopped() { return stopped; },
    uIOhook: { on: (name, fn) => { (listeners[name] ||= []).push(fn); }, off: (name, fn) => { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); }, start: () => { started++; }, stop: () => { stopped++; } } };
}
// Every way to inspect a keyboard or mouse event throws, including enumeration.
const sealedEvent = () => new Proxy({}, {
  get() { throw new Error('event content was read'); },
  has() { throw new Error('event content was inspected'); },
  ownKeys() { throw new Error('event content was enumerated'); },
  getOwnPropertyDescriptor() { throw new Error('event descriptor was read'); }
});

test('typing follow is off by default and only a boolean', () => {
  assert.equal(DEFAULT_SETTINGS.typingFollow, false);
  assert.equal(normalizeSettings({}).typingFollow, false);
  assert.equal(normalizeSettings({ typingFollow: 'yes' }).typingFollow, false);
  assert.equal(normalizeSettings({ typingFollow: true }).typingFollow, true);
});

test('global hook: keydown and mousedown share one throttle and send only timestamps', () => {
  const native = fakeHook(), seen = []; let clock = 0, loads = 0;
  const hook = createTypingHook({ platform: 'win32', load: () => { loads++; return native; }, onActivity: (...args) => seen.push(args), now: () => clock });
  assert.equal(hook.status(), 'off'); assert.equal(loads, 0, 'nothing loads while the setting is off');
  assert.equal(hook.setEnabled(true), 'active');
  assert.equal(hook.setEnabled(true), 'active'); assert.equal(native.started, 1);
  assert.deepEqual(Object.keys(native.listeners), ['keydown', 'mousedown']);
  const fire = (name) => native.listeners[name].forEach((fn) => fn(sealedEvent()));
  fire('mousedown'); clock += THROTTLE_MS / 2; fire('keydown'); clock += THROTTLE_MS / 2; fire('keydown');
  clock += THROTTLE_MS / 2; fire('mousedown'); clock += THROTTLE_MS / 2; fire('mousedown');
  assert.deepEqual(seen, [[0], [THROTTLE_MS], [THROTTLE_MS * 2]]);
  const stale = native.listeners.mousedown[0];
  assert.equal(hook.setEnabled(false), 'off'); assert.equal(native.stopped, 1);
  for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
  clock += THROTTLE_MS; stale(sealedEvent()); assert.equal(seen.length, 3);
  hook.setEnabled(true); stale(sealedEvent()); assert.equal(seen.length, 3, 'old callbacks stay inert after restart');
  fire('mousedown'); assert.deepEqual(seen.at(-1), [clock]);
  hook.stop(); hook.stop(); assert.equal(native.stopped, 2, 'stop is idempotent');
  for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
});

test('failed start or partial subscription removes both listeners, stops native hook and can retry', () => {
  for (const failAt of ['on', 'start']) {
    const native = fakeHook(), seen = []; let fail = true;
    const originalOn = native.uIOhook.on, originalStart = native.uIOhook.start;
    native.uIOhook.on = (name, fn) => { originalOn(name, fn); if (fail && failAt === 'on' && name === 'mousedown') throw new Error('registration failed'); };
    native.uIOhook.start = () => { originalStart(); if (fail && failAt === 'start') throw new Error('start failed'); };
    const hook = createTypingHook({ platform: 'linux', load: () => native, now: () => 1000, onActivity: at => seen.push(at) });
    assert.equal(hook.setEnabled(true), 'unavailable');
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0, failAt);
    assert.equal(native.stopped, 1);
    fail = false;
    assert.equal(hook.retry(), 'active');
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 1, 'retry does not accumulate listeners');
    native.listeners.mousedown[0](sealedEvent()); assert.deepEqual(seen, [1000]);
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
    const hook = createTypingHook({ platform: 'linux', load: () => native, onActivity: () => {} });
    assert.equal(hook.setEnabled(true), 'active');
    assert.doesNotThrow(() => hook.stop());
    assert.equal(hook.status(), 'off'); assert.deepEqual(removed, ['keydown', 'mousedown']);
    for (const name of ['keydown', 'mousedown']) assert.equal(native.listeners[name].length, 0);
  }
});

test('macOS: no native load without Accessibility permission; prompt, then start on retry', () => {
  const native = fakeHook(); let trusted = false, loads = 0; const prompts = [];
  const systemPreferences = { isTrustedAccessibilityClient: (prompt) => { prompts.push(prompt); return trusted; } };
  const hook = createTypingHook({ platform: 'darwin', systemPreferences, load: () => { loads++; return native; }, onActivity: () => {} });
  assert.equal(hook.setEnabled(true), 'needs-permission'); assert.equal(loads, 0);
  assert.equal(hook.requestPermission(), 'needs-permission'); assert.ok(prompts.includes(true), 'the system prompt is shown on request only');
  assert.ok(prompts.filter((p) => p === true).length === 1);
  trusted = true; assert.equal(hook.retry(), 'active'); assert.equal(loads, 1);
  hook.stop(); assert.equal(hook.status(), 'off'); assert.equal(native.stopped, 1);
});

test('a broken native module only disables the feature', () => {
  const logs = [];
  const hook = createTypingHook({ platform: 'linux', load: () => { throw new Error('no prebuild'); }, onActivity: () => {}, log: (...a) => logs.push(a) });
  assert.equal(hook.setEnabled(true), 'unavailable'); assert.equal(logs[0][0], 'typing-hook-error');
});

test('the source never logs or forwards key or mouse details', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'typing-hook.cjs'), 'utf8').replace(/\/\/.*$/gm, ''); // code only, not the comments
  assert.doesNotMatch(source, /keycode|rawcode|\.key\b|\.button\b|\.buttons\b|\.x\b|\.y\b|mousemove|mousewheel|'input'/i);
  const pkg = require('../package.json');
  assert.ok(pkg.build.asarUnpack.some((glob) => glob.includes('uiohook-napi')), 'native prebuilds stay outside the asar');
  assert.ok(pkg.build.files.includes('typing-hook.cjs'));
});

test('CompanionBridge fallback ignores Proxy event content, throttles both inputs and cleans up', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/CompanionBridge.jsx'), 'utf8')
    .replace(/^import [^\n]*\n/gm, '').replace('export default function', 'function');
  const listeners = new Map(), effects = []; let clock = 1000;
  const window = {
    addEventListener(name, fn, capture) { const list = listeners.get(name) || []; list.push({ fn, capture }); listeners.set(name, list); },
    removeEventListener(name, fn, capture) { listeners.set(name, (listeners.get(name) || []).filter(entry => entry.fn !== fn || entry.capture !== capture)); }
  };
  vm.runInNewContext(`${source}\nCompanionBridge();`, {
    window, Date: { now: () => clock }, useRef: current => ({ current }), useEffect: fn => effects.push(fn),
    useFocus: () => null, useSoundscape: () => null, PLAYBACK_EVENT: 'playback',
    currentFocusDisplay: () => 'scene', careForCompanion: () => null
  });
  const cleanup = effects.map(fn => fn());
  const fire = name => listeners.get(name).forEach(({ fn }) => fn(sealedEvent()));
  const snapshot = () => window.albumCompanionSnapshot();
  assert.equal(snapshot().typingAt, 0);
  for (const name of ['keydown', 'pointerdown']) {
    assert.equal(listeners.get(name).length, 1); assert.equal(listeners.get(name)[0].capture, true);
  }
  fire('pointerdown'); assert.equal(snapshot().typingAt, 1000);
  clock += THROTTLE_MS / 2; fire('keydown'); assert.equal(snapshot().typingAt, 1000);
  clock += THROTTLE_MS / 2; fire('keydown'); assert.equal(snapshot().typingAt, clock);
  clock += THROTTLE_MS / 2; fire('pointerdown'); assert.equal(snapshot().typingAt, clock - THROTTLE_MS / 2);
  clock += THROTTLE_MS / 2; fire('pointerdown'); assert.equal(snapshot().typingAt, clock);
  assert.equal(typeof snapshot().typingAt, 'number');
  assert.equal(Object.keys(snapshot()).some(key => /mouse|pointer|keycode|coordinate/i.test(key)), false);
  cleanup.forEach(fn => fn?.());
  for (const entries of listeners.values()) assert.equal(entries.length, 0);
  assert.equal(window.albumCompanionSnapshot, undefined);
});
