'use strict';
// 2.2 focus + desktop pet: notifications, lock / sleep relay, close-to-tray, pet mood / 免打扰 /
// 摸摸 passthrough, gravity, walking across displays, DPI size, behaviour preferences.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { parseNotice, createNotifier, keepAliveOnClose, createPowerRelay, powerScript, FOCUS_HOTKEYS } = require('../focus-shell.cjs');
const { cleanCompanion, cleanFocus } = require('../wallpaper-model.cjs');
const { COMMANDS, sendCompanionCommand } = require('../companion-sync.cjs');
const { createPetPhysics, floorOf, walkArea, crispSize } = require('../pet-physics.cjs');
const { createFullscreenWatch, parseFullscreenLine } = require('../pet-fullscreen.cjs');
const { createSiteCommands } = require('../main/site-commands.cjs');

test('a page notice keeps only companion commands as buttons and bounded text', () => {
  const notice = parseNotice(new URLSearchParams({ title: '专注完成', body: '辛苦啦\n+1 小鱼干', silent: 'true', actions: 'focus-break:开始休息|focus-next:跳过休息|shell-exec:危险|focus-extend:再 5 分钟' }));
  assert.deepEqual(notice.actions, [{ command: 'focus-break', label: '开始休息' }, { command: 'focus-next', label: '跳过休息' }]);
  assert.equal(notice.silent, true);
  assert.equal(notice.body, '辛苦啦\n+1 小鱼干');
  assert.equal(parseNotice(new URLSearchParams({ body: 'no title' })), null);
  assert.equal(parseNotice(new URLSearchParams({ title: 'x'.repeat(200) })).title.length, 60);
});

test('the notifier makes a sound unless the cabin chimed, brings the window back on click and runs macOS buttons', () => {
  const made = [], restored = [], sent = [];
  class FakeNotification extends EventEmitter { static isSupported() { return true; } constructor(options) { super(); this.options = options; made.push(this); } show() { this.shown = true; } close() { this.closed = true; } }
  const mac = createNotifier({ Notification: FakeNotification, platform: 'darwin', restore: () => restored.push(1), command: (c) => sent.push(c) });
  assert.equal(mac.show({ title: '专注完成', body: '', silent: false, actions: [{ command: 'focus-break', label: '开始休息' }] }), true);
  assert.equal(made[0].options.silent, false);
  assert.deepEqual(made[0].options.actions, [{ type: 'button', text: '开始休息' }]);
  made[0].emit('action', {}, 0); made[0].emit('click');
  assert.deepEqual(sent, ['focus-break']); assert.equal(restored.length, 1);
  mac.show({ title: '休息结束', body: '', silent: true, actions: [] });
  assert.equal(made[0].closed, true, 'one notification at a time');
  const win = createNotifier({ Notification: FakeNotification, platform: 'win32', restore() {}, command() {} });
  win.show({ title: 'x', body: '', silent: false, actions: [{ command: 'focus-next', label: '跳过休息' }] });
  assert.equal(made.at(-1).options.actions, undefined, 'Windows shows no buttons (click opens the cabin)');
  assert.equal(createNotifier({ Notification: { isSupported: () => false } }).show({ title: 'x', actions: [] }), false);
});

test('closing the window keeps the page alive only while a round runs; quitting still quits', () => {
  assert.equal(keepAliveOnClose({ phase: 'focus' }), true);
  assert.equal(keepAliveOnClose({ phase: 'shortBreak' }), true);
  assert.equal(keepAliveOnClose({ phase: 'idle' }), false);
  assert.equal(keepAliveOnClose({ phase: 'focus', quitting: true }), false);
  assert.match(FOCUS_HOTKEYS.toggle, /^CommandOrControl\+Alt\+/);
});

test('lock and sleep reach the page; the return repeats when the user left', () => {
  const power = new EventEmitter(), sent = []; let now = 1000;
  createPowerRelay({ powerMonitor: power, send: (detail) => sent.push(detail), now: () => now });
  power.emit('lock-screen'); now = 5000; power.emit('suspend');
  assert.deepEqual(sent, [{ state: 'away', at: 1000 }, { state: 'away', at: 1000 }], 'the first moment away is kept');
  now = 900000; power.emit('resume'); power.emit('unlock-screen');
  assert.deepEqual(sent.at(-1), { state: 'back', at: 900000, from: 1000 });
  assert.equal(sent.length, 3, 'one return for one absence');
  const script = powerScript({ state: 'back', at: 2, from: 1, extra: '<script>' });
  assert.match(script, /"state":"back","at":2,"from":1/); assert.doesNotMatch(script, /extra/);
});

