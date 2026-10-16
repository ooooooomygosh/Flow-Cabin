const chooseSource = (...args) => import('../../scripts/settings-actions.mjs').then(m => m.chooseSource(...args));
const openMusicSettings = (...args) => import('../../scripts/settings-actions.mjs').then(m => m.openMusicSettings(...args));
'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mountFixture, albums } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results');
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `night-study-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const report = { fixtureData: true, syntheticSilentAudio: true, actualPlatformLoginTested: false, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
const items = Array.from({ length: 18 }, (_, i) => ({ ...albums[i % albums.length], id: `night-study-${i}`, addedAt: `2026-09-${String(29 - i).padStart(2, '0')}` }));
const pixelHelper = path.join(output, 'DesktopPixels.exe');
execFileSync(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', '/platform:x64', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', '/out:' + pixelHelper, path.join(__dirname, 'DesktopPixels.cs')], { windowsHide: true });
let app, site, host, wallpaper;
async function desktopPixels(name) {
  await wallpaper.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise(r => setTimeout(r, 180));
  const owned = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/wallpaper/wallpaper.html')); return { hwnd: w.getNativeWindowHandle().readBigUInt64LE().toString(), pid: String(process.pid) }; });
  const box = await wallpaper.locator('.room-record-slot').nth(8).boundingBox();
  const size = await wallpaper.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const clip = { x: Math.round(box.x + box.width * .3), y: Math.round(box.y + box.height * .3), width: Math.round(box.width * .4), height: Math.round(box.height * .4) };
  const file = path.join(output, name + '.png'), reference = path.join(output, name + '-reference.png');
  const args = [owned.hwnd, owned.pid, file, String(clip.x / size.width), String(clip.y / size.height), String(clip.width / size.width), String(clip.height / size.height)];
  // Read the Windows desktop composition before a browser capture can induce paint.
  const captured = JSON.parse(execFileSync(pixelHelper, args, { windowsHide: true, encoding: 'utf8', timeout: 8000 }));
  const first = fs.readFileSync(file).toString('base64');
  assert.equal(captured.clientWidth, captured.windowWidth); assert.equal(captured.clientHeight, captured.windowHeight);
  const bytes = await wallpaper.screenshot({ clip, scale: 'css' });
  const match = await app.evaluate(({ nativeImage }, { first, bytes, reference, width, height }) => {
    const fs = process.getBuiltinModule('fs'), image = nativeImage.createFromBuffer(Buffer.from(bytes, 'base64')).resize({ width, height }); fs.writeFileSync(reference, image.toPNG());
    const a = nativeImage.createFromBuffer(Buffer.from(first, 'base64')).getBitmap(), b = image.getBitmap(); let close = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]) <= 45) close++;
    return close / (a.length / 4);
  }, { first, bytes: bytes.toString('base64'), reference, width: captured.width, height: captured.height });
  assert.ok(match > .9, 'Desktop first frame did not contain scene: ' + match);
  return { ...captured, firstFrameMatch: match };
}
async function startWallpaper() {
  await site.getByRole('button', { name: '沉入桌面', exact: true }).click();
  await site.waitForFunction(() => window.albumRoomWallpaperState?.active || window.albumRoomWallpaperState?.error);
  const state = await site.evaluate(() => window.albumRoomWallpaperState); assert.equal(state.active, true, JSON.stringify(state));
  wallpaper = app.context().pages().find(p => p.url() === 'album-desktop://wallpaper/wallpaper.html');
  wallpaper.on('pageerror', e => report.pageErrors.push(e.message));
  await wallpaper.locator('.study-writing-hand').waitFor();
  await wallpaper.waitForFunction(() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0));
}
(async () => {
  app = await _electron.launch({ executablePath: process.env.ALBUM_QA_EXE || path.join(desktop, 'node_modules/electron/dist/electron.exe'), args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(20000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find(p => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find(p => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise(r => setTimeout(r, 100)); }
  site.on('pageerror', e => report.pageErrors.push(e.message)); await mountFixture(app, site, { items, music: true, autoMusic: true });
  await site.locator('.cabin-night-study .study-writing-hand').waitFor(); assert.equal(await site.locator('.room-record-slot').count(), 9);
  await site.locator('.room-record').first().click(); await site.keyboard.press('ArrowDown');
  await site.waitForFunction(() => document.querySelector('.room-rack-grid').dataset.startRow === '1');
  assert.ok((await site.locator('.room-record').first().getAttribute('title')).startsWith(items[3].title)); await site.keyboard.press('Home');
  const shade = await site.locator('.room-record').first().evaluate(e => ({ filter: getComputedStyle(e.querySelector('.showroom-artwork')).filter, shadow: getComputedStyle(e, ':after').boxShadow, gradient: getComputedStyle(e, ':after').backgroundImage }));
  assert.match(shade.filter, /brightness\(0.78\)/); assert.notEqual(shade.shadow, 'none'); assert.match(shade.gradient, /120deg/); check('new-reference-scene-nine-slots-three-column-navigation-and-directional-shadow');
  const poses = await site.evaluate(() => new Promise(resolve => { const poses = new Set(); const timer = setInterval(() => poses.add(document.querySelector('.study-writing-hand').dataset.pose), 40); setTimeout(() => { clearInterval(timer); resolve([...poses].map(Number)); }, 7200); }));
  assert.ok(poses.includes(0) && poses.some(p => p >= 8 && p <= 11) && poses.includes(15), JSON.stringify(poses));
  assert.equal(await site.locator('.study-writing-hand').evaluate(e => getComputedStyle(e).transform), 'none');
  await host.evaluate(() => window.albumDesktop.settings('apply', { reduceMotion: true })); await site.locator('.study-writing[data-animation=still]').waitFor();
  const position = await site.locator('.study-writing-hand').evaluate(e => getComputedStyle(e).backgroundPosition); await site.waitForTimeout(350); assert.equal(await site.locator('.study-writing-hand').evaluate(e => getComputedStyle(e).backgroundPosition), position);
  await host.evaluate(() => window.albumDesktop.settings('apply', { reduceMotion: false })); check('writing-lift-spin-catch-poses-without-image-stretch-and-reduced-motion');
  await site.locator('.room-record').first().dblclick(); await chooseSource(site, 'netease');
  await site.waitForFunction(() => document.querySelector('audio').currentTime > .2 && !document.querySelector('audio').paused);
  assert.deepEqual((await app.evaluate(() => globalThis.__qaMusicResolves)).slice(-2), ['99999', '12345']);
  await site.getByLabel('唱机展示曲目', { exact: true }).selectOption('1');
  await site.waitForFunction(() => document.querySelector('.turntable-track').textContent.includes('懦夫') && document.querySelector('audio').currentTime > .2 && !document.querySelector('audio').paused);
  assert.deepEqual((await app.evaluate(() => globalThis.__qaMusicResolves)).slice(-2), ['99999', '12345']); check('automatic-source-fallback-and-album-dropdown-play-real-html-audio');
  await site.getByRole('button', { name: '进入全屏模式', exact: true }).click();
  await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'true');
  const full = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/shell/')); return { full: w.isFullScreen(), bounds: w.getBounds(), monitor: screen.getDisplayMatching(w.getBounds()).bounds }; });
  assert.equal(full.full, true); assert.deepEqual(full.bounds, full.monitor);
  for (const selector of ['.app-titlebar', '.cabin-toolbar', '.room-turntable', '.room-now-playing']) {
    if (await site.locator(selector).count()) assert.equal(await site.locator(selector).isVisible(), true);
  }
  await site.screenshot({ path: path.join(output, 'night-study-fullscreen.png') });
  await site.reload(); await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'true' && document.querySelector('.cabin-toolbar') && getComputedStyle(document.querySelector('.cabin-toolbar')).display !== 'none');
  await app.evaluate(({ webContents }) => { const contents = webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app')); contents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' }); contents.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' }); });
  await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'false'); check('native-fullscreen-covers-monitor-keeps-interaction-survives-reload-and-escape-restores');
  await openMusicSettings(site);
  const musicDialog = site.getByRole('dialog', { name: '设置', exact: true, includeHidden: true }); await musicDialog.getByRole('region', { name: '账户与文件夹', exact: true }).waitFor();
  const nativeKey = keyCode => app.evaluate(({ webContents }, keyCode) => { const c = webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app')); c.sendInputEvent({ type: 'keyDown', keyCode }); c.sendInputEvent({ type: 'keyUp', keyCode }); }, keyCode);
  await nativeKey('F11'); await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'true');
  assert.equal(await musicDialog.isVisible(), true);
  await nativeKey('ESC'); await musicDialog.waitFor({ state: 'hidden' }); assert.equal(await site.evaluate(() => document.documentElement.dataset.desktopFullscreen), 'true');
  await nativeKey('ESC'); await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'false'); check('fullscreen-keeps-dialog-interactive-and-escape-closes-dialog-before-fullscreen');
  await startWallpaper();
  const native = await app.evaluate(({ app, BrowserWindow }) => { const rq = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs'), w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/wallpaper/wallpaper.html')), helper = app.isPackaged ? rq('node:path').join(process.resourcesPath, 'native/DesktopHost.exe') : app.getAppPath() + '/native/bin/DesktopHost.exe'; return JSON.parse(rq('node:child_process').execFileSync(helper, ['probe', w.getNativeWindowHandle().readBigUInt64LE().toString(), String(process.pid)], { windowsHide: true, encoding: 'utf8' })); });
  assert.equal(native.behindIcons, true); assert.equal(native.hasFrame, false); assert.equal(native.coversMonitor, true); check('native-wallpaper-behind-icons-no-border-covers-entire-monitor', native);
  check('actual-desktop-first-frame-matches-scene', await desktopPixels('night-desktop-first'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/shell/')).close());
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/shell/')).isVisible()), false);
  const before = await wallpaper.locator('.study-writing-hand').getAttribute('data-pose');
  await wallpaper.waitForFunction(p => document.querySelector('.study-writing-hand').dataset.pose !== p, before);
  check('wallpaper-stays-rendered-and-animates-after-main-close', await desktopPixels('night-desktop-closed'));
  const owned = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/wallpaper/wallpaper.html')); return { hwnd: w.getNativeWindowHandle().readBigUInt64LE().toString(), pid: String(process.pid) }; });
  const hand = await wallpaper.locator('.study-writing-hand').boundingBox(), size = await wallpaper.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const captureHand = name => { const file = path.join(output, name + '.png'); execFileSync(pixelHelper, [owned.hwnd, owned.pid, file, String(hand.x / size.width), String(hand.y / size.height), String(hand.width / size.width), String(hand.height / size.height)], { windowsHide: true }); return fs.readFileSync(file).toString('base64'); };
  const firstHand = captureHand('night-hand-first'); await wallpaper.waitForTimeout(450); const nextHand = captureHand('night-hand-next');
  const changed = await app.evaluate(({ nativeImage }, { first, next }) => { const a = nativeImage.createFromBuffer(Buffer.from(first, 'base64')).getBitmap(), b = nativeImage.createFromBuffer(Buffer.from(next, 'base64')).getBitmap(); let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]) > 30) count++; return count; }, { first: firstHand, next: nextHand });
  assert.ok(changed > 100, 'Desktop hand did not animate: ' + changed); check('actual-desktop-hand-pixels-change-with-main-hidden', { changedPixels: changed });
  await site.evaluate(() => window.open('album-desktop://action/wallpaper-stop', '_blank')); await site.waitForFunction(() => !window.albumRoomWallpaperState?.active); assert.equal(wallpaper.isClosed(), true);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/shell/')).isVisible()), true);
  await startWallpaper(); check('stop-restores-main-and-reapplication-renders-again', await desktopPixels('night-desktop-reapplied'));
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(await app.evaluate(() => globalThis.__qaBlockedWrites), 0); report.passed = true;
})().catch(e => { report.passed = false; report.error = e.stack; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'night-study-failure.png') }).catch(() => {});
  if (app) await app.close().catch(() => {}); fs.writeFileSync(path.join(output, 'night-study-ui-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
});
