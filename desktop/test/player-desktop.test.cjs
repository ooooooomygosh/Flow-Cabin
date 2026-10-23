'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMediaKeys, normalizeMediaKeys, cleanAccelerator, mediaKeysScript, DEFAULT_BINDINGS, ACTION_IDS } = require('../media-keys.cjs');
const { thumbarButtons, glyphBitmap, GLYPHS, createThumbar } = require('../thumbar.cjs');
const { miniBounds, dragTarget, cleanMiniPrefs, miniScript, relayPlayerCommand, WIDTH, HEIGHT } = require('../mini-player.cjs');
const { appMenuTemplate, trayMenuTemplate, dockMenuTemplate } = require('../main/menus.cjs');
const { cleanCompanion, cleanNowPlaying } = require('../wallpaper-model.cjs');

test('media hotkeys: accelerators are validated, deduplicated and never steal 沉入桌面', () => {
  assert.equal(cleanAccelerator('CommandOrControl+Alt+p'), 'CommandOrControl+Alt+P');
  assert.equal(cleanAccelerator('MediaPlayPause'), 'MediaPlayPause');
  for (const bad of ['P', 'Shift+P', 'Alt+', '+P', 'Ctrl+Ctrl+P', 'Hyper+P', 'CommandOrControl+Alt+D', 'Ctrl+Alt+NotAKey', 7, 'x'.repeat(80)]) assert.equal(cleanAccelerator(bad), '', String(bad));
  assert.deepEqual(normalizeMediaKeys({}), { enabled: true, bindings: { ...DEFAULT_BINDINGS } });
  const custom = normalizeMediaKeys({ enabled: false, bindings: { toggle: 'Ctrl+Shift+Space', next: 'Ctrl+Shift+Space', previous: '', 'volume-up': 'bogus' } });
  assert.equal(custom.enabled, false); assert.equal(custom.bindings.toggle, 'Ctrl+Shift+Space');
  assert.equal(custom.bindings.next, '', 'a duplicate combination is left unbound'); assert.equal(custom.bindings.previous, '', 'explicitly cleared');
  assert.equal(custom.bindings['volume-up'], '', 'an invalid saved binding is not silently replaced');
  assert.equal(custom.bindings['lyrics-toggle'], DEFAULT_BINDINGS['lyrics-toggle']);
});

test('media hotkeys: register, report conflicts, persist, run the action', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-keys-')), registered = new Map(), ran = [], published = [];
  const globalShortcut = { register: (key, fn) => { if (key === 'CommandOrControl+Alt+Up') return false; registered.set(key, fn); return true; }, unregister: (key) => registered.delete(key), isRegistered: (key) => registered.has(key) };
  const keys = createMediaKeys({ globalShortcut, directory, run: (id) => ran.push(id), publish: (state) => published.push(state) });
  const state = keys.start();
  assert.deepEqual(state.failed, ['volume-up'], 'a combination another app owns is reported');
  assert.equal(registered.size, ACTION_IDS.length - 1);
  registered.get('CommandOrControl+Alt+P')(); registered.get('CommandOrControl+Alt+L')();
  assert.deepEqual(ran, ['toggle', 'lyrics-toggle']);
  keys.set({ bindings: { toggle: 'CommandOrControl+Shift+K' } });
  assert.equal(registered.has('CommandOrControl+Alt+P'), false); assert.equal(registered.has('CommandOrControl+Shift+K'), true);
  keys.set({ enabled: false }); assert.equal(registered.size, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'media-keys.json'), 'utf8')).bindings.toggle, 'CommandOrControl+Shift+K');
  const again = createMediaKeys({ globalShortcut, directory, run: () => {} }).start();
  assert.equal(again.enabled, false); assert.equal(again.bindings.toggle, 'CommandOrControl+Shift+K');
  assert.equal(keys.set({ enabled: true, reset: true }).bindings.toggle, DEFAULT_BINDINGS.toggle);
  assert.ok(published.length >= 4);
  assert.match(mediaKeysScript(state), /^window\.cabinMediaKeys = \{.*\}; window\.dispatchEvent\(new CustomEvent\('cabin:media-keys'/);
  keys.stop(); assert.equal(registered.size, 0);
});

