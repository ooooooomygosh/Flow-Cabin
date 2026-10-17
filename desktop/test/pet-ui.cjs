'use strict';
// Desktop pet: opens as a transparent always-on-top window, mirrors the room's
// focus state, sends whitelisted commands back and returns home on request.
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `pet-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || path.join(desktop, 'node_modules/electron/dist/electron.exe');
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site, host;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find((p) => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  await mountFixture(app, site, { showroom: 'room' }); await site.locator('.room-cat').waitFor();

  const opened = app.waitForEvent('window', (page) => page.url() === 'album-desktop://pet/pet.html');
  assert.equal(await site.getByRole('button', { name: '伙伴出门', exact: true }).getAttribute('title'), '奶糖出门：到桌面上散步');
  await site.getByRole('button', { name: '伙伴出门', exact: true }).click();
  const pet = await opened; pet.on('pageerror', (error) => report.pageErrors.push('pet: ' + error.message));
  await pet.locator('.pixel-cat').waitFor();
  const info = await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://pet/pet.html'); return { top: win.isAlwaysOnTop(), taskbar: win.isFocusable(), bounds: win.getBounds(), bg: win.getBackgroundColor() }; });
  assert.equal(info.top, true); assert.ok(info.bounds.width >= 240 && info.bounds.height >= 192); assert.match(info.bg, /^#00/i);
  await site.getByRole('button', { name: '让伙伴回家', exact: true }).waitFor(); assert.equal(await site.getByRole('button', { name: '让伙伴回家', exact: true }).getAttribute('title'), '让奶糖回家'); assert.equal(await site.locator('.room-cat').count(), 0);
  check('pet-window-opens-on-top-and-room-cat-leaves', info);
  assert.equal(await pet.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(Object.keys(await pet.evaluate(() => window.albumPet)).sort(), ['command', 'dragEnd', 'getSnapshot', 'menu', 'moveBy', 'onSnapshot', 'open', 'setHit']);
  check('pet-is-sandboxed-with-a-narrow-bridge');

  await pet.evaluate(() => window.albumPet.command('focus-start'));
  await site.locator('.focus-badge.is-running').waitFor();
  await pet.locator('.pixel-cat[data-pose="focus"]').waitFor(); await pet.locator('.pet-bubble', { hasText: '专注中' }).waitFor();
  check('pet-starts-focus-and-mirrors-it');
  await pet.evaluate(() => window.albumPet.command('evil-command')); await pet.evaluate(() => window.albumPet.command('focus-pause'));
  await site.waitForFunction(() => document.querySelector('.focus-badge')?.textContent.includes('⏸')); check('pet-commands-are-whitelisted');
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('pet.html')).getBounds());
  await pet.evaluate(() => window.albumPet.moveBy(-40, -30)); await pet.evaluate(() => window.albumPet.dragEnd()); await new Promise((r) => setTimeout(r, 500));
  const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('pet.html')).getBounds());
  assert.equal(after.x, before.x - 40); assert.equal(after.y, before.y - 30);
  const saved = JSON.parse(fs.readFileSync(path.join(env.ALBUM_DESKTOP_TEST_PROFILE, 'pet.json'), 'utf8')); assert.equal(saved.x, after.x); check('pet-drags-and-remembers-position');
  await pet.screenshot({ path: path.join(output, 'pet-window.png') });

  await site.getByRole('button', { name: '让伙伴回家', exact: true }).click(); await site.locator('.room-cat').waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('pet.html'))), false); check('pet-returns-home');
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
})().catch((error) => { report.error = error.stack || error.message; report.passed = false; process.exitCode = 1; }).finally(async () => {
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'pet-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error); await app?.close().catch(() => {});
});
