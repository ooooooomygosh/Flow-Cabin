'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { mountFixture, chooseRoomScene } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results/atmosphere'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || path.join(desktop, 'node_modules/electron/dist/electron.exe');
const report = { platform: process.platform, nativeWallpaperVerified: false, checks: [], pageErrors: [] }, hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS ' + name); };
let app, site;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sample = (page) => page.evaluate(() => ({ snow: document.querySelector('.cabin-weather-canvas').toDataURL(), fire: document.querySelector('.cabin-hearth-fire').toDataURL(), lights: [...document.querySelectorAll('[data-surface]')].map((node) => [node.dataset.surface, node.style.opacity]) }));
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await pause(100); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message)); await mountFixture(app, site, { items: [] });
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('shell/')); win.setBounds({ x: 0, y: 0, width: 1448, height: 1086 }); });
  for (const look of ['warm', 'pixel']) {
    await chooseRoomScene(site, look);
    await site.locator(`.atmosphere-${look}[data-motion=running]`).waitFor();
    const floorSize = await site.evaluate(async (look) => { const img = new Image(); img.src = `/room-scenes/${look}-cabin-floor.png`; await img.decode(); return [img.naturalWidth, img.naturalHeight]; }, look);
    assert.deepEqual(floorSize, [1448, 1086]);
    await pause(250);
    const a = await sample(site); await site.screenshot({ path: path.join(output, `${look}-a.png`) });
    await pause(850); const b = await sample(site); await site.screenshot({ path: path.join(output, `${look}-b.png`) });
    assert.notEqual(hash(a.snow), hash(b.snow)); assert.notEqual(hash(a.fire), hash(b.fire)); assert.notDeepEqual(a.lights, b.lights);
    const geometry = await site.evaluate(() => {
      const art = document.querySelector('.cabin-scene-art'), layer = document.querySelector('.cabin-atmosphere');
      return { art: art.getBoundingClientRect().toJSON(), effects: layer.getBoundingClientRect().toJSON(), src: art.getAttribute('src'), canvasPixels: [...layer.querySelectorAll('canvas')].reduce((sum, c) => sum + c.width * c.height, 0) };
    }); assert.deepEqual(geometry.art, geometry.effects); assert.ok(geometry.canvasPixels <= 330000);
    assert.equal(geometry.src, `/room-scenes/${look}-cabin.png`);
    const masks = await site.evaluate((look) => {
      const snow = document.querySelector('.cabin-weather-canvas'), fire = document.querySelector('.cabin-hearth-fire');
      const alpha = (c, x, y, w, h) => c.getContext('2d').getImageData(Math.floor(x / w * c.width), Math.floor(y / h * c.height), 1, 1).data[3];
      return { crossbar: alpha(snow, 107, 60, 218, 286), horizontal: alpha(snow, 50, 117, 218, 286), rim: alpha(fire, 1, 60, 94, look === 'warm' ? 180 : 192), interior: alpha(fire, 45, 120, 94, look === 'warm' ? 180 : 192) };
    }, look);
    assert.equal(masks.crossbar, 0); assert.equal(masks.horizontal, 0); assert.equal(masks.rim, 0); assert.equal(masks.interior, 255);
    check(`${look}-two-distinct-frames-aligned-and-clipped`, { ...geometry, masks, snowHashes: [hash(a.snow), hash(b.snow)], fireHashes: [hash(a.fire), hash(b.fire)] });
  }
  for (const look of ['forest', 'seaside', 'starlight']) {
    const bad = []; const collect = request => { if ([`/room-scenes/${look}-cabin-clean.png`, `/room-scenes/${look}-cabin-floor.png`].includes(new URL(request.url()).pathname)) bad.push(request.url()); };
    site.on('request', collect); await chooseRoomScene(site, look); await pause(300); site.off('request', collect);
    assert.equal(await site.locator('.cabin-atmosphere').count(), 0); assert.deepEqual(bad, []); check(`${look}-retains-scene-without-cabin-only-atmosphere-or-missing-clean-asset`);
  }
  await chooseRoomScene(site, 'pixel'); await site.locator('.atmosphere-pixel[data-motion=running]').waitFor();
  const floorClip = await site.evaluate(async () => {
    const svg = document.querySelector('.cabin-floor-base').cloneNode(true); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '1448'); svg.setAttribute('height', '1086');
    const imageNode = svg.querySelector('image'), rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const name of ['width', 'height', 'clip-path', 'mask']) rect.setAttribute(name, imageNode.getAttribute(name)); rect.setAttribute('fill', 'white'); imageNode.replaceWith(rect);
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1448; canvas.height = 1086; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const points = { floor: [1000, 875], shelf: [800, 700], sofa: [180, 700], rug: [1100, 1000], hearth: [1370, 800], window: [250, 250] };
    return Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [name, ctx.getImageData(x, y, 1, 1).data[3]]));
  }); assert.equal(floorClip.floor, 255); for (const key of ['shelf', 'sofa', 'rug', 'hearth', 'window']) assert.equal(floorClip[key], 0); check('static-floor-correction-is-clipped-away-from-furniture-rug-and-hearth', floorClip);
  // Rasterize only the SVG material pass to verify window, couch, albums and
  // distant wall receive no fire-light pixels. This does not edit any asset.
  const maskPixels = await site.evaluate(async () => {
    const svg = document.querySelector('.cabin-hearth-light').cloneNode(true); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '1448'); svg.setAttribute('height', '1086');
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1448; canvas.height = 1086; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const points = { window: [245, 230], wall: [600, 80], couch: [125, 680], album: [700, 450], floor: [1190, 894], distantFloor: [810, 925], stone: [1323, 640], mantel: [1350, 440], pillarFront: [1250, 620], shelfWood: [1123, 610], hearthFront: [1360, 838], hearthShadow: [1300, 863], rug: [1250, 990], hearthTop: [1390, 778] };
    return Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [name, [...ctx.getImageData(x, y, 1, 1).data]]));
  }); for (const name of ['window', 'wall', 'couch', 'album', 'mantel', 'pillarFront', 'shelfWood', 'hearthFront', 'hearthShadow']) assert.equal(maskPixels[name][3], 0); assert.ok(maskPixels.floor[3] > maskPixels.distantFloor[3]); assert.ok(maskPixels.rug[3] > 0); assert.ok(maskPixels.hearthTop[3] > 0); check('material-pass-leaves-unmasked-surfaces-untouched', maskPixels);
  await site.emulateMedia({ reducedMotion: 'reduce' }); await site.locator('.cabin-atmosphere[data-motion=reduced]').waitFor();
  const reduced = await sample(site); await pause(500); assert.deepEqual(await sample(site), reduced); await site.screenshot({ path: path.join(output, 'reduced-motion.png') }); check('system-reduced-motion-freezes-snow-flames-and-light');
  await site.emulateMedia({ reducedMotion: 'no-preference' }); await site.locator('.cabin-atmosphere[data-motion=running]').waitFor();
  await site.evaluate(() => { document.documentElement.dataset.desktopReduceMotion = 'true'; }); await site.locator('.cabin-atmosphere[data-motion=reduced]').waitFor(); const setting = await sample(site); await pause(500); assert.deepEqual(await sample(site), setting);
  await site.evaluate(() => { document.documentElement.dataset.desktopReduceMotion = 'false'; }); await site.locator('.cabin-atmosphere[data-motion=running]').waitFor(); check('existing-app-reduce-motion-setting-freezes-and-resumes');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('shell/')).hide());
  await site.waitForFunction(() => document.querySelector('.cabin-atmosphere').dataset.motion === 'hidden'); const hidden = await sample(site); await pause(500); assert.deepEqual(await sample(site), hidden);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('shell/')).show()); await site.locator('.room-turntable').click(); await site.locator('.cabin-atmosphere[data-motion=running]').waitFor(); await pause(500); assert.notEqual((await sample(site)).fire, hidden.fire); check('real-window-hide-pauses-and-show-resumes');
  for (let i = 0; i < 6; i++) { await chooseRoomScene(site, i % 2 ? 'pixel' : 'warm'); await site.locator('.cabin-atmosphere[data-motion=running]').waitFor(); assert.equal(await site.locator('.cabin-atmosphere canvas').count(), 2); }
  const cdp = await site.context().newCDPSession(site);
  for (const [width, height] of [[960, 600], [1920, 1080], [2560, 1440], [3440, 1440]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }); await pause(120);
    const aligned = await site.evaluate(() => { const a = document.querySelector('.cabin-scene-art').getBoundingClientRect(), b = document.querySelector('.cabin-atmosphere').getBoundingClientRect(); return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height); }); assert.ok(aligned < 1);
  }
  await cdp.detach(); check('repeated-look-switches-and-multiple-aspect-ratios-stay-aligned');
  // Independent wallpaper renderer smoke, not native desktop attachment.
  const snapshot = await site.evaluate(() => ({ ...window.albumRoomSnapshot(), look: 'warm' }));
  await app.evaluate(async ({ app, BrowserWindow, ipcMain, session }, snapshot) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs'); const { registerShellProtocol } = require('./shell-protocol.cjs');
    const partition = session.fromPartition('album-circle-wallpaper'); if (!(await partition.protocol.isProtocolHandled('album-desktop'))) registerShellProtocol(partition.protocol);
    ipcMain.removeHandler('wallpaper:snapshot'); ipcMain.handle('wallpaper:snapshot', () => require('./wallpaper-model.cjs').cleanSnapshot(snapshot));
    const win = new BrowserWindow({ width: 1448, height: 1086, show: true, webPreferences: { partition: 'album-circle-wallpaper', preload: app.getAppPath() + '/wallpaper-preload.cjs', sandbox: true, contextIsolation: true, nodeIntegration: false } }); globalThis.__qaAtmosphereWallpaper = win; await win.loadURL('album-desktop://wallpaper/wallpaper.html');
  }, snapshot);
  const wallpaper = app.context().pages().find((p) => p.url() === 'album-desktop://wallpaper/wallpaper.html'); wallpaper.on('pageerror', (error) => report.pageErrors.push(error.message));
  await wallpaper.locator('.atmosphere-warm[data-motion=running]').waitFor(); const wa = await sample(wallpaper); await pause(650); assert.notEqual((await sample(wallpaper)).fire, wa.fire); await wallpaper.screenshot({ path: path.join(output, 'wallpaper-warm.png') });
  if (process.env.ALBUM_QA_RECORD === '1') {
    const windowId = await app.evaluate(() => globalThis.__qaAtmosphereWallpaper.getNativeWindowHandle().readUInt32LE(0));
    const result = require('node:child_process').spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-window_id', String(windowId), '-framerate', '24', '-draw_mouse', '0', '-i', process.env.DISPLAY, '-t', '8', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'warm-preview.mp4')], { timeout: 20000 });
    assert.equal(result.status, 0, result.stderr?.toString());
  }
  await wallpaper.emulateMedia({ reducedMotion: 'reduce' }); await wallpaper.locator('.cabin-atmosphere[data-motion=reduced]').waitFor(); const wr = await sample(wallpaper); await pause(450); assert.deepEqual(await sample(wallpaper), wr);
  assert.equal(await wallpaper.evaluate(() => typeof window.require), 'undefined'); check('isolated-wallpaper-animates-and-honours-reduced-motion');
  assert.deepEqual(report.pageErrors, []); report.passed = true;
})().catch((error) => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await app?.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); if (report.error) console.error(report.error);
});
