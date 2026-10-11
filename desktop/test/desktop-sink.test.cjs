const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopSink, migrateDesktopPreferences } = require('../desktop-sink.cjs');
const { trayIconPath, createTrayPet, PET_IDS } = require('../tray-icons.cjs');
const fs = require('node:fs');

function fixture({ attach = true, platform = 'win32', petFails = false } = {}) {
  const calls = [], states = [];
  const wallpaper = { active: false, busy: false, error: '', async start() { calls.push('wallpaper.start'); if (attach) this.active = true; else this.error = 'Windows 桌面暂时无法挂载动态背景。'; }, stop() { calls.push('wallpaper.stop'); this.active = false; } };
  const legacy = { active: false, enter() { calls.push('legacy.enter'); this.active = true; }, exit() { calls.push('legacy.exit'); this.active = false; } };
  const pet = { active: false, async start() { if (petFails) throw new Error('no'); calls.push('pet.start'); this.active = true; }, stop() { calls.push('pet.stop'); this.active = false; } };
  const mini = { async show() { calls.push('mini.show'); }, hide() { calls.push('mini.hide'); } };
  const sink = createDesktopSink({ platform, wallpaper, legacy, pet, mini, hideMain: () => calls.push('hideMain'), restoreMain: () => calls.push('restoreMain'), onChange: (s) => states.push(s), setLowPower: (on) => calls.push(`lowPower:${on}`) });
  return { sink, calls, states, wallpaper, pet, legacy };
}

test('沉入桌面: wallpaper behind icons + pet + mini player, window collapses', async () => {
  const f = fixture();
  const state = await f.sink.enter();
  assert.deepEqual({ active: state.active, via: state.via, supported: state.supported }, { active: true, via: 'wallpaper', supported: true });
  assert.deepEqual(f.calls.filter((c) => !c.startsWith('lowPower')), ['wallpaper.start', 'hideMain', 'pet.start', 'mini.show']);
  assert.equal(f.states[0].busy, true);
  f.sink.exit();
  assert.deepEqual(f.calls.slice(-4), ['mini.hide', 'wallpaper.stop', 'pet.stop', 'restoreMain']);
  assert.equal(f.states.at(-1).active, false);
});

test('a pet the user already sent out stays out after exit', async () => {
  const f = fixture(); f.pet.active = true;
  await f.sink.enter(); f.sink.exit();
  assert.ok(!f.calls.includes('pet.stop'));
});

test('falls back to the interactive desktop-level window when the desktop layer fails', async () => {
  const f = fixture({ attach: false });
  const state = await f.sink.enter();
  assert.equal(state.via, 'window'); assert.match(state.reason, /无法挂载/);
  assert.ok(f.calls.includes('legacy.enter')); assert.ok(!f.calls.includes('hideMain')); assert.ok(!f.calls.includes('mini.show'));
  f.sink.exit(); assert.ok(f.calls.includes('legacy.exit'));
});

test('unsupported platforms report a reason and do nothing', async () => {
  const f = fixture({ platform: 'linux' });
  const state = await f.sink.enter();
  assert.equal(state.active, false); assert.equal(state.supported, false); assert.ok(state.reason);
  assert.equal(f.calls.length, 0);
});

test('a lost wallpaper (explorer restart) leaves the mode and restores the window', async () => {
  const f = fixture(); await f.sink.enter();
  f.sink.wallpaperLost('动态背景意外停止');
  assert.equal(f.sink.active, false); assert.ok(f.calls.includes('restoreMain'));
});

test('toggle while starting cancels; low power is forwarded only while active', async () => {
  const f = fixture();
  const pending = f.sink.enter(); f.sink.toggle(); await pending;
  assert.equal(f.sink.active, false);
  f.sink.setLowPower(true); assert.ok(!f.calls.includes('lowPower:true'));
  await f.sink.enter(); f.sink.setLowPower(true); assert.ok(f.calls.includes('lowPower:true'));
  assert.equal(f.sink.status().lowPower, true);
});

