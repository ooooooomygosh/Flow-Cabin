/**
 * Focused Smart Turntable browser regression.
 * The OpenAI-compatible endpoint and local audio source are fixtures; no real
 * account, network request or user collection is used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { chatUrl } from '../src/ai/ai-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SMART_TURNTABLE_OUTPUT || path.join(root, 'desktop/test-results/smart-turntable');
const port = Number(process.env.SMART_TURNTABLE_PORT || 4199), origin = `http://127.0.0.1:${port}`;
const apiBase = 'https://api.mock-ai.test/v1', apiOrigin = new URL(apiBase).origin, key = 'sk-smart-turntable-SECRET';
const focusKey = 'album-circle-focus-v1:local-owner';
const queueKey = 'album-circle-player-queue-v1';
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#34545a"/><circle cx="48" cy="48" r="28" fill="#e6b36f"/><circle cx="48" cy="48" r="8" fill="#243438"/></svg>')}`;

const track = (providerId) => ({ title: '第一首', source: 'local', providerId, lengthMillis: 180000 });
const items = [
  { id: 'smart-main', type: 'album', title: '晨间书桌', artist: '小屋乐队', cover, tracks: ['第一首'], trackDetails: [track('2222222222222222')] },
  { id: 'smart-second', type: 'album', title: '雨窗练习', artist: '林间', cover, tracks: ['第一首'], trackDetails: [track('1111111111111111')] },
  { id: 'smart-third', type: 'album', title: '夜灯余白', artist: 'Lo-fi Cat', cover, tracks: ['第一首'], trackDetails: [track('3333333333333333')] },
  { id: 'smart-fourth', type: 'album', title: '没有被选中的唱片', artist: 'Fixture Artist', cover, tracks: ['第一首'], trackDetails: [track('4444444444444444')] },
  { id: 'old-queued', type: 'album', title: '旧待播唱片', artist: 'Fixture Artist', cover, tracks: ['第一首'], trackDetails: [track('5555555555555555')] }
];

const wav = Buffer.alloc(44 + 22050 * 2 * 8);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let index = 0; index < (wav.length - 44) / 2; index++) {
  wav.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 220 / 22050) * 1200), 44 + index * 2);
}

const report = { fixtureData: true, nativeIntegrationTested: false, checks: [], aiRequests: [], pageErrors: [], unexpectedRequests: [] };
await fs.mkdir(output, { recursive: true });

let browser, server;
const screenshot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const smartRequestsFor = (name) => report.aiRequests.filter((entry) => entry.name === name);

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt > 150) throw new Error(serverLog || 'Vite failed to start');
    if (hasViteLocalOrigin(serverLog, origin) && await fetch(origin).then((response) => response.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await launchChromium();

  const run = async (name, { autoplay, albumIds }, test) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(({ apiBase, apiOrigin, key, focusKey, queueKey }) => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.0' }));
      localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: false }));
      localStorage.setItem('album-circle-room-player-v1', 'local');
      localStorage.setItem(queueKey, JSON.stringify({ ids: ['old-queued'], repeat: 'one', shuffle: true }));
      localStorage.setItem('flow-cabin-ai-v1', JSON.stringify({ v: 1, enabled: true, baseUrl: apiBase, model: 'mock-model', cadence: 'daily', tone: 'warm', shareNotes: false }));
      localStorage.setItem('flow-cabin-ai-key-v1', JSON.stringify({ v: 2, key, endpoint: `${apiOrigin}/v1/chat/completions`, revision: 'smart-fixture:1' }));
      // Prevent an unrelated weekly/daily letter request from sharing this regression.
      localStorage.setItem('flow-cabin-letter-try-v1', JSON.stringify({ id: `d:${day}`, at: Date.now() }));
      localStorage.setItem(focusKey, JSON.stringify({ settings: { focusMin: 25, shortMin: 5, notify: false, chime: false } }));
    }, { apiBase, apiOrigin, key, focusKey, queueKey });

    const plan = {
      minutes: 50,
      activity: 'study',
      albumIds,
      autoplay,
      reason: autoplay ? '从雨窗渐入，再由书桌与夜灯接住专注。' : '先把三张唱片排好，等你准备好再开始。'
    };

    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === apiOrigin) {
        const cors = {
          'access-control-allow-origin': origin,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'POST'
        };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const body = request.postDataJSON();
        const isSmart = String(body?.messages?.[0]?.content || '').includes('智能唱片机');
        if (isSmart) report.aiRequests.push({ name, body, auth: request.headers().authorization === `Bearer ${key}` });
        return route.fulfill({
          status: 200,
          headers: cors,
          json: { choices: [{ message: { role: 'assistant', content: isSmart ? JSON.stringify(plan) : '好' } }] }
        });
      }
      if (url.origin !== origin) {
        report.unexpectedRequests.push(url.href);
        return route.abort('blockedbyclient');
      }
      const pathname = url.pathname;
      if (pathname === '/api/items') return route.fulfill({ json: { items } });
      if (pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
      if (pathname === '/desktop-music/now-playing' || pathname === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
      if (pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: items.length, trackCount: items.length } });
      if (pathname === '/desktop-music/resolve') return route.fulfill({ json: { audioPath: `/desktop-music/local/audio/${request.postDataJSON().id}`, trial: false } });
      if (pathname.startsWith('/desktop-music/local/audio/')) {
        return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'accept-ranges': 'bytes' } });
      }
      if (pathname.startsWith('/api/') || pathname.startsWith('/desktop-music/')) {
        report.unexpectedRequests.push(pathname);
        return route.fulfill({ status: 404, json: { error: `Unimplemented fixture ${pathname}` } });
      }
      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => report.pageErrors.push(`${name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') report.pageErrors.push(`${name}: console: ${message.text()}`);
      if (message.text().includes(key)) report.pageErrors.push(`${name}: API key leaked to console`);
    });

    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('.room-record').first().waitFor({ timeout: 30000 });
      await page.locator('.focus-badge').waitFor();
      await test(page);
      report.checks.push({ name, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      report.checks.push({ name, passed: false, error: error.stack || String(error) });
      console.error(`FAIL ${name}: ${error.message}`);
      await screenshot(page, `${name}-failure`).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  };

  const openSmart = async (page) => {
    await page.getByRole('button', { name: '智能唱片机', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '智能唱片机', exact: true });
    await dialog.waitFor();
    return dialog;
  };

  const ask = async (page, dialog, prompt) => {
    await dialog.getByLabel('告诉小屋你的计划').fill(prompt);
    await dialog.getByRole('button', { name: '让小屋推荐唱片', exact: true }).click();
    await dialog.locator('.st-result').waitFor();
  };

  const queueTitles = async (page) => {
    await page.getByRole('button', { name: /待播唱片 2 张/ }).click();
    const panel = page.getByRole('region', { name: '待播唱片', exact: true });
    await panel.waitFor();
    return panel.locator('.player-queue-albums li strong').allInnerTexts();
  };

  await run('formatted-ai-order-filter-queue-and-autoplay', {
    autoplay: true,
    albumIds: ['smart-second', 'ghost-album', 'smart-main', 'smart-second', 'smart-third', 'smart-fourth']
  }, async (page) => {
    const dialog = await openSmart(page);
    await ask(page, dialog, '我要学习五十分钟，帮我搭配音乐');

    const requests = smartRequestsFor('formatted-ai-order-filter-queue-and-autoplay');
    assert.equal(requests.length, 1, 'one Smart Turntable request');
    const { body, auth } = requests[0];
    assert.equal(auth, true, 'the mock endpoint received the configured key');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.temperature, 0.2);
    assert.equal(body.max_tokens, 420);
    assert.match(body.messages[0].content, /只输出一个严格 JSON 对象/);
    const userPayload = JSON.parse(body.messages[1].content);
    assert.equal(userPayload.constraints.minutes, 50);
    assert.equal(userPayload.constraints.activity, 'study');
    assert.deepEqual(userPayload.albums.map((album) => album.id), items.map((album) => album.id));
    assert.equal(JSON.stringify(userPayload).includes('ghost-album'), false, 'the fake id was never in the prompt');

    assert.deepEqual(await dialog.locator('.st-album-title').allInnerTexts(), ['雨窗练习', '晨间书桌', '夜灯余白']);
    assert.equal(await dialog.locator('.st-album').count(), 3, 'the invented id and duplicate were filtered');
    const summary = await dialog.locator('.st-summary').innerText();
    assert.match(summary, /50 分钟/);
    assert.match(summary, /学习/);
    assert.match(summary, /开始即播放/);
    assert.match(summary, /AI 推荐/);
    await dialog.getByText('AI 从你的唱片架里挑好了。', { exact: true }).waitFor();
    await screenshot(page, 'formatted-plan-preview');

    await dialog.getByRole('button', { name: '开始学习并播放', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.loadedId === 'smart-second');
    assert.equal(await page.locator('.room-turntable').getAttribute('data-provider'), 'local');
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio[data-deck="active"]');
      return audio && audio.src.endsWith('/desktop-music/local/audio/1111111111111111') && !audio.paused && audio.currentTime > 0.1;
    }, null, { timeout: 20000 });
    assert.equal(await page.getByRole('button', { name: '暂停音乐播放', exact: true }).count(), 1);
    assert.match(await page.locator('.turntable-status').innerText(), /正在播放本地文件/);
    assert.deepEqual(await queueTitles(page), ['晨间书桌', '夜灯余白']);
    const queue = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || '{}'), queueKey);
    assert.deepEqual(queue.ids, ['smart-main', 'smart-third'], 'session queue replaced old entries and excludes the first pick');
    assert.equal(queue.repeat, 'off', 'a new ordered session clears repeat-one');
    assert.equal(queue.shuffle, false, 'a new ordered session clears shuffle');
    const focus = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || '{}'), focusKey);
    assert.equal(focus.settings.focusMin, 50);
    assert.equal(focus.timer.phase, 'focus');
    assert.equal(focus.timer.duration, 50 * 60000);
    await screenshot(page, 'formatted-plan-playing');
  });

  await run('autoplay-false-loads-record-without-audio', {
    autoplay: false,
    albumIds: ['smart-third', 'ghost-album', 'smart-main', 'smart-second', 'smart-main']
  }, async (page) => {
    const dialog = await openSmart(page);
    await ask(page, dialog, '我要学习五十分钟');
    assert.deepEqual(await dialog.locator('.st-album-title').allInnerTexts(), ['夜灯余白', '晨间书桌', '雨窗练习']);
    assert.match(await dialog.locator('.st-summary').innerText(), /先不播放/);
    await screenshot(page, 'autoplay-false-preview');

    await dialog.getByRole('button', { name: '开始学习并放上唱片', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.loadedId === 'smart-third');
    await page.waitForTimeout(350);
    assert.equal(await page.getByRole('button', { name: '播放音乐', exact: true }).count(), 1);
    assert.match(await page.locator('.turntable-status').innerText(), /待播放/);
    const paused = await page.evaluate(() => {
      const audio = document.querySelector('audio[data-deck="active"]');
      return { paused: audio?.paused !== false, src: audio?.getAttribute('src') || '' };
    });
    assert.equal(paused.paused, true, 'no audio starts before the user presses play');
    assert.equal(paused.src, '', 'the record is held before source resolution');
    assert.deepEqual(await queueTitles(page), ['晨间书桌', '雨窗练习']);
    await screenshot(page, 'autoplay-false-held');

    await page.getByRole('button', { name: '播放音乐', exact: true }).click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio[data-deck="active"]');
      return audio && audio.src.endsWith('/desktop-music/local/audio/3333333333333333') && !audio.paused && audio.currentTime > 0.1;
    }, null, { timeout: 20000 });
    assert.equal(await page.getByRole('button', { name: '暂停音乐播放', exact: true }).count(), 1);
  });

  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  server?.kill();
  console.log(`Report: ${path.join(output, 'report.json')}`);
}
