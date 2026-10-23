'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, openRecordTools, closeRecordCard } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results/improvements'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { fixtureData: true, platform: process.platform, nativeWallpaperVerified: false, checks: [], pageErrors: [] };
const check = (name) => { report.checks.push(name); console.log('PASS ' + name); };
let app, site;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  const cover = await app.evaluate(({ nativeImage }) => nativeImage.createFromBitmap(Buffer.from(Array.from({ length: 48 * 48 }, () => [30, 60, 210, 255]).flat()), { width: 48, height: 48 }).toDataURL());
  const items = [{ ...albums[0], id: 'colour-one', cover: 'https://album-circle.vercel.app/qa-colour.png', externalIds: undefined, collectionId: undefined }, { ...albums[1], id: 'colour-missing', cover: '' }, { ...albums[2], id: 'colour-broken', cover: 'https://album-circle.vercel.app/missing.png?qa-broken-cover' }, { ...albums[0], id: 'colour-slow', title: '慢速封面', externalIds: undefined, collectionId: undefined, cover: 'https://album-circle.vercel.app/qa-colour.png?qa-slow-cover' }];
  await mountFixture(app, site, { items, coverResponse: cover, slowCover: true });
  await site.waitForFunction(() => document.querySelector('.room-drag-record .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === '#d23c1e');
  assert.deepEqual(await site.locator('.room-drag-record .custom-vinyl').evaluateAll((nodes) => nodes.map((node) => node.style.getPropertyValue('--vinyl-base'))), ['#d23c1e', '#16191d', '#16191d', '#16191d']);
  await site.locator('.room-record').first().dblclick();
  const vinyl = site.locator('.room-turntable .custom-vinyl');
  await site.waitForFunction(() => document.querySelector('.room-turntable .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === '#d23c1e');
  assert.equal((await site.evaluate(() => window.albumRoomSnapshot())).recordStyle.base, '#d23c1e');
  await site.screenshot({ path: path.join(output, 'cover-colour-default.png') });
  check('cover-dominant-colour-shared-by-drag-disc-turntable-and-wallpaper-snapshot; missing/broken-safe-fallback');
  const dragImage = await site.locator('.room-record').first().evaluate((node) => {
    let preview; const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: { setData() {}, setDragImage(element) { preview = element.querySelector('.custom-vinyl').style.getPropertyValue('--vinyl-base'); } } });
    node.dispatchEvent(event); return preview;
  }); assert.equal(dragImage, '#d23c1e');
  await openRecordTools(site);
  const editor = site.getByRole('dialog', { name: '自定义唱片' });
  // The editor starts its own asynchronous cover sample after mounting.
  await site.waitForFunction((input) => input.value === '#d23c1e', await editor.getByLabel('黑胶底色', { exact: true }).elementHandle());
  assert.equal(await editor.getByLabel('黑胶底色', { exact: true }).inputValue(), '#d23c1e');
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#2255aa'); await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site);
  await site.waitForFunction(() => document.querySelector('.room-turntable .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === '#2255aa');
  assert.equal(await site.locator('.room-drag-record .custom-vinyl').first().evaluate((node) => node.style.getPropertyValue('--vinyl-base')), '#2255aa'); check('manual-colour-wins-in-editor-turntable-and-drag-preview');

  await site.locator('.room-record').nth(3).click();
  await openRecordTools(site);
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#00aa77');
  await app.evaluate(() => globalThis.__qaReleaseImage());
  await site.waitForFunction(() => document.querySelectorAll('.room-drag-record .custom-vinyl')[3]?.style.getPropertyValue('--vinyl-base') === '#d23c1e');
  assert.equal(await editor.getByLabel('黑胶底色', { exact: true }).inputValue(), '#00aa77');
  await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site);
  check('late-cover-result-cannot-overwrite-an-in-progress-manual-colour');

  const handle = site.getByRole('button', { name: '移动唱机', exact: true }), deck = site.locator('.room-turntable');
  const before = await deck.boundingBox(), start = await handle.boundingBox();
  await site.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await site.mouse.down(); await site.mouse.move(start.x + start.width / 2 + 260, start.y + start.height / 2 - 25, { steps: 12 }); await site.mouse.up();
  const moved = await deck.boundingBox(); assert.ok(moved.x > before.x + 200); assert.ok(moved.y < before.y);
  const saved = await site.evaluate(() => JSON.parse(localStorage.getItem('album-circle-library-v1-local-owner')).rooms['local-room'].turntable); assert.ok(saved.x > 0);
  await site.getByRole('button', { name: '暂停唱片旋转', exact: true }).click(); assert.equal(await deck.getAttribute('data-spinning'), 'false');
  await site.getByRole('button', { name: '继续唱片旋转', exact: true }).click();
  await site.locator('.room-record').nth(1).dragTo(deck); await site.waitForFunction(() => document.querySelector('.room-turntable').dataset.loadedId === 'colour-missing');
  check('mouse-drag-moves-turntable-without-breaking-playback-or-album-drop');
  await site.reload(); await handle.waitFor(); await site.waitForFunction((x) => Math.abs(document.querySelector('.room-turntable').getBoundingClientRect().x - x) < 2, moved.x);
  await site.locator('.room-record').first().dblclick(); await site.waitForFunction(() => document.querySelector('.room-turntable .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === '#2255aa');
  await site.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const touchStart = await handle.boundingBox();
  const naturalSize = await site.evaluate(() => [innerWidth, innerHeight]);
  const cdp = await site.context().newCDPSession(site);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart.x + 20, y: touchStart.y + 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart.x + 90, y: touchStart.y + 40 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await site.waitForFunction((x) => document.querySelector('.room-turntable').getBoundingClientRect().x > x + 50, moved.x);
  const touched = await deck.boundingBox(); assert.ok(touched.x > moved.x + 50);
  // A cancelled touch reverts to the previous saved placement.
  const cancelStart = await handle.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelStart.x + 20, y: cancelStart.y + 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelStart.x + 80, y: cancelStart.y + 30 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await site.waitForFunction((x) => Math.abs(document.querySelector('.room-turntable').getBoundingClientRect().x - x) < 2, touched.x);
  check('position-persists-on-reload-touch-drags-and-touch-cancel-restores');
  await handle.focus(); await site.keyboard.press('ArrowRight'); assert.ok((await deck.boundingBox()).x > touched.x + 10);
  for (const [width, height] of [[960, 600], [1920, 1080], [3840, 2160]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await site.waitForFunction(() => { const r = document.querySelector('.room-turntable').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: naturalSize[0], height: naturalSize[1], deviceScaleFactor: 1, mobile: false });
  await site.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height && Math.abs(document.querySelector('.cabin-scene-art').getBoundingClientRect().width - 1448 * Math.max(width / 1448, height / 1086)) < 1, naturalSize);
  await cdp.detach();
  await site.screenshot({ path: path.join(output, 'movable-cover-colour.png'), clip: { x: 0, y: 0, width: naturalSize[0], height: naturalSize[1] } });
  await handle.focus(); await site.keyboard.press('Home'); await site.waitForFunction(() => !document.querySelector('.room-turntable').style.left);
  check('keyboard-reset-and-responsive-screen-bounds');

  // Exercise actual unsupported-platform feedback on Linux; do not fake native success.
  if (process.platform === 'linux') {
    await site.getByRole('button', { name: '沉入桌面', exact: true }).click(); await site.locator('.wallpaper-error').waitFor();
    assert.equal((await site.evaluate(() => window.albumRoomWallpaperState)).busy, false);
    await site.clock.install(); await site.clock.runFor(5100); await site.locator('.wallpaper-error').waitFor({ state: 'detached' });
    await site.getByRole('button', { name: '沉入桌面', exact: true }).click(); await site.locator('.wallpaper-error').waitFor();
    await site.getByRole('button', { name: '关闭动态背景提示' }).click(); await site.locator('.wallpaper-error').waitFor({ state: 'detached' });
    check('real-linux-unsupported-feedback-auto-dismisses-and-retry-remains-available');
  }
  await site.evaluate(() => window.dispatchEvent(new CustomEvent('album-room-wallpaper', { detail: { busy: true } })));
  await site.getByRole('button', { name: '取消沉入桌面', exact: true }).click(); await site.getByRole('button', { name: '沉入桌面', exact: true }).waitFor();
  check('busy-button-uses-existing-stop-command-for-cancellation');

  // Real Electron protocol/resource/renderer smoke, without attaching a native desktop.
  const snapshot = await site.evaluate(() => window.albumRoomSnapshot());
  await app.evaluate(async ({ app, BrowserWindow, ipcMain, session }, snapshot) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs');
    const { registerShellProtocol } = require('./shell-protocol.cjs');
    const { cleanSnapshot } = require('./wallpaper-model.cjs');
    const partition = session.fromPartition('album-circle-wallpaper'); registerShellProtocol(partition.protocol);
    const response = await partition.fetch('album-desktop://wallpaper/wallpaper.html'); if (!response.ok) throw new Error('wallpaper preflight failed'); await response.body.cancel();
    ipcMain.removeHandler('wallpaper:snapshot'); ipcMain.handle('wallpaper:snapshot', () => cleanSnapshot(snapshot));
    const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { partition: 'album-circle-wallpaper', preload: app.getAppPath() + '/wallpaper-preload.cjs', sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('album-desktop://wallpaper/wallpaper.html');
    globalThis.__qaWallpaper = win;
  }, snapshot);
  const wallpaper = app.context().pages().find((page) => page.url() === 'album-desktop://wallpaper/wallpaper.html'); assert.ok(wallpaper);
  wallpaper.on('pageerror', (error) => report.pageErrors.push(error.message)); await wallpaper.locator('.room-turntable').waitFor();
  assert.equal(await wallpaper.evaluate(() => typeof window.require), 'undefined'); assert.equal(await wallpaper.evaluate(() => typeof window.albumDesktop), 'undefined');
  assert.deepEqual(await wallpaper.evaluate(() => Object.keys(window.albumWallpaper).sort()), ['getSnapshot', 'onSnapshot']);
  assert.equal(await wallpaper.getByRole('button', { name: '移动唱机', exact: true }).count(), 0);
  assert.equal(await wallpaper.locator('.custom-vinyl').evaluate((node) => node.style.getPropertyValue('--vinyl-base')), '#2255aa');
  await wallpaper.screenshot({ path: path.join(output, 'wallpaper-protocol-smoke.png') });
  const resources = await app.evaluate(async ({ session }) => {
    const partition = session.fromPartition('album-circle-wallpaper');
    const page = await (await partition.fetch('album-desktop://wallpaper/wallpaper.html')).text();
    const paths = [...page.matchAll(/(?:src|href)="([^\"]+)"/g)].map((match) => match[1]);
    const statuses = await Promise.all(paths.map(async (asset) => { const response = await partition.fetch(new URL(asset, 'album-desktop://wallpaper/wallpaper.html').href); await response.body?.cancel(); return response.status; }));
    const denied = await partition.fetch('album-desktop://wallpaper/pet.html'); await denied.body?.cancel();
    globalThis.__qaWallpaper.destroy(); return { statuses, denied: denied.status };
  }); assert.ok(resources.statuses.length > 2); assert.ok(resources.statuses.every((status) => status === 200)); assert.equal(resources.denied, 404);
  check('real-isolated-wallpaper-protocol-loads-built-page-and-assets-with-readonly-bridge; no-native-attachment-claimed');
  assert.deepEqual(report.pageErrors, []); report.passed = true;
})().catch((error) => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await app?.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); if (report.error) console.error(report.error);
});
