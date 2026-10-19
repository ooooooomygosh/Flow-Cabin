'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createSiteCommands, parseSiteCommand } = require('../main/site-commands.cjs');
const { createAutostart, autostartScript } = require('../main/autostart.cjs');
const { appMenuTemplate, trayMenuTemplate } = require('../main/menus.cjs');

function fixture({ sitePage = true } = {}) {
  const calls = [], log = (name) => (...args) => { calls.push([name, ...args]); return Promise.resolve({ ok: true }); };
  const sink = { active: false, toggle: log('sink.toggle'), enter: log('sink.enter'), exit: log('sink.exit') };
  const win = { minimize: log('minimize'), close: log('close'), maximize: log('maximize'), unmaximize: log('unmaximize'), isMaximized: () => false };
  const commands = createSiteCommands({
    isSitePage: () => sitePage, mainWindow: () => win, desktopSink: () => sink, pet: () => ({ start: log('pet.start'), stop: log('pet.stop') }),
    music: () => ({ login: log('login'), logout: log('logout') }), appearance: () => ({ zoom: 100 }), trayPet: { setTrayPet: log('tray-pet') },
    toggleSettings: log('settings'), toggleFullscreen: log('fullscreen'), setFullscreen: log('setFullscreen'), isFullscreen: () => false,
    chooseMusicFolder: log('folder'), notifyMusic: log('notifyMusic'), saveAppearance: log('appearance'), writeLog: log('log'),
    typing: { check: log('typing.check'), accessibility: log('typing.accessibility'), inputMonitoring: log('typing.inputMonitoring') },
    handleUpdateCommand: (pathname, params) => calls.push(['update', pathname, params.get('enabled')]),
    autostart: { set: log('autostart.set'), publish: log('autostart.publish') },
    weather: { set: log('weather.set'), publish: log('weather.publish') }
  });
  return { calls, commands };
}

test('site commands: one table, aliases explicit, hostile input refused', () => {
  const { calls, commands } = fixture();
  for (const value of ['album-desktop://action/desktop-sink-enter', 'album-desktop://action/wallpaper-start', 'album-desktop://action/tray-pet?id=fox', 'album-desktop://action/update-auto?enabled=false', 'album-desktop://action/music-login?provider=qq', 'album-desktop://action/autostart?enabled=true', 'album-desktop://action/autostart', 'album-desktop://action/typing-follow?enabled=false', 'album-desktop://action/typing-check', 'album-desktop://action/typing-permission', 'album-desktop://action/typing-input-permission']) assert.equal(commands.handle(value), true, value);
  assert.deepEqual(calls.map((call) => call[0]), ['sink.enter', 'sink.enter', 'tray-pet', 'update', 'login', 'autostart.set', 'autostart.publish', 'appearance', 'typing.check', 'typing.accessibility', 'typing.inputMonitoring']);
  assert.deepEqual(calls[3], ['update', '/update-auto', 'false']); assert.deepEqual(calls[5], ['autostart.set', true]);
  assert.deepEqual(calls[7], ['appearance', { zoom: 100, typingFollow: false }], 'typing follow is persisted through the one settings path');
  calls.length = 0;
  assert.equal(commands.handle('album-desktop://action/music-login?provider=spotify'), true); assert.equal(calls.length, 0, 'unknown provider is ignored');
  for (const value of ['album-desktop://action/shell-exec', 'album-desktop://user:pw@action/close', 'album-desktop://other/close', 'https://evil.test/close', 'not a url', 'album-desktop://action/constructor', 'album-desktop://action/__proto__']) assert.equal(commands.handle(value), false, value);
  assert.equal(calls.length, 0);
  assert.equal(fixture({ sitePage: false }).commands.handle('album-desktop://action/close'), false, 'only the cabin page may command the shell');
  assert.equal(parseSiteCommand('album-desktop://action/x')?.pathname, '/x');
  assert.ok(commands.commands.includes('/fullscreen-exit') && commands.commands.includes('/autostart'));
});

test('site commands: weather is opt-in by an explicit flag; anything else only re-publishes', () => {
  const { calls, commands } = fixture();
  for (const value of ['album-desktop://action/weather?enabled=true&lat=31.23&lng=121.47', 'album-desktop://action/weather?enabled=false', 'album-desktop://action/weather?enabled=yes&lat=1&lng=2']) assert.equal(commands.handle(value), true, value);
  assert.deepEqual(calls, [['weather.set', { enabled: true, lat: '31.23', lng: '121.47' }], ['weather.set', { enabled: false, lat: null, lng: null }], ['weather.publish']]);
  assert.ok(commands.commands.includes('/weather'));
});

test('autostart registers a login item only in a packaged macOS / Windows app', () => {
  const published = [], settings = { openAtLogin: false };
  const app = { isPackaged: true, getLoginItemSettings: () => settings, setLoginItemSettings: (value) => Object.assign(settings, value) };
  const mac = createAutostart({ app, platform: 'darwin', publish: (value) => published.push(value) });
  assert.deepEqual(mac.set(true), { supported: true, enabled: true }); assert.equal(settings.openAtLogin, true);
  assert.deepEqual(mac.set(false), { supported: true, enabled: false });
  const linux = createAutostart({ app, platform: 'linux', publish: (value) => published.push(value) });
  assert.deepEqual(linux.set(true), { supported: false, enabled: false }); assert.equal(settings.openAtLogin, false);
  assert.deepEqual(createAutostart({ app: { ...app, isPackaged: false }, platform: 'win32', publish() {} }).state(), { supported: false, enabled: false });
  assert.equal(published.length, 3);
  assert.match(autostartScript({ supported: true, enabled: true, extra: '<script>' }), /^window\.cabinAutostart = \{"supported":true,"enabled":true\}; window\.dispatchEvent\(new CustomEvent\('cabin:autostart'/);
});

test('menus: no doubled separators, tray offers the opposite of the current state', () => {
  const noop = () => {}, app = appMenuTemplate({ companion: noop, toggleSettings: noop, checkUpdates: noop, reload: noop, zoom: noop, fullscreen: true, toggleFullscreen: noop, toggleSink: noop, openData: noop, about: noop });
  for (const menu of app) menu.submenu.forEach((item, index) => assert.ok(!(item.type === 'separator' && menu.submenu[index - 1]?.type === 'separator'), menu.label));
  assert.equal(app[2].submenu.find((item) => item.id === 'cabin-fullscreen').checked, true);
  const tray = (state) => trayMenuTemplate({ restore: noop, companion: noop, checkUpdates: noop, petStart: noop, petStop: noop, sinkEnter: noop, sinkExit: noop, quit: noop, ...state }).map((item) => item.label).filter(Boolean);
  assert.ok(tray({ petActive: true, sinkActive: true }).includes('让伙伴回家')); assert.ok(tray({ petActive: true, sinkActive: true }).includes('浮出桌面（回到窗口）'));
  assert.ok(tray({}).includes('伙伴出门（桌宠）')); assert.ok(tray({}).includes('沉入桌面'));
});
