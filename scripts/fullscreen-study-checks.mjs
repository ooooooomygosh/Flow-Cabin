import assert from 'node:assert/strict';
import path from 'node:path';
export async function verifyFullscreenStudy({ browser, origin, output, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  const errors = [], commands = [];
  await context.addInitScript(() => {
    if (location.origin === 'null') return;
    localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 1, status: 'done', step: 'done' }));
    window.__commands = []; window.open = url => { window.__commands.push(String(url)); return null; };
    window.albumDesktopAppearance = { client: true, reduceMotion: true };
    const init = () => { document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = 'true'; };
    if (document.documentElement) init(); else new MutationObserver((_, observer) => { if (document.documentElement) { init(); observer.disconnect(); } }).observe(document, { childList: true });
  });
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `fullscreen-${i}`, type: 'album', title: `小屋试听唱片 ${i+1}`, artist: '演示收藏', tracks: ['晨光', '雨后'], source: 'manual', cover: '', addedAt: '2026-10-11T12:00:00Z' }));
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { errors.push('external request blocked'); return route.abort(); }
    const json = value => route.fulfill({ json: value });
    if (u.pathname === '/api/items') return json({ items });
    if (u.pathname === '/desktop-music/config') return json({ qqLoggedIn: false, neteaseLoggedIn: false });
    if (u.pathname === '/desktop-music/now-playing') return json({ available: false });
    if (u.pathname === '/desktop-music/local/summary') return json({ folders: [], albumCount: 0, trackCount: 0 });
    if (u.pathname === '/desktop-music/apple/permission') return json({ available: false });
    if (u.pathname === '/desktop-music/playlists') return json({ loggedIn: false, playlists: [] });
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/desktop-music/')) { errors.push(u.pathname); return json({}); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  const state = async on => page.evaluate(on => { document.documentElement.dataset.desktopFullscreen = String(on); window.dispatchEvent(new CustomEvent('album-desktop-fullscreen', { detail: on })); }, on);
  const shot = async name => { if (output) await page.screenshot({ path: path.join(output, name+'.png'), animations: 'disabled' }); };
  // 学习 is a focus-dock tab, opened from the toolbar's 专注 badge (the one entry, also in immersive + 显示工具).
  const openStudy = async () => { if (!await page.locator('.focus-dock').count()) await page.locator('.cabin-toolbar .focus-badge').click(); await page.getByRole('tab', { name: '学习', exact: true }).click(); };
  const studyState = () => page.evaluate(() => JSON.parse(localStorage.getItem('album-circle-study-v1:local-owner') || '{}'));
  try {
    await page.goto(origin); await page.locator('.room-record').first().waitFor();
    await page.getByRole('button', { name: '进入全屏模式', exact: true }).click();
    assert.match(await page.evaluate(() => window.__commands.at(-1)), /action\/fullscreen$/);
    await state(true); await page.getByRole('button', { name: '退出全屏模式', exact: true }).waitFor();
    await page.locator('.room-record').first().dblclick();
    await page.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.loadedId === 'fullscreen-0');
    await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('tab', { name: '我的歌单', exact: true }).click(); await page.getByRole('dialog', { name: '添加到唱片架', exact: true }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.documentElement.dataset.desktopFullscreen), 'true');
    assert.equal(await page.evaluate(() => window.__commands.some(x => x.endsWith('/fullscreen-exit'))), false);
    await page.locator('.room-cat').click(); await shot('fullscreen-normal');
    check('fullscreen-normal-record-playlist-pet-and-dialog-remain-interactive');
    await page.getByRole('button', { name: '收起工具', exact: true }).click();
    assert.equal(await page.locator('.app-titlebar').isVisible(), false);
    await page.getByRole('button', { name: '显示工具', exact: true }).waitFor(); await shot('fullscreen-immersive');
    // The physical deck remains an actual drag target in immersive mode.
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await transfer.evaluate(d => d.setData('application/x-album-circle-record', 'fullscreen-1'));
    await page.locator('.scene-deck').dispatchEvent('drop', { dataTransfer: transfer });
    await page.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.loadedId === 'fullscreen-1');
    await transfer.dispose();
    await page.getByRole('button', { name: '显示工具', exact: true }).click();
    await page.locator('.app-titlebar').waitFor(); await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('toolbar', { name: '全屏与沉浸工具' }).getByRole('button', { name: '学习' }).count(), 0, 'immersive tools do not duplicate the dock tabs');
    await openStudy(); await page.getByLabel('入门词书', { exact: true }).waitFor();
    await shot('fullscreen-immersive-tools-study'); check('immersive-drag-target-recovery-playlists-and-study');
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Escape');
    await page.locator('.focus-dock').waitFor({ state:'detached' });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-zen')),true);
    assert.equal(await page.evaluate(() => window.__commands.some(x => x.endsWith('/fullscreen-exit'))),false);
    await page.getByRole('button', { name: '隐藏工具', exact: true }).click();
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-zen')), false);
    assert.equal(await page.evaluate(() => window.__commands.some(x => x.endsWith('/fullscreen-exit'))), false);
    await page.keyboard.press('Escape'); assert.match(await page.evaluate(() => window.__commands.at(-1)), /fullscreen-exit$/);
    await state(false); check('escape-closes-dialog-then-immersive-then-requests-native-exit');
    await openStudy(); await page.getByLabel('词书每日新词').fill('5'); assert.equal((await studyState()).newPerDay, 5); assert.equal(await page.getByText('每天新卡').count(), 0, 'one daily-new control');
    await page.getByText('预览 6 个词', { exact: true }).click(); await shot('study-book-library');
    await page.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
    await page.getByRole('button', { name: '翻到背面（空格）', exact: true }).waitFor();
    assert.equal((await studyState()).cards.length, 1);
    await page.getByRole('button', { name: '翻面 · 空格', exact: true }).click(); await page.getByRole('button', { name: /^记得/ }).click();
    const saved = (await studyState()).cards.find(card => card.memory); assert(saved.memory.reps > 0);
    await page.keyboard.press('Escape'); await page.getByLabel('入门词书', { exact: true }).selectOption('book-music');
    await page.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
    await page.getByRole('button', { name: '翻到背面（空格）', exact: true }).waitFor(); await shot('study-review');
    assert.deepEqual((await studyState()).cards.find(card => card.id === saved.id), saved);
    await page.keyboard.press('Escape');
    await page.getByLabel('新卡组名称').fill('导入练习'); await page.getByRole('button', { name: '新建', exact: true }).click();
    const importDeck = page.locator('.study-decks li', { hasText: '导入练习' });
    await importDeck.getByText('0 张 · 空词书 · 添加或导入词条后开始', { exact: true }).waitFor();
    assert.doesNotMatch(await importDeck.innerText(), /已完成/);
    await importDeck.getByRole('button', { name: '添加词条', exact: true }).click();
    await page.getByText('导入本地词书', { exact: true }).click();
    const templateDownload = page.waitForEvent('download'); await page.getByRole('button',{name:'下载两列模板',exact:true}).click();
    const template = await templateDownload; assert.equal(template.suggestedFilename(),'小屋词书模板.tsv');
    await page.getByLabel('选择词书文件').setInputFiles({ name: 'example.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from('word\tmeaning\nwindow\t窗户\nwindow\t重复\nbroken\t\n<script>plain</script>\t普通文本') });
    await page.getByLabel('首行为标题').check();
    await page.getByText('有效 2 · 重复 1 · 错误 1', { exact: true }).waitFor(); await shot('study-import-preview');
    await page.getByRole('button', { name: '确认追加 2 张', exact: true }).click();
    await page.getByText('已追加 2 张卡片；旧进度保持不变。', { exact: true }).waitFor();
    assert.deepEqual((await studyState()).cards.find(card => card.id === saved.id), saved);
    await page.reload(); await openStudy();
    await importDeck.getByText('2 张 · 未开始', { exact: true }).waitFor();
    await importDeck.getByRole('button', { name: '编辑', exact: true }).waitFor();
    assert.deepEqual((await studyState()).cards.find(card => card.id === saved.id), saved); check('wordbook-preview-review-switch-import-and-reload-preserve-progress');
    for (const size of [{width:960,height:600},{width:1280,height:800}]) { await page.setViewportSize(size); await state(true); await shot(`fullscreen-study-${size.width}x${size.height}`); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    check('fullscreen-study-small-screen-layout');
    await page.addInitScript(() => {
      if (location.origin === 'null') return;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'album-circle-study-v1:local-owner') window.__studyWrites = (window.__studyWrites || 0)+1; return original.call(this,key,value); };
    });
    await page.evaluate(() => localStorage.setItem('album-circle-study-v1:local-owner', JSON.stringify({ decks:[{id:'full',name:'满容量旧卡'}], cards:Array.from({length:5000},(_,i)=>({id:`full-${i}`,deckId:'full',front:`word-${i}`,back:'旧释义',createdAt:Date.now()+i,memory:null})), newPerDay:5, log:{} })));
    await page.reload(); await openStudy(); await page.getByRole('button', {name:'开始学习 / 复习',exact:true}).click();
    await page.getByText('学习卡已达 5,000 张上限；旧词仍可复习。整理不需要的卡片后再添加新词。', {exact:true}).waitFor();
    await page.waitForTimeout(300);
    assert.equal((await studyState()).cards.length,5000); assert.equal(await page.evaluate(()=>window.__studyWrites),1);
    await shot('study-full-capacity'); check('full-capacity-wordbook-does-not-loop-or-rewrite-existing-cards');
    assert.deepEqual(errors, []);
  } catch (error) { await shot('fullscreen-study-failure'); throw error; }
  finally { await context.close(); }
}
