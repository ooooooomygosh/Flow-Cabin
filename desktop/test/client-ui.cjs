'use strict';
const { chooseRoomScene, openAddToShelf, openRecordTools, closeRecordCard } = require('./ui-fixture.cjs');
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'album-client-ui-'));
const output = path.join(__dirname, '../test-results/client'); fs.mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], limitations: [], pageErrors: [] }; let application, site;
async function launch() {
  const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ ...(process.env.ALBUM_QA_EXE ? { executablePath: path.resolve(process.env.ALBUM_QA_EXE), args: [] } : { args: [path.join(__dirname, '..')] }), env });
  await application.firstWindow();
  await application.evaluate(async ({ webContents }) => { const started = Date.now(); while (!webContents.getAllWebContents().some((contents) => contents.getURL().startsWith('https://album-circle.vercel.app'))) { if (Date.now() - started > 30000) throw new Error('Site view did not open'); await new Promise((resolve) => setTimeout(resolve, 100)); } });
  site = await application.waitForEvent('window', { predicate: (page) => page.url().startsWith('https://album-circle.vercel.app'), timeout: 5000 }).catch(() => application.windows().find((page) => page.url().startsWith('https://album-circle.vercel.app')));
  assert.ok(site); site.on('pageerror', (error) => report.pageErrors.push(error.message));
  await site.locator('.app-titlebar').waitFor({ timeout: 30000 });
  // A fresh profile opens the 新手引导 (PR #16); this test checks the cabin itself, so skip it.
  const onboarding = site.getByRole('dialog', { name: '新手引导', exact: true });
  await onboarding.waitFor({ timeout: 15000 }).catch(() => {});
  if (await onboarding.isVisible()) { await onboarding.getByRole('button', { name: '跳过引导', exact: true }).click(); await onboarding.waitFor({ state: 'hidden' }); }
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(1024, 768); });
  await site.waitForFunction(() => innerWidth <= 1100);
}
const check = (value) => report.checks.push(value);
(async () => {
  await launch();
  await site.locator('.cabin-pixel').waitFor(); assert.match(await site.locator('.app-brand small').innerText(), /0 张唱片/);
  await site.locator('.room-empty', { hasText: '等你放上第一张' }).waitFor(); check('fresh-start-opens-the-pixel-cabin-without-an-account');
  const add = await openAddToShelf(site, '手动填写');
  await add.getByLabel('专辑名').fill('本地验证专辑'); await add.getByLabel('歌手').fill('离线歌手'); await add.getByLabel('曲目').fill('第一首\n第二首');
  await add.getByRole('button', { name: /放上唱片架/ }).click(); await add.locator('.add-notice', { hasText: '本地验证专辑' }).waitFor();
  await add.getByRole('button', { name: '关闭添加到唱片架' }).click();
  await site.locator('.room-record').first().waitFor(); check('manual-album-persists-locally');
  await openRecordTools(site);
  await site.getByLabel('黑胶底色', { exact: true }).fill('#aabbcc');
  await site.getByRole('button', { name: '保存唱片设置', exact: true }).click(); await closeRecordCard(site); check('vinyl-customization');
  await chooseRoomScene(site, 'warm');
  await chooseRoomScene(site, 'pixel');
  await site.locator('.room-record').first().dblclick();
  await site.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.spinning === 'true'); check('cabin-looks-and-turntable');
  await site.getByRole('button', { name: /唱片卡片/ }).click(); const card = site.getByRole('dialog', { name: '唱片卡片：本地验证专辑' });
  await card.getByPlaceholder(/第一次听的场景/).fill('安装后的第一张'); await card.locator('.record-card-saved', { hasText: '已保存' }).waitFor();
  await card.getByRole('button', { name: '关闭唱片卡片' }).click(); check('record-card-notes');
  await site.getByRole('button', { name: '设置', exact: true }).click();
  await site.getByRole('tab', { name: '桌面', exact: true }).click();
  await application.evaluate(({ app }) => {
    if (process.platform === 'darwin') { app.setActivationPolicy('regular'); app.focus({ steal: true }); }
  });
  await site.getByRole('button', { name: '打开显示与字体', exact: true }).click();
  const shell = application.windows().find((page) => page.url().startsWith('album-desktop://shell'));
  await shell.locator('#zoom').fill('110'); await shell.locator('#zoom').dispatchEvent('change'); await shell.getByRole('button', { name: '完成', exact: true }).click();
  report.nativeFocus = await application.evaluate(async ({ webContents }) => {
    // Activate before opening settings; closing them must restore content focus.
    const started = Date.now();
    while (!webContents.getFocusedWebContents()?.getURL().startsWith('https://album-circle.vercel.app')) {
      if (Date.now() - started > 15000) throw new Error(`Keyboard focus did not return to content (focused=${webContents.getFocusedWebContents()?.getURL() || 'none'})`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return { passed: true, focusedURL: webContents.getFocusedWebContents().getURL() };
  });
  await site.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  const nativeKey = keyCode => application.evaluate(({ webContents }, keyCode) => {
    const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://album-circle.vercel.app'));
    contents.sendInputEvent({ type: 'keyDown', keyCode }); contents.sendInputEvent({ type: 'keyUp', keyCode });
  }, keyCode);
  await application.evaluate(({ webContents }) => {
    const focused = webContents.getFocusedWebContents();
    if (!focused?.getURL().startsWith('https://album-circle.vercel.app')) throw new Error('Content lost native focus before Escape');
    focused.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
    focused.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
  });
  await site.getByRole('dialog', { name: '设置', exact: true }).waitFor({ state: 'hidden' });
  check('native-content-focus-restored-and-focused-escape-closes-settings');
  check('settings-open-and-save');
  // Exercise the packaged native window and real renderer, without music accounts.
  await site.getByRole('button', { name: '进入全屏模式', exact:true }).click();
  await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'true', null, { timeout: 20000 });
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('album-desktop://shell')).isFullScreen()), true);
  await openAddToShelf(site, '我的歌单'); await nativeKey('ESC'); await site.getByRole('dialog').waitFor({ state:'hidden' });
  assert.equal(await site.evaluate(() => document.documentElement.dataset.desktopFullscreen), 'true');
  await site.getByRole('button', { name:'收起工具', exact:true }).click();
  await site.getByRole('button', { name:'显示工具', exact:true }).click();
  // 学习 is a 专注 dock tab, reached from the toolbar's 专注 badge (the toolbar stays under 显示工具).
  if (!await site.locator('.focus-dock').count()) await site.locator('.cabin-toolbar .focus-badge').click();
  await site.getByRole('tab', { name:'学习', exact:true }).click(); await site.getByLabel('词书', { exact:true }).waitFor();
  await site.screenshot({ path:path.join(output, 'native-fullscreen-study.png') });
  await site.getByLabel('新卡组名称').fill('模板验收'); await site.getByRole('button',{name:'新建',exact:true}).click();
  const templateDeck = site.locator('.study-decks li',{hasText:'模板验收'});
  await templateDeck.getByText('0 张 · 空词书 · 添加或导入词条后开始',{exact:true}).waitFor();
  assert.doesNotMatch(await templateDeck.innerText(), /已完成/);
  await templateDeck.getByRole('button',{name:'添加词条',exact:true}).click();
  await site.getByText('导入本地词书',{exact:true}).click();
  const templatePath = path.join(profile,'word-template.tsv');
  await application.evaluate(({webContents}, savePath) => {
    const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://album-circle.vercel.app'));
    globalThis.__qaTemplateDownload = new Promise(resolve => contents.session.once('will-download', (_event,item) => {
      item.setSavePath(savePath); item.once('done',(_event,state)=>resolve(state));
    }));
  },templatePath);
  await site.getByRole('button',{name:'下载两列模板',exact:true}).click();
  assert.equal(await application.evaluate(async()=>await globalThis.__qaTemplateDownload),'completed');
  assert.equal(fs.readFileSync(templatePath,'utf8'),'word\tmeaning\nwindow\t窗户\n');
  check('packaged-study-template-download-saves-exact-local-tsv');
  await site.evaluate(() => document.activeElement?.blur()); await nativeKey('ESC');
  await site.locator('.focus-dock').waitFor({state:'detached'});
  assert.equal(await site.evaluate(()=>document.documentElement.classList.contains('room-zen')),true);
  assert.equal(await site.evaluate(()=>document.documentElement.dataset.desktopFullscreen),'true');
  check('packaged-escape-closes-study-tools-before-immersive-and-fullscreen');
  await site.getByRole('button', { name:'隐藏工具', exact:true }).click();
  await site.evaluate(() => document.activeElement?.blur()); await nativeKey('ESC');
  await site.waitForFunction(() => !document.documentElement.classList.contains('room-zen'));
  assert.equal(await site.evaluate(() => document.documentElement.dataset.desktopFullscreen), 'true');
  await nativeKey('ESC'); await site.waitForFunction(() => document.documentElement.dataset.desktopFullscreen === 'false', null, { timeout:20000 });
  check('packaged-native-fullscreen-normal-immersive-dialog-learning-and-escape');

  if (process.env.ALBUM_QA_SKIP_WALLPAPER !== '1') {
  await site.getByRole('button', { name: '沉入桌面', exact: true }).click();
  await site.getByRole('button', { name: '浮出桌面', exact: true }).waitFor({ timeout: 20000 });
  await site.getByRole('button', { name: '浮出桌面', exact: true }).click(); check('native-desktop-wallpaper');
  } else report.limitations.push('Native desktop wallpaper attachment skipped by ALBUM_QA_SKIP_WALLPAPER=1');
  await site.screenshot({ path: path.join(output, 'cabin.png') });
  await application.close(); application = null;
  await launch(); await site.locator('.cabin-pixel').waitFor(); await site.locator('.room-record').first().waitFor();
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'collection.json'), 'utf8'));
  assert.equal(saved.items[0].title, '本地验证专辑'); assert.equal(saved.items[0].notes, '安装后的第一张'); check('collection-notes-and-style-survive-restart');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); report.passed = true;
})().catch((error) => { report.error = error.stack; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  if (application) await application.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
});