test('mood tiers (droopy), 免打扰 and overtime survive the companion read; the pet may forward 摸摸', () => {
  const value = cleanCompanion({ care: { tier: 'droopy', feedsToday: 2 }, focus: { phase: 'focus', quietMode: true, due: true, over: 61000, startedAt: 5, duration: 4 * 3600000 } });
  assert.equal(value.care.tier, 'droopy');
  assert.equal(value.care.feedsToday, 2);
  assert.equal(value.focus.quietMode, true);
  assert.equal(value.focus.due, true);
  assert.equal(value.focus.over, 61000);
  assert.equal(value.focus.duration, 4 * 3600000);
  assert.equal(cleanFocus({ phase: 'shortBreak', due: true }).due, false, 'only a focus round runs over');
  assert.equal(cleanCompanion({ care: { tier: 'grumpy' } }).care.tier, '');
  for (const command of ['cat-pet', 'focus-extend', 'focus-break', 'focus-next', 'focus-end', 'focus-distraction']) assert.ok(COMMANDS.has(command), command);
  const scripts = []; sendCompanionCommand({ isDestroyed: () => false, executeJavaScript: async (s) => scripts.push(s) }, 'cat-pet');
  assert.match(scripts[0], /album-companion-command[\s\S]*"cat-pet"/);
});

const area = { x: 0, y: 0, width: 1440, height: 860 }, size = { width: 288, height: 256 };
test('with gravity a released pet falls to the Dock / taskbar line, bounces and lands', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time, random: () => .5 });
  physics.drag(2, 1); time += 500;
  const start = { ...size, x: 600, y: 100 };
  assert.equal(physics.release(start, area, { gravity: true }), 'fall');
  let current = { ...start }, frames = [];
  for (let i = 0; i < 600 && physics.moving; i++) { time += 16; const next = physics.step(current, area, 1 / 60); frames.push(next); current = { ...current, x: next.x, y: next.y }; }
  assert.equal(current.y, floorOf(size, area), 'on the floor');
  assert.equal(current.x, 600, 'a careful placement drops straight down');
  const ys = frames.map((f) => f.y), bottomHits = ys.filter((y, i) => y === floorOf(size, area) && ys[i - 1] !== y).length;
  assert.ok(bottomHits >= 2, 'it bounces at least once before landing');
  assert.ok(frames.some((f) => f.mode === 'land'));
  assert.equal(physics.release({ ...size, x: 600, y: floorOf(size, area) }, area, { gravity: true }), 'idle', 'already on the floor: nothing to do');
  // A throw with gravity arcs down instead of floating to a stop.
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(40, -10); }
  physics.release({ ...size, x: 300, y: 300 }, area, { gravity: true });
  current = { ...size, x: 300, y: 300 };
  for (let i = 0; i < 900 && physics.moving; i++) { time += 16; const next = physics.step(current, area, 1 / 60); current = { ...current, x: next.x, y: next.y }; }
  assert.equal(current.y, floorOf(size, area)); assert.ok(current.x > 300);
  // drop(): gravity switched on while the pet hangs mid-air.
  assert.equal(physics.drop({ ...size, x: 10, y: 50 }, area), 'fall');
  assert.equal(createPetPhysics().drop({ ...size, x: 10, y: floorOf(size, area) }, area), 'idle');
});

test('side-by-side displays with the same floor join into one stroll; stacked or uneven ones do not', () => {
  const left = { x: 0, y: 25, width: 1440, height: 835 }, right = { x: 1440, y: 0, width: 1920, height: 860 }, above = { x: 0, y: -1080, width: 1920, height: 1080 }, uneven = { x: -1280, y: 0, width: 1280, height: 700 };
  assert.deepEqual(walkArea(left, [left, right, above, uneven]), { x: 0, y: 25, width: 3360, height: 835 });
  assert.deepEqual(walkArea(right, [left, right]), { x: 0, y: 25, width: 3360, height: 835 });
  assert.deepEqual(walkArea(above, [left, right, above]), above);
  // A stroll on the joined floor can end on the neighbouring display.
  let time = 0, draws = 0; const physics = createPetPhysics({ now: () => time, random: () => [.9, .9][draws++ % 2] });
  const joined = walkArea(left, [left, right]), bounds = { ...size, x: 200, y: floorOf(size, joined) };
  physics.reset(bounds); time += 10 * 60000;
  physics.step(bounds, joined, 0, { allowWalk: true }); assert.equal(physics.mode, 'walk');
  let current = bounds;
  for (let i = 0; i < 60 * 120 && physics.mode === 'walk'; i++) { time += 16; const next = physics.step(current, joined, 1 / 60, { allowWalk: true }); current = { ...current, x: next.x, y: next.y }; }
  assert.ok(current.x > 1440, `walked onto the right display (x=${current.x})`);
});

