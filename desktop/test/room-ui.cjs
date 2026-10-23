'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, useWarmCabin, chooseRoomScene } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `room-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, paidAIRequests: 0, productionWrites: 0, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site, host;
const items = Array.from({ length: 24 }, (_, i) => ({ ...albums[i % albums.length], id: `immersive-fixture-${i}`, title: `${albums[i % albums.length].title} ${i + 1}`, addedAt: `2026-09-${String(29 - i).padStart(2, '0')}` }));
const row = () => site.locator('.room-rack-grid').getAttribute('data-start-row');
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find((p) => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message)); await mountFixture(app, site, { items }); await useWarmCabin(site);
  await site.locator('.room-record').first().waitFor();
  const cdp = await site.context().newCDPSession(site);
  const naturalSize = await site.evaluate(() => [innerWidth, innerHeight]);
  for (const [width, height] of [[960, 600], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await site.waitForFunction(({ width, height }) => { const r = document.querySelector('.cabin-scene-art').getBoundingClientRect(); const scale = Math.max(width / 1448, height / 1086); return Math.abs(r.width - 1448 * scale) < 1 && Math.abs(r.height - 1086 * scale) < 1 && r.left <= 1 && r.right >= width - 1 && r.top <= 1 && r.bottom >= height - 1; }, { width, height });
    const metrics = await site.evaluate(() => { const scene = document.querySelector('.room-scene').getBoundingClientRect(), image = document.querySelector('.cabin-scene-art').getBoundingClientRect(); return { scene: { x: scene.x, y: scene.y, width: scene.width, height: scene.height }, image: { left: image.left, top: image.top, right: image.right, bottom: image.bottom }, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }; });
    assert.deepEqual(metrics.scene, { x: 0, y: 0, width, height }); assert.ok(metrics.image.left <= 1 && metrics.image.right >= width - 1 && metrics.image.top <= 1 && metrics.image.bottom >= height - 1); assert.ok(metrics.scrollWidth <= width + 1 && metrics.scrollHeight <= height + 1); check(`immersive-full-bleed-${width}x${height}`, metrics);
    if (width === 960) {
      const layout = await site.evaluate(() => { const deck = document.querySelector('.turntable-deck').getBoundingClientRect(), toolbar = document.querySelector('.cabin-toolbar').getBoundingClientRect(), cabinet = document.querySelector('.turntable-side-cabinet').getBoundingClientRect(); return { deckTop: deck.top, toolbarBottom: toolbar.bottom, cabinetBottom: cabinet.bottom, height: innerHeight }; });
      assert.ok(layout.deckTop >= layout.toolbarBottom + 4, JSON.stringify(layout)); assert.ok(layout.cabinetBottom < layout.height - 20, JSON.stringify(layout));
      await site.screenshot({ path: path.join(output, 'immersive-room-small-screen.png') });
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: naturalSize[0], height: naturalSize[1], deviceScaleFactor: 1, mobile: false }); await cdp.detach();
  await site.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height && Math.abs(document.querySelector('.cabin-scene-art').getBoundingClientRect().width - 1448 * Math.max(width / 1448, height / 1086)) < 1, naturalSize);
  const rack = await site.locator('.room-rack').boundingBox();
  await site.locator('.room-record').first().click(); await site.keyboard.press('ArrowDown'); assert.equal(await row(), '1');
  assert.equal(await site.locator('.room-record').first().getAttribute('title'), `${items[4].title} · ${items[4].artist}；双击或拖到唱机放盘`);
  assert.deepEqual(await site.locator('.room-rack').boundingBox(), rack); await site.keyboard.press('ArrowUp'); assert.equal(await row(), '0');
  await site.mouse.move(rack.x + rack.width * .6, rack.y + rack.height * .5); await site.mouse.wheel(0, 120); await site.waitForFunction(() => document.querySelector('.room-rack-grid').dataset.startRow === '1');
  assert.deepEqual(await site.locator('.room-rack').boundingBox(), rack); await site.keyboard.press('End'); assert.equal(await row(), '3'); await site.keyboard.press('Home'); assert.equal(await row(), '0'); check('shelf-keys-wheel-and-fixed-cabinet');
  await site.getByRole('button', { name: '整理唱片架', exact: true }).click(); await site.getByLabel('筛选流派').focus(); await site.keyboard.press('ArrowDown'); assert.equal(await row(), '0');
  await site.getByLabel('筛选流派').selectOption('all');
  await site.getByRole('button', { name: '整理唱片架', exact: true }).click(); check('filters-and-select-keyboard-do-not-scroll-cabinet');
  await site.locator('.room-record').nth(1).dblclick(); await site.waitForFunction((id) => document.querySelector('.room-turntable').dataset.loadedId === id, items[1].id);
  const furniture = await site.evaluate(() => {
    const css = (selector) => getComputedStyle(document.querySelector(selector));
    const cabinet = document.querySelector('.turntable-side-cabinet').getBoundingClientRect(), deck = document.querySelector('.turntable-deck').getBoundingClientRect();
    return { perspective: css('.turntable-stage').perspective, surface: css('.turntable-deck').transform, front: css('.turntable-body-front').transform, side: css('.turntable-body-right').transform, raisedPlatter: css('.turntable-platter').transform, cabinetSupportsDeck: Math.abs(deck.bottom - cabinet.top) < 70, cabinetWithinViewport: cabinet.left >= 0 && cabinet.right < innerWidth && cabinet.bottom < innerHeight };
  });
  assert.notEqual(furniture.perspective, 'none'); assert.match(furniture.surface, /^matrix3d/); assert.match(furniture.front, /^matrix3d/); assert.match(furniture.side, /^matrix3d/); assert.match(furniture.raisedPlatter, /^matrix3d/); assert.equal(furniture.cabinetSupportsDeck, true); assert.equal(furniture.cabinetWithinViewport, true); check('three-dimensional-turntable-on-wooden-side-cabinet', furniture);
  assert.equal(await site.locator('.room-turntable').getAttribute('data-spinning'), 'true'); assert.ok((await site.locator('.turntable-status').innerText()).includes('无音频'));
  await site.getByLabel('唱机展示曲目', { exact: true }).selectOption('1'); assert.ok((await site.locator('.turntable-track').innerText()).includes(items[1].tracks[1]));
  await site.getByRole('button', { name: '暂停唱片旋转', exact: true }).click(); assert.equal(await site.locator('.room-turntable').getAttribute('data-spinning'), 'false');
  await site.getByRole('button', { name: '继续唱片旋转', exact: true }).click(); check('double-click-record-placement-original-track-selection-pause-resume');
  await site.locator('.room-record').nth(2).dragTo(site.getByRole('complementary', { name: '黑胶唱机' }));
  await site.waitForFunction((id) => document.querySelector('.room-turntable').dataset.loadedId === id, items[2].id); check('real-drag-and-drop-loads-record');
  await site.screenshot({ path: path.join(output, 'immersive-room.png') });
  await site.getByRole('button', { name: '沉入桌面', exact: true }).click();
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
  await useWarmCabin(site); await chooseRoomScene(site, 'pixel'); await wallpaper.locator('.cabin-pixel').waitFor();
  await site.keyboard.press('ArrowDown'); await wallpaper.waitForFunction(() => document.querySelector('.room-rack-grid').dataset.startRow === '1'); check('wallpaper-live-sync-look-shelf-and-turntable');
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
