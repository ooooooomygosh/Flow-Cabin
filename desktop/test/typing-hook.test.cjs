'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTypingHook, THROTTLE_MS } = require('../typing-hook.cjs');
const { normalizeSettings, DEFAULT_SETTINGS } = require('../settings.cjs');

function fakeHook() {
  const listeners = {}; let started = 0, stopped = 0;
  return { listeners, get started() { return started; }, get stopped() { return stopped; },
    uIOhook: { on: (name, fn) => { (listeners[name] ||= []).push(fn); }, off: (name, fn) => { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); }, start: () => { started++; }, stop: () => { stopped++; } } };
}
// A keydown whose every property read throws: proves the hook never looks at which key it was.
const sealedEvent = () => new Proxy({}, { get() { throw new Error('the key was read'); }, has() { throw new Error('the key was inspected'); } });

test('typing follow is off by default and only a boolean', () => {
  assert.equal(DEFAULT_SETTINGS.typingFollow, false);
  assert.equal(normalizeSettings({}).typingFollow, false);
  assert.equal(normalizeSettings({ typingFollow: 'yes' }).typingFollow, false);
  assert.equal(normalizeSettings({ typingFollow: true }).typingFollow, true);
});

test('global hook: keydown activity only, never the key, throttled; no mouse listeners', () => {
  const native = fakeHook(), seen = []; let clock = 1000;
  const hook = createTypingHook({ platform: 'win32', load: () => native, onActivity: (at) => seen.push(at), now: () => clock });
  assert.equal(hook.status(), 'off'); assert.equal(native.started, 0, 'nothing loads while the setting is off');
  assert.equal(hook.setEnabled(true), 'active');
  assert.deepEqual(Object.keys(native.listeners), ['keydown']);
  const fire = () => native.listeners.keydown.forEach((fn) => fn(sealedEvent()));
  fire(); clock += THROTTLE_MS / 2; fire(); clock += THROTTLE_MS; fire();
  assert.deepEqual(seen, [1000, 1000 + THROTTLE_MS * 1.5]);
  assert.ok(seen.every((value) => typeof value === 'number'), 'only timestamps leave the hook');
  assert.equal(hook.setEnabled(false), 'off'); assert.equal(native.stopped, 1); assert.equal(native.listeners.keydown.length, 0);
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

test('the source never logs or forwards key details', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'typing-hook.cjs'), 'utf8').replace(/\/\/.*$/gm, ''); // code only, not the comments
  assert.doesNotMatch(source, /keycode|rawcode|\.key\b|mousemove|mousedown|'input'/i);
  const pkg = require('../package.json');
  assert.ok(pkg.build.asarUnpack.some((glob) => glob.includes('uiohook-napi')), 'native prebuilds stay outside the asar');
  assert.ok(pkg.build.files.includes('typing-hook.cjs'));
});
