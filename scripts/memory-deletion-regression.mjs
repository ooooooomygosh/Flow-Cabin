/** Permanent deletion and backup acceptance using isolated synthetic profiles only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { JOURNAL_KEY } from '../src/focus/journal-entries.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.MEMORY_DELETE_OUTPUT || path.join(root, 'desktop/test-results/memory-deletion'));
const port = Number(process.env.MEMORY_DELETE_PORT || 4253);
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

async function openFocus(page, tab = '随手记') {
  const badge = page.locator('.focus-badge');
  await badge.waitFor({ timeout: 30000 });
  if (await badge.getAttribute('aria-expanded') === 'false') await badge.click();
  const dock = page.locator('.focus-dock');
  await dock.waitFor();
  await dock.getByRole('tab', { name: tab, exact: true }).click();
  return dock;
}

async function openEntries(page) {
  const dialog = page.getByRole('dialog', { name: '小屋日记' });
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
  const dialog = page.getByRole('dialog', { name: '小屋日记' });
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
    if (process.env.MEMORY_DELETE_FILTER && !name.includes(process.env.MEMORY_DELETE_FILTER)) return;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(({ focusKey, journalKey, notes, journalSeed }) => {
      if (location.origin === 'null') return;
      if (!localStorage.getItem('flow-cabin-onboarding-v1')) localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.3' }));
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

  const blockWrites = (page, key, fail) => page.evaluate(({ key, fail }) => {
    window.__originalSet ||= Storage.prototype.setItem;
    window.__blockedKey = fail ? key : '';
    Storage.prototype.setItem = function(name, value) {
      if (name === window.__blockedKey) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return window.__originalSet.call(this, name, value);
    };
  }, { key, fail });
  const openMail = async page => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'letters' } })));
    const panel = page.getByRole('tabpanel', { name: '信箱' }); await panel.waitFor(); return panel;
  };
  const openBackup = async page => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'data' } })));
    await page.getByRole('button', { name: '收藏与备份', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '收藏与备份' }); await dialog.waitFor(); return dialog;
  };
  const importBackup = async (page, backup) => {
    const dialog = await openBackup(page);
    await dialog.getByLabel('导入备份文件').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await dialog.getByRole('button', { name: '恢复这些内容' }).click();
    await dialog.getByRole('status').filter({ hasText: '已合并' }).waitFor();
    await page.keyboard.press('Escape');
  };
  const layout = async (page, group, name) => {
    for (const [width, height] of [[1440, 900], [960, 600]]) {
      await page.setViewportSize({ width, height });
      const confirm = group.getByRole('button', { name: '确认永久删除', exact: true });
      await confirm.scrollIntoViewIfNeeded();
      const result = await group.evaluate(el => ({
        width: document.documentElement.scrollWidth, viewport: innerWidth,
        overflow: el.scrollWidth > el.clientWidth + 1,
        fonts: [...el.querySelectorAll('p,button')].map(node => parseFloat(getComputedStyle(node).fontSize))
      }));
      assert.ok(result.width <= result.viewport + 1 && !result.overflow, JSON.stringify(result));
      assert.ok(result.fonts.every(size => size >= 12), JSON.stringify(result));
      await shot(page, `${name}-${width}x${height}`);
    }
  };

  await run('journal-permanent-delete-confirm-failure-retry-and-stale-window', async (page, context) => {
    let { panel } = await openEntries(page);
    await createEntry(page, panel, { body: '合成删除正文第一版', tags: '合成秘密标签' });
    await closeEntries(page); ({ panel } = await openEntries(page));
    await selectEntry(panel, '合成删除正文第一版');
    await panel.getByLabel('这一页的内容').fill('合成删除正文第二版');
    await waitForBody(page, '合成删除正文第二版');
    assert.equal(await panel.getByRole('button', { name: '永久删除这一页' }).count(), 0);
    const entry = (await records(page))[0];
    const other = await context.newPage(); observePage(other, 'stale-journal');
    await other.goto(origin); const second = (await openEntries(other)).panel;
    await selectEntry(second, '合成删除正文第二版');
    await page.bringToFront();
    await panel.getByRole('button', { name: '移到回收站', exact: true }).click();
    await panel.getByRole('button', { name: '回收站', exact: true }).click();
    await selectEntry(panel, '合成删除正文第二版');
    await panel.getByRole('button', { name: '永久删除这一页' }).click();
    let confirmation = panel.getByRole('group', { name: '确认永久删除手记' });
    assert.match(await confirmation.innerText(), /全部编辑历史/);
    assert.match(await confirmation.innerText(), /外部旧备份不会被擦除/);
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await records(page))[0].body, '合成删除正文第二版');
    await panel.getByRole('button', { name: '永久删除这一页' }).click();
    confirmation = panel.getByRole('group', { name: '确认永久删除手记' });
    await layout(page, confirmation, 'journal-delete-confirm');
    const before = await page.evaluate(key => localStorage.getItem(key), JOURNAL_KEY);
    await blockWrites(page, JOURNAL_KEY, true);
    await confirmation.getByRole('button', { name: '确认永久删除', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '永久删除失败' }).waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), JOURNAL_KEY), before);
    await shot(page, 'journal-delete-failure');
    await blockWrites(page, JOURNAL_KEY, false);
    await confirmation.getByRole('button', { name: '确认永久删除', exact: true }).click();
    await second.getByLabel('这一页的内容').waitFor({ state: 'detached' });
    const stale = await other.evaluate(async entry => {
      const m = await import('/src/focus/journal-entries.mjs');
      return m.saveJournalEntry({ storage: localStorage, id: entry.id, expectedVersion: entry.version, body: '旧窗口迟到保存' });
    }, entry);
    assert.equal(stale.deleted, true);
    const stored = await records(page); assert.equal(stored.length, 1);
    assert.deepEqual(Object.keys(stored[0]).sort(), ['id', 'purgedAt']);
    await page.reload(); ({ panel } = await openEntries(page));
    await panel.getByRole('button', { name: '回收站', exact: true }).click();
    assert.equal(await panel.locator('.journal-entry-list li').count(), 0);
    assert.ok(!JSON.stringify(await records(page)).includes('合成删除正文'));
    await other.close();
  });

  await run('mailbox-whole-thread-delete-quota-and-cross-window', async (page, context) => {
    const key = 'flow-cabin-letters-v1';
    const panel = await openMail(page);
    await panel.getByRole('button', { name: '写一封信', exact: true }).click();
    await panel.getByLabel('写给小屋的信').fill('合成永久删除往来内容');
    await panel.getByRole('button', { name: '寄给小屋', exact: true }).click();
    await panel.getByRole('region', { name: '小屋回信' }).waitFor();
    assert.equal(await panel.getByRole('button', { name: '永久删除往来信' }).count(), 0);
    const other = await context.newPage(); observePage(other, 'stale-mail'); await other.goto(origin);
    const second = await openMail(other);
    const staleLettersRaw = await other.evaluate(key => localStorage.getItem(key), key);
    await page.bringToFront();
    await panel.getByRole('button', { name: '移到回收站', exact: true }).click();
    await panel.getByRole('button', { name: '回收站', exact: true }).click();
    await panel.getByRole('button', { name: '永久删除往来信' }).click();
    const confirmation = panel.getByRole('group', { name: '确认永久删除往来信' });
    assert.match(await confirmation.innerText(), /全部回信/);
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await panel.getByRole('region', { name: '小屋回信' }).waitFor();
    await panel.getByRole('button', { name: '永久删除往来信' }).click();
    await layout(page, confirmation, 'mail-delete-confirm');
    const before = await page.evaluate(key => localStorage.getItem(key), key);
    await blockWrites(page, key, true);
    await confirmation.getByRole('button', { name: '确认永久删除', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '修改没有保存' }).waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
    await blockWrites(page, key, false);
    await confirmation.getByRole('button', { name: '确认永久删除', exact: true }).click();
    await second.locator('.fs-mail-thread').waitFor({ state: 'detached' });
    const raw = await page.evaluate(key => localStorage.getItem(key), key);
    assert.ok(!raw.includes('合成永久删除往来内容'));
    assert.ok(JSON.parse(raw).every(item => item.purgedAt != null));
    const oldWindowWrite = await other.evaluate(async raw => {
      const model = await import('/src/ai/ai-model.mjs');
      const stale = JSON.parse(raw);
      const result = model.tryWriteLetters(localStorage, stale);
      return { ok: result.ok, live: model.readLetters(localStorage).length, count: stale.length, error: result.error };
    }, staleLettersRaw);
    assert.equal(oldWindowWrite.live, 0);
    assert.equal(oldWindowWrite.ok, true, JSON.stringify(oldWindowWrite));
    await page.reload(); const restored = await openMail(page);
    await restored.getByRole('button', { name: '回收站', exact: true }).click();
    assert.equal(await restored.locator('.fs-mail-list li').count(), 0);
    await other.close();
  });

  await run('pending-reply-cannot-resurrect-a-purged-thread', async (page, context) => {
    await page.evaluate(async () => {
      const model = await import('/src/ai/ai-model.mjs');
      const reply = await import('/src/ai/letter-reply.mjs');
      model.writeAi(localStorage, { enabled: true, baseUrl: 'https://synthetic.invalid', model: 'fixture' });
      localStorage.setItem(model.AI_KEY_KEY, JSON.stringify({ v: 2, key: 'synthetic-test-key', endpoint: 'https://synthetic.invalid/chat/completions', revision: 'synthetic' }));
      reply.saveLetterDraft(localStorage, { text: '合成等待中的信' });
      window.__pendingReply = reply.sendCabinLetter({ storage: localStorage, text: '合成等待中的信', win: window, replyDelayMs: 0,
        chatImpl: () => new Promise(resolve => { window.__releaseReply = resolve; }) });
      window.__oldPendingBackup = (await import('/src/backup-model.mjs')).buildBackup({ storage: localStorage });
    });
    const panel = await openMail(page);
    const other = await context.newPage(); observePage(other, 'stale-draft'); await other.goto(origin);
    const second = await openMail(other);
    await second.getByLabel('写给小屋的信').waitFor();
    await page.bringToFront();
    await panel.getByRole('button', { name: '收进抽屉', exact: true }).click();
    await panel.getByRole('button', { name: '移到回收站', exact: true }).click();
    await panel.getByRole('button', { name: '回收站', exact: true }).click();
    await panel.getByRole('button', { name: '永久删除往来信' }).click();
    await panel.getByRole('group', { name: '确认永久删除往来信' }).getByRole('button', { name: '确认永久删除' }).click();
    await second.getByLabel('写给小屋的信').waitFor({ state: 'detached' });
    const result = await page.evaluate(async () => {
      window.__releaseReply({ ok: true, text: '合成迟到的秘密回信' });
      const result = await window.__pendingReply;
      (await import('/src/backup-model.mjs')).restoreBackupMemory(window.__oldPendingBackup);
      return { result, raw: localStorage.getItem('flow-cabin-letters-v1') };
    });
    assert.equal(result.result.deleted, true);
    assert.ok(!result.raw.includes('合成'));
    assert.equal(await panel.locator('.fs-mail-list li').count(), 0);
    await shot(page, 'late-reply-discarded');
    await panel.getByRole('button', { name: '写一封信', exact: true }).click();
    await panel.getByLabel('写给小屋的信').fill('明确新写的合成草稿');
    const draft = await page.evaluate(async () => (await import('/src/ai/letter-reply.mjs')).readLetterDraft(localStorage));
    assert.notEqual(draft.id, 'draft:my-letter');
    assert.equal(draft.lines[0], '明确新写的合成草稿');
    await other.close();
  });

  await run('backup-deletion-wins-and-external-old-copy-remains-recoverable', async page => {
    const old = await page.evaluate(async () => {
      const journal = await import('/src/focus/journal-entries.mjs');
      const letters = await import('/src/ai/ai-model.mjs');
      const souvenirs = await import('/src/focus/souvenirs.mjs');
      const backup = await import('/src/backup-model.mjs');
      const now = Date.now();
      let entry = journal.saveJournalEntry({ storage: localStorage, body: 'PRIVATE-SYNTHETIC-HISTORY', now: now - 1000 }).entry;
      entry = journal.saveJournalEntry({ storage: localStorage, id: entry.id, expectedVersion: entry.version, body: 'PRIVATE-SYNTHETIC-BODY', now }).entry;
      letters.saveLetter(localStorage, { id: 'synthetic-sent', direction: 'out', status: 'sent', lines: ['PRIVATE-SYNTHETIC-LETTER'], at: now });
      souvenirs.syncSouvenirs({ storage: localStorage });
      return backup.buildBackup({ storage: localStorage });
    });
    assert.equal(old.memory.souvenirs.records[0].id, 'first-letter');
    let { panel } = await openEntries(page); await selectEntry(panel, 'PRIVATE-SYNTHETIC-BODY');
    await panel.getByRole('button', { name: '移到回收站', exact: true }).click();
    await panel.getByRole('button', { name: '回收站', exact: true }).click(); await selectEntry(panel, 'PRIVATE-SYNTHETIC-BODY');
    await panel.getByRole('button', { name: '永久删除这一页' }).click();
    await panel.getByRole('group', { name: '确认永久删除手记' }).getByRole('button', { name: '确认永久删除' }).click();
    panel = await openMail(page);
    await panel.getByRole('button', { name: '移到回收站', exact: true }).click();
    await panel.getByRole('button', { name: '回收站', exact: true }).click();
    await panel.getByRole('button', { name: '永久删除往来信' }).click();
    await panel.getByRole('group', { name: '确认永久删除往来信' }).getByRole('button', { name: '确认永久删除' }).click();
    const dialog = await openBackup(page);
    assert.match(await dialog.innerText(), /没有删除记录的新小屋/);
    const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: '导出备份', exact: true }).click();
    const file = path.join(output, 'synthetic-deleted-backup.json'); await (await downloaded).saveAs(file);
    const text = await fs.readFile(file, 'utf8'), clean = JSON.parse(text);
    assert.equal(clean.version, 4); assert.ok(!text.includes('PRIVATE-SYNTHETIC'));
    assert.deepEqual(clean.memory.souvenirs, old.memory.souvenirs);
    await page.keyboard.press('Escape');
    await importBackup(page, old);
    const state = () => page.evaluate(async () => {
      const j = await import('/src/focus/journal-entries.mjs'), l = await import('/src/ai/ai-model.mjs');
      return { journal: j.readJournalRecords(localStorage).length, letters: l.readLetters(localStorage).length };
    });
    assert.deepEqual(await state(), { journal: 0, letters: 0 });
    // This is an isolated synthetic browser context, never the user's profile.
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await importBackup(page, old);
    assert.deepEqual(await state(), { journal: 1, letters: 1 });
    await importBackup(page, clean);
    assert.deepEqual(await state(), { journal: 0, letters: 0 });
    const retained = await page.evaluate(async () => (await import('/src/focus/souvenirs.mjs')).readSouvenirs(localStorage));
    assert.deepEqual(retained, old.memory.souvenirs);
    await shot(page, 'backup-deletion-rule');
  });
} finally {
  report.unexpectedRequests = [...new Set(report.unexpectedRequests)];
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`OUTPUT ${output}`);
  await browser?.close(); server?.kill();
}
if (!report.checks.length || report.checks.some(check => !check.passed) || report.pageErrors.length || report.consoleErrors.length || report.unexpectedRequests.length) process.exitCode = 1;
