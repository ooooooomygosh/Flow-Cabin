/** Real UI with offline, synthetic evidence produced by the production models. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { sessionRecord, SESSION_LOG_KEY, SESSION_EVENT } from '../src/focus/session-log.mjs';
import { createPlaybackLog, PLAYBACK_LOG_KEY } from '../src/player/playback-log.mjs';
import { normalizeLetter, LETTERS_KEY, LETTER_EVENT } from '../src/ai/ai-model.mjs';
import { saveJournalEntry, JOURNAL_KEY, JOURNAL_CHANGE } from '../src/focus/journal-entries.mjs';
import { SOUVENIR_PREFIX, SOUVENIR_KEYS } from '../src/focus/souvenirs.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.SOUVENIR_OUTPUT || path.join(root, 'desktop/test-results/souvenirs'));
const port = Number(process.env.SOUVENIR_PORT || 4234);
const origin = `http://127.0.0.1:${port}`;
const FOCUS_KEY = 'album-circle-focus-v1:local-owner';
const report = {
  output, startedAt: new Date().toISOString(), checks: [], pageErrors: [], consoleErrors: [],
  unexpectedRequests: [], screenshots: [], layouts: [],
  fixture: '合成离线数据，通过生产模型生成日志。播放时钟和媒体进度是夹具，不代表真实音源或原生播放器实测。',
  untested: ['完整备份事务和新用户导入由集成测试负责。', '真实播放器、系统休眠及跨设备时区变化未在此浏览器脚本验收。']
};
await fs.mkdir(output, { recursive: true });
let browser, server;

function evidenceFixture() {
  const now = Date.now() - 60000, data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  storage.setItem(SESSION_LOG_KEY, JSON.stringify([sessionRecord({ start: now - 1500000, end: now, completed: true })]));
  let elapsed = 0;
  const log = createPlaybackLog({ storage, wallNow: () => now - 600000 + elapsed, now: () => elapsed, makeId: () => 'souvenir-fixture' });
  const media = { currentTime: 0, playbackRate: 1, paused: false, ended: false, seeking: false, readyState: 4 };
  const track = { id: 'fixture', index: 0, title: '合成播放进度', album: '纪念物测试', artist: 'fixture' };
  log.mediaEvent('playing', { media, track });
  for (elapsed = 1000; elapsed <= 600000; elapsed += 1000) {
    media.currentTime = elapsed / 1000;
    log.mediaEvent('timeupdate', { media, track });
  }
  log.flush();
  storage.setItem(LETTERS_KEY, JSON.stringify([normalizeLetter({ id: 'fixture-sent', at: now, direction: 'out', status: 'sent', lines: ['这是一封合成测试信件。'] })]));
  for (const daysAgo of [4, 2, 0]) {
    const date = new Date(now); date.setDate(date.getDate() - daysAgo);
    const result = saveJournalEntry({ storage, now: date.getTime(), body: `合成手记，第 ${daysAgo} 天`, target: null });
    assert.equal(result.ok, true);
  }
  return Object.fromEntries(data);
}

const shot = async (page, name) => {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  report.screenshots.push(file);
};
const stored = page => page.evaluate(keys => keys.flatMap(key => {
  const raw = localStorage.getItem(key);
  return raw ? [JSON.parse(raw)] : [];
}), SOUVENIR_KEYS);
const section = page => page.getByRole('region', { name: '小屋纪念物', exact: true });
async function openPanel(page) {
  await page.locator('.room-cat').dblclick();
  await page.locator('.cat-panel[open]').waitFor();
  await section(page).waitFor();
}
async function waitEarned(page, count) {
  await page.waitForFunction(count => document.querySelectorAll('.souvenir-card[data-earned=true]').length === count, count);
}
async function installEvidence(page, input) {
  await page.evaluate(({ input, events }) => {
    for (const [key, value] of Object.entries(input)) localStorage.setItem(key, value);
    events.forEach(event => window.dispatchEvent(new Event(event)));
  }, { input, events: [SESSION_EVENT, LETTER_EVENT, JOURNAL_CHANGE] });
}
async function failWrites(page, active) {
  await page.evaluate(({ prefix, active }) => {
    if (!window.__souvenirWriteOriginal) {
      window.__souvenirWriteOriginal = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (window.__failSouvenirWrites && key.startsWith(prefix)) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return window.__souvenirWriteOriginal.call(this, key, value);
      };
    }
    window.__failSouvenirWrites = active;
  }, { prefix: SOUVENIR_PREFIX, active });
}
async function newPage(context, label, { open = true } = {}) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(`${label}: ${message.text()}`); });
  await page.goto(origin, { waitUntil: open ? 'networkidle' : 'domcontentloaded', timeout: 30000 });
  if (open) await openPanel(page);
  return page;
}
async function run(name, test, { open = true, prepare } = {}) {
  if (process.env.SOUVENIR_FILTER && !name.includes(process.env.SOUVENIR_FILTER)) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript(focusKey => {
    if (location.origin === 'null') return;
    if (!localStorage.getItem('flow-cabin-onboarding-v1')) localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
    if (!localStorage.getItem(focusKey)) localStorage.setItem(focusKey, JSON.stringify({ settings: { notify: false, chime: false }, rewards: { fish: 7, xp: 100 } }));
    if (!localStorage.getItem('album-circle-focus-display-v1')) localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: false }));
  }, FOCUS_KEY);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname;
    if (url.origin !== origin) { report.unexpectedRequests.push(url.href); return route.abort(); }
    if (pathname === '/api/items') return route.fulfill({ json: { items: [] } });
    if (pathname === '/api/items/import') return route.fulfill({ json: { added: 0, total: 0 } });
    if (pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (pathname === '/desktop-music/now-playing' || pathname === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
    if (pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (pathname.startsWith('/api/') || pathname.startsWith('/desktop-music/')) return route.fulfill({ status: 404, json: {} });
    return route.continue();
  });
  let page;
  try {
    await prepare?.(context);
    page = await newPage(context, name, { open });
    await test(page, context);
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
    const failedPage = page || context.pages()[0];
    if (failedPage) await shot(failedPage, `${name}-failure`).catch(() => {});
  } finally { await context.close(); }
}

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 150) throw new Error(log || 'Vite startup failed');
    if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(response => response.ok, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await launchChromium();
  report.browserVersion = await browser.version();

  let releasePanel, heldRequests = 0;
  const panelGate = new Promise(resolve => { releasePanel = resolve; });
  try {
    await run('cold-cat-panel-first-double-click-and-controls', async page => {
      const cat = page.locator('button.room-cat'), panel = page.locator('.cat-panel[open]');
      await cat.waitFor({ state: 'visible' });
      assert.equal(heldRequests, 1, 'CatPanel module is still blocked when the cat becomes visible');
      await cat.dblclick();
      const beforeRelease = await page.evaluate(() => ({ ...window.__catOpenEvents, dialogs: document.querySelectorAll('.cat-panel').length }));
      assert.deepEqual(beforeRelease, { doubleClicks: 1, openEvents: 1, dialogs: 0 });
      report.coldLoad = { heldRequests, beforeRelease };
      await shot(page, '00-cold-module-held');
      releasePanel();
      await panel.waitFor({ timeout: 5000 });
      await section(page).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__catOpenEvents), { doubleClicks: 1, openEvents: 1 }, 'opens after release without another input or event');
      assert.equal(await cat.getAttribute('aria-expanded'), 'true');
      await shot(page, '00-cold-first-open');

      await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });
      assert.equal(await cat.getAttribute('aria-expanded'), 'false');
      assert.equal(await cat.evaluate(node => document.activeElement === node), true, 'Escape returns focus to the cat');
      await cat.click({ button: 'right' }); await panel.waitFor();
      const portrait = panel.locator('.cat-portrait canvas');
      const pixels = node => Array.from(node.getContext('2d').getImageData(0, 0, node.width, node.height).data);
      const beforeAccessory = await portrait.evaluate(pixels);
      await panel.getByRole('button', { name: '鼠尾草领结', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.cat-portrait canvas')?.dataset.accessory === 'bow');
      assert.notDeepEqual(await portrait.evaluate(pixels), beforeAccessory, 'equipping the bow changes rendered pixels');
      assert.equal(await panel.getByRole('button', { name: '鼠尾草领结', exact: true }).getAttribute('aria-pressed'), 'true');
      await panel.getByRole('button', { name: '关闭小猫', exact: true }).click();
      await panel.waitFor({ state: 'detached' });
      await openPanel(page);
      assert.equal(await panel.getByRole('button', { name: '鼠尾草领结', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rewards.equipped.accessory, FOCUS_KEY), 'bow');
      await panel.getByRole('button', { name: '不戴', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.cat-portrait canvas')?.dataset.accessory === '');
      await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });
      assert.equal(await cat.getAttribute('aria-expanded'), 'false');
      report.coldLoad.controls = ['Escape and focus return', 'right click', 'accessory pixels and persistence', 'close button', 'normal double click', 'unequip'];
    }, { open: false, prepare: async context => {
      await context.addInitScript(() => {
        window.__catOpenEvents = { doubleClicks: 0, openEvents: 0 };
        document.addEventListener('dblclick', event => { if (event.target.closest?.('.room-cat')) window.__catOpenEvents.doubleClicks++; });
        window.addEventListener('cabin-open-cat', () => { window.__catOpenEvents.openEvents++; });
      });
      await context.route(/\/src\/focus\/CatPanel(?:\.jsx)?(?:\?|$)/, async route => {
        heldRequests++;
        await panelGate;
        await route.continue();
      });
    } });
  } finally { releasePanel(); }

  await run('empty-room-has-no-awards', async page => {
    assert.equal(await section(page).locator('.souvenir-card').count(), 4);
    assert.equal(await section(page).getByText('尚未获得', { exact: true }).count(), 4);
    assert.deepEqual(await stored(page), []);
    assert.equal(await section(page).getByRole('alert').count(), 0);
    await section(page).scrollIntoViewIfNeeded();
    await shot(page, '01-empty-souvenirs');
  });

  await run('production-model-logs-grant-four-once-without-fish-change', async page => {
    const input = evidenceFixture();
    await installEvidence(page, input); await waitEarned(page, 4);
    const records = await stored(page);
    assert.deepEqual(records.map(record => record.id).sort(), ['first-focus', 'first-letter', 'journal-three-days', 'listening-ten']);
    assert.equal(records.find(record => record.id === 'first-focus').evidence.durationMs, 1500000);
    assert.equal(records.find(record => record.id === 'listening-ten').evidence.verifiedMs, 600000);
    assert.equal(records.find(record => record.id === 'first-letter').evidence.letterId, 'fixture-sent');
    assert.equal(new Set(records.find(record => record.id === 'journal-three-days').evidence.days).size, 3);
    assert.equal(await section(page).locator('time').count(), 4);
    for (const record of records) assert.ok((await section(page).innerText()).includes(record.earnedOn));
    await installEvidence(page, input);
    assert.deepEqual(await stored(page), records);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rewards.fish, FOCUS_KEY), 7);
    await section(page).scrollIntoViewIfNeeded();
    await shot(page, '02-four-awards');
  });

  await run('reload-keeps-awards-after-source-log-removal', async page => {
    const input = evidenceFixture();
    await installEvidence(page, input); await waitEarned(page, 4);
    const before = await stored(page);
    await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), Object.keys(input));
    await page.reload({ waitUntil: 'networkidle' }); await openPanel(page); await waitEarned(page, 4);
    assert.deepEqual(await stored(page), before);
    assert.equal(await section(page).locator('time').count(), 4);
    await section(page).scrollIntoViewIfNeeded(); await shot(page, '03-reloaded-awards');
  });

  await run('two-windows-merge-different-awards-and-refresh', async (page, context) => {
    const other = await newPage(context, 'second-window'), input = evidenceFixture();
    await installEvidence(page, { [SESSION_LOG_KEY]: input[SESSION_LOG_KEY] });
    await waitEarned(page, 1); await waitEarned(other, 1);
    await installEvidence(other, { [LETTERS_KEY]: input[LETTERS_KEY] });
    await waitEarned(page, 2); await waitEarned(other, 2);
    const before = await stored(page);
    assert.deepEqual(before.map(record => record.id).sort(), ['first-focus', 'first-letter']);
    assert.deepEqual(await stored(other), before);
    await other.reload({ waitUntil: 'networkidle' }); await openPanel(other); await waitEarned(other, 2);
    assert.deepEqual(await stored(other), before);
  });

  await run('failed-write-retains-working-copy-and-keyboard-retry', async page => {
    await failWrites(page, true);
    await installEvidence(page, evidenceFixture());
    await section(page).getByRole('alert').waitFor();
    assert.equal(await section(page).getByText(/已达成 · 保存待确认/).count(), 4);
    assert.deepEqual(await stored(page), []);
    await section(page).getByRole('button', { name: '重试保存纪念物' }).scrollIntoViewIfNeeded();
    await shot(page, '04-write-failure');
    await page.keyboard.press('Escape'); await page.locator('.cat-panel').waitFor({ state: 'detached' });
    await openPanel(page);
    assert.equal(await section(page).getByText(/已达成 · 保存待确认/).count(), 4);
    await failWrites(page, false);
    const retry = section(page).getByRole('button', { name: '重试保存纪念物' });
    await retry.focus(); await page.keyboard.press('Enter'); await waitEarned(page, 4);
    assert.equal(await section(page).getByRole('alert').count(), 0);
    assert.equal((await stored(page)).length, 4);
    await page.reload({ waitUntil: 'networkidle' }); await openPanel(page); await waitEarned(page, 4);
  });

  await run('cards-readable-scrollable-and-close-at-two-viewports', async page => {
    await installEvidence(page, evidenceFixture()); await waitEarned(page, 4);
    for (const [width, height] of [[1440, 900], [960, 600]]) {
      await page.setViewportSize({ width, height });
      await section(page).locator('.souvenir-card').last().scrollIntoViewIfNeeded();
      const layout = await section(page).evaluate(element => {
        const panel = element.closest('dialog'), rect = panel.getBoundingClientRect();
        const fonts = [...element.querySelectorAll('p,small,h3,h4,time,span')].filter(node => node.textContent.trim() && node.getClientRects().length)
          .map(node => Number.parseFloat(getComputedStyle(node).fontSize));
        return { width: innerWidth, height: innerHeight, minFont: Math.min(...fonts), documentWidth: document.documentElement.scrollWidth,
          panelWidth: panel.clientWidth, panelScrollWidth: panel.scrollWidth, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
      });
      report.layouts.push(layout);
      assert.ok(layout.minFont >= 12, JSON.stringify(layout));
      assert.ok(layout.documentWidth <= width + 1 && layout.panelScrollWidth <= layout.panelWidth + 1, JSON.stringify(layout));
      assert.ok(layout.rect.left >= 0 && layout.rect.top >= 0 && layout.rect.right <= width + 1 && layout.rect.bottom <= height + 1, JSON.stringify(layout));
      await shot(page, `05-souvenirs-${width}x${height}`);
      await section(page).locator('.souvenir-card').first().scrollIntoViewIfNeeded();
      await shot(page, `06-souvenirs-top-${width}x${height}`);
    }
    await page.locator('.cat-panel').getByRole('button', { name: '关闭小猫', exact: true }).click();
    await page.locator('.cat-panel').waitFor({ state: 'detached' });
    await openPanel(page); await waitEarned(page, 4);
    await page.keyboard.press('Escape'); await page.locator('.cat-panel').waitFor({ state: 'detached' });
  });
} catch (error) {
  report.fatal = error.stack;
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  report.unexpectedRequests = [...new Set(report.unexpectedRequests)];
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`OUTPUT ${output}`);
  await browser?.close(); server?.kill();
}
if (report.fatal || !report.checks.length || report.checks.some(check => !check.passed)
  || report.pageErrors.length || report.consoleErrors.length || report.unexpectedRequests.length) process.exitCode = 1;
