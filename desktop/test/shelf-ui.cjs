'use strict';
// The cabin shelf: twelve records per view, both looks, filters, the record
// card (notes, play from a track, remove) and adding an album from the catalog.
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, chooseRoomScene, openAddToShelf } = require('./ui-fixture.cjs');
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
  assert.equal(await site.locator('.room-record').count(), 12); assert.match(await site.locator('.app-brand small').innerText(), /14 张唱片/);
  assert.equal(await site.locator('.cabin-scene').getAttribute('data-room-look'), 'pixel');
  await chooseRoomScene(site, 'warm');
  assert.equal(await site.locator('.cabin-scene-art').getAttribute('src'), '/room-scenes/warm-cabin.png');
  await chooseRoomScene(site, 'pixel'); check('twelve-records-and-both-cabin-looks');
  await site.getByRole('button', { name: '下一排唱片' }).click(); assert.equal(await site.locator('.room-record').count(), 10);
  await site.getByRole('button', { name: '上一排唱片' }).click(); assert.equal(await site.locator('.room-record').count(), 12); check('shelf-rows-keep-every-album-reachable');

  await site.getByRole('button', { name: '整理唱片架', exact: true }).click(); await site.getByLabel('排序方式').selectOption('title');
  assert.equal(await site.locator('.room-record').first().getAttribute('aria-label'), `选择 ${[...items].sort((a, b) => a.title.localeCompare(b.title, 'zh'))[0].artist} 的 ${[...items].sort((a, b) => a.title.localeCompare(b.title, 'zh'))[0].title}`);
  await site.getByLabel('筛选类型').selectOption('song'); await site.locator('.room-empty', { hasText: '没有符合筛选的唱片' }).waitFor();
  await site.getByRole('button', { name: '清除筛选' }).click(); assert.equal(await site.locator('.room-record').count(), 12);
  await site.getByLabel('排序方式').selectOption('recent'); await site.getByRole('button', { name: '整理唱片架', exact: true }).click(); check('sort-and-filter-the-shelf');

  await site.locator('.room-record').nth(1).click(); assert.ok((await site.locator('.room-selection-copy h2').innerText()).includes(items[1].title));
  await site.getByRole('button', { name: /唱片卡片/ }).click();
  const card = site.getByRole('dialog', { name: `唱片卡片：${items[1].title}` }); await card.waitFor();
  assert.equal(await card.locator('h3').innerText(), items[1].title);
  await card.getByPlaceholder(/第一次听的场景/).fill('下雪天的晚上'); await card.locator('.record-card-saved', { hasText: '已保存' }).waitFor();
  assert.deepEqual((await app.evaluate(() => globalThis.__qaCollectionWrites)).at(-1), ['update', 'shelf-1']);
  await site.screenshot({ path: path.join(output, 'record-card.png') });
  await card.locator('.record-card-tracks button').nth(1).click(); await card.waitFor({ state: 'detached' });
  assert.equal(await site.locator('.room-turntable').getAttribute('data-loaded-id'), 'shelf-1'); assert.match(await site.locator('.turntable-track').innerText(), /^02 ·/); check('record-card-notes-and-play-from-a-track');

  await site.getByRole('button', { name: /唱片卡片/ }).click(); await card.getByRole('button', { name: '移除' }).click(); await card.getByRole('button', { name: '确认移除' }).click();
  await site.locator('.app-toast', { hasText: '已从唱片架移除' }).waitFor(); assert.match(await site.locator('.app-brand small').innerText(), /13 张唱片/);
  assert.equal(await site.locator('.room-turntable').getAttribute('data-loaded-id'), ''); check('remove-from-the-shelf-also-clears-the-deck');

  const add = await openAddToShelf(site);
  await add.getByRole('searchbox').fill('周杰伦'); await add.getByRole('button', { name: '搜索' }).click();
  await add.locator('.add-results li').first().waitFor(); await add.getByRole('button', { name: /放上唱片架/ }).first().click();
  await add.locator('.add-notice', { hasText: '已放上唱片架' }).waitFor(); assert.match(await site.locator('.app-brand small').innerText(), /14 张唱片/);
  await add.getByRole('tab', { name: '手动填写' }).click(); await add.getByLabel('专辑名').fill('自己的磁带'); await add.getByLabel('歌手').fill('我'); await add.getByRole('button', { name: /放上唱片架/ }).click();
  await add.locator('.add-notice', { hasText: '自己的磁带' }).waitFor(); await site.screenshot({ path: path.join(output, 'add-album.png') });
  await add.getByRole('button', { name: '关闭添加到唱片架' }).click(); assert.match(await site.locator('.room-record').first().getAttribute('aria-label'), /自己的磁带/); check('add-from-catalog-and-by-hand');

  const cdp = await site.context().newCDPSession(site);
  for (const width of [1024, 1920, 3840]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.round(width * .5625), deviceScaleFactor: 1, mobile: false });
    await site.waitForFunction((w) => innerWidth === w, width);
    const metrics = await site.evaluate(() => { const bar = document.querySelector('.app-titlebar').getBoundingClientRect(), tools = document.querySelector('.cabin-toolbar').getBoundingClientRect(); return { scrollWidth: document.documentElement.scrollWidth, barRight: bar.right, toolsBottom: tools.bottom, rack: document.querySelector('.room-rack').getBoundingClientRect().top }; });
    assert.ok(metrics.scrollWidth <= width + 1 && metrics.barRight <= width + 1, JSON.stringify(metrics));
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
