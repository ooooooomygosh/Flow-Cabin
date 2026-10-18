/** AI（Beta）+ 小屋来信 browser regression. The OpenAI-compatible endpoint is mocked; nothing leaves the machine. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.AI_OUTPUT || path.join(root, 'desktop/test-results/ai-beta');
const port = Number(process.env.AI_PORT || 4196), origin = `http://127.0.0.1:${port}`;
const API = 'https://api.mock-ai.test', KEY = 'sk-browser-SECRET-0123456789';
const FOCUS = 'album-circle-focus-v1:local-owner', LETTER = '小猫今天想说：你上周专注了三个多小时。\n\n唱片一直在转，我也一直在。';
const items = [{ id: 'a1', type: 'album', title: '测试唱片', artist: '离线测试', cover: '', tracks: ['晨光'], source: 'manual' }];
const report = { checks: [], pageErrors: [], unexpectedRequests: [], aiRequests: [] };
await fs.mkdir(output, { recursive: true });
let browser, server;
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
// Sessions in last week, so the weekly letter has data.
const lastWeek = () => { const d = new Date(); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 3); return d.getTime(); };
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (b) => log += b); server.stderr.on('data', (b) => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 150) throw new Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium();
  const run = async (name, test, { desktop = false, ai = null, mode = () => ({ status: 200 }) } = {}) => {
    if (process.env.AI_FILTER && !name.includes(process.env.AI_FILTER)) return;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(({ FOCUS, desktop, ai, KEY, start }) => {
      if (location.origin === 'null' || sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 1, status: 'done', step: 'done' }));
      localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: false }));
      const sessions = [0, 1, 2].map((i) => ({ id: `s${i}`, start: start + i * 86400000, end: start + i * 86400000 + 75 * 60000, durationMs: 75 * 60000, completed: true, taskText: '秘密待办内容', album: { key: 'a1', title: '测试唱片', artist: '离线测试' } }));
      localStorage.setItem('flow-cabin-focus-sessions-v1', JSON.stringify(sessions));
      localStorage.setItem(FOCUS, JSON.stringify({ settings: { focusMin: 25, shortMin: 5, notify: false, chime: false } }));
      localStorage.setItem('flow-cabin-cat-mood-v1', JSON.stringify({ v: 1, mood: 80, tier: 'happy', updatedAt: Date.now(), feeds: [{ at: start + 3600000, fishLeft: 2 }], totalFeeds: 1, unlockedActions: [] }));
      if (ai) { localStorage.setItem('flow-cabin-ai-v1', JSON.stringify({ v: 1, ...ai })); if (!desktop) localStorage.setItem('flow-cabin-ai-key-v1', KEY); }
      window.__nativeCommands = [];
      if (desktop) {
        window.cabinAiKey = { stored: true, secure: true };
        window.open = (url) => { window.__nativeCommands.push(String(url)); return null; };
        const init = () => { document.documentElement.dataset.desktopClient = 'true'; };
        if (document.documentElement) init(); else new MutationObserver((_, o) => { if (document.documentElement) { init(); o.disconnect(); } }).observe(document, { childList: true });
      }
    }, { FOCUS, desktop, ai, KEY, start: lastWeek() });
    await context.route('**/*', async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname;
      if (u.origin === API) {
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const body = req.postDataJSON();
        report.aiRequests.push({ name, path: p, auth: req.headers().authorization === `Bearer ${KEY}`, body });
        const m = mode(body);
        if (m.hang) return; // never answers → client timeout
        if (m.status !== 200) return route.fulfill({ status: m.status, headers: cors, json: { error: { message: `mock failure for ${KEY}` } } });
        const test = body.max_tokens <= 8;
        return route.fulfill({ status: 200, headers: cors, json: { choices: [{ message: { role: 'assistant', content: test ? '好' : LETTER } }] } });
      }
      if (u.origin !== origin) { report.unexpectedRequests.push(u.href); return route.abort(); }
      if (p === '/api/items') return route.fulfill({ json: { items } });
      if (p === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
      if (p === '/desktop-music/now-playing' || p === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
      if (p === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
      if (p.startsWith('/api/') || p.startsWith('/desktop-music/')) return route.fulfill({ status: 404, json: {} });
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => report.pageErrors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.text().includes(KEY)) report.pageErrors.push(`${name}: key in console`); });
    try { await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.locator('.focus-badge').waitFor({ timeout: 30000 }); await test(page); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); await shot(page, `${name}-failure`).catch(() => {}); }
    finally { await context.close(); }
  };
  const openAi = async (page) => { await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'ai' } }))); await page.getByRole('region', { name: 'AI（Beta）' }).waitFor(); };
  const openWeekly = (page) => page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'weekly' } })));
  const letterSpot = (page) => page.locator('.cabin-journal .fs-letter');

  await run('settings-off-by-default-and-test-connection', async (page) => {
    await openAi(page);
    const region = page.getByRole('region', { name: 'AI（Beta）' });
    assert.equal(await region.getByRole('checkbox', { name: '启用 AI（Beta）' }).isChecked(), false);
    assert.equal(await region.getByRole('button', { name: '测试连接' }).isDisabled(), true);
    await shot(page, 'ai-settings-off');
    await region.getByRole('checkbox', { name: '启用 AI（Beta）' }).check();
    await region.getByLabel('接口地址').fill(`${API}/v1`);
    await region.getByLabel('API Key').fill(KEY);
    await region.getByLabel('模型').fill('deepseek-chat');
    await region.getByRole('radio', { name: '俏皮' }).click();
    await region.getByRole('button', { name: '测试连接' }).click();
    await region.getByText('连接成功').waitFor();
    const req = report.aiRequests.filter((r) => r.name === 'settings-off-by-default-and-test-connection');
    assert.equal(req.length, 1); assert.equal(req[0].path, '/v1/chat/completions'); assert.ok(req[0].auth); assert.equal(req[0].body.model, 'deepseek-chat');
    const stored = await page.evaluate(() => ({ s: localStorage.getItem('flow-cabin-ai-v1'), k: localStorage.getItem('flow-cabin-ai-key-v1') }));
    assert.ok(!stored.s.includes(KEY)); assert.equal(stored.k, KEY);
    assert.equal(JSON.parse(stored.s).tone, 'playful');
    assert.equal(await region.getByLabel('API Key').inputValue(), '');
    await shot(page, 'ai-settings-test-ok');
  });
  await run('test-connection-shows-clear-errors', async (page) => {
    await openAi(page);
    const region = page.getByRole('region', { name: 'AI（Beta）' });
    await region.getByRole('button', { name: '测试连接' }).click();
    const alert = region.getByRole('alert'); await alert.waitFor();
    const text = await alert.innerText(); assert.match(text, /API Key 无效/); assert.ok(!text.includes(KEY));
    await shot(page, 'ai-settings-test-error');
  }, { ai: { enabled: true, baseUrl: API, model: 'm' }, mode: () => ({ status: 401 }) });

  await run('weekly-letter-delivered-once-with-mailbox-flag', async (page) => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]').length === 1, null, { timeout: 15000 });
    const reqs = report.aiRequests.filter((r) => r.name === 'weekly-letter-delivered-once-with-mailbox-flag');
    assert.equal(reqs.length, 1);
    const prompt = JSON.stringify(reqs[0].body.messages);
    assert.ok(!prompt.includes('秘密待办内容'), 'no task text in the prompt'); assert.match(prompt, /focusMinutes/); assert.match(prompt, /测试唱片/); assert.match(prompt, /feeds\\+":1/); assert.match(prompt, /平静/);
    await openWeekly(page);
    const spot = letterSpot(page); await spot.waitFor();
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '1');
    await spot.getByRole('button', { name: /拆开看看/ }).waitFor();
    await shot(page, 'letter-sealed-mailbox-flag');
    await spot.getByRole('button', { name: /拆开看看/ }).click();
    await spot.getByText('唱片一直在转，我也一直在。').waitFor();
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '0');
    assert.match(await spot.innerText(), /AI/);
    await shot(page, 'letter-open');
    await page.reload(); await page.locator('.focus-badge').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    assert.equal(report.aiRequests.filter((r) => r.name === 'weekly-letter-delivered-once-with-mailbox-flag').length, 1, 'one letter per period');
  }, { ai: { enabled: true, baseUrl: API, model: 'm', cadence: 'weekly', tone: 'calm' } });

  await run('failure-falls-back-to-template-letter', async (page) => {
    await page.waitForFunction(() => localStorage.getItem('flow-cabin-letter-try-v1'), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]').length), 0);
    await openWeekly(page);
    const spot = letterSpot(page); await spot.waitFor();
    assert.equal(await spot.getAttribute('class').then((c) => c.includes('is-template')), true);
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '0');
    await shot(page, 'letter-fallback-template');
  }, { ai: { enabled: true, baseUrl: API, model: 'm' }, mode: () => ({ status: 500 }) });

  await run('ai-off-sends-nothing', async (page) => {
    await page.waitForTimeout(2500);
    assert.equal(report.aiRequests.filter((r) => r.name === 'ai-off-sends-nothing').length, 0);
    await openWeekly(page); await letterSpot(page).waitFor();
    assert.ok((await letterSpot(page).getAttribute('class')).includes('is-template'));
  }, { ai: { enabled: false, baseUrl: API, model: 'm' } });

  await run('desktop-routes-through-shell-and-keeps-no-key', async (page) => {
    await page.waitForFunction(() => window.__nativeCommands.some((u) => u.includes('/ai-chat')), null, { timeout: 15000 });
    const cmd = new URL(await page.evaluate(() => window.__nativeCommands.find((u) => u.includes('/ai-chat'))));
    assert.equal(cmd.searchParams.get('url'), `${API}/chat/completions`); assert.ok(!cmd.href.includes(KEY));
    assert.equal(report.aiRequests.filter((r) => r.name === 'desktop-routes-through-shell-and-keeps-no-key').length, 0, 'page never fetches the endpoint itself');
    await page.evaluate(({ id, text }) => window.dispatchEvent(new CustomEvent('cabin:ai-result', { detail: { id, ok: true, text } })), { id: cmd.searchParams.get('id'), text: LETTER });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]').length === 1);
    // Saving a key in the desktop app hands it to the shell; localStorage never holds it.
    await openAi(page);
    const region = page.getByRole('region', { name: 'AI（Beta）' });
    await region.getByLabel('API Key').fill('sk-new-desktop-key-999999'); await region.getByLabel('模型').click();
    await page.waitForFunction(() => window.__nativeCommands.some((u) => u.includes('/ai-key')));
    assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-ai-key-v1')), null);
    await region.getByText('safeStorage').waitFor();
    await shot(page, 'ai-settings-desktop');
  }, { desktop: true, ai: { enabled: true, baseUrl: API, model: 'm', cadence: 'daily' } });

  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []);
  if (report.checks.some((x) => !x.passed)) process.exitCode = 1;
} finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
