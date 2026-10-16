'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, chooseRoomScene, openRecordTools, closeRecordCard } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results');
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `library-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || path.join(desktop, 'node_modules/electron/dist/electron.exe');
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
  const filters = site.getByRole('button', { name: '整理唱片架', exact: true });
  await filters.click(); await site.getByRole('button', { name: '管理唱片盒', exact: true }).click();
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
  await site.getByLabel('筛选唱片盒').selectOption(boxes[0].id); assert.equal(await site.locator('.room-record').count(), 2);
  await site.getByLabel('筛选唱片盒').selectOption('all'); assert.equal(await site.locator('.room-record').count(), 12);
  check('create-rename-boxes-and-filter-the-shelf');

  await filters.click(); await site.locator('.room-record').first().click();
  await openRecordTools(site);
  const editor = site.getByRole('dialog', { name: '自定义唱片' });
  await editor.getByLabel('黑胶底色', { exact: true }).fill('#a23856'); await editor.getByLabel('黑胶透明度').fill('62');
  await editor.getByRole('button', { name: '复古金彩', exact: true }).click(); await editor.getByLabel('泼溅颜色数量', { exact: true }).selectOption('3');
  await editor.getByLabel('泼溅颜色 1', { exact: true }).fill('#f4db92'); await editor.getByLabel('泼溅颜色 2', { exact: true }).fill('#a53d45'); await editor.getByLabel('泼溅颜色 3', { exact: true }).fill('#eadbc0');
  await editor.getByLabel('流派标签', { exact: true }).fill('爵士，电子');
  await editor.screenshot({ path: path.join(output, 'custom-vinyl.png') });
  await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site);
  await site.locator('.room-record').first().dblclick();
  const vinyl = site.locator('.room-turntable .custom-vinyl');
  assert.equal(await vinyl.getAttribute('data-splatter'), 'true');
  assert.equal(await vinyl.evaluate((node) => getComputedStyle(node).getPropertyValue('--vinyl-base').trim()), '#a23856');
  assert.deepEqual(await vinyl.locator('[data-splash-colour]').evaluateAll((nodes) => nodes.map((node) => node.dataset.splashColour)), ['#f4db92', '#a53d45', '#eadbc0']);
  await filters.click(); await site.getByLabel('筛选流派').selectOption('爵士'); assert.equal(await site.locator('.room-record').count(), 1);
  await site.getByRole('button', { name: '清除音乐筛选' }).click(); assert.equal(await site.locator('.room-record').count(), 12); await filters.click();
  check('custom-vinyl-shows-on-the-turntable-and-genres-filter');

  await chooseRoomScene(site, 'warm');
  await site.reload(); await site.locator('.cabin-warm').waitFor(); assert.equal((await saved()).rooms[ROOM].look, 'warm');
  await chooseRoomScene(site, 'pixel');
  check('cabin-look-persists');

  await filters.click(); await site.getByRole('button', { name: '管理唱片盒', exact: true }).click();
  await manager.getByRole('button', { name: '最爱', exact: false }).click();
  await manager.getByRole('button', { name: '删除这个唱片盒' }).click(); await manager.getByRole('button', { name: '确认删除唱片盒' }).click();
  await manager.getByRole('button', { name: '完成', exact: true }).click();
  assert.equal(await site.locator('.room-record').count(), 12); assert.equal((await saved()).rooms[ROOM].boxes.length, 1);
  check('delete-box-keeps-the-shelf');

  // A real restart with the same user directory keeps every preference.
  await app.close(); app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  await mountFixture(app, site, { items }); await site.locator('.cabin-pixel').waitFor();
  const after = await saved();
  assert.equal(after.rooms[ROOM].boxes[0].name, '周末唱片'); assert.equal(after.styles['qq:' + items[0].externalIds.qqAlbumMid].opacity, 62); assert.deepEqual(after.genres['qq:' + items[0].externalIds.qqAlbumMid], ['爵士', '电子']);
  check('restart-retains-boxes-genres-vinyl-and-look');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.passed = true;
})().catch((error) => { report.error = error.stack; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'library-failure.png') }).catch(() => {});
  if (app) await app.close().catch(() => {});
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'library-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error);
});
