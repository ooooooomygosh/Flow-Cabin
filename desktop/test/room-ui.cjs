'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, useWarmCabin, chooseRoomScene, playRecord, openSettingsTab, closeSettings } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `room-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, paidAIRequests: 0, productionWrites: 0, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site, host;
const items = Array.from({ length: 24 }, (_, i) => ({ ...albums[i % albums.length], id: `immersive-fixture-${i}`, title: `${albums[i % albums.length].title} ${i + 1}`, addedAt: `2026-09-${String(29 - i).padStart(2, '0')}` }));
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find((p) => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message)); await mountFixture(app, site, { items }); await useWarmCabin(site);
  // 3.1: the life cabin is the main window; its old scene-fill / shelf-key / 3D deck / drag checks left with the original home.
  // This suite keeps what still has a native side: 沉入桌面 puts the wallpaper (the room scene renderer) behind the icons.
  await site.locator('.cabin-home').waitFor();
  await playRecord(site, items[2].title);
  await site.screenshot({ path: path.join(output, 'immersive-room.png') });
  await openSettingsTab(site, '桌面'); await site.getByRole('checkbox', { name: '沉入桌面' }).check();
  await site.waitForFunction(() => window.albumRoomWallpaperState?.active || window.albumRoomWallpaperState?.error);
  const state = await site.evaluate(() => window.albumRoomWallpaperState); assert.equal(state.active, true, JSON.stringify(state));
  const wallpaper = app.context().pages().find((p) => p.url() === 'album-desktop://wallpaper/wallpaper.html'); assert.ok(wallpaper); wallpaper.on('pageerror', (error) => report.pageErrors.push(error.message));
  await wallpaper.locator('.room-turntable[data-loaded-id="' + items[2].id + '"]').waitFor();
  const native = await app.evaluate(async ({ app, BrowserWindow }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs'), path = require('node:path'), { execFile } = require('node:child_process');
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://wallpaper/wallpaper.html');
    const helper = app.isPackaged ? path.join(process.resourcesPath, 'native', 'DesktopHost.exe') : path.join(app.getAppPath(), 'native/bin/DesktopHost.exe');
    return new Promise((resolve, reject) => execFile(helper, ['probe', win.getNativeWindowHandle().readBigUInt64LE().toString(), String(process.pid)], { windowsHide: true }, (error, output) => error ? reject(error) : resolve(JSON.parse(output))));
  }); assert.equal(native.behindIcons, true); assert.equal(native.visible, true); check('real-native-desktop-window-behind-icons', native);
  await closeSettings(site); await useWarmCabin(site); await wallpaper.locator('.cabin-warm').waitFor(); await chooseRoomScene(site, 'pixel'); await wallpaper.locator('.cabin-pixel').waitFor(); check('wallpaper-live-sync-look-and-turntable');
  await wallpaper.screenshot({ path: path.join(output, 'desktop-room.png') });
  assert.equal(await wallpaper.evaluate(() => typeof window.require), 'undefined'); assert.equal(await wallpaper.evaluate(() => typeof window.albumDesktop), 'undefined'); assert.equal(await wallpaper.evaluate(() => Object.keys(window.albumWallpaper).sort().join(',')), 'getSnapshot,onSnapshot'); check('wallpaper-read-only-isolated-bridge');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://shell/index.html').close());
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://shell/index.html').isVisible()), false); assert.ok(!wallpaper.isClosed()); check('close-main-window-retains-live-wallpaper-and-tray');
  await site.evaluate(() => window.open('album-desktop://action/wallpaper-stop', '_blank')); await site.waitForFunction(() => !window.albumRoomWallpaperState?.active);
  assert.equal(wallpaper.isClosed(), true); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://shell/index.html').isVisible()), true); check('stop-destroys-wallpaper-and-restores-main-window');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(await app.evaluate(() => globalThis.__qaBlockedWrites), 0); report.passed = true;
})().catch((error) => { report.error = error.stack; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'room-failure.png') }).catch(() => {});
  if (app) await app.close().catch(() => {});
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'room-ui-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
});
