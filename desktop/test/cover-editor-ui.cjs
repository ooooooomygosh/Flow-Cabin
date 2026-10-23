'use strict';
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture, albums, openRecordTools, closeRecordCard } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results/cover-editor'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { fixtureData: true, checks: [], pageErrors: [] }; let app, site;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  const cover = await app.evaluate(({ nativeImage }) => nativeImage.createFromBitmap(Buffer.from(Array.from({ length: 48 * 48 }, () => [30, 60, 210, 255]).flat()), { width: 48, height: 48 }).toDataURL());
  for (const testCase of ['opacity', 'splatter', 'manual-base', 'reset-base', 'opacity-early', 'splatter-early', 'manual-base-early', 'reset-base-early']) {
    const earlySave = testCase.endsWith('-early'), scenario = testCase.replace(/-early$/, '');
    const id = `delayed-${testCase}`, key = `item:${id}`;
    const item = { ...albums[0], id, title: scenario, externalIds: undefined, collectionId: undefined, cover: `https://album-circle.vercel.app/qa-colour.png?qa-slow-cover=${testCase}` };
    if (scenario === 'reset-base') await site.evaluate((key) => localStorage.setItem('album-circle-library-v1-local-owner', JSON.stringify({ styles: { [key]: { base: '#2255aa' } } })), key);
    await mountFixture(app, site, { items: [item], coverResponse: cover, slowCover: true });
    await site.locator('.room-record').first().click(); await openRecordTools(site);
    const editor = site.getByRole('dialog', { name: '自定义唱片' });
    assert.equal(await editor.getByLabel('黑胶底色', { exact: true }).inputValue(), scenario === 'reset-base' ? '#2255aa' : '#16191d');
    if (scenario === 'manual-base') await editor.getByLabel('黑胶底色', { exact: true }).fill('#00aa77');
    if (scenario === 'reset-base') await editor.getByRole('button', { name: '恢复默认黑胶', exact: true }).click();
    await editor.getByLabel('黑胶透明度').fill('62');
    if (scenario === 'splatter') {
      await editor.getByRole('button', { name: '海盐蓝', exact: true }).click();
      await editor.getByLabel('泼溅颜色数量', { exact: true }).selectOption('2');
      await editor.getByLabel('泼溅颜色 1', { exact: true }).fill('#cc00aa');
    }
    if (earlySave) { await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site); }
    await app.evaluate(() => globalThis.__qaReleaseImage());
    const expected = scenario === 'manual-base' ? '#00aa77' : '#d23c1e';
    // Wait on the independent shelf result first, then assert the editor did not
    // mistake an opacity/palette change for an explicit base-colour choice.
    if (scenario !== 'reset-base' && scenario !== 'manual-base') await site.waitForFunction(() => document.querySelector('.room-drag-record .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === '#d23c1e');
    if (!earlySave) {
      await site.waitForFunction((expected) => document.querySelector('.record-editor input[type=color]')?.value === expected, expected);
      assert.equal(await editor.getByLabel('黑胶透明度').inputValue(), '62');
      if (scenario === 'splatter') {
        assert.equal(await editor.getByLabel('泼溅颜色数量', { exact: true }).inputValue(), '2');
        assert.equal(await editor.getByLabel('泼溅颜色 1', { exact: true }).inputValue(), '#cc00aa');
      }
      await editor.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site);
    }
    const saved = await site.evaluate((key) => JSON.parse(localStorage.getItem('album-circle-library-v1-local-owner')).styles[key], key);
    assert.equal(saved.base, earlySave && scenario !== 'manual-base' ? '#16191d' : expected); assert.equal(saved.opacity, 62);
    assert.equal(saved.autoBase, scenario === 'manual-base' ? undefined : true);
    if (scenario === 'splatter') { assert.equal(saved.splatter, true); assert.deepEqual(saved.splashes, ['#cc00aa', '#ede3c7']); }
    await site.locator('.room-record').first().dblclick();
    await site.waitForFunction((expected) => document.querySelector('.room-turntable .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === expected, expected);
    await site.reload(); await site.locator('.room-record').first().dblclick();
    await site.waitForFunction((expected) => document.querySelector('.room-turntable .custom-vinyl')?.style.getPropertyValue('--vinyl-base') === expected, expected);
    report.checks.push(testCase); console.log('PASS delayed-cover-' + testCase);
  }
  assert.deepEqual(report.pageErrors, []); report.passed = true;
})().catch((error) => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await app?.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); if (report.error) console.error(report.error);
});
