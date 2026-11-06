'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { binderSpine, mountFixture, albums, openRoomSettings, closeSettings, openRecordTools, closeRecordCard, takeBinder, closeLibrary, playRecord } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results');
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `library-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, paidAIRequests: 0, productionWrites: 0, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site, host;
const items = Array.from({ length: 14 }, (_, i) => ({ ...albums[i % albums.length], id: `library-fixture-${i}`, externalIds: i < albums.length ? albums[i].externalIds : undefined, collectionId: undefined, title: i < albums.length ? albums[i].title : `${albums[i % albums.length].title} · 测试 ${i}`, tags: i === 0 ? ['album', 'qq', 'Rock'] : [], addedAt: `2026-09-${String(29 - i).padStart(2, '0')}` }));
const saved = () => site.evaluate(() => JSON.parse(localStorage.getItem('album-circle-library-v1-local-owner')));
const ROOM = 'local-room';
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  await mountFixture(app, site, { items });
  // 唱片盒 are managed from 唱片架 › 唱片 › 筛选, and every box stands on the shelf as its own binder.
  let shelf = await takeBinder(site, '唱片');
  const filters = shelf.getByRole('button', { name: /^筛选/ });
  await filters.click(); await shelf.getByRole('button', { name: '管理唱片盒', exact: true }).click();
  const manager = site.getByRole('dialog', { name: '管理唱片盒' });
  await manager.getByLabel('新唱片盒名称').fill('周末收藏'); await manager.getByRole('button', { name: '新建唱片盒', exact: true }).click();
  await manager.getByRole('checkbox', { name: `唱片盒包含 ${items[0].title}`, exact: true }).check();
  await manager.getByRole('checkbox', { name: `唱片盒包含 ${items[1].title}`, exact: true }).check();
  await manager.getByLabel('重命名唱片盒').fill('周末唱片'); await manager.getByRole('button', { name: '重命名', exact: true }).click();
  await manager.getByLabel('新唱片盒名称').fill('最爱'); await manager.getByRole('button', { name: '新建唱片盒', exact: true }).click();
  await manager.getByRole('checkbox', { name: `唱片盒包含 ${items[0].title}`, exact: true }).check();
  await manager.screenshot({ path: path.join(output, 'record-boxes.png') });
  await manager.getByRole('button', { name: '完成', exact: true }).click();
  const boxes = (await saved()).rooms[ROOM].boxes;
  assert.equal(boxes.length, 2); assert.equal(boxes[0].name, '周末唱片');
  await site.getByLabel('筛选唱片盒').selectOption(boxes[0].id); assert.equal(await shelf.locator('.listen-grid li').count(), 2);
  await site.getByLabel('筛选唱片盒').selectOption('all'); assert.equal(await shelf.locator('.listen-grid li').count(), 14);
  await shelf.getByRole('button', { name: '好了', exact: true }).click();
  // The box is also a binder of its own, holding just its two records.
  await closeLibrary(site); const weekend = await takeBinder(site, '周末唱片'); assert.match(await binderSpine(site, '周末唱片').getAttribute('aria-label'), /，2/); assert.equal(await weekend.locator('.shelf-open-binder .listen-grid li').count(), 2);
  await closeLibrary(site);
  check('create-rename-boxes-and-filter-the-shelf');

  await openRecordTools(site, items[0].title);
  const editor = site.getByRole('dialog', { name: '自定义唱片' });
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#a23856'); await editor.getByLabel('黑胶透明度').fill('62');
  await editor.getByRole('button', { name: '复古金彩', exact: true }).click(); await editor.getByLabel('泼溅颜色数量', { exact: true }).selectOption('3');
  await editor.getByLabel('泼溅颜色 1', { exact: true }).fill('#f4db92'); await editor.getByLabel('泼溅颜色 2', { exact: true }).fill('#a53d45'); await editor.getByLabel('泼溅颜色 3', { exact: true }).fill('#eadbc0');
  await editor.getByLabel('流派标签', { exact: true }).fill('爵士，电子');
  await editor.screenshot({ path: path.join(output, 'custom-vinyl.png') });
  await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site); await closeLibrary(site);
  // The vinyl is painted on a canvas in 唱机特写 (the classic room drew it as DOM); its settings are what is stored.
  const style = (await saved()).styles['qq:' + items[0].externalIds.qqAlbumMid];
  assert.equal(style.base.toLowerCase(), '#a23856'); assert.equal(style.opacity, 62); assert.equal(style.splatter, true);
  assert.deepEqual(style.splashes, ['#f4db92', '#a53d45', '#eadbc0']);
  shelf = await takeBinder(site, '唱片'); await shelf.getByRole('button', { name: /^筛选/ }).click(); await site.getByLabel('筛选流派').selectOption('爵士'); assert.equal(await shelf.locator('.listen-grid li').count(), 1);
  await site.getByRole('button', { name: '清除音乐筛选' }).click(); assert.equal(await shelf.locator('.listen-grid li').count(), 14); await shelf.getByRole('button', { name: '好了', exact: true }).click(); await closeLibrary(site);
  check('custom-vinyl-is-stored-and-genres-filter');

  // 3.1: 设置 › 小屋与奶糖 picks the companion (there is no room-scene picker); the choice is kept per room and survives a reload.
  const lookBefore = (await saved()).rooms[ROOM]?.look;
  await openRoomSettings(site); await site.getByRole('button', { name: '选择桌宠 枫糖', exact: true }).click(); await closeSettings(site);
  await site.reload(); await site.locator('.desk-home').waitFor(); assert.equal((await saved()).rooms[ROOM].petId, 'fox'); assert.equal((await saved()).rooms[ROOM].look, lookBefore);
  await openRoomSettings(site); assert.equal(await site.getByRole('button', { name: '选择桌宠 枫糖', exact: true }).getAttribute('aria-pressed'), 'true'); await closeSettings(site);
  check('cabin-companion-persists');

  shelf = await takeBinder(site, '唱片'); await shelf.getByRole('button', { name: /^筛选/ }).click(); await shelf.getByRole('button', { name: '管理唱片盒', exact: true }).click();
  await manager.getByRole('button', { name: '最爱', exact: false }).click();
  await manager.getByRole('button', { name: '删除这个唱片盒' }).click(); await manager.getByRole('button', { name: '确认删除唱片盒' }).click();
  await manager.getByRole('button', { name: '完成', exact: true }).click();
  await shelf.getByRole('button', { name: '好了', exact: true }).click(); assert.equal(await shelf.locator('.listen-grid li').count(), 14); assert.equal((await saved()).rooms[ROOM].boxes.length, 1);
  await closeLibrary(site);
  check('delete-box-keeps-the-shelf');

  // A real restart with the same user directory keeps every preference.
  await app.close(); app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  await mountFixture(app, site, { items }); await site.locator('.desk-home').waitFor();
  const after = await saved();
  assert.equal(after.rooms[ROOM].boxes[0].name, '周末唱片'); assert.equal(after.styles['qq:' + items[0].externalIds.qqAlbumMid].opacity, 62); assert.deepEqual(after.genres['qq:' + items[0].externalIds.qqAlbumMid], ['爵士', '电子']); assert.equal(after.rooms[ROOM].petId, 'fox');
  check('restart-retains-boxes-genres-vinyl-and-companion');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.passed = true;
})().catch((error) => { report.error = error.stack; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'library-failure.png') }).catch(() => {});
  if (app) await app.close().catch(() => {});
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'library-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error);
});
