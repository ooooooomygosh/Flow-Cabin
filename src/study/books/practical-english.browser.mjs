// Offline content acceptance in two fresh browser contexts, through the real
// study and backup UIs. This is not packaged Electron or OS-profile acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from '../../../scripts/launch-browser.mjs';
import { hasViteLocalOrigin } from '../../../scripts/vite-readiness.mjs';
import { PRACTICAL_WORD_BOOKS } from './practical-english.mjs';
import { WORD_BOOKS } from '../word-books.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const port = Number(process.env.STUDY_CONTENT_PORT || 4329), origin = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.STUDY_CONTENT_OUTPUT || path.join(root, 'desktop/test-results/study-content'));
await fs.mkdir(output, { recursive: true });
const evidence = await fs.mkdtemp(path.join(output, 'run-'));
const studyKey = 'album-circle-study-v1:local-owner';
const report = { startedAt: new Date().toISOString(), checks: [], pageErrors: [], externalRequestsBlocked: [],
  credentialsTested: false, nativeElectronTested: false, contexts: 2, screenshots: [], passed: false };
let server, browser, activePage;
const check = name => { report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
const readStudy = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"cards":[],"decks":[]}'), studyKey);
async function shot(page, name) {
  const file = path.join(evidence, `${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled' }); report.screenshots.push(file);
}
async function openStudy(page) {
  const badge = page.locator('.focus-badge'); await badge.waitFor();
  if (await badge.getAttribute('aria-expanded') === 'false') await badge.click();
  await page.locator('.focus-dock').getByRole('tab', { name: '学习', exact: true }).click();
  await page.locator('.study-books select').waitFor();
}
async function openBackup(page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '数据与备份', exact: true }).click();
  await page.getByRole('button', { name: '收藏与备份', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '收藏与备份', exact: true });
  await dialog.waitFor(); return dialog;
}
async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', reducedMotion: 'reduce', acceptDownloads: true });
  await context.addInitScript(() => {
    if (!localStorage.getItem('flow-cabin-onboarding-v1')) {
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.4' }));
    }
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { report.externalRequestsBlocked.push(url.origin); return route.abort(); }
    if (url.pathname === '/api/items') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/items/import') return route.fulfill({ json: { added: 0, total: 0, ids: {} } });
    if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (url.pathname.startsWith('/desktop-music/')) return route.fulfill({ json: { available: false, folders: [], albumCount: 0, trackCount: 0 } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
    return route.continue();
  });
  const page = await context.newPage(); activePage = page; page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.focus-badge').waitFor();
  assert.equal((await readStudy(page)).cards.length, 0);
  return page;
}

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(evidence, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 150) throw new Error(log);
    if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(response => response.ok, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await launchChromium(); report.browserVersion = browser.version();
  const source = await freshPage(); await openStudy(source);
  assert.equal(await source.locator('.study-books select option').count(), WORD_BOOKS.length);
  const select = source.locator('.study-books select'), preview = source.locator('.study-books details');
  await preview.locator('summary').click();
  for (const book of PRACTICAL_WORD_BOOKS) {
    await select.selectOption(book.id);
    assert.equal(await preview.locator('li').count(), 20);
    assert.match(await source.locator('.study-books').innerText(), /12 个主题、240 词/);
    assert.ok((await preview.innerText()).includes(book.words[0].back.split('\n')[1]));
  }
  assert.equal((await readStudy(source)).cards.length, 0);
  check('all-12-topics-preview-with-counts-and-examples-without-materializing-cards');
  const home = PRACTICAL_WORD_BOOKS[0], food = PRACTICAL_WORD_BOOKS[1];
  await select.selectOption(home.id); await shot(source, 'theme-preview');
  await preview.locator('summary').click();
  const limit = source.getByLabel('词书每日新词', { exact: true });
  await limit.fill('1'); await limit.press('Tab');
  await source.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
  await source.locator('.study-card-front', { hasText: home.words[0].front }).waitFor();
  assert.equal((await readStudy(source)).cards.length, 1);
  await source.getByRole('button', { name: '翻面 · 空格', exact: true }).click();
  assert.equal(await source.locator('.study-card-back').innerText(), home.words[0].back);
  assert.ok((await source.locator('.study-review').innerText()).includes(home.source));
  await shot(source, 'original-card-back');
  await source.locator('.study-ratings .is-easy').click();
  await source.waitForFunction(key => JSON.parse(localStorage.getItem(key)).cards[0].memory?.reps === 1, studyKey);
  await source.getByRole('button', { name: '回到词书架', exact: true }).click();
  await select.selectOption(food.id);
  await source.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
  await source.locator('.study-done').waitFor();
  assert.match(await source.locator('.study-done').innerText(), /今日新词额度已用完/);
  assert.equal((await readStudy(source)).cards.length, 1);
  const learned = await readStudy(source);
  check('one-card-creation-rating-and-shared-daily-quota-through-study-ui');
  await source.reload({ waitUntil: 'domcontentloaded' }); await openStudy(source);
  assert.deepEqual(await readStudy(source), learned);
  check('reload-preserves-source-bilingual-content-memory-and-daily-log');
  const dialog = await openBackup(source), downloadPromise = source.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出备份', exact: true }).click();
  const download = await downloadPromise, backupPath = path.join(evidence, 'source-backup.json');
  await download.saveAs(backupPath);
  const exported = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.deepEqual(exported.study, learned); report.backup = backupPath;
  check('backup-ui-download-keeps-card-and-deck-sources-without-expanding-catalog');
  const target = await freshPage();
  assert.equal(await target.evaluate(key => localStorage.getItem(key), studyKey), null);
  const restore = await openBackup(target);
  await restore.getByLabel('导入备份文件', { exact: true }).setInputFiles(backupPath);
  await restore.getByRole('button', { name: /^(恢复|替换)这些内容$/ }).click();
  await restore.getByRole('status').filter({ hasText: '学习记录' }).waitFor();
  assert.equal(await restore.getByRole('alert').count(), 0);
  assert.deepEqual(await readStudy(target), learned);
  await shot(target, 'fresh-context-restored');
  check('fresh-browser-context-imports-exact-study-state-through-backup-ui');
  await target.reload({ waitUntil: 'domcontentloaded' }); await openStudy(target);
  await target.locator('.study-books select').selectOption(home.id);
  const targetLimit = target.getByLabel('词书每日新词', { exact: true });
  await targetLimit.fill('2'); await targetLimit.press('Tab');
  await target.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
  await target.locator('.study-card-front', { hasText: home.words[1].front }).waitFor();
  const continued = await readStudy(target);
  assert.equal(continued.cards.length, 2);
  assert.deepEqual(continued.cards[0], learned.cards[0]);
  assert.equal(continued.cards[1].front, home.words[1].front);
  assert.equal(continued.cards[1].source, home.source);
  await target.getByRole('button', { name: '翻面 · 空格', exact: true }).click();
  assert.equal(await target.locator('.study-card-back').innerText(), home.words[1].back);
  await shot(target, 'restored-next-card');
  check('restored-book-continues-with-next-word-and-keeps-reviewed-memory');
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.error = error.stack; process.exitCode = 1;
  console.error(error);
  if (activePage && !activePage.isClosed()) await shot(activePage, 'failure').catch(() => {});
} finally {
  await browser?.close(); server?.kill();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`OUTPUT ${path.join(evidence, 'report.json')}`);
}
