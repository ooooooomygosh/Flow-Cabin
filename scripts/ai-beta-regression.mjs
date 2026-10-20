/** AI（Beta）+ 小屋来信 browser regression. The OpenAI-compatible endpoint is mocked; nothing leaves the machine. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { chatUrl } from '../src/ai/ai-model.mjs';
import { onboardingSeed } from './app-version.mjs';
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
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (b) => log += b); server.stderr.on('data', (b) => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 150) throw new Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium();
  const run = async (name, test, { desktop = false, ai = null, mode = () => ({ status: 200 }) } = {}) => {
    if (process.env.AI_FILTER && !name.includes(process.env.AI_FILTER)) return;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce', ...(process.env.AI_TIMEZONE ? { timezoneId: process.env.AI_TIMEZONE } : {}) });
    await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
    await context.addInitScript(({ FOCUS, desktop, ai, KEY, endpoint }) => {
      if (location.origin === 'null' || sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
      localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: false }));
      // Seed the browser's actual reporting period. Daily letters need yesterday,
      // not last week's weekend (those coincide only on Monday).
      const daily = ai?.cadence === 'daily', base = new Date();
      base.setHours(10, 0, 0, 0);
      base.setDate(base.getDate() - (daily ? 1 : (base.getDay() + 6) % 7 + 3));
      const sessions = [0, 1, 2].map((i) => {
        const date = new Date(base);
        if (daily) date.setHours(10 + i * 2);
        else date.setDate(date.getDate() + i);
        const start = date.getTime();
        return { id: `s${i}`, start, end: start + 75 * 60000, durationMs: 75 * 60000, completed: true, taskText: '秘密待办内容', album: { key: 'a1', title: '测试唱片', artist: '离线测试' } };
      });
      localStorage.setItem('flow-cabin-focus-sessions-v1', JSON.stringify(sessions));
      localStorage.setItem(FOCUS, JSON.stringify({ settings: { focusMin: 25, shortMin: 5, notify: false, chime: false } }));
      localStorage.setItem('flow-cabin-cat-mood-v1', JSON.stringify({ v: 1, mood: 80, tier: 'happy', updatedAt: Date.now(), feeds: [{ at: sessions[0].start + 3600000, fishLeft: 2 }], totalFeeds: 1, unlockedActions: [] }));
      if (ai) { localStorage.setItem('flow-cabin-ai-v1', JSON.stringify({ v: 1, ...ai })); if (!desktop) localStorage.setItem('flow-cabin-ai-key-v1', JSON.stringify({ v: 2, key: KEY, endpoint, revision: 'fixture:1' })); }
      window.__nativeCommands = [];
      if (desktop) {
        window.cabinAiKey = { stored: true, secure: true, endpoint, revision: 1 };
        window.open = (url) => { window.__nativeCommands.push(String(url)); return null; };
        const init = () => { document.documentElement.dataset.desktopClient = 'true'; };
        if (document.documentElement) init(); else new MutationObserver((_, o) => { if (document.documentElement) { init(); o.disconnect(); } }).observe(document, { childList: true });
      }
    }, { FOCUS, desktop, ai, KEY, endpoint: ai ? chatUrl(ai.baseUrl) : '' });
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
  const openLetters = (page) => page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'letters' } })));
  const letterSpot = (page) => page.locator('.cabin-journal .fs-letter');

  await run('settings-off-by-default-and-test-connection', async (page) => {
    await openAi(page);
    const region = page.getByRole('region', { name: 'AI（Beta）' });
    assert.equal(await region.getByRole('checkbox', { name: '启用 AI（Beta）' }).isChecked(), false);
    assert.equal(await region.getByRole('button', { name: '测试连接' }).isDisabled(), true);
    assert.equal(await region.getByLabel('AI 服务').inputValue(), 'deepseek');
    assert.equal(await region.getByLabel('接口地址').inputValue(), 'https://api.deepseek.com/v1');
    assert.equal(await region.getByLabel('模型').inputValue(), 'deepseek-flash');
    assert.equal(await region.getByLabel('接口地址').getAttribute('readonly'), '');
    await shot(page, 'ai-settings-off');
    await region.getByRole('checkbox', { name: '启用 AI（Beta）' }).check();
    await region.getByLabel('AI 服务').selectOption('ollama');
    assert.equal(await region.getByLabel('接口地址').inputValue(), 'http://127.0.0.1:11434/v1');
    assert.equal(await region.getByLabel('模型').inputValue(), 'qwen3:8b');
    assert.equal(await region.getByLabel('API Key').count(), 0, 'local Ollama needs no key');
    await region.getByLabel('AI 服务').selectOption('openai');
    assert.equal(await region.getByLabel('接口地址').inputValue(), 'https://api.openai.com/v1');
    assert.equal(await region.getByLabel('模型').inputValue(), 'gpt-4.1-mini');
    await region.getByLabel('AI 服务').selectOption('codex');
    assert.equal(await region.getByLabel('接口地址').count(), 0);
    assert.equal(await region.getByLabel('模型').count(), 0);
    await region.getByText('本机 Codex CLI 只在桌面版可用。网页版请选择其他模板。', { exact: true }).waitFor();
    await region.getByLabel('AI 服务').selectOption('custom');
    await region.getByLabel('接口地址').fill(`${API}/v1`);
    await region.getByLabel('API Key').fill(KEY);
    await region.getByLabel('模型').fill('deepseek-flash');
    await region.getByRole('radio', { name: '俏皮' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-ai-key-v1')), null, 'blur does not save a key');
    await region.getByRole('button', { name: '保存 Key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ai-settings input[type="password"]')?.value === '');
    await region.getByRole('button', { name: '测试连接' }).click();
    await region.getByText('连接成功').waitFor();
    const req = report.aiRequests.filter((r) => r.name === 'settings-off-by-default-and-test-connection');
    assert.equal(req.length, 1); assert.equal(req[0].path, '/v1/chat/completions'); assert.ok(req[0].auth); assert.equal(req[0].body.model, 'deepseek-flash');
    const stored = await page.evaluate(() => ({ s: localStorage.getItem('flow-cabin-ai-v1'), k: localStorage.getItem('flow-cabin-ai-key-v1') }));
    assert.ok(!stored.s.includes(KEY));
    const credential = JSON.parse(stored.k);
    assert.equal(credential.v, 2); assert.equal(credential.key, KEY);
    assert.equal(credential.endpoint, `${API}/v1/chat/completions`); assert.ok(credential.revision);
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

  await run('failure-still-delivers-a-local-letter', async (page) => {
    await page.waitForFunction(() => {
      const list = JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]');
      return list.length === 1 && list[0].source === 'template';
    }, null, { timeout: 15000 });
    assert.ok(await page.evaluate(() => localStorage.getItem('flow-cabin-letter-try-v1')), 'the failed AI try is recorded');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1')));
    assert.equal(saved[0].direction, 'in'); assert.equal(saved[0].status, 'delivered');
    assert.equal(saved[0].source, 'template'); assert.equal(saved[0].read, false);
    assert.ok(saved[0].evidence.some((item) => item.kind === 'focus'));
    await openWeekly(page);
    const spot = letterSpot(page); await spot.waitFor();
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '1');
    assert.doesNotMatch(await spot.locator('.fs-letter-head').innerText(), /AI/);
    await spot.getByRole('button', { name: /拆开看看/ }).click();
    await spot.getByText(/这一段时间，你在小屋里专注了 225 分钟/).waitFor();
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '0');
    await shot(page, 'letter-fallback-local');
  }, { ai: { enabled: true, baseUrl: API, model: 'm' }, mode: () => ({ status: 500 }) });

  await run('ai-off-still-delivers-a-local-letter', async (page) => {
    await page.waitForFunction(() => {
      const list = JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]');
      return list.length === 1 && list[0].source === 'template';
    }, null, { timeout: 15000 });
    assert.equal(report.aiRequests.filter((r) => r.name === 'ai-off-still-delivers-a-local-letter').length, 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-letter-try-v1')), null, 'AI off is not treated as a failed request');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1')));
    assert.equal(saved[0].direction, 'in'); assert.equal(saved[0].source, 'template');
    assert.equal(saved[0].read, false); assert.ok(saved[0].evidence.length > 0);
    await openWeekly(page);
    const spot = letterSpot(page); await spot.waitFor();
    assert.equal(await spot.locator('.fs-mailbox').getAttribute('data-unread'), '1');
    assert.doesNotMatch(await spot.locator('.fs-letter-head').innerText(), /AI/);
    await page.getByRole('tab', { name: /信箱/ }).click();
    const mailbox = page.getByRole('tabpanel', { name: '信箱' }); await mailbox.waitFor();
    await mailbox.getByText('小屋亲笔').waitFor();
    assert.equal(await mailbox.locator('.fs-mail-paper.is-ai').count(), 0);
    await shot(page, 'letter-ai-off-local-mailbox');
  }, { ai: { enabled: false, baseUrl: API, model: 'm' } });

  await run('letter-draft-survives-immediate-close-and-sends-local-reply', async (page) => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]').length === 1, null, { timeout: 15000 });
    await openLetters(page);
    const journal = page.getByRole('dialog', { name: '小屋日记' });
    const mailbox = journal.getByRole('tabpanel', { name: '信箱' });
    await mailbox.getByRole('button', { name: '写一封信' }).click();
    const editor = mailbox.getByLabel('写给小屋的信');
    const body = ['第一行先不急着寄。', '第二行留到回来。', ...Array.from({ length: 12 }, (_, index) => `第 ${index + 3} 行也留着。`)].join('\n');
    await editor.fill(body);
    assert.equal(await editor.getAttribute('maxlength'), '2880');
    const paint = await editor.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, fontSize: parseFloat(style.fontSize) };
    });
    const channels = (value) => (value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
    assert.ok(Math.min(...channels(paint.background)) >= 180, `textarea remains light: ${paint.background}`);
    assert.ok(Math.max(...channels(paint.color)) <= 100, `textarea ink remains dark: ${paint.color}`);
    assert.ok(paint.fontSize >= 12, `textarea text is at least 12px: ${paint.fontSize}`);
    const context = mailbox.getByRole('checkbox', { name: /让奶糖了解最近的小屋/ });
    assert.equal(await context.isChecked(), true);
    await context.uncheck();
    // Close the composer and the whole book immediately: the draft must already be on disk.
    await mailbox.getByRole('button', { name: '收进抽屉' }).click();
    const savedDraft = await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1')).find((letter) => letter.status === 'draft'));
    assert.equal(savedDraft.lines.length, 14, 'the draft keeps more than twelve user-authored lines');
    assert.equal(savedDraft.lines.join('\n'), body); assert.equal(savedDraft.shareContext, false);
    await journal.getByRole('button', { name: '返回小屋' }).click();
    await journal.waitFor({ state: 'hidden' });
    await openLetters(page);
    await journal.waitFor();
    const restored = journal.getByRole('tabpanel', { name: '信箱' });
    await restored.getByLabel('写给小屋的信').waitFor();
    assert.equal(await restored.getByLabel('写给小屋的信').inputValue(), body);
    assert.equal(await restored.getByRole('checkbox', { name: /让奶糖了解最近的小屋/ }).isChecked(), false, 'shareContext stays off after reopening');
    assert.match(await restored.innerText(), /草稿已从抽屉里接上|接着上次没写完的话/);
    await restored.getByRole('button', { name: '寄给小屋' }).click();
    const reply = restored.getByRole('region', { name: '小屋回信' });
    await reply.waitFor({ timeout: 10000 });
    assert.match(await restored.locator('.fs-mail-thread-head').innerText(), /我寄出的信|已寄出/);
    assert.match(await restored.locator('.fs-mail-thread > .fs-mail-paper').first().innerText(), /第一行先不急着寄/);
    assert.match(await reply.innerText(), /我把你的信读完了/);
    assert.match(await reply.innerText(), /第一行先不急着寄/);
    assert.equal(await restored.locator('.fs-mail-toast.is-error').count(), 0, 'a normal local reply is not an error state');
    assert.equal(await restored.locator('.fs-mail-error').count(), 0);
    const final = await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1')));
    const outgoing = final.find((letter) => letter.direction === 'out' && letter.status === 'sent');
    const localReply = final.find((letter) => letter.replyTo === outgoing?.id);
    assert.equal(outgoing.lines.length, 14); assert.equal(outgoing.shareContext, false); assert.equal(localReply.source, 'template');
    assert.equal(final.some((letter) => letter.status === 'draft'), false, 'sending clears only the saved draft after success');
    await shot(page, 'letter-sent-with-local-reply');
  }, { ai: { enabled: false, baseUrl: API, model: 'm' } });

  await run('journal-excerpts-require-per-letter-selection-and-never-send-unselected-pages', async (page) => {
    const journalKey = 'flow-cabin-journal-v1', text = '只想聊聊主动附上的这一页。';
    const body = '附上的一页\n' + '今天给自己留了一点安静的时间。'.repeat(30) + 'EXCLUDED_TAIL';
    await page.evaluate(({ journalKey, body }) => {
      localStorage.setItem(journalKey, JSON.stringify([
        { id: 'selected-page', version: 'v1', createdAt: Date.now(), updatedAt: Date.now(), body, tags: [], revisions: [] },
        { id: 'unselected-page', version: 'v1', createdAt: Date.now(), updatedAt: Date.now(), body: 'PRIVATE_UNSELECTED_PAGE', tags: [], revisions: [] }
      ]));
    }, { journalKey, body });
    await openLetters(page);
    const mailbox = page.getByRole('tabpanel', { name: '信箱' });
    await mailbox.getByRole('button', { name: '写一封信', exact: true }).click();
    await mailbox.getByLabel('写给小屋的信').fill(text);
    const picker = mailbox.locator('.fs-mail-journal-picker');
    await picker.locator('summary').click();
    const choice = picker.getByRole('checkbox', { name: '附上的一页', exact: true });
    assert.equal(await choice.isChecked(), false);
    await choice.check();
    assert.equal(await picker.getByRole('region', { name: '本次附上的手记摘录' }).locator('article p').innerText(), body.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 240));
    await mailbox.getByRole('button', { name: '收进抽屉', exact: true }).click();
    await mailbox.getByRole('button', { name: '写一封信', exact: true }).click();
    await picker.locator('summary').click();
    assert.equal(await choice.isChecked(), false, 'reopening a draft does not revive private attachments');
    await choice.check();
    await page.evaluate((journalKey) => {
      const records = JSON.parse(localStorage.getItem(journalKey));
      records[0].version = 'v2';
      records[0].body += '\n后来修改过。';
      localStorage.setItem(journalKey, JSON.stringify(records));
      window.dispatchEvent(new Event('cabin:journal-entries'));
    }, journalKey);
    await mailbox.getByRole('button', { name: '寄给小屋', exact: true }).click();
    await mailbox.locator('.fs-mail-toast.is-error', { hasText: '重新选择' }).waitFor();
    assert.equal(report.aiRequests.some((request) => request.name.startsWith('journal-excerpts') && JSON.stringify(request.body.messages).includes(text)), false);
    await choice.uncheck(); await choice.check();
    await mailbox.getByRole('checkbox', { name: /让奶糖了解最近的小屋/ }).uncheck();
    await mailbox.getByRole('checkbox', { name: /让奶糖了解最近的小屋/ }).check();
    await picker.locator('summary').click();
    assert.equal(await choice.isChecked(), false, 'turning context off clears selected excerpts');
    await choice.check();
    await page.setViewportSize({ width: 960, height: 600 });
    await picker.getByRole('region', { name: '本次附上的手记摘录' }).scrollIntoViewIfNeeded();
    await shot(page, 'selected-journal-excerpt-960');
    await mailbox.getByRole('button', { name: '寄给小屋', exact: true }).click();
    await mailbox.getByRole('region', { name: '小屋回信' }).waitFor();
    const request = report.aiRequests.findLast((item) => item.name.startsWith('journal-excerpts') && JSON.stringify(item.body.messages).includes(text));
    assert.ok(request);
    const payload = JSON.stringify(request.body.messages);
    assert.ok(payload.includes('附上的一页'));
    assert.equal(payload.includes('PRIVATE_UNSELECTED_PAGE'), false);
    assert.equal(payload.includes('EXCLUDED_TAIL'), false);
    assert.equal(payload.includes('后来修改过'), false);
    assert.equal(payload.includes('selected-page'), false, 'internal entry identifiers are not transmitted');
  }, { ai: { enabled: true, baseUrl: API, model: 'm' } });

  await run('mailbox-search-favorites-and-trash-survive-reload', async (page) => {
    await openLetters(page);
    let mailbox = page.getByRole('tabpanel', { name: '信箱' });
    await mailbox.getByRole('button', { name: '写一封信' }).click();
    await mailbox.getByLabel('写给小屋的信').fill('今天把窗边的绿植照顾好了。');
    await mailbox.getByRole('button', { name: '寄给小屋' }).click();
    await mailbox.getByRole('region', { name: '小屋回信' }).waitFor();
    await mailbox.getByRole('button', { name: '收藏这封信', exact: true }).click();
    await mailbox.getByRole('button', { name: '收藏', exact: true }).click();
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 1);
    await mailbox.getByLabel('搜索信件').fill('我把你的信读完了');
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 1, 'reply text is searchable');
    await mailbox.getByLabel('搜索信件').fill('不存在的信件词');
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 0);
    await mailbox.getByLabel('搜索信件').fill('');
    await mailbox.getByRole('button', { name: '移到回收站', exact: true }).click();
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 0);
    await page.reload(); await page.locator('.focus-badge').waitFor(); await openLetters(page);
    mailbox = page.getByRole('tabpanel', { name: '信箱' });
    await mailbox.getByRole('button', { name: '回收站', exact: true }).click();
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 1);
    await mailbox.getByRole('region', { name: '小屋回信' }).waitFor();
    assert.equal(await mailbox.getByRole('button', { name: '已收藏', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 600 }]) {
      await page.setViewportSize(viewport);
      const restore = mailbox.getByRole('button', { name: '放回信箱', exact: true });
      await restore.scrollIntoViewIfNeeded();
      const box = await restore.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      await shot(page, `mailbox-organized-${viewport.width}`);
    }
    await mailbox.getByRole('button', { name: '放回信箱', exact: true }).click();
    await mailbox.getByRole('button', { name: '收藏', exact: true }).click();
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 1);
    await mailbox.getByRole('button', { name: '已收藏', exact: true }).click();
    assert.equal(await mailbox.locator('.fs-mail-list li').count(), 0);
    await mailbox.getByRole('button', { name: '来信', exact: true }).click();
    await mailbox.locator('.fs-mail-list li').first().waitFor();
    await mailbox.getByRole('button', { name: '移到回收站', exact: true }).click();
    await page.getByRole('tab', { name: '周报', exact: true }).click();
    assert.equal(await page.locator('.fs-letter.is-ai').count(), 0, 'removed incoming letters also disappear from the weekly letter spot');
  }, { ai: { enabled: false, baseUrl: API, model: 'm' } });

  await run('interrupted-ai-local-letter-reply-can-be-recovered', async (page) => {
    await openLetters(page);
    const journal = page.getByRole('dialog', { name: '小屋日记' });
    const mailbox = journal.getByRole('tabpanel', { name: '信箱' });
    await mailbox.getByRole('button', { name: '写一封信' }).click();
    const body = '网络断开时也要留住这封信。';
    await mailbox.getByLabel('写给小屋的信').fill(body);
    await mailbox.getByRole('button', { name: '寄给小屋' }).click();
    await page.waitForFunction((text) => {
      const list = JSON.parse(localStorage.getItem('flow-cabin-letters-v1') || '[]');
      return list.some((letter) => letter.direction === 'out' && letter.status === 'sending' && letter.lines.join('\n') === text);
    }, body);
    const requestCount = () => report.aiRequests.filter((r) => r.name === 'interrupted-ai-local-letter-reply-can-be-recovered' && JSON.stringify(r.body.messages).includes(body)).length;
    for (let i = 0; i < 20 && requestCount() === 0; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(requestCount(), 1);
    await page.reload(); await page.locator('.focus-badge').waitFor({ timeout: 30000 });
    await openLetters(page);
    const restored = page.getByRole('dialog', { name: '小屋日记' }).getByRole('tabpanel', { name: '信箱' });
    await restored.getByLabel('写给小屋的信').waitFor();
    await restored.getByRole('button', { name: '收进抽屉' }).click();
    await restored.getByRole('button', { name: '用本地回信接上' }).waitFor();
    await restored.getByRole('button', { name: '用本地回信接上' }).click();
    const reply = restored.getByRole('region', { name: '小屋回信' });
    await reply.waitFor();
    assert.match(await reply.innerText(), /我把你的信读完了/);
    assert.match(await restored.locator('.fs-mail-toast').innerText(), /小屋已接上这封回信/);
    assert.equal(await restored.locator('.fs-mail-toast.is-error').count(), 0);
    assert.equal(requestCount(), 1, 'local recovery never resends the private letter');
    const final = await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-letters-v1')));
    const outgoing = final.filter((letter) => letter.direction === 'out' && letter.status === 'sent' && letter.lines.join('\n') === body);
    assert.equal(outgoing.length, 1); assert.equal(outgoing[0].status, 'sent');
    assert.equal(final.filter((letter) => letter.replyTo === outgoing[0].id).length, 1);
    assert.equal(final.some((letter) => letter.status === 'draft'), false, 'local recovery clears the matching saved draft');
    assert.equal(await restored.locator('.fs-mail-draft').count(), 0, 'recovered letter no longer appears as an unfinished draft');
    await shot(page, 'letter-interrupted-local-recovery');
  }, { ai: { enabled: true, baseUrl: API, model: 'm' }, mode: () => ({ hang: true }) });

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
    assert.equal(await page.evaluate(() => window.__nativeCommands.some((u) => u.includes('/ai-key'))), false, 'blur does not send a key to the shell');
    await region.getByRole('button', { name: '保存 Key', exact: true }).click();
    await page.waitForFunction(() => window.__nativeCommands.some((u) => u.includes('/ai-key')));
    const save = new URL(await page.evaluate(() => window.__nativeCommands.find((u) => u.includes('/ai-key'))));
    assert.equal(save.searchParams.get('key'), 'sk-new-desktop-key-999999');
    assert.equal(save.searchParams.get('endpoint'), `${API}/chat/completions`);
    assert.equal(await region.getByLabel('API Key').inputValue(), 'sk-new-desktop-key-999999', 'keep the draft until the shell confirms saving');
    await page.evaluate((endpoint) => {
      window.cabinAiKey = { stored: true, secure: true, endpoint, revision: window.cabinAiKey.revision + 1 };
      window.dispatchEvent(new CustomEvent('cabin:ai-key', { detail: window.cabinAiKey }));
    }, save.searchParams.get('endpoint'));
    await page.waitForFunction(() => document.querySelector('.ai-settings input[type="password"]')?.value === '');
    assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-ai-key-v1')), null);
    await region.getByText('Key 用系统加密，只存在这台电脑上，请求由桌面版发出。', { exact: true }).waitFor();
    await shot(page, 'ai-settings-desktop');
  }, { desktop: true, ai: { enabled: true, baseUrl: API, model: 'm', cadence: 'daily' } });

  await run('desktop-codex-template-runs-through-cli-without-a-key', async (page) => {
    await openAi(page);
    const region = page.getByRole('region', { name: 'AI（Beta）' });
    await region.getByRole('checkbox', { name: '启用 AI（Beta）' }).check();
    await region.getByLabel('AI 服务').selectOption('codex');
    await region.getByText('只读取最后一条回答，不保存思考过程、工具输出或会话文件。', { exact: false }).waitFor();
    await region.getByRole('button', { name: '测试连接' }).click();
    await page.waitForFunction(() => window.__nativeCommands.some((u) => u.includes('/ai-chat-cli')), null, { timeout: 15000 });
    const command = new URL(await page.evaluate(() => window.__nativeCommands.find((u) => u.includes('/ai-chat-cli'))));
    const body = JSON.parse(command.searchParams.get('body'));
    assert.match(JSON.stringify(body.messages), /回复「好」一个字/);
    assert.ok(!command.href.includes('sk-'));
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent('cabin:ai-result', { detail: { id, ok: true, text: '好' } })), command.searchParams.get('id'));
    await region.getByText(/连接成功：本机 Codex CLI 回复了「好」/).waitFor();
    await shot(page, 'ai-settings-codex');
  }, { desktop: true, ai: { enabled: false, provider: 'codex', baseUrl: '', model: '', cadence: 'weekly' } });

  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []);
  if (report.checks.some((x) => !x.passed)) process.exitCode = 1;
} finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
