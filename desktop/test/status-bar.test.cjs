'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { statusFrom, statusIconPath, createStatusApplier, clockText, ICONS } = require('../status-bar.cjs');
const { trayMenuTemplate } = require('../main/menus.cjs');

test('status model: remaining time title, icon per state, Dock progress and badge', () => {
  assert.equal(clockText(1499000), '24:59'); assert.equal(clockText(3723000), '1:02:03'); assert.equal(clockText(-5), '00:00');
  const idle = statusFrom(null);
  assert.equal(idle.icon, 'cat'); assert.equal(idle.title, ''); assert.equal(idle.progress, -1); assert.equal(idle.badge, '');
  assert.equal(statusFrom({ musicPlaying: true, track: '晚风' }).icon, 'play');
  assert.match(statusFrom({ musicPlaying: true, track: '晚风' }).tooltip, /正在播放：晚风/);
  const now = 1e6, running = statusFrom({ focus: { phase: 'focus', endsAt: now + 15 * 60000, duration: 25 * 60000 } }, now);
  assert.equal(running.icon, 'focus'); assert.equal(running.title, ' 15:00'); assert.equal(running.badge, '15'); assert.ok(Math.abs(running.progress - .4) < 1e-9);
  const paused = statusFrom({ focus: { phase: 'focus', paused: true, remaining: 61000, duration: 25 * 60000 }, musicPlaying: true }, now);
  assert.equal(paused.icon, 'pause'); assert.equal(paused.title, ' 01:01'); assert.equal(paused.badge, '2'); assert.match(paused.statusLine, /已暂停/);
  const rest = statusFrom({ focus: { phase: 'shortBreak', endsAt: now + 300000, duration: 300000 } }, now);
  assert.equal(rest.icon, 'focus'); assert.equal(rest.progress, -1); assert.equal(rest.badge, ''); assert.match(rest.statusLine, /短休息/);
});

test("status icons are beauty's PR #59 tray art and exist for every platform", () => {
  for (const icon of ICONS) for (const platform of ['darwin', 'win32', 'linux']) assert.ok(fs.existsSync(statusIconPath(icon, platform)), `${icon}/${platform}`);
  assert.equal(path.basename(statusIconPath('focus', 'darwin')), 'trayTemplate-focus.png');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'tray', 'trayTemplate-focus@2x.png')));
  assert.equal(path.basename(statusIconPath('nope', 'win32')), 'tray-cat.ico');
});

function fakes(platform) {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  const tray = { setImage: rec('image'), setTitle: rec('title'), setToolTip: rec('tooltip') };
  const win = { isDestroyed: () => false, isFocused: () => false, setProgressBar: rec('progress'), setOverlayIcon: rec('overlay'), flashFrame: rec('flash') };
  const app = { dock: { setBadge: rec('badge'), bounce: rec('bounce') } };
  const nativeImage = { createFromPath: (file) => ({ file, isEmpty: () => false, setTemplateImage: rec('template') }) };
  return { calls, applier: createStatusApplier({ getTray: () => tray, getWindow: () => win, app, nativeImage, platform }) };
}

test('macOS: title + Dock badge/progress while focusing, bounce once when focus ends', () => {
  const { calls, applier } = fakes('darwin'), now = 1e6;
  applier.apply(statusFrom({ focus: { phase: 'focus', endsAt: now + 60000, duration: 120000 } }, now));
  assert.deepEqual(calls.find((c) => c[0] === 'title').slice(1, 2), [' 01:00']);
  assert.deepEqual(calls.find((c) => c[0] === 'badge'), ['badge', '1']);
  assert.deepEqual(calls.find((c) => c[0] === 'progress'), ['progress', .5]);
  assert.ok(calls.some((c) => c[0] === 'template')); assert.equal(calls.filter((c) => c[0] === 'bounce').length, 0);
  applier.apply(statusFrom({ focus: { phase: 'shortBreak', endsAt: now + 300000, duration: 300000 } }, now));
  assert.equal(calls.filter((c) => c[0] === 'bounce').length, 1);
  assert.deepEqual(calls.filter((c) => c[0] === 'progress').at(-1), ['progress', -1]);
  applier.apply(statusFrom(null)); assert.equal(calls.filter((c) => c[0] === 'bounce').length, 1);
  assert.equal(calls.filter((c) => c[0] === 'overlay').length, 0);
});

test('Windows: taskbar progress + overlay while focusing, flash when it ends, no Dock calls', () => {
  const { calls, applier } = fakes('win32'), now = 1e6;
  applier.apply(statusFrom({ focus: { phase: 'focus', endsAt: now + 60000, duration: 120000 } }, now));
  const overlay = calls.find((c) => c[0] === 'overlay'); assert.match(overlay[1].file, /tray-focus-16\.png$/); assert.equal(overlay[2], '专注中');
  applier.apply(statusFrom(null));
  assert.equal(calls.filter((c) => c[0] === 'overlay').at(-1)[1], null);
  assert.equal(calls.filter((c) => c[0] === 'flash').length, 1);
  assert.equal(calls.filter((c) => c[0] === 'title' || c[0] === 'badge' || c[0] === 'bounce').length, 0);
});

test('tray menu: status line, pause/next, start pomodoro, feed cat, open journal', () => {
  const sent = [], player = [], noop = () => {}; let journal = 0;
  const menu = (status) => trayMenuTemplate({ restore: noop, companion: (c) => sent.push(c), checkUpdates: noop, player: (a) => player.push(a), openJournal: () => journal++, petStart: noop, petStop: noop, sinkEnter: noop, sinkExit: noop, quit: noop, status });
  const click = (items, label) => items.find((item) => item.label === label).click();
  const idle = menu(statusFrom(null));
  assert.deepEqual([idle[0].label, idle[0].enabled], ['小屋很安静', false]);
  click(idle, '播放音乐'); click(idle, '下一首'); click(idle, '开始番茄钟'); click(idle, '喂小猫一条小鱼干'); click(idle, '打开小屋日记');
  assert.deepEqual(player, ['toggle', 'next']); assert.deepEqual(sent, ['focus-start', 'cat-feed']); assert.equal(journal, 1);
  const now = Date.now(), running = menu(statusFrom({ musicPlaying: true, focus: { phase: 'focus', endsAt: now + 60000, duration: 120000 } }, now));
  click(running, '暂停专注'); assert.equal(sent.at(-1), 'focus-toggle'); assert.ok(running.some((item) => item.label === '暂停音乐'));
  assert.ok(menu(statusFrom({ focus: { phase: 'focus', paused: true, remaining: 1000 } })).some((item) => item.label === '继续专注'));
});
