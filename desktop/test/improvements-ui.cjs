'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, openRecordTools, closeRecordCard, closeLibrary, playRecord, openSettingsTab, closeSettings } = require('./ui-fixture.cjs');
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
  // The cover's dominant colour is the record's default vinyl colour: the editor and the wallpaper snapshot share it,
  // a missing or broken cover falls back safely. (The classic room's drag disc and DOM turntable vinyl are gone with it.)
  await playRecord(site, items[0].title);
  await site.waitForFunction(() => window.albumRoomSnapshot?.().recordStyle?.base === '#d23c1e');
  await site.screenshot({ path: path.join(output, 'cover-colour-default.png') });
  check('cover-dominant-colour-shared-by-the-wallpaper-snapshot; missing/broken-safe-fallback');
  await openRecordTools(site, items[0].title);
  const editor = site.getByRole('dialog', { name: '自定义唱片' });
  // The editor starts its own asynchronous cover sample after mounting.
  await site.waitForFunction((input) => input.value === '#d23c1e', await editor.getByLabel('黑胶底色', { exact: true }).elementHandle());
  assert.equal(await editor.getByLabel('黑胶底色', { exact: true }).inputValue(), '#d23c1e');
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#2255aa'); await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site); await closeLibrary(site);
  await site.waitForFunction(() => window.albumRoomSnapshot?.().recordStyle?.base === '#2255aa'); check('manual-colour-wins-in-editor-and-wallpaper-snapshot');

  await openRecordTools(site, items[3].title);
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#00aa77');
  await app.evaluate(() => globalThis.__qaReleaseImage());
  await site.waitForTimeout(400);
  assert.equal(await editor.getByLabel('黑胶底色', { exact: true }).inputValue(), '#00aa77');
  await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site); await closeLibrary(site);
  check('late-cover-result-cannot-overwrite-an-in-progress-manual-colour');

  // The movable pocket turntable (mouse / touch drag, keyboard reset, screen bounds) belonged to the original room and left with it.
  // 沉入桌面 lives in 设置 › 桌面: where the platform cannot do it, the row says why and the switch stays off.
  if (process.platform === 'linux') {
    await openSettingsTab(site, '桌面');
    const sink = site.getByRole('checkbox', { name: '沉入桌面' });
    assert.equal(await sink.isDisabled(), true); assert.equal(await sink.isChecked(), false);
    await site.getByText('沉入桌面目前支持 Windows 与 macOS。').first().waitFor();
    check('real-linux-unsupported-feedback-explains-and-keeps-the-switch-off');
    await closeSettings(site);
  }

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
