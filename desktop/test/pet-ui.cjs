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

  const week = Array.from({ length: 7 }, (_, index) => ({ key: `2026-10-${13 + index}`, keyboard: 10 + index, click: 2 + index, total: 12 + index * 2 }));
  await site.evaluate((week) => {
    window.albumInputStats = { status: 'active', tracking: true, platform: 'darwin', today: { keyboard: 123, click: 45, total: 168 }, total: { keyboard: 1234, click: 456, total: 1690 }, week, activeDays: 7, streak: 4 };
    window.dispatchEvent(new CustomEvent('album-input-stats', { detail: window.albumInputStats }));
    window.dispatchEvent(new Event('cabin-open-cat'));
  }, week);
  const catPanel = site.getByRole('dialog', { name: '小猫' }); await catPanel.waitFor();
  const inputCard = catPanel.locator('.cat-input-companion'); await inputCard.waitFor();
  const inputText = await inputCard.innerText();
  assert.match(inputText, /今天一起敲/); assert.match(inputText, /123/); assert.match(inputText, /45/); assert.match(inputText, /连续\s*4\s*天/);
  assert.match(inputText, /累计 1,690 次/); assert.match(inputText, /只记录键盘按下和点击的次数/);
  assert.equal(await inputCard.locator('.cat-input-day').count(), 7);
  await catPanel.screenshot({ path: path.join(output, 'cat-input-panel.png') });
  check('cat-panel-shows-local-keyboard-and-click-stats', { text: inputText.replace(/\s+/g, ' ').slice(0, 180) });
  await catPanel.getByRole('button', { name: '关闭小猫', exact: true }).click(); await catPanel.waitFor({ state: 'hidden' });
  await site.evaluate(() => { delete window.albumInputStats; });

  const opened = app.waitForEvent('window', (page) => page.url() === 'album-desktop://pet/pet.html');
  assert.equal(await site.getByRole('button', { name: '伙伴出门', exact: true }).getAttribute('title'), '奶糖出门：到桌面上散步');
  await site.getByRole('button', { name: '伙伴出门', exact: true }).click();
  const pet = await opened; pet.on('pageerror', (error) => report.pageErrors.push('pet: ' + error.message));
  await pet.locator('.pixel-cat').waitFor();
  const base = await pet.evaluate(() => window.albumPet.getSnapshot());
  await app.evaluate(({ BrowserWindow }, payload) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL() === 'album-desktop://pet/pet.html');
    win.webContents.send('pet:update', payload);
  }, { ...base, typingAt: 0, clickAt: Date.now() });
  await pet.locator('.pixel-cat[data-pose="click"]').waitFor();
  assert.equal(await pet.locator('.pet-stage[data-clicking="true"]').count(), 1);
  await pet.screenshot({ path: path.join(output, 'pet-click.png') });
  await app.evaluate(({ BrowserWindow }, payload) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL() === 'album-desktop://pet/pet.html');
    win.webContents.send('pet:update', payload);
  }, { ...base, typingAt: Date.now(), clickAt: 0 });
  await pet.locator('.pixel-cat[data-pose="typing"]').waitFor();
  assert.equal(await pet.locator('.pet-stage[data-typing="true"]').count(), 1);
  await pet.screenshot({ path: path.join(output, 'pet-typing.png') });
  check('pet-renders-distinct-click-and-keyboard-reactions');
  const info = await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://pet/pet.html'); return { top: win.isAlwaysOnTop(), taskbar: win.isFocusable(), bounds: win.getBounds(), bg: win.getBackgroundColor() }; });
  assert.equal(info.top, true); assert.ok(info.bounds.width >= 240 && info.bounds.height >= 192); assert.match(info.bg, /^#00/i);
  await site.getByRole('button', { name: '让伙伴回家', exact: true }).waitFor(); assert.equal(await site.getByRole('button', { name: '让伙伴回家', exact: true }).getAttribute('title'), '让奶糖回家'); assert.equal(await site.locator('.room-cat').count(), 0);
  check('pet-window-opens-on-top-and-room-cat-leaves', info);
  assert.equal(await pet.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(Object.keys(await pet.evaluate(() => window.albumPet)).sort(), ['command', 'cursor', 'dragEnd', 'getSnapshot', 'menu', 'moveBy', 'onSnapshot', 'open', 'setHit']);
  check('pet-is-sandboxed-with-a-narrow-bridge');

  await pet.evaluate(() => window.albumPet.command('focus-start'));
  await site.locator('.focus-badge.is-running').waitFor();
  await pet.locator('.pixel-cat[data-pose="focus"]').waitFor(); await pet.locator('.pet-bubble', { hasText: '专注中' }).waitFor();
  check('pet-starts-focus-and-mirrors-it');
  await pet.evaluate(() => window.albumPet.command('evil-command')); await pet.evaluate(() => window.albumPet.command('focus-pause'));
  await site.locator('.focus-badge.is-paused').waitFor(); assert.equal(await site.evaluate(() => window.albumCompanionSnapshot().focus.paused), true); check('pet-commands-are-whitelisted');
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('pet.html')).getBounds());
  await pet.evaluate(() => window.albumPet.moveBy(-40, -30)); await pet.evaluate(() => window.albumPet.dragEnd()); await new Promise((r) => setTimeout(r, 500));
  const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('pet.html')).getBounds());
  assert.equal(after.x, before.x - 40); assert.equal(after.y, before.y - 30);
  const saved = JSON.parse(fs.readFileSync(path.join(env.ALBUM_DESKTOP_TEST_PROFILE, 'pet.json'), 'utf8')); assert.equal(saved.x, after.x); check('pet-drags-and-remembers-position');
  await pet.screenshot({ path: path.join(output, 'pet-window.png') });

  await site.keyboard.press('Escape'); await site.locator('.focus-display').waitFor({ state: 'detached' });
  await site.getByRole('button', { name: '让伙伴回家', exact: true }).click(); await site.locator('.room-cat').waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('pet.html'))), false); check('pet-returns-home');
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
})().catch((error) => { report.error = error.stack || error.message; report.passed = false; process.exitCode = 1; }).finally(async () => {
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'pet-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error); await app?.close().catch(() => {});
});
