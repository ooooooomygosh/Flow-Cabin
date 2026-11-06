'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results/wallpaper'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { platform: process.platform, checks: [], pageErrors: [] };
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS ' + name); };
// 3.1: 沉入桌面 is the desk itself (src/WallpaperRoom.jsx): DEsk's walnut desk with the pieces at its back edge, the red LED
// clock (the time, or the focus round counting down) and a slip that names the record on the turntable. The isometric rooms and
// their hearth / snow / window atmosphere are gone, so this suite drives the real wallpaper renderer in its own isolated window
// (its own partition, the real preload and IPC) with snapshots pushed the way the main process pushes them.
let app, site, wallpaper;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = () => wallpaper.evaluate(() => document.querySelector('.desk-clock-glass').toDataURL());
const slip = async () => (await wallpaper.locator('.wallpaper-slip').count()) ? wallpaper.locator('.wallpaper-slip').innerText() : '';
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await pause(100); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message)); await mountFixture(app, site, { items: [] });
  const baseSnapshot = { look: 'pixel', weather: 'snow', items: [], petOut: true, reduceMotion: false, focus: {}, focusDisplay: {} };
  await app.evaluate(async ({ app, BrowserWindow, ipcMain, session }, snapshot) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs'); const { registerShellProtocol } = require('./shell-protocol.cjs');
    const partition = session.fromPartition('album-circle-wallpaper'); if (!(await partition.protocol.isProtocolHandled('album-desktop'))) registerShellProtocol(partition.protocol);
    ipcMain.removeHandler('wallpaper:snapshot'); ipcMain.handle('wallpaper:snapshot', () => require('./wallpaper-model.cjs').cleanSnapshot(snapshot));
    const win = new BrowserWindow({ width: 1448, height: 1086, show: true, webPreferences: { partition: 'album-circle-wallpaper', preload: app.getAppPath() + '/wallpaper-preload.cjs', sandbox: true, contextIsolation: true, nodeIntegration: false } }); globalThis.__qaDeskWallpaper = win; await win.loadURL('album-desktop://wallpaper/wallpaper.html');
  }, baseSnapshot);
  wallpaper = app.context().pages().find((p) => p.url() === 'album-desktop://wallpaper/wallpaper.html'); wallpaper.on('pageerror', (error) => report.pageErrors.push(error.message));
  const push = (patch) => app.evaluate(({ app }, snapshot) => { const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs'); globalThis.__qaDeskWallpaper.webContents.send('wallpaper:update', require('./wallpaper-model.cjs').cleanSnapshot(snapshot)); }, { ...baseSnapshot, ...patch });
  const requests = []; wallpaper.on('request', (request) => requests.push(new URL(request.url()).pathname));

  // 1. The lit desk: the three pieces at its back edge, the LED clock, both engraved plates, every picture decoded, nothing to press.
  await wallpaper.locator('.wallpaper-desk.is-lit').waitFor();
  await wallpaper.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  assert.equal(await wallpaper.locator('.wallpaper-desk .desk-piece').count(), 3);
  assert.equal(await wallpaper.locator('.wallpaper-desk .desk-clock-glass').count(), 1);
  assert.deepEqual(await wallpaper.locator('.desk-engraving').allInnerTexts(), ['唱机', '唱片架']);
  assert.equal(await wallpaper.locator('button, a, input').count(), 0);
  assert.equal(await wallpaper.locator('.wallpaper-room, .cabin-atmosphere').count(), 0, 'no isometric room or its atmosphere');
  await wallpaper.waitForFunction(() => { const c = document.querySelector('.desk-clock-glass'); if (!c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; });
  await wallpaper.screenshot({ path: path.join(output, 'desk.png') }); check('wallpaper-draws-the-lit-desk-with-its-clock');

  // 2. The stored look only picks the lyric skin: every look draws the same desk and loads no room picture.
  const { CATALOG_IDS } = require('../wallpaper-model.cjs'), markup = () => wallpaper.evaluate(() => document.querySelector('.wallpaper-desk').outerHTML);
  const desk = await markup(), before = requests.length;
  for (const look of CATALOG_IDS.looks) { await push({ look }); await pause(150); assert.equal(await markup(), desk, look); }
  assert.deepEqual(requests.slice(before).filter((pathname) => pathname.startsWith('/room-scenes/')), []); check('every-stored-look-draws-the-same-desk', { looks: CATALOG_IDS.looks });

  // 3. The clock tells the time: two frames a second apart differ.
  { const a = await clock(); await pause(1100); assert.notEqual(await clock(), a); check('led-clock-ticks'); }

  // 4. A focus round: the slip names the phase and the task, the clock counts down; paused, the clock holds still.
  const duration = 25 * 60000;
  await push({ focus: { phase: 'focus', endsAt: Date.now() + duration - 5000, duration, round: 2, task: '写周报' } });
  await wallpaper.locator('.wallpaper-slip', { hasText: '专注中 · 写周报' }).waitFor();
  { const a = await clock(); await pause(1100); assert.notEqual(await clock(), a, 'a running round counts down'); }
  await push({ focus: { phase: 'focus', paused: true, remaining: 600000, duration, round: 2, task: '写周报' } });
  await wallpaper.locator('.wallpaper-slip', { hasText: '专注中 · 暂停 · 写周报' }).waitFor(); await pause(200);
  { const a = await clock(); await pause(1300); assert.equal(await clock(), a, 'a paused round holds still'); }
  await push({ focus: { phase: 'shortBreak', endsAt: Date.now() + 300000, duration: 300000 } }); await wallpaper.locator('.wallpaper-slip', { hasText: '短休息' }).waitFor();
  await wallpaper.screenshot({ path: path.join(output, 'desk-focus.png') });
  await push({}); await wallpaper.locator('.wallpaper-slip').waitFor({ state: 'detached' }); check('focus-round-shows-on-the-slip-and-the-clock');

  // 5. The slip follows the record on the turntable.
  const record = { id: 'qa-record', title: '雪夜', artist: '预览' };
  await push({ record, spinning: true }); await wallpaper.locator('.wallpaper-slip', { hasText: '正在播放雪夜 · 预览' }).waitFor();
  await push({ record, spinning: false }); await wallpaper.locator('.wallpaper-slip', { hasText: '唱机上雪夜 · 预览' }).waitFor();
  assert.match(await slip(), /^唱机上/);
  await push({ record: { ...record, id: 'qa-other', title: '晴天', artist: '' }, spinning: true }); await wallpaper.locator('.wallpaper-slip', { hasText: '正在播放晴天' }).waitFor();
  assert.doesNotMatch(await slip(), /雪夜/);
  await push({}); await wallpaper.locator('.wallpaper-slip').waitFor({ state: 'detached' }); check('record-slip-follows-the-snapshot');

  // 6. The app's reduce-motion setting reaches the wallpaper's own partition.
  await push({ reduceMotion: true }); await wallpaper.waitForFunction(() => document.documentElement.dataset.desktopReduceMotion === 'true');
  await push({ reduceMotion: false }); await wallpaper.waitForFunction(() => document.documentElement.dataset.desktopReduceMotion === 'false'); check('app-reduce-motion-setting-reaches-the-wallpaper');

  // 7. A hidden wallpaper window (Page Visibility; faked because an Xvfb window has no window manager to hide it) stops the clock; visible resumes it.
  const visibility = (hidden) => wallpaper.evaluate((value) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => value }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await visibility(true); await pause(1100);
  { const a = await clock(); await pause(1500); assert.equal(await clock(), a, 'a hidden wallpaper does not redraw'); }
  await visibility(false);
  { const a = await clock(); await wallpaper.waitForFunction((a) => document.querySelector('.desk-clock-glass').toDataURL() !== a, a, { timeout: 3000 }); }
  check('hidden-wallpaper-stops-the-clock-and-visible-resumes');

  // 8. Any monitor shape: the desk is laid out inside the window, nothing scrolls, the clock is drawn.
  const cdp = await wallpaper.context().newCDPSession(wallpaper), shapes = [];
  for (const [width, height] of [[960, 600], [1920, 1080], [2560, 1440], [3440, 1440], [1080, 1920]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(200);
    const fit = await wallpaper.evaluate(() => {
      const w = innerWidth, h = innerHeight, out = [];
      for (const node of document.querySelectorAll('.desk-piece, .desk-plate, .desk-clock, .desk-post')) { const r = node.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) out.push([node.className, r.toJSON()]); }
      return { w, h, out, scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], clock: document.querySelector('.desk-clock-glass').width };
    });
    assert.equal(fit.w, width); assert.deepEqual(fit.out, [], `${width}x${height}`); assert.ok(fit.scroll[0] <= width && fit.scroll[1] <= height, `${width}x${height} scrolls`); assert.ok(fit.clock > 0);
    shapes.push([width, height]);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach(); check('desk-fits-every-monitor-shape', { shapes });

  // 9. The wallpaper is read-only and isolated: no Node, only the snapshot bridge.
  assert.equal(await wallpaper.evaluate(() => typeof window.require), 'undefined'); assert.equal(await wallpaper.evaluate(() => typeof window.albumDesktop), 'undefined');
  assert.equal(await wallpaper.evaluate(() => Object.keys(window.albumWallpaper).sort().join(',')), 'getSnapshot,onSnapshot'); check('isolated-read-only-wallpaper-bridge');
  assert.deepEqual(report.pageErrors, []); report.passed = true;
})().catch((error) => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && wallpaper && !wallpaper.isClosed()) await wallpaper.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await app?.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); if (report.error) console.error(report.error);
});
