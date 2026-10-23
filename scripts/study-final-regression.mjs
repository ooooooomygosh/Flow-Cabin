/** Study wordbooks + flip clock browser acceptance. Offline fixtures only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.STUDY_OUTPUT || path.join(root, 'desktop/test-results/study-ui');
const port = Number(process.env.STUDY_PORT || 4232);
const origin = `http://127.0.0.1:${port}`;
const FOCUS_KEY = 'album-circle-focus-v1:local-owner';
const STUDY_KEY = 'album-circle-study-v1:local-owner';
const DISPLAY_KEY = 'album-circle-focus-display-v1';
const DECK_NAME = '英语入门';
const SOURCE = '合成词书 fixture · 仅用于测试，不代表真实来源或授权';
const JSON_SOURCE = '<img src=x onerror="window.__sourceHtmlExecuted=true"> 合成 JSON fixture';
const SOURCE_ROWS = [
  ['serendipity', '意外发现美好事物的运气'],
  ['meticulous', '一丝不苟的；细心的'],
  ['resilient', '有韧性的；能恢复的']
];
const SOURCE_FILE = [
  'front\tback\tsource',
  ...SOURCE_ROWS.map(([front, back]) => `${front}\t${back}\t${SOURCE}`)
].join('\n');

const report = {
  startedAt: new Date().toISOString(),
  repo: root,
  output,
  browser: process.env.BROWSER_EXECUTABLE || 'Playwright Chromium',
  viewport: { width: 1440, height: 900 },
  checks: [],
  defects: [],
  evidence: {},
  artifacts: [],
  pageErrors: [],
  consoleErrors: [],
  unexpectedRequests: [],
  untested: [
    '真实跨日/多天的 FSRS 间隔；本次通过把已学卡片的 due 提前来触发到期复习。',
    '接近 500 KB 的单文件、5,000 张卡片、40 个卡组等容量边界。',
    '真实第三方词书来源、授权文本和版权核验；fixture 仅为合成数据。',
    '原生桌面全屏、多显示器、DPI、休眠恢复和 GPU 动画帧率；本次只测 Edge 浏览器窗口。',
    '跨窗口学习同步、备份导入导出、损坏存储恢复。',
    'Anki .apkg 及第三方调度历史；产品界面已明确不支持。'
  ]
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'source-wordbook-fixture.tsv'), SOURCE_FILE);

let browser, server;
const record = (name, passed, detail = '') => {
  report.checks.push({ name, passed, ...(detail ? { detail } : {}) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const state = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STUDY_KEY);
const display = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), DISPLAY_KEY);

async function shot(page, name) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled', timeout: 15000 });
  report.artifacts.push(file);
  return file;
}

async function openDock(page, tab = '学习') {
  const badge = page.locator('.focus-badge');
  await badge.waitFor({ timeout: 30000 });
  if (await badge.getAttribute('aria-expanded') === 'false') await badge.click();
  const dock = page.locator('.focus-dock');
  await dock.waitFor();
  await dock.getByRole('tab', { name: tab, exact: true }).click();
  return dock;
}

async function openStudy(page) {
  const dock = await openDock(page, '学习');
  await page.getByLabel('词书', { exact: true }).waitFor();
  return dock;
}

function observe(page, label) {
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(`${label}: ${message.text()}`);
  });
}

async function writeSummary() {
  const passed = report.checks.filter((check) => check.passed).length;
  const lines = [
    '# 学习 / 词书 / 翻页钟最终验收',
    '',
    `- 运行时间：${report.startedAt}`,
    `- 浏览器：${report.browser}`,
    `- 视口：${report.viewport.width}×${report.viewport.height}`,
    `- 结果：${passed}/${report.checks.length} 项通过`,
    `- 页面错误：${report.pageErrors.length}；控制台错误：${report.consoleErrors.length}；意外请求：${report.unexpectedRequests.length}`,
    ...(report.fatal ? [`- 执行中断：${report.fatal}`] : []),
    '',
    '## 检查结果',
    '',
    ...report.checks.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'}：${check.name}${check.detail ? ` — ${check.detail}` : ''}`),
    '',
    '## 缺陷',
    '',
    ...(report.defects.length ? report.defects.map((defect) => `- **${defect.severity} · ${defect.id}**：${defect.summary}\n  - 证据：${defect.evidence.join('；')}\n  - 实现位置：${defect.source.join('；')}`) : ['- 本次未发现其它阻断缺陷。']),
    '',
    '## 未测边界',
    '',
    ...report.untested.map((item) => `- ${item}`),
    '',
    '## 证据文件',
    '',
    ...report.artifacts.map((item) => `- ${path.basename(item)}`)
  ];
  await fs.writeFile(path.join(output, 'summary.md'), lines.join('\n') + '\n');
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
  report.browserVersion = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  // These flows exercise the classic shelf; since 2.2 the life cabin is the default home.
  await context.addInitScript(() => { if (localStorage.getItem('flow-cabin-interface-v1') === null) localStorage.setItem('flow-cabin-interface-v1', 'classic'); });
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript(({ focusKey, displayKey }) => {
    if (location.origin === 'null') return;
    if (!localStorage.getItem('flow-cabin-onboarding-v1')) localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
    if (!localStorage.getItem(focusKey)) localStorage.setItem(focusKey, JSON.stringify({ notes: '', settings: { focusMin: 25, shortMin: 5, notify: false, chime: false } }));
    if (!localStorage.getItem(displayKey)) localStorage.setItem(displayKey, JSON.stringify({ mode: 'ring', show: 'clock', seconds: true, autoEnter: false }));
    window.__nativeCommands = [];
  }, { focusKey: FOCUS_KEY, displayKey: DISPLAY_KEY });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      report.unexpectedRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname === '/api/items') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/items/import') return route.fulfill({ json: { added: 0, total: 0 } });
    if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (url.pathname === '/desktop-music/now-playing' || url.pathname === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
    if (url.pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/desktop-music/')) return route.fulfill({ status: 404, json: {} });
    return route.continue();
  });

  const page = await context.newPage();
  observe(page, 'study-flip-clock');
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.focus-badge').waitFor({ timeout: 30000 });

  // A sourced TSV: the third column deliberately carries attribution.
  await openStudy(page);
  await page.getByLabel('新卡组名称').fill(DECK_NAME);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  let deckRow = page.locator('.study-decks li').filter({ hasText: DECK_NAME });
  await deckRow.getByRole('button', { name: '添加词条', exact: true }).click();
  await page.locator('.study-import summary').click();
  await page.getByLabel('选择词书文件').setInputFiles({
    name: 'source-wordbook-fixture.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(SOURCE_FILE)
  });
  await page.getByLabel('首行为标题').check();
  await page.getByText('有效 3 · 重复 0 · 错误 0', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.study-import-preview .study-source').allTextContents(), SOURCE_ROWS.map(() => `来源：${SOURCE}`));
  await shot(page, '01-import-preview-with-source-column');
  await page.getByRole('button', { name: '确认追加 3 张', exact: true }).click();
  await page.getByText('已追加 3 张卡片；旧进度保持不变。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '卡组', exact: true }).click();

  const imported = await state(page);
  const importedDeck = imported.decks.find((deck) => deck.name === DECK_NAME);
  assert.ok(importedDeck);
  assert.equal(imported.cards.filter((card) => card.deckId === importedDeck.id).length, 3);
  const provenance = await page.evaluate(({ key, deckName, source }) => {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const deck = value.decks.find((entry) => entry.name === deckName);
    const cards = value.cards.filter((entry) => entry.deckId === deck.id);
    return {
      deckKeys: Object.keys(deck).sort(),
      cardKeys: Object.keys(cards[0]).sort(),
      retained: cards.length === 3 && cards.every((card) => card.source === source),
      visible: document.querySelector('.focus-dock')?.innerText.includes(source) || false
    };
  }, { key: STUDY_KEY, deckName: DECK_NAME, source: SOURCE });
  report.evidence.sourceImport = provenance;
  const sourceRetained = provenance.retained && provenance.visible;
  if (!sourceRetained) {
    report.defects.push({
      id: 'imported-wordbook-source-is-dropped',
      severity: 'major',
      summary: '带来源 TSV 虽能导入单词，但来源列既未持久化也不在卡组/卡片界面展示。',
      evidence: [
        `fixture 第三列为 ${SOURCE}`,
        `导入后的卡组字段只有 ${provenance.deckKeys.join(', ')}，卡片字段只有 ${provenance.cardKeys.join(', ')}`,
        '来源字符串在导入后的专注工具界面不可见',
        path.join(output, '01-import-preview-with-source-column.png')
      ],
      source: [
        'src/study/word-books.mjs previewWordImport',
        'src/study/study-model.mjs normalizeCard/normalizeStudy',
        'src/study/StudyPanel.jsx'
      ]
    });
  }

  // Exercise JSON through the file picker too; markup must stay literal text.
  await page.getByLabel('新卡组名称').fill('JSON 合成词书');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const jsonDeckRow = page.locator('.study-decks li').filter({ hasText: 'JSON 合成词书' });
  await jsonDeckRow.getByRole('button', { name: '添加词条', exact: true }).click();
  await page.locator('.study-import summary').click();
  const jsonFixture = JSON.stringify([{ front: 'fixture', back: '合成测试词条', source: JSON_SOURCE }]);
  await fs.writeFile(path.join(output, 'source-wordbook-fixture.json'), jsonFixture);
  await page.getByLabel('选择词书文件').setInputFiles({ name: 'source-wordbook-fixture.json', mimeType: 'application/json', buffer: Buffer.from(jsonFixture) });
  await page.getByText('有效 1 · 重复 0 · 错误 0', { exact: true }).waitFor();
  assert.equal(await page.locator('.study-import-preview .study-source').textContent(), `来源：${JSON_SOURCE}`);
  assert.equal(await page.locator('.study-source img').count(), 0);
  await shot(page, '01b-json-source-literal-preview');
  await page.getByRole('button', { name: '确认追加 1 张', exact: true }).click();
  await page.getByText('已追加 1 张卡片；旧进度保持不变。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '卡组', exact: true }).click();
  await jsonDeckRow.locator('.study-deck-open').click();
  assert.equal(await page.locator('.study-review .study-source').textContent(), `来源：${JSON_SOURCE}`);
  assert.equal(await page.locator('.study-source img').count(), 0);
  assert.equal(await page.evaluate(() => window.__sourceHtmlExecuted), undefined);
  const sourceLayout = await page.locator('.study-review .study-source').evaluate(element => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    width: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  assert.ok(sourceLayout.fontSize >= 12 && sourceLayout.scrollWidth <= sourceLayout.width + 1, JSON.stringify(sourceLayout));
  await shot(page, '01c-json-source-literal-study');
  await page.reload();
  await openStudy(page);
  const jsonCard = (await state(page)).cards.find(card => card.front === 'fixture');
  assert.equal(jsonCard.source, JSON_SOURCE);
  await jsonDeckRow.locator('.study-deck-open').click();
  assert.equal(await page.locator('.study-review .study-source').textContent(), `来源：${JSON_SOURCE}`);
  await page.locator('.study-back').click();
  report.evidence.jsonSource = { source: jsonCard.source, retainedAfterReload: true, renderedAsText: true, sourceLayout };
  record('imported-wordbook-source-attribution-is-kept-and-visible', sourceRetained,
    `TSV: all 3 cards retained source; shelf visible=${provenance.visible}; JSON: literal markup, persisted after reload`);

  // Learn one imported card with the daily-new quota held at one.
  await page.getByLabel('词书每日新词').fill('1');
  await page.getByLabel('词书每日新词').press('Tab');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').newPerDay === 1, STUDY_KEY);
  deckRow = page.locator('.study-decks li').filter({ hasText: DECK_NAME });
  await deckRow.locator('.study-deck-open').click();
  const front = await page.locator('.study-card-front').innerText();
  assert.ok(SOURCE_ROWS.some(([word]) => word === front), `unexpected imported front: ${front}`);
  assert.equal(await page.locator('.study-review .study-source').textContent(), `来源：${SOURCE}`);
  await shot(page, '02-study-review-front');
  await page.getByRole('button', { name: '翻面 · 空格', exact: true }).click();
  assert.ok((await page.locator('.study-card-back').innerText()).trim());
  await shot(page, '03-study-review-back');
  await page.locator('.study-ratings button').filter({ hasText: '记得' }).click();
  await page.locator('.study-done').waitFor();
  let learned = await state(page);
  let learnedCard = learned.cards.find((card) => card.front === front);
  assert.ok(learnedCard.memory?.reps >= 1);
  assert.equal(learned.log[Object.keys(learned.log).sort().at(-1)].learned, 1);
  assert.equal(learned.log[Object.keys(learned.log).sort().at(-1)].reviews, 1);
  const firstMemory = { ...learnedCard.memory };
  await shot(page, '04-study-first-card-rated');
  record('imported-wordbook-learn-and-first-rating-persist', true, `${front} · reps ${learnedCard.memory.reps}`);

  await page.reload();
  await page.locator('.focus-badge').waitFor({ timeout: 30000 });
  await openStudy(page);
  deckRow = page.locator('.study-decks li').filter({ hasText: DECK_NAME });
  await deckRow.waitFor();
  const afterReload = await state(page);
  const afterReloadCard = afterReload.cards.find((card) => card.id === learnedCard.id);
  assert.deepEqual(afterReloadCard.memory, firstMemory);
  assert.equal(afterReloadCard.source, SOURCE);
  assert.ok((await deckRow.innerText()).includes(SOURCE));
  await shot(page, '05-study-learn-progress-after-reload');
  record('learned-progress-survives-page-reload', true);

  // Force the learned card due rather than waiting days, then exercise the review queue.
  await page.evaluate(({ key, cardId }) => {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const card = value.cards.find((entry) => entry.id === cardId);
    card.memory.due = Date.now() - 60000;
    card.memory.state = 2;
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STUDY_KEY, cardId: learnedCard.id });
  await page.reload();
  await page.locator('.focus-badge').waitFor({ timeout: 30000 });
  await openStudy(page);
  deckRow = page.locator('.study-decks li').filter({ hasText: DECK_NAME });
  await deckRow.getByLabel('待复习 1 张').waitFor();
  await deckRow.locator('.study-deck-open').click();
  await page.locator('.study-stage').filter({ hasText: '复习' }).waitFor();
  assert.equal(await page.locator('.study-card-front').innerText(), front);
  assert.equal(await page.locator('.study-review .study-source').textContent(), `来源：${SOURCE}`);
  await shot(page, '06-study-due-review-front');
  await page.getByRole('button', { name: '翻面 · 空格', exact: true }).click();
  await page.locator('.study-ratings button').filter({ hasText: '简单' }).click();
  await page.locator('.study-done').waitFor();
  const reviewed = await state(page);
  const reviewedCard = reviewed.cards.find((card) => card.id === learnedCard.id);
  assert.ok(reviewedCard.memory.reps > firstMemory.reps);
  const lastDay = reviewed.log[Object.keys(reviewed.log).sort().at(-1)];
  assert.equal(lastDay.reviews, 2);
  assert.equal(lastDay.learned, 1, 'reviewing a learned card must not count as a new word');
  await shot(page, '07-study-due-review-rated');

  await page.reload();
  await page.locator('.focus-badge').waitFor({ timeout: 30000 });
  await openStudy(page);
  const persistedReview = await state(page);
  assert.deepEqual(persistedReview.cards.find((card) => card.id === learnedCard.id).memory, reviewedCard.memory);
  assert.equal(persistedReview.cards.find((card) => card.id === learnedCard.id).source, SOURCE);
  await shot(page, '08-study-review-progress-after-reload');
  record('due-review-second-rating-and-reload-persist', true, `reps ${reviewedCard.memory.reps}`);

  // Flip clock: quick switch in the dock, immersive face changes, button + keyboard exits, reload.
  let dock = await openDock(page, '番茄钟');
  let faceSwitch = dock.locator('.face-switch');
  await faceSwitch.waitFor();
  assert.equal((await faceSwitch.locator('strong').innerText()).trim(), '像素番茄环');
  await faceSwitch.getByRole('button', { name: '上一个专注画面' }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').mode === 'flip', DISPLAY_KEY);
  assert.equal((await faceSwitch.locator('strong').innerText()).trim(), '琥珀翻页钟');
  await page.locator('.focus-timer .focus-face[data-face=flip]').waitFor();
  await shot(page, '09-flip-clock-dock');

  await faceSwitch.getByRole('button', { name: '沉浸', exact: true }).click();
  const stage = page.getByRole('dialog', { name: '专注画面' });
  await stage.waitFor();
  assert.equal(await stage.locator('.focus-display').getAttribute('data-face'), 'flip');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-focus-display')), true);
  const canvas = await stage.locator('.focus-face.is-full[data-face=flip] .focus-face-canvas').evaluate((element) => {
    const context = element.getContext('2d');
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) painted++;
    return { width: element.width, height: element.height, painted };
  });
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.painted > 100, 'flip clock canvas is painted');
  await shot(page, '10-flip-clock-immersive');

  await stage.getByRole('radio', { name: '极简大字', exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').mode === 'minimal', DISPLAY_KEY);
  await page.locator('.focus-display[data-face=minimal]').waitFor();
  await shot(page, '11-immersive-face-switched-minimal');
  await stage.getByRole('radio', { name: '琥珀翻页钟', exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').mode === 'flip', DISPLAY_KEY);
  const showTabs = stage.getByRole('radiogroup', { name: '画面显示' });
  await showTabs.getByRole('radio', { name: '计时', exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').show === 'timer', DISPLAY_KEY);
  await showTabs.getByRole('radio', { name: '时钟', exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').show === 'clock', DISPLAY_KEY);

  await stage.getByRole('navigation', { name: '专注画面工具' }).getByRole('button', { name: '返回小屋', exact: true }).click();
  await stage.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-focus-display')), false);
  await shot(page, '12-flip-clock-immersive-exited');

  if (await dock.isVisible()) await page.getByRole('button', { name: '收起专注工具', exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('z');
  await page.getByRole('dialog', { name: '专注画面' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: '专注画面' }).locator('.focus-display').getAttribute('data-face'), 'flip');
  await shot(page, '13-flip-clock-immersive-keyboard');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '专注画面' }).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-focus-display')), false);

  await page.reload();
  await page.locator('.focus-badge').waitFor({ timeout: 30000 });
  dock = await openDock(page, '番茄钟');
  faceSwitch = dock.locator('.face-switch');
  assert.equal((await faceSwitch.locator('strong').innerText()).trim(), '琥珀翻页钟');
  assert.equal((await display(page)).mode, 'flip');
  await shot(page, '14-flip-clock-after-reload');
  record('flip-clock-switch-immersive-face-change-and-exit', true, `painted canvas ${canvas.width}×${canvas.height}, ${canvas.painted} px`);
  record('flip-clock-selection-survives-reload', true);
} catch (error) {
  report.fatal = error.stack;
  console.error(error.stack || error.message);
  try {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) await shot(page, 'failure');
  } catch {}
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeSummary();
  console.log(`OUTPUT ${output}`);
  await browser?.close();
  server?.kill();
}

const failed = Boolean(report.fatal) || report.checks.some((check) => !check.passed)
  || report.pageErrors.length || report.consoleErrors.length || report.unexpectedRequests.length;
if (failed) process.exitCode = 1;