test('thumbnail toolbar: three pixel buttons that follow play state, Windows only', () => {
  assert.deepEqual(thumbarButtons({ playing: true, active: true }).map((b) => [b.id, b.action, b.tooltip]), [['previous', 'previous', '上一首'], ['pause', 'toggle', '暂停'], ['next', 'next', '下一首']]);
  assert.deepEqual(thumbarButtons({ playing: false, active: false })[1].flags, ['disabled']);
  for (const rows of Object.values(GLYPHS)) { assert.equal(rows.length, 16); assert.ok(rows.every((row) => row.length === 16)); }
  const bitmap = glyphBitmap(GLYPHS.play); assert.equal(bitmap.length, 16 * 16 * 4); assert.equal(bitmap[(7 * 16 + 6) * 4 + 3], 255); assert.equal(bitmap[3], 0);
  const sets = [], ran = [], win = { id: 1, isDestroyed: () => false, setThumbarButtons: (buttons) => { sets.push(buttons); return true; } };
  const thumbar = createThumbar({ getWindow: () => win, nativeImage: { createFromBitmap: () => ({}) }, player: (a) => ran.push(a), platform: 'win32' });
  thumbar.update({ playing: true, active: true }); thumbar.update({ playing: true, active: true }); thumbar.update({ playing: false, active: true });
  assert.equal(sets.length, 2, 'unchanged state is not re-sent'); sets[1][1].click(); assert.deepEqual(ran, ['toggle']);
  assert.equal(createThumbar({ getWindow: () => win, nativeImage: {}, player: () => {}, platform: 'darwin' }).update({ playing: true }), false);
});

test('mini player: remembered spot only while it is on screen, drags stay reachable, prefs are cleaned', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(miniBounds(area, {}), { x: 16, y: 1040 - HEIGHT - 16, width: WIDTH, height: HEIGHT });
  assert.deepEqual(miniBounds(area, { x: 600, y: 300 }), { x: 600, y: 300, width: WIDTH, height: HEIGHT });
  assert.deepEqual(miniBounds(area, { x: 1900, y: 300 }), miniBounds(area, {}), 'a spot from an unplugged screen falls back');
  assert.deepEqual(dragTarget({ x: 100, y: 100 }, 50, -20, [area]), { x: 150, y: 80 });
  const far = dragTarget({ x: 100, y: 100 }, 5000, 5000, [area]); assert.ok(far.x <= area.width - 48 && far.y <= area.height - 32);
  assert.deepEqual(cleanMiniPrefs({ x: 1.5, y: 2, alwaysOnTop: 'yes', shown: true }), { alwaysOnTop: false, shown: true });
  assert.deepEqual(cleanMiniPrefs({ x: 10, y: 20, alwaysOnTop: true }), { x: 10, y: 20, alwaysOnTop: true, shown: false });
  assert.match(miniScript({ shown: true, alwaysOnTop: false, secret: 1 }), /^window\.cabinMiniPlayer = \{"shown":true,"alwaysOnTop":false,"supported":true\};/);
});

test('player relay: value actions carry a bounded number, others none', () => {
  const scripts = [], site = { isDestroyed: () => false, executeJavaScript: (code) => { scripts.push(code); return Promise.resolve(); } };
  assert.equal(relayPlayerCommand(site, 'set-volume', .5), true);
  assert.match(scripts[0], /detail: \{ action: "set-volume", value: 0\.5 \}/);
  assert.equal(relayPlayerCommand(site, 'seek', 'x'), false); assert.equal(relayPlayerCommand(site, 'seek', 1e9), false);
  assert.equal(relayPlayerCommand(site, 'volume-up'), true); assert.match(scripts[1], /detail: \{ action: "volume-up" \}/);
});

