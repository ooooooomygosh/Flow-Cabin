'use strict';
// The 唱片架 (bookcase close-up): every record filed in the 唱片 binder, both room looks, sort and filters,
// the record card (notes, play from a track, remove) and adding an album from the catalog.
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, chooseRoomScene, openAddToShelf, takeBinder, closeLibrary, openRecordCard, closeRecordCard, openConsole, closeConsole, deckRecord } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `shelf-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(15000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (e) => report.pageErrors.push(e.message));
  const items = Array.from({ length: 14 }, (_, i) => ({ ...albums[i % albums.length], id: `shelf-${i}`, title: `${albums[i % albums.length].title} ${String(i + 1).padStart(2, '0')}`, addedAt: `2026-09-${String(20 - i).padStart(2, "0")}T00:00:00.000Z` }));
  await mountFixture(app, site, { items });
  const shelf = await takeBinder(site, '唱片');
  assert.equal(await shelf.locator('.listen-grid li').count(), 14); assert.match(await shelf.getByRole('button', { name: /^唱片活页夹/ }).getAttribute('aria-label'), /14/);
  await closeLibrary(site);
  await site.locator('.desk-home').waitFor();
  await chooseRoomScene(site, 'warm');
  await chooseRoomScene(site, 'pixel'); check('every-record-filed-and-both-cabin-looks');

  const bookcase = await takeBinder(site, '唱片'); const titles = () => bookcase.locator('.listen-grid-title strong').allInnerTexts();
  await bookcase.getByRole('button', { name: /^筛选/ }).click(); await bookcase.getByLabel('排序方式').selectOption('title');
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title, 'zh')).map((item) => item.title);
  assert.deepEqual(await titles(), sorted);
  await bookcase.getByLabel('筛选类型').selectOption('song'); await bookcase.getByText('没有找到相符的唱片。').waitFor();
  await bookcase.getByRole('button', { name: '全部恢复', exact: true }).click(); assert.equal(await bookcase.locator('.listen-grid li').count(), 14);
  await bookcase.getByLabel('排序方式').selectOption('recent'); await bookcase.getByRole('button', { name: '好了', exact: true }).click(); await closeLibrary(site); check('sort-and-filter-the-shelf');

  const card = await openRecordCard(site, items[1].title);
  assert.equal(await card.locator('h3').innerText(), items[1].title);
  await card.getByPlaceholder(/第一次听的场景/).fill('下雪天的晚上'); await card.locator('.record-card-saved', { hasText: '已保存' }).waitFor();
  assert.deepEqual((await app.evaluate(() => globalThis.__qaCollectionWrites)).at(-1), ['update', 'shelf-1']);
  await site.screenshot({ path: path.join(output, 'record-card.png') });
  await card.locator('.record-card-tracks button').nth(1).click(); await card.waitFor({ state: 'detached' });
  await closeLibrary(site);
  assert.equal((await deckRecord(site)).id, 'shelf-1'); await (await openConsole(site)).locator('.console-track', { hasText: /^\s*02 ·/ }).waitFor(); await closeConsole(site); check('record-card-notes-and-play-from-a-track');

  { const again = await openRecordCard(site, items[1].title); await again.getByRole('button', { name: '移除' }).click(); await again.getByRole('button', { name: '确认移除' }).click();
    await site.locator('.app-toast', { hasText: '已从唱片架移除' }).waitFor(); await closeLibrary(site);
    assert.match(await (await takeBinder(site, '唱片')).getByRole('button', { name: /^唱片活页夹/ }).getAttribute('aria-label'), /13/); await closeLibrary(site);
    assert.equal(await deckRecord(site), null); check('remove-from-the-shelf-also-clears-the-deck'); }

  const add = await openAddToShelf(site);
  await add.getByRole('searchbox').fill('周杰伦'); await add.getByRole('button', { name: '搜索' }).click();
  await add.locator('.add-results li').first().waitFor(); await add.getByRole('button', { name: /放上唱片架/ }).first().click();
  await add.locator('.add-notice', { hasText: '已放上唱片架' }).waitFor(); assert.match(await (await takeBinder(site, '唱片')).getByRole('button', { name: /^唱片活页夹/ }).getAttribute('aria-label'), /14/);
  await add.getByRole('tab', { name: '手动填写' }).click(); await add.getByLabel('专辑名').fill('自己的磁带'); await add.getByLabel('歌手').fill('我'); await add.getByRole('button', { name: /放上唱片架/ }).click();
  await add.locator('.add-notice', { hasText: '自己的磁带' }).waitFor(); await site.screenshot({ path: path.join(output, 'add-album.png') });
  await add.getByRole('button', { name: '关闭添加到唱片架' }).click(); assert.match(await site.locator('.listen-grid-title').first().innerText(), /自己的磁带/); await closeLibrary(site); check('add-from-catalog-and-by-hand');

  const cdp = await site.context().newCDPSession(site);
  const innerHeightFor = (width) => Math.round(width * .5625);
  for (const width of [1024, 1920, 3840]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.round(width * .5625), deviceScaleFactor: 1, mobile: false });
    await site.waitForFunction((w) => innerWidth === w, width);
    const metrics = await site.evaluate(() => { const shelf = document.querySelector('.desk-shelf-plate').getBoundingClientRect(), pull = document.querySelector('.desk-pull').getBoundingClientRect(); return { scrollWidth: document.documentElement.scrollWidth, barRight: shelf.right, toolsBottom: pull.bottom }; });
    assert.ok(metrics.scrollWidth <= width + 1 && metrics.barRight <= width + 1 && metrics.toolsBottom <= innerHeightFor(width) + 1, JSON.stringify(metrics));
    check(`layout-fits-${width}`, metrics);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.passed = true;
})().catch((error) => { report.error = error.stack; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'shelf-failure.png') }).catch(() => {});
  if (app) await app.close().catch(() => {});
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'shelf-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error);
});