test('the sprite size lands on whole device pixels per art pixel at every display scaling', () => {
  for (const scale of [1, 1.25, 1.5, 1.75, 2, 3]) for (const base of [128, 192, 256]) {
    const dip = crispSize(base, scale), device = dip * scale;
    assert.ok(Math.abs(device - Math.round(device)) < 1e-9 && Math.round(device) % 32 === 0, `${base} @ ${scale}`);
    assert.ok(Math.abs(dip - base) <= 32 / scale / 2 + 1e-9, 'close to the chosen size');
  }
  assert.equal(crispSize(192, 1), 192); assert.equal(crispSize(192, NaN), 192);
});

test('Windows fullscreen apps hide the pet: the helper reports changes, restarts a few times, stops cleanly', () => {
  assert.equal(parseFullscreenLine('{"fullscreen":true}'), true); assert.equal(parseFullscreenLine('nope'), null); assert.equal(parseFullscreenLine('{"fullscreen":1}'), null);
  const children = [], changes = [], timers = [];
  const spawnProcess = (file, args) => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stdin = new PassThrough(); child.args = args; child.kill = () => { child.killed = true; }; children.push(child); return child; };
  const watch = createFullscreenWatch({ platform: 'win32', helperPath: 'DesktopHost.exe', spawnProcess, onChange: (on) => changes.push(on), setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer() {} });
  watch.start('12345');
  assert.deepEqual(children[0].args, ['fullscreen-watch', '12345', String(process.pid)]);
  return new Promise((resolve) => {
    children[0].stdout.write('{"fullscreen":true}\n{"fullscreen":true}\n{"fullscreen":false}\n');
    setImmediate(() => {
      assert.deepEqual(changes, [true, false]);
      children[0].emit('exit', 1); assert.equal(timers.length, 1, 'restart scheduled'); timers[0](); assert.equal(children.length, 2);
      watch.stop(); assert.equal(children[1].killed, true);
      assert.equal(createFullscreenWatch({ platform: 'darwin', helperPath: 'x', spawnProcess }).supported, false);
      resolve();
    });
  });
});

test('pet preferences: defaults, bounds and the page command', () => {
  const { normalizePetPrefs, prefsFromParams } = require('../pet.cjs');
  const prefs = normalizePetPrefs({});
  assert.deepEqual({ ...prefs }, { size: 'M', enabled: false, bubbles: true, walk: true, gravity: true, onTop: true, locked: false, clickThrough: false, autoHide: true, opacity: 1 });
  assert.equal(normalizePetPrefs({ opacity: .01 }).opacity, .3);
  assert.deepEqual(prefsFromParams(new URLSearchParams('bubbles=false&opacity=0.6&evil=1')), { bubbles: false, opacity: .6 });
});

test('the page may set pet behaviour and hide it for a while through whitelisted shell commands', () => {
  const calls = [];
  const pet = { setPrefs: (value) => calls.push(['prefs', value]), hideFor: (ms) => calls.push(['hide', ms]), showNow: () => calls.push(['show']) };
  const commands = createSiteCommands({ isSitePage: () => true, pet: () => pet, petPrefs: (params) => ({ bubbles: params.get('bubbles') === 'true' }), notify: (params) => calls.push(['notify', params.get('title')]) });
  commands.handle('album-desktop://action/pet-prefs?bubbles=false');
  commands.handle('album-desktop://action/pet-hide?hours=1');
  commands.handle('album-desktop://action/pet-hide?hours=0');
  commands.handle('album-desktop://action/pet-hide?hours=99');
  commands.handle('album-desktop://action/notify?title=%E4%B8%93%E6%B3%A8%E5%AE%8C%E6%88%90');
  assert.deepEqual(calls, [['prefs', { bubbles: false }], ['hide', 3600000], ['show'], ['notify', '专注完成']]);
});
