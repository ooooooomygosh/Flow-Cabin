'use strict';
// 2.2 (M4): closing the window while a focus round runs hides it to the tray / menu bar and the
// page keeps counting; screen lock and unlock reach the page (a quick lock simply counts).
// Run: npm --prefix desktop run test:focus-close (Linux: under xvfb-run, with ALBUM_QA_EXE set).
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `focus-close-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const check = (name) => console.log('PASS ' + name);
const mainWindow = (BrowserWindow) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://shell/index.html');
let app;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(20000); await app.firstWindow();
  let site;
  for (let i = 0; i < 200 && !site; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (!site) await new Promise((r) => setTimeout(r, 100)); }
  await site.waitForFunction(() => typeof window.albumCompanionSnapshot === 'function' && window.albumCompanionSnapshot()?.focus);
  const focus = () => site.evaluate(() => window.albumCompanionSnapshot().focus);
  await site.evaluate(() => window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: 'focus-start' } })));
  await site.waitForFunction(() => window.albumCompanionSnapshot().focus.phase === 'focus');
  // Close right after starting (before the idle tray poll has seen the round).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'album-desktop://shell/index.html').close());
  await new Promise((r) => setTimeout(r, 800));
  const state = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((c) => c.webContents.getURL() === 'album-desktop://shell/index.html'); return w ? { destroyed: w.isDestroyed(), visible: w.isVisible() } : null; });
  assert.deepEqual(state, { destroyed: false, visible: false }, 'the window hides instead of closing');
  const first = await focus(); await new Promise((r) => setTimeout(r, 2200)); const later = await focus();
  assert.equal(later.phase, 'focus'); assert.ok(later.endsAt > 0 && !later.paused, 'still running while hidden');
  assert.ok(later.endsAt === first.endsAt, 'the same round continues');
  check('close-while-focusing-hides-and-keeps-counting');
  // A quick screen lock pauses at the lock and, back within a minute, simply counts.
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  await site.waitForFunction(() => window.albumCompanionSnapshot().focus.paused === true);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  await site.waitForFunction(() => window.albumCompanionSnapshot().focus.paused === false);
  check('screen-lock-reaches-the-page-and-a-short-one-counts');
  // Back to the window; ending the round lets the close button quit again (Linux / Windows).
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((c) => c.webContents.getURL() === 'album-desktop://shell/index.html'); w.show(); });
  await site.evaluate(() => window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: 'focus-end' } })));
  await site.waitForFunction(() => window.albumCompanionSnapshot().focus.phase === 'idle');
  await new Promise((r) => setTimeout(r, 3500)); // the slower idle tray poll
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((c) => c.webContents.getURL() === 'album-desktop://shell/index.html').close());
  if (process.platform !== 'darwin') { await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('the app did not quit after the round ended')), 10000))]); check('idle-close-quits'); }
  else await app.close();
})().catch(async (error) => { console.error(error); try { await app?.close(); } catch {} process.exitCode = 1; });
