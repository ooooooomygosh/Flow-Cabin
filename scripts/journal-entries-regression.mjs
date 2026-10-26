/** Local journal entries browser regression. All storage and APIs are deterministic/offline. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { JOURNAL_BODY_LIMIT, JOURNAL_KEY } from '../src/focus/journal-entries.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.JOURNAL_OUTPUT || path.join(root, 'desktop/test-results/journal-entries');
const port = Number(process.env.JOURNAL_PORT || 4227);
const origin = `http://127.0.0.1:${port}`;
const FOCUS_KEY = 'album-circle-focus-v1:local-owner';
const report = { output, checks: [], pageErrors: [], consoleErrors: [], unexpectedRequests: [] };

await fs.mkdir(output, { recursive: true });
let browser, server;
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const records = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), JOURNAL_KEY);
const focusState = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), FOCUS_KEY);

async function waitForBody(page, body) {
  await page.waitForFunction(({ key, body }) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]').some((entry) => entry.body === body);
    } catch {
      return false;
    }
  }, { key: JOURNAL_KEY, body });
}

async function openFocus(page, tab = '这一段') { // 3.0: 随手记 is the 便签 in 这一段
  const badge = page.locator('.focus-badge');
  await badge.waitFor({ timeout: 30000 });
  if (await badge.getAttribute('aria-expanded') === 'false') await badge.click();
  const dock = page.locator('.focus-dock');
  await dock.waitFor();
  await dock.getByRole('tab', { name: tab, exact: true }).click();
  return dock;
}

async function openEntries(page) {
  const dialog = page.getByRole('dialog', { name: '唱片日记' });
  if (!await dialog.isVisible().catch(() => false)) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('l');
  }
  await dialog.waitFor();
  const tab = dialog.getByRole('tab', { name: '手记', exact: true });
  await tab.click();
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
  const panel = dialog.getByRole('tabpanel', { name: '手记' });
  await panel.waitFor();
  return { dialog, panel };
}

async function closeEntries(page) {
  const dialog = page.getByRole('dialog', { name: '唱片日记' });
  await dialog.getByRole('button', { name: '返回小屋', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function createEntry(page, panel, { body, tags = '' }) {
  await panel.getByRole('button', { name: '写一页', exact: true }).click();
  const editor = panel.getByLabel('这一页的内容');
  await editor.waitFor();
  await editor.fill(body);
  if (tags) await panel.getByLabel('这一页的标签').fill(tags);
  await waitForBody(page, body);
  return editor;
}

async function selectEntry(panel, titleText) {
  const row = panel.locator('.journal-entry-list li button').filter({ hasText: titleText }).first();
  await row.waitFor();
  await row.click();
  return row;
}

function observePage(page, label) {
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(`${label}: ${message.text()}`);
  });
}

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', (chunk) => { log += chunk; });
  server.stderr.on('data', (chunk) => { log += chunk; });
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 150) throw new Error(log);
    if (hasViteLocalOrigin(log, origin) && await fetch(origin).then((response) => response.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await launchChromium();
  const run = async (name, test, { notes = '原有随手记', journalSeed = null } = {}) => {
    if (process.env.JOURNAL_FILTER && !name.includes(process.env.JOURNAL_FILTER)) return;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
    await context.addInitScript(({ focusKey, journalKey, notes, journalSeed }) => {
      if (location.origin === 'null') return;
      if (!localStorage.getItem('flow-cabin-onboarding-v1')) localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
      if (!localStorage.getItem('album-circle-focus-display-v1')) localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: false }));
      if (!localStorage.getItem(focusKey)) localStorage.setItem(focusKey, JSON.stringify({ notes, settings: { focusMin: 25, shortMin: 5, notify: false, chime: false } }));
      if (journalSeed && !localStorage.getItem(journalKey)) localStorage.setItem(journalKey, JSON.stringify(journalSeed));
      window.__nativeCommands = [];
    }, { focusKey: FOCUS_KEY, journalKey: JOURNAL_KEY, notes, journalSeed });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      if (url.origin !== origin) {
        report.unexpectedRequests.push(url.href);
        return route.abort();
      }
      if (pathname === '/api/items') return route.fulfill({ json: { items: [] } });
      if (pathname === '/api/items/import') return route.fulfill({ json: { added: 0, total: 0 } });
      if (pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
      if (pathname === '/desktop-music/now-playing' || pathname === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
      if (pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
      if (pathname.startsWith('/api/') || pathname.startsWith('/desktop-music/')) return route.fulfill({ status: 404, json: {} });
      return route.continue();
    });

    const page = await context.newPage();
    observePage(page, name);
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('.focus-badge').waitFor({ timeout: 30000 });
      await test(page, context);
      report.checks.push({ name, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      report.checks.push({ name, passed: false, error: error.stack });
      console.error(`FAIL ${name}: ${error.message}`);
      await shot(page, `${name}-failure`).catch(() => {});
    } finally {
      await context.close();
    }
  };

  await run('long-chinese-entry-survives-exit-reload-and-filters', async (page) => {
    let opened = await openEntries(page);
    let { panel } = opened;
    const firstLine = '九月的风从窗缝里进来，带着一点桂花香。';
    const longBody = [
      firstLine,
      '我把早上听到的旋律和下午没说完的话都留在这里。'.repeat(10),
      ...Array.from({ length: 14 }, (_, index) => `第 ${index + 3} 行：今天也有一些值得慢慢记住的小事。`),
      '最后一句留给蓝色雨伞。'
    ].join('\n');
    let editor = await createEntry(page, panel, { body: longBody, tags: '工作，音乐，心情' });
    assert.equal(await editor.getAttribute('maxlength'), String(JOURNAL_BODY_LIMIT));
    const initial = await records(page);
    assert.equal(initial.length, 1);
    assert.equal(initial[0].body, longBody);
    assert.deepEqual(initial[0].tags, ['工作', '音乐', '心情']);

    await closeEntries(page);
    opened = await openEntries(page);
    panel = opened.panel;
    await selectEntry(panel, firstLine);
    editor = panel.getByLabel('这一页的内容');
    assert.equal(await editor.inputValue(), longBody);
    assert.equal(await panel.getByLabel('这一页的标签').inputValue(), '工作，音乐，心情');

    await page.reload();
    await page.locator('.focus-badge').waitFor({ timeout: 30000 });
    opened = await openEntries(page);
    panel = opened.panel;
    await selectEntry(panel, firstLine);
    editor = panel.getByLabel('这一页的内容');
    assert.equal(await editor.inputValue(), longBody);
    assert.equal((await records(page)).length, 1);

    const secondBody = '周六去了海边，风把帽檐吹得很高。\n这段也收进手记。';
    await createEntry(page, panel, { body: secondBody, tags: '旅行，音乐' });
    const search = panel.getByLabel('搜索手记');
    await search.fill('蓝色雨伞');
    await page.waitForFunction(() => document.querySelectorAll('.journal-entry-list li').length === 1);
    assert.equal(await panel.locator('.journal-entry-list li').count(), 1);
    assert.match(await panel.locator('.journal-entry-list li').innerText(), /九月的风/);
    assert.doesNotMatch(await panel.locator('.journal-entry-list').innerText(), /周六去了海边/);

    await search.fill('');
    await page.waitForFunction(() => document.querySelectorAll('.journal-entry-list li').length === 2);
    await panel.getByLabel('筛选手记标签').selectOption({ label: '工作' });
    await page.waitForFunction(() => document.querySelectorAll('.journal-entry-list li').length === 1);
    assert.match(await panel.locator('.journal-entry-list li').innerText(), /九月的风/);
    assert.doesNotMatch(await panel.locator('.journal-entry-list').innerText(), /周六去了海边/);
  });

  await run('history-restore-and-trash-round-trip', async (page) => {
    const first = '第一版：雨停以后，我沿着小路走回家。';
    const second = '第二版：雨停以后，我沿着小路慢慢走回家，还听见了远处的钟声。';
    let { panel } = await openEntries(page);
    await createEntry(page, panel, { body: first, tags: '散步，雨' });
    await closeEntries(page);
    ({ panel } = await openEntries(page));
    await selectEntry(panel, '第一版');
    const editor = panel.getByLabel('这一页的内容');
    await editor.fill(second);
    await waitForBody(page, second);

    const history = panel.locator('.journal-entry-history');
    const historyButton = history.getByRole('button', { name: /编辑历史/ });
    await historyButton.click();
    const oldVersion = history.locator('details').filter({ hasText: '第一版：雨停以后' }).first();
    await oldVersion.locator('summary').click();
    await oldVersion.getByRole('button', { name: '恢复这个版本' }).click();
    await waitForBody(page, first);
    assert.equal(await editor.inputValue(), first);
    await panel.getByRole('button', { name: /编辑历史/ }).click();
    const replacedVersion = panel.locator('.journal-entry-history details').filter({ hasText: '第二版：雨停以后' });
    await replacedVersion.waitFor();
    assert.equal(await replacedVersion.count(), 1, 'restoring keeps the version it replaced');

    await panel.getByRole('button', { name: '移到回收站' }).click();
    const filters = panel.locator('.journal-entry-filter');
    await filters.getByRole('button', { name: '回收站', exact: true }).click();
    await selectEntry(panel, '第一版');
    assert.notEqual(await editor.getAttribute('readonly'), null, 'trashed entries are read-only');
    assert.equal(await editor.inputValue(), first);
    await panel.getByRole('button', { name: '放回日记' }).click();
    await filters.getByRole('button', { name: '手记', exact: true }).click();
    await selectEntry(panel, '第一版');
    assert.equal(await editor.inputValue(), first);
    const persisted = await records(page);
    assert.equal(persisted[0].deletedAt, undefined);
  });

  await run('quick-notes-archive-keeps-source-and-does-not-duplicate', async (page) => {
    const note = '会议结束后要先整理三条结论，再回来继续专注。';
    const dock = await openFocus(page);
    const noteBox = page.getByLabel('随手记内容');
    await noteBox.fill(note);
    await page.waitForFunction(({ key, note }) => JSON.parse(localStorage.getItem(key) || '{}').notes === note, { key: FOCUS_KEY, note });
    const archive = dock.getByRole('button', { name: '收进日记', exact: true });
    await archive.click();
    await dock.getByText('已收进手记。便签原文也留着，可以继续写。', { exact: true }).waitFor();
    let entries = await records(page);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].body, note);
    assert.equal(entries[0].origin, 'scratch');

    await archive.click();
    await page.waitForTimeout(150);
    entries = await records(page);
    assert.equal(entries.length, 1, 'repeated archive does not duplicate the same daily scratch');
    assert.equal(await noteBox.inputValue(), note, 'archiving never clears the source note');
    assert.equal((await focusState(page)).notes, note);

    await dock.getByRole('button', { name: '翻开手记', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '唱片日记' });
    await dialog.waitFor();
    const { panel } = await openEntries(page);
    await selectEntry(panel, '会议结束后');
    assert.equal(await panel.getByLabel('这一页的内容').inputValue(), note);
  });

  await run('cross-window-conflict-preserves-both-and-saves-a-copy', async (page, context) => {
    const base = '共同起点：这段内容不能因为另一个窗口而被覆盖。';
    const windowA = '窗口甲：我把这一段改成了甲的内容。';
    const windowB = '窗口乙：这是同时发生、但尚未保存的另一段内容。';
    let opened = await openEntries(page);
    await createEntry(page, opened.panel, { body: base, tags: '冲突测试' });
    const original = (await records(page))[0];
    await closeEntries(page);

    const second = await context.newPage();
    observePage(second, 'cross-window-conflict-preserves-both-and-saves-a-copy#second-window');
    await second.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await second.locator('.focus-badge').waitFor({ timeout: 30000 });
    opened = await openEntries(page);
    const firstPanel = opened.panel;
    await selectEntry(firstPanel, '共同起点');
    const secondOpened = await openEntries(second);
    const secondPanel = secondOpened.panel;
    await selectEntry(secondPanel, '共同起点');
    assert.equal(await secondPanel.getByLabel('这一页的内容').inputValue(), base);

    await firstPanel.getByLabel('这一页的内容').fill(windowA);
    await waitForBody(page, windowA);
    const savedA = (await records(page)).find((entry) => entry.id === original.id);
    assert.equal(savedA.body, windowA);

    await secondPanel.getByLabel('这一页的内容').fill(windowB);
    const conflict = secondPanel.getByRole('alert');
    await conflict.waitFor();
    assert.match(await conflict.innerText(), /另一窗口|修改/);
    assert.equal(await secondPanel.getByLabel('这一页的内容').inputValue(), windowB, 'the losing window keeps its working text');
    let entries = await records(second);
    assert.equal(entries.length, 1, 'the stale editor does not create or overwrite an entry yet');
    assert.equal(entries.find((entry) => entry.id === original.id).body, windowA);
    assert.equal(entries.find((entry) => entry.id === original.id).version, savedA.version);

    await secondPanel.getByRole('button', { name: '另存为新的一页', exact: true }).click();
    await second.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '[]').length === 2, JOURNAL_KEY);
    entries = await records(second);
    assert.equal(entries.length, 2);
    const kept = entries.find((entry) => entry.id === original.id);
    const copy = entries.find((entry) => entry.id !== original.id);
    assert.equal(kept.body, windowA);
    assert.equal(kept.version, savedA.version);
    assert.equal(copy.body, windowB);
    assert.deepEqual(copy.tags, ['冲突测试']);
    await shot(second, 'journal-conflict-save-as-copy');
  });

  await run('quota-failure-keeps-working-copy-after-closing-the-book', async (page) => {
    const before = '保存成功的第一段，留在磁盘上。';
    const unsaved = '存储配额失败以后仍然留在编辑框里的第二段，关本再开也不能丢。';
    let opened = await openEntries(page);
    let panel = opened.panel;
    await createEntry(page, panel, { body: before, tags: '工作副本' });
    await page.evaluate((key) => {
      window.__journalQuotaFail = true;
      if (!window.__journalStorageSetItem) window.__journalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (window.__journalQuotaFail && name === key) throw new DOMException('本机空间不足（quota test）', 'QuotaExceededError');
        return window.__journalStorageSetItem.call(this, name, value);
      };
    }, JOURNAL_KEY);
    const editor = panel.getByLabel('这一页的内容');
    await editor.fill(unsaved);
    const alert = panel.getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.innerText(), /手记没有保存|检查本机存储/);
    assert.equal((await records(page))[0].body, before, 'the failed write leaves the last saved page intact');

    await closeEntries(page);
    ({ panel } = await openEntries(page));
    const workingRow = panel.locator('.journal-entry-list li').filter({ hasText: '有尚未保存的修改' });
    await workingRow.waitFor();
    assert.match(await workingRow.innerText(), /有尚未保存的修改/);
    await workingRow.getByRole('button').click();
    assert.equal(await panel.getByLabel('这一页的内容').inputValue(), unsaved, 'the in-memory working copy survives closing the book');
    assert.match(await panel.getByRole('alert').innerText(), /接回尚未保存的修改/);

    await page.evaluate(() => { window.__journalQuotaFail = false; });
    await panel.getByRole('button', { name: '重试保存', exact: true }).click();
    await waitForBody(page, unsaved);
    await panel.getByText('已保存到本机', { exact: true }).waitFor();
    await closeEntries(page);
    ({ panel } = await openEntries(page));
    await panel.locator('.journal-entry-list li button').first().click();
    assert.equal(await panel.getByLabel('这一页的内容').inputValue(), unsaved);
    assert.equal(await panel.getByText('有尚未保存的修改', { exact: true }).count(), 0);
    await shot(page, 'journal-quota-working-copy-recovered');
  });

  await run('entries-fit-and-remain-readable-at-both-target-sizes', async (page) => {
    const body = [
      '给今天留一页。',
      '窗外有风，桌边有光。'.repeat(18),
      ...Array.from({ length: 12 }, (_, index) => `第 ${index + 2} 行：慢慢写，不急着把一天概括完。`)
    ].join('\n');
    const { panel } = await openEntries(page);
    const editor = await createEntry(page, panel, { body, tags: '日常，阅读，音乐' });
    await editor.focus();

    for (const [width, height] of [[1440, 900], [960, 600]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(output, `journal-entries-${width}x${height}.png`), animations: 'disabled' });

      const fit = await page.evaluate(() => {
        const targets = [
          ['document', document.documentElement],
          ['body', document.body],
          ['dialog', document.querySelector('.cabin-journal[open]')],
          ['book', document.querySelector('.fs-book')],
          ['spread', document.querySelector('.journal-entries-spread')],
          ['index', document.querySelector('.journal-entry-index')],
          ['main', document.querySelector('.journal-entry-main')]
        ].filter(([, element]) => element);
        return targets.map(([name, element]) => ({ name, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      });
      for (const item of fit) assert.ok(item.scrollWidth <= item.clientWidth + 1, `${item.name} overflows horizontally at ${width}x${height}: ${item.scrollWidth} > ${item.clientWidth}`);

      const fonts = await panel.evaluate((panel) => {
        const selectors = [
          '.journal-entry-index > header p',
          '.journal-entry-new',
          '.journal-entry-search input',
          '.journal-entry-filter button',
          '.journal-entry-filter select',
          '.journal-entry-list time',
          '.journal-entry-list span',
          '.journal-entry-list strong',
          '.journal-entry-heading small',
          '.journal-entry-heading h3',
          '.journal-entry-body-label textarea',
          '.journal-entry-count',
          '.journal-entry-tags',
          '.journal-entry-tags input',
          '.journal-entry-tags small',
          '.journal-entry-status',
          '.journal-entry-history button',
          '.journal-entry-private'
        ];
        return selectors.flatMap((selector) => [...panel.querySelectorAll(selector)]
          .filter((element) => element.getClientRects().length)
          .map((element) => ({ selector, fontSize: parseFloat(getComputedStyle(element).fontSize) })));
      });
      assert.ok(fonts.length > 8, `expected readable journal controls at ${width}x${height}`);
      for (const item of fonts) assert.ok(item.fontSize >= 12, `${item.selector} is ${item.fontSize}px at ${width}x${height}`);
    }
  });
} finally {
  report.unexpectedRequests = [...new Set(report.unexpectedRequests)];
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`OUTPUT ${output}`);
  await browser?.close();
  server?.kill();
}

if (report.checks.some((check) => !check.passed) || report.pageErrors.length || report.consoleErrors.length || report.unexpectedRequests.length) {
  process.exitCode = 1;
}
