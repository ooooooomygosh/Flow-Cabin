/** Core product journey. Synthetic collection, silent audio, no accounts/network. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openAddToShelf } from './settings-actions.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'desktop/test-results/journey');
const port = Number(process.env.JOURNEY_PORT || 4285), origin = `http://127.0.0.1:${port}`;
const KEY = 'album-circle-focus-v1:local-owner', LOG = 'flow-cabin-focus-sessions-v1';
const report = { fixtureData: true, realAccountsUsed: false, checks: [], pageErrors: [], unexpectedRequests: [] };
const items = [];
let server, browser, page;
const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
await fs.mkdir(output, { recursive: true });
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 150) throw new Error(log || 'Vite startup timed out'); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(({ seed, key }) => {
    if (location.origin === 'null' || sessionStorage.getItem('journey-seeded')) return;
    sessionStorage.setItem('journey-seeded', '1');
    localStorage.setItem('flow-cabin-onboarding-v1', seed);
    localStorage.setItem(key, JSON.stringify({ settings: { notify: false, chime: false } }));
    // No display preference: this test exercises the product's actual default.
  }, { seed: onboardingSeed(), key: KEY });
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    if (u.origin !== origin) { report.unexpectedRequests.push(u.href); return route.abort(); }
    if (p === '/api/items') {
      if (req.method() === 'GET') return route.fulfill({ json: { items } });
      if (req.method() === 'POST') { const item = { ...req.postDataJSON(), id: `journey-${items.length}`, addedAt: new Date().toISOString() }; items.unshift(item); return route.fulfill({ json: { item } }); }
    }
    if (p === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (p === '/desktop-music/now-playing' || p === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
    if (p === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (p.startsWith('/api/') || p.startsWith('/desktop-music/')) { report.unexpectedRequests.push(p); return route.fulfill({ status: 500, json: { error: 'Unexpected fixture request' } }); }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.focus-badge').waitFor();
  assert.equal(await page.getByRole('heading', { name: '心流小屋', level: 1, exact: true }).count(), 1);
  check('room-opens-with-one-product-heading');
  await openAddToShelf(page, '手动填写');
  await page.getByLabel('专辑名', { exact: true }).fill('留给自己的晚风');
  await page.getByLabel('歌手', { exact: true }).fill('离线旅程');
  await page.getByLabel('曲目', { exact: true }).fill('慢慢来\n灯还亮着');
  await page.getByRole('button', { name: '放上唱片架', exact: true }).click();
  await page.getByText('《留给自己的晚风》已放上唱片架。', { exact: true }).waitFor();
  await page.getByRole('dialog', { name: '添加到唱片架', exact: true }).getByRole('button', { name: /关闭/ }).click();
  assert.equal(items.length, 1); await page.locator('.room-record').waitFor();
  check('add-record-and-confirm-real-shelf-update');
  const record = page.locator('.room-record'); await record.focus(); await page.keyboard.press('Enter');
  await page.locator('.room-turntable[data-loaded-id="journey-0"]').waitFor();
  assert.equal(await record.getAttribute('aria-pressed'), 'true');
  check('keyboard-loads-record-on-the-first-enter');
  await page.locator('.focus-badge').click();
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  assert.equal(await page.locator('.focus-display').count(), 0, 'starting work leaves the record in view by default');
  await page.locator('.focus-badge.is-running').waitFor();
  check('focus-start-retains-the-room-and-record');
  const timer = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).timer, KEY);
  // Deterministic elapsed work, without waiting a real minute or touching private data.
  await page.evaluate(start => { Date.now = () => start + 90000; window.dispatchEvent(new Event('focus')); }, timer.startedAt);
  await page.getByRole('button', { name: '提前结束本轮专注', exact: true }).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).timer.phase === 'idle', KEY);
  assert.equal(await page.getByRole('button', { name: '开始专注', exact: true }).count(), 1);
  const saved = await page.evaluate(({ key, log }) => ({ state: JSON.parse(localStorage.getItem(key)), sessions: JSON.parse(localStorage.getItem(log)) }), { key: KEY, log: LOG });
  assert.equal(saved.state.sessions.length, 1); assert.equal(saved.state.sessions[0].completed, false);
  assert.equal(saved.state.rewards.fish, 0); assert.equal(saved.sessions.length, 1);
  assert.equal(saved.sessions[0].album.title, '留给自己的晚风');
  check('end-once-returns-to-idle-and-records-the-album-without-rewards');
  // 3.0: 统计 lives in 唱片日记. An early-ended round is never pressed into a record (no card, no
  // failure), but its minutes and its album still show under 统计 › 最近的专注.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'stats' } })));
  await page.getByRole('dialog', { name: '唱片日记' }).waitFor();
  assert.equal(await page.locator('.press-card').count(), 0, 'no 压制唱片 card for an early end');
  await page.locator('.fs-sessions').getByText(/留给自己的晚风/).waitFor();
  await page.screenshot({ path: path.join(output, 'journal.png'), animations: 'disabled' });
  check('journal-shows-the-round-and-its-record');
  await page.getByRole('button', { name: '返回小屋', exact: true }).click();
  await page.reload(); await page.locator('.cabin-return-note').waitFor();
  assert.match(await page.locator('.cabin-return-note').innerText(), /上次陪你专注：《留给自己的晚风》/);
  assert.equal((await page.evaluate(log => JSON.parse(localStorage.getItem(log)), LOG)).length, 1);
  await page.screenshot({ path: path.join(output, 'return.png'), animations: 'disabled' });
  check('return-after-reload-remembers-the-record-without-duplicating-the-round');
  // Modal background and return focus, including keyboard-open with BODY focus.
  await page.getByRole('button', { name: '收起专注工具', exact: true }).click();
  await page.locator('.focus-badge').focus(); await page.keyboard.press('z');
  const display = page.getByRole('dialog', { name: '专注画面', exact: true }); await display.waitFor();
  assert.equal(await display.evaluate(node => node.matches(':modal')), true);
  await page.keyboard.press('Tab'); assert.equal(await display.evaluate(node => node.contains(document.activeElement)), true);
  await page.keyboard.press('Escape'); await display.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.focus-badge').evaluate(node => node === document.activeElement), true);
  check('immersive-display-is-modal-and-returns-keyboard-focus');
  await page.keyboard.press('f'); await display.waitFor();
  await page.keyboard.press('f'); await display.waitFor({ state: 'detached' });
  check('f-still-toggles-immersion-when-the-native-dialog-is-open');
  await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('t');
  const corner = page.getByRole('dialog', { name: '唱机特写', exact: true }); await corner.waitFor();
  await page.keyboard.press('Escape'); await corner.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.focus-badge').evaluate(node => node === document.activeElement), true);
  check('keyboard-opened-listening-corner-has-a-stable-focus-return');
  await page.locator('.focus-badge').click(); await page.getByRole('tab', { name: '这一段', exact: true }).click();
  // Narrow controls still fit, without clipping interactive targets.
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 600 }]) {
    await page.setViewportSize(viewport); await page.screenshot({ path: path.join(output, `compact-${viewport.width}.png`), animations: 'disabled' });
    const button = await page.locator('.focus-dock-close').boundingBox();
    assert(button && button.x >= 0 && button.y >= 0 && button.x + button.width <= viewport.width && button.y + button.height <= viewport.height);
  }
  check('focus-controls-fit-compact-windows');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: 'focus-start' } })));
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).timer.phase === 'focus', KEY);
  await page.evaluate(key => { const timer = JSON.parse(localStorage.getItem(key)).timer; Date.now = () => timer.startedAt + 65000; window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: 'focus-skip' } })); }, KEY);
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).timer.phase === 'idle', KEY);
  assert.equal(await page.evaluate(log => JSON.parse(localStorage.getItem(log)).length, LOG), 2);
  check('desktop-pet-end-command-has-the-same-end-round-semantics');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []);
  check('no-page-errors-or-external-requests');
} catch (error) {
  report.error = error.stack;
  await page?.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill('SIGTERM');
}