test('menus: 控制 menu, tray 上一首, Dock playback menu', () => {
  const noop = () => {}, played = [];
  const app = appMenuTemplate({ companion: noop, toggleSettings: noop, checkUpdates: noop, reload: noop, zoom: noop, fullscreen: false, toggleFullscreen: noop, toggleSink: noop, openData: noop, about: noop, player: (a) => played.push(a), status: { playing: true }, mediaKeys: { enabled: true, bindings: DEFAULT_BINDINGS }, lyricsToggle: noop, miniToggle: noop, miniShown: true });
  const control = app.find((menu) => menu.label === '控制').submenu;
  assert.equal(control[0].label, '暂停'); assert.equal(control[0].accelerator, DEFAULT_BINDINGS.toggle); assert.equal(control[0].registerAccelerator, false);
  control.find((item) => item.label === '上一首').click(); control.find((item) => item.label === '音量 +').click();
  assert.deepEqual(played, ['previous', 'volume-up']);
  assert.equal(control.find((item) => item.label === '迷你唱机').checked, true);
  for (const item of control) assert.ok(!(item.type === 'separator' && control[control.indexOf(item) - 1]?.type === 'separator'));
  const bare = appMenuTemplate({ companion: noop, toggleSettings: noop, checkUpdates: noop, reload: noop, zoom: noop, toggleFullscreen: noop, toggleSink: noop, openData: noop, about: noop }).find((menu) => menu.label === '控制').submenu;
  assert.notEqual(bare.at(-1).type, 'separator'); assert.equal(bare[0].accelerator, undefined);
  const tray = trayMenuTemplate({ restore: noop, companion: noop, checkUpdates: noop, petStart: noop, petStop: noop, sinkEnter: noop, sinkExit: noop, quit: noop, player: (a) => played.push(a), miniToggle: noop, miniShown: false });
  tray.find((item) => item.label === '上一首').click(); assert.equal(played.at(-1), 'previous');
  assert.equal(tray.find((item) => item.label === '迷你唱机').checked, false);
  const dock = dockMenuTemplate({ player: (a) => played.push(a), status: { playing: true }, track: '晴天 · 周杰伦' });
  assert.deepEqual(dock.map((item) => item.label || item.type), ['晴天 · 周杰伦', 'separator', '暂停', '上一首', '下一首']);
  dock[4].click(); assert.equal(played.at(-1), 'next');
});

test('now playing for the mini player: display data only, covers are https or small inline images', () => {
  const raw = { title: '晴天', artist: '周杰伦', album: '叶惠美', cover: 'file:///Users/me/cover.jpg', playing: true, position: 30.04, duration: 269, provider: 'qq', canSeek: true, canVolume: true, volume: 1.4, liked: true, at: 5, audioPath: 'https://cdn/stream?token=secret' };
  const clean = cleanNowPlaying(raw);
  assert.deepEqual(clean, { title: '晴天', artist: '周杰伦', album: '叶惠美', cover: '', playing: true, position: 30, duration: 269, provider: 'qq', canSeek: true, canVolume: true, volume: 1, muted: false, liked: true, at: 5 });
  assert.equal(cleanNowPlaying({ ...raw, cover: 'data:image/jpeg;base64,AAAA' }).cover, 'data:image/jpeg;base64,AAAA');
  assert.equal(cleanNowPlaying({ ...raw, cover: 'data:image/svg+xml,<svg onload=alert(1)>' }).cover, '');
  assert.equal(cleanNowPlaying({ ...raw, cover: `data:image/png;base64,${'A'.repeat(300000)}` }).cover, '', 'oversized inline art is dropped');
  assert.equal(cleanNowPlaying({ ...raw, duration: 0 }).canSeek, false);
  assert.equal(cleanNowPlaying({ title: '' }), null);
  const companion = cleanCompanion({ nowPlaying: raw, lyric: '故事的小黄花'.repeat(80) });
  assert.equal(companion.nowPlaying.title, '晴天'); assert.equal(companion.lyric.length, 300);
  assert.doesNotMatch(JSON.stringify(companion), /token|secret|file:/);
});