test('old 桌面模式 / 动态背景 preferences migrate to 沉入桌面', () => {
  assert.deepEqual(migrateDesktopPreferences({ desktopMode: true, x: 1 }), { x: 1, desktopSink: true });
  assert.deepEqual(migrateDesktopPreferences({ wallpaper: true }), { desktopSink: true });
  assert.deepEqual(migrateDesktopPreferences({ desktopMode: false }), { desktopSink: false });
  assert.deepEqual(migrateDesktopPreferences({ desktopSink: true }), { desktopSink: true });
  assert.deepEqual(migrateDesktopPreferences(null), { desktopSink: false });
});

test('every pet has tray icons: macOS template @1x/@2x and a Windows ICO', () => {
  for (const id of PET_IDS) {
    const mac = trayIconPath(id, 'darwin'), win = trayIconPath(id, 'win32');
    assert.match(mac, new RegExp(`${id}Template\\.png$`)); assert.ok(fs.existsSync(mac)); assert.ok(fs.existsSync(mac.replace('.png', '@2x.png')));
    const ico = fs.readFileSync(win); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 2);
    const png = fs.readFileSync(mac); assert.equal(png.readUInt32BE(16), 16);
    assert.equal(fs.readFileSync(mac.replace('.png', '@2x.png')).readUInt32BE(16), 32);
  }
  assert.match(trayIconPath('dragon', 'darwin'), /catTemplate\.png$/);
});

test('tray icon updates live when the pet changes', () => {
  const images = [], tray = { setImage: (image) => images.push(image.path) };
  const nativeImage = { createFromPath: (p) => ({ path: p, isEmpty: () => false, setTemplateImage() {} }) };
  const trayPet = createTrayPet({ getTray: () => tray, nativeImage, platform: 'darwin' });
  trayPet.setTrayPet('fox'); trayPet.setTrayPet('fox'); trayPet.setTrayPet('bunny');
  assert.equal(images.length, 2); assert.match(images[0], /foxTemplate/); assert.match(images[1], /bunnyTemplate/);
  assert.equal(trayPet.petId, 'bunny');
});

test('mini deck player relay forwards only known actions as the cabin:player-command DOM event', () => {
  const { relayPlayerCommand, PLAYER_CHANNEL } = require('../mini-player.cjs');
  const scripts = [], site = { isDestroyed: () => false, executeJavaScript: (code) => { scripts.push(code); return Promise.resolve(); } };
  assert.equal(PLAYER_CHANNEL, 'cabin:player-command');
  for (const action of ['toggle', 'play', 'pause', 'next', 'previous']) assert.equal(relayPlayerCommand(site, action), true);
  assert.equal(relayPlayerCommand(site, 'rm -rf'), false); assert.equal(relayPlayerCommand(null, 'next'), false);
  assert.equal(scripts.length, 5); assert.match(scripts[3], /new CustomEvent\('cabin:player-command', \{ detail: \{ action: "next" \} \}\)/);
});

test('exit cancels an owned pet while its start promise is pending', async () => {
  const f = fixture(); let finish;
  f.pet.start = () => new Promise(resolve => { f.pet.active = true; finish = resolve; });
  const entering = f.sink.enter(); await Promise.resolve();
  f.sink.exit(); finish(); await entering;
  assert.equal(f.pet.active, false); assert.equal(f.sink.active, false); assert.ok(!f.calls.includes('mini.show'));
});
test('exit while mini is loading cannot re-activate the sink', async () => {
  let finish; const calls = [];
  const sink = createDesktopSink({ wallpaper: { active: true, start: async () => {}, stop() {} }, legacy: {}, pet: { active: true }, mini: { show: () => new Promise(resolve => { finish = resolve; }), hide: () => calls.push('hide') }, hideMain() {}, restoreMain() {} });
  const entering = sink.enter(); await Promise.resolve(); sink.exit(); finish(); await entering;
  assert.equal(sink.active, false); assert.equal(sink.busy, false); assert.deepEqual(calls, ['hide']);
});
