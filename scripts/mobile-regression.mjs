// Production Android assets in Chromium with a deterministic native bridge double.
// This verifies layout/renderer behavior, not Android SQLite or system pickers.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openAddToShelf, openLibrary, closeLibrary, takeBinder, playRecord, openRecordCard, closeRecordCard, openSettingsSection, openConsole, closeConsole, libraryDialog } from './settings-actions.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output = path.join(root, 'mobile-test-results');
await fs.mkdir(output, { recursive: true });
const report = { bridge: 'deterministic mock', nativeDeviceTested: false, checks: [], errors: [] };
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const wav = Buffer.alloc(44 + 8000 * 2 * 60);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let server, browser, page;
// Android plays through the native CabinPlayer (src/mobile/platform.mjs); this double records what it is asked to play.
let nativePlayer = { playing: false, status: 'paused', position: 0, duration: 60, index: 0, mediaId: '', title: '' };
const db = new Map([
  ['flow-cabin-onboarding-v1', onboardingSeed()],
  ['flow-cabin-home-intro-v1', 'done'], // the first-visit hint card is a separate, dismissible overlay (it sits over the play key in phone landscape)
  ['album-circle-focus-v1:local-owner', JSON.stringify({ settings: { notify: false, chime: false } })],
  ['album-circle-performance-v1', 'low']
]), files = [], nativeQueue = [], account = { qqLoggedIn: false, neteaseLoggedIn: false, quality: 'exhigh', qualities: [{ id: 'standard', label: '标准' }, { id: 'exhigh', label: '高品质' }] };
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--config', 'vite.android.config.js', '--host', '127.0.0.1', '--port', '4293', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 100) throw new Error('Android preview did not start'); if (await fetch('http://127.0.0.1:4293').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium(); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.exposeBinding('__qaNativePromise', async (_source, { plugin, method, options }) => {
    if (plugin === 'CabinPlayer' && method === 'state') return nativePlayer;
    if (plugin === 'CabinPlayer' && method === 'queue') { nativeQueue.push(options); const item = options.items[options.index]; nativePlayer = { ...nativePlayer, playing: Boolean(options.play), status: options.play ? 'playing' : 'paused', position: options.position || 0, index: options.index, mediaId: item.provider === 'local' ? item.uri : `cabin://${item.provider}/${item.id}`, title: item.title }; return nativePlayer; }
    if (plugin === 'CabinPlayer' && method === 'command') { if (['pause', 'stop'].includes(options.action)) nativePlayer = { ...nativePlayer, playing: false, status: 'paused' }; if (options.action === 'play') nativePlayer = { ...nativePlayer, playing: true, status: 'playing' }; if (options.action === 'toggle') nativePlayer = { ...nativePlayer, playing: !nativePlayer.playing, status: nativePlayer.playing ? 'paused' : 'playing' }; return nativePlayer; }
    if (plugin === 'CabinDevice' && method === 'loadData') return { initialized: true, entries: Object.fromEntries(db) };
    if (plugin === 'CabinDevice' && method === 'saveData') { for (const { key, value } of options.changes) value === null ? db.delete(key) : db.set(key, value); return {}; }
    if (plugin === 'CabinDevice' && method === 'saveFile') { files.push(options); return { cancelled: false }; }
    if (plugin === 'CabinDevice' && method === 'startMusic') return { ready: true };
    if (plugin === 'CabinDevice' && method === 'musicRequest') { if (options.path === '/config') return { ...account }; if (options.path === '/quality') { account.quality = JSON.parse(options.body).quality; return { ...account }; } return { playlists: [], candidates: [] }; }
    if (plugin === 'CabinDevice' && ['musicLogin', 'musicLogout'].includes(method)) { account[options.provider === 'qq' ? 'qqLoggedIn' : 'neteaseLoggedIn'] = method === 'musicLogin'; return { ok: true }; }
    if (plugin === 'CabinDevice' && method === 'pickMusic') return { tracks: [1, 2].map(n => ({ uri: `content://qa/music/${n}.wav`, name: `${n}.wav`, title: `手机歌曲${n}`, artist: '测试歌手', album: '手机离线专辑', track: String(n), duration: '60000' })) };
    return {};
  });
  await context.addInitScript(() => {
    window.androidBridge = {};
    window.Capacitor = {
      convertFileSrc: uri => uri.startsWith('content://') ? `${location.origin}/_capacitor_content_/${uri.slice(10)}` : uri,
      PluginHeaders: [{ name: 'CabinPlayer', methods: [{ name: 'state', rtype: 'promise' }, { name: 'queue', rtype: 'promise' }, { name: 'command', rtype: 'promise' }, { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] }, { name: 'CabinDevice', methods: ['loadData', 'saveData', 'saveFile', 'pickMusic', 'setImmersive', 'startMusic', 'musicRequest', 'musicLogin', 'musicLogout', 'catalogRequest'].map(name => ({ name, rtype: 'promise' })) }, { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }, { name: 'minimizeApp', rtype: 'promise' }] }],
      nativePromise: (plugin, method, options) => window.__qaNativePromise({ plugin, method, options }),
      nativeCallback: () => 'mock-listener'
    };
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.setProperty('--safe-area-inset-top', '28px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px'); });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.errors.push(e.message));
  await page.route('**/_capacitor_content_/**', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'accept-ranges': 'bytes' } }));
  await page.goto('http://127.0.0.1:4293'); await page.locator('html[data-platform=android] .focus-badge').waitFor();
  await openAddToShelf(page, '手动填写');
  await page.getByLabel('专辑名', { exact: true }).fill('手机里的唱片'); await page.getByLabel('歌手', { exact: true }).fill('本地艺人'); await page.getByLabel('曲目', { exact: true }).fill('第一首\n第二首');
  await page.getByRole('button', { name: '放上唱片架', exact: true }).tap(); await page.getByText('《手机里的唱片》已放上唱片架。', { exact: true }).waitFor(); await page.keyboard.press('Escape'); await closeLibrary(page);
  assert.match(db.get('flow-cabin-web-collection-v1'), /手机里的唱片/); check('touch-add-persists-to-native-transaction-before-confirmation');
  const assertWithin = async selector => { const box = await page.locator(selector).first().boundingBox(), viewport = page.viewportSize(); assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, selector + ': ' + JSON.stringify(box)); };
  for (const [width, height] of [[360, 640], [390, 844], [412, 915], [844, 390], [800, 1280]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const desk = ['.desk-console-plate', '.desk-clock-face', '.desk-post', '.desk-shelf-plate', '.desk-pull'];
    for (const selector of desk) await assertWithin(selector);
    // The desk's entries stay reachable by touch: the drawer pull is 44 px; the plates DEsk drew are at least 24 px each way (WCAG 2.5.8).
    for (const selector of desk) { const box = await page.locator(selector).boundingBox(); assert.ok(box && Math.min(box.width, box.height) >= 24 - 1 && box.x >= 0 && box.x + box.width <= width + 1, selector + ' touch target at ' + width + 'x' + height + ' ' + JSON.stringify(box)); }
    assert.ok((await page.locator('.desk-pull').boundingBox()).height >= 44 - 1, 'the drawer pull is a 44 px touch target');
    await page.screenshot({ path: path.join(output, `android-layout-${width}x${height}.png`), animations: 'disabled' }); check(`phone-tablet-layout-${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await openRecordCard(page, '手机里的唱片');
  await page.getByLabel('我的笔记').fill('重启后也留下的手机笔记'); await page.getByLabel('我的笔记').blur(); await page.getByText('已保存在这台手机', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'android-record-card.png'), animations: 'disabled' }); await closeRecordCard(page); await closeLibrary(page);
  await page.reload(); await page.locator('.desk-home').waitFor(); assert.match(db.get('flow-cabin-web-collection-v1'), /重启后也留下的手机笔记/); check('reload-restores-native-collection-and-notes');
  await openSettingsSection(page, '数据');
  await page.getByText('这台手机的小屋', { exact: true }).waitFor(); await page.getByRole('button', { name: '收藏与备份', exact: true }).tap();
  await page.getByRole('button', { name: '导出备份', exact: true }).tap(); await page.getByText('备份已保存到你选择的位置。', { exact: true }).waitFor();
  const backup = JSON.parse(Buffer.from(files.at(-1).data, 'base64').toString('utf8')); assert.equal(backup.items[0].notes, '重启后也留下的手机笔记'); assert.equal(files.at(-1).mime, 'application/json'); check('backup-goes-through-native-save-picker-with-real-backup-data');
  await page.keyboard.press('Escape'); if (await page.getByRole('dialog', { name: '设置', exact: true }).count()) await page.keyboard.press('Escape');
  await page.locator('.focus-badge').tap(); await page.getByRole('tab', { name: '待办', exact: true }).tap();
  await page.screenshot({ path: path.join(output, 'android-focus.png'), animations: 'disabled' }); await assertWithin('dialog[open]'); check('focus-sheet-fits-safe-area-and-touch-tabs');
  await page.getByRole('dialog', { name: '专注', exact: true }).getByRole('button', { name: '关闭专注', exact: true }).tap();
  await openAddToShelf(page, '本地音乐');
  assert.equal(await page.getByRole('button', { name: '添加音乐文件夹', exact: true }).count(), 0);
  await page.getByRole('button', { name: '选择手机音乐', exact: true }).tap(); await page.getByRole('button', { name: '放上唱片架', exact: true }).tap();
  await page.getByText('《手机离线专辑》已放上唱片架。', { exact: true }).waitFor(); await page.keyboard.press('Escape'); await closeLibrary(page); await page.reload(); await page.locator('.desk-home').waitFor();
  await (await takeBinder(page, '唱片')).getByRole('button', { name: '播放 手机离线专辑', exact: true }).waitFor(); await closeLibrary(page);
  assert.match(db.get('flow-cabin-android-music-v1'), /content:\/\/qa\/music\/2.wav/); check('system-picked-music-mapping-survives-renderer-reload');
  await openSettingsSection(page, '音乐');
  await page.getByRole('radio', { name: '本地音乐', exact: true }).tap(); await page.keyboard.press('Escape');
  await playRecord(page, '手机离线专辑');
  // The restored content:// URI reaches the native player, which is asked to play it (no <audio> on Android).
  const playing = async (uri, timeout = 15000) => { for (const end = Date.now() + timeout; Date.now() < end; await new Promise(r => setTimeout(r, 100))) { const last = nativeQueue.at(-1); if (last?.play && last.items[last.index]?.uri === uri && nativePlayer.playing) return last; } assert.fail(`native player was not asked to play ${uri}: ${JSON.stringify(nativeQueue.at(-1))}`); };
  const first = await playing('content://qa/music/1.wav'); assert.deepEqual(first.items.map(item => item.uri), ['content://qa/music/1.wav', 'content://qa/music/2.wav'], 'the whole album is handed over');
  await openConsole(page); await page.getByRole('button', { name: /^选择曲目/ }).click(); await page.getByRole('listbox', { name: '唱机展示曲目', exact: true }).getByRole('option').nth(1).click();
  await playing('content://qa/music/2.wav'); await closeConsole(page);
  check('restored-phone-uri-plays-and-track-dropdown-autoplays-through-the-native-player');
  for (const [width, height, left, right, top, bottom] of [[393, 852, 0, 0, 44, 28], [852, 393, 44, 0, 0, 24], [852, 393, 0, 44, 0, 24], [360, 740, 0, 0, 32, 48]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(({ left, right, top, bottom }) => { for (const [side, value] of Object.entries({left,right,top,bottom})) document.documentElement.style.setProperty('--safe-area-inset-' + side, value + 'px'); window.dispatchEvent(new Event('resize')); }, {left,right,top,bottom}); await page.waitForTimeout(300);
    // The desk refits inside the cutout and system bars; the LED clock and the drawer pull stay uncovered.
    for (const selector of ['.desk-console-plate', '.desk-clock-face', '.desk-post', '.desk-shelf-plate', '.desk-pull']) { const box = await page.locator(selector).first().boundingBox(); assert.ok(box.x >= left - 1 && box.x + box.width <= width - right + 1 && box.y >= top - 1 && box.y + box.height <= height - bottom + 1, 'safe-area ' + selector + JSON.stringify({ box, left, right, top, bottom })); }
    for (const selector of ['.focus-badge', '.desk-pull']) { const hit = await page.locator(selector).first().evaluate(e => { const r = e.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { ok: e === top || e.contains(top), box: [r.x, r.y, r.width, r.height].map(Math.round), top: top && top.tagName + '.' + String(top.className).slice(0, 40) }; }); assert.equal(hit.ok, true, selector + ' is covered or clipped: ' + JSON.stringify({ hit, width, height, left, right })); }
    await page.screenshot({ path: path.join(output, `android-cutout-${width}x${height}-${left}-${right}.png`), animations:'disabled' }); check(`loaded-player-cutout-${width}x${height}-${left}-${right}`);
  }
  await page.setViewportSize({width:393,height:852}); await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-left','0px');document.documentElement.style.setProperty('--safe-area-inset-right','0px'); });
  await openSettingsSection(page, '音乐');
  assert.equal(await page.getByRole('radio', {name:'QQ 音乐',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('radio', {name:'网易云音乐',exact:true}).isEnabled(),true);
  await page.getByRole('button', {name:'账户与文件夹',exact:true}).tap(); await page.getByRole('button', {name:'登录',exact:true}).first().tap();
  await page.getByRole('button', {name:'重新登录',exact:true}).waitFor(); assert.equal(account.qqLoggedIn,true);
  await page.screenshot({path:path.join(output,'android-platform-accounts.png'),animations:'disabled'});
  await page.getByRole('button', {name:'退出平台',exact:true}).tap(); await page.waitForFunction(() => document.querySelector('.music-account button')?.textContent==='登录'); assert.equal(account.qqLoggedIn,false); check('phone-platform-login-and-logout-use-native-account-bridge');
  await page.keyboard.press('Escape'); await openRecordCard(page, '手机里的唱片'); await page.getByLabel('我的笔记').focus(); await page.setViewportSize({width:393,height:490}); await page.waitForTimeout(250);
  assert.equal(await page.locator('html').getAttribute('data-mobile-keyboard'),'true'); await assertWithin('dialog[open]');
  await page.screenshot({path:path.join(output,'android-keyboard-note.png'),animations:'disabled'}); check('keyboard-note-dialog-remains-reachable-without-player-overlay');
  // More records than any viewport can show: every one stays reachable by scrolling the open binder, and not covered.
  await page.getByLabel('我的笔记').blur(); await page.keyboard.press('Escape'); await closeRecordCard(page); await closeLibrary(page); await page.setViewportSize({width:393,height:852});
  const fixtureItems = Array.from({length:29},(_,index)=>({id:`mobile-page-${index}`,type:'album',title:`全面屏唱片 ${index+1}`,artist:'布局测试',tracks:['测试曲目'],addedAt:new Date(2026,0,1,index).toISOString()}));
  db.set('flow-cabin-web-collection-v1',JSON.stringify({version:1,items:fixtureItems}));
  for (const [width,height] of [[393,852],[852,393]]) {
    await page.setViewportSize({width,height}); await page.reload(); await page.locator('.desk-home').waitFor(); await page.waitForTimeout(300);
    await page.waitForFunction(() => !document.querySelector('.app-toast'), null, { timeout: 20000 }); // a passing toast may cover a cover for a moment
    const shelf = await takeBinder(page, '唱片'); const covers = shelf.locator('.listen-grid-cover');
    assert.equal(await covers.count(), fixtureItems.length, `${width}x${height}: every record is filed`);
    const visited = new Set();
    for (let index = 0; index < fixtureItems.length; index++) {
      const cover = covers.nth(index); await cover.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' })); await page.waitForTimeout(30);
      const reach = await cover.evaluate(element => { const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { label: element.getAttribute('aria-label'), hit: element === hit || element.contains(hit), top: hit && hit.tagName + '.' + String(hit.className).slice(0, 40), box: [r.x, r.y, r.width, r.height].map(Math.round) }; });
      assert.equal(reach.hit, true, `${width}x${height}: record blocked by other controls: ${JSON.stringify(reach)}`); visited.add(reach.label);
    }
    assert.equal(visited.size, fixtureItems.length, `${width}x${height}: some records cannot be reached`);
    await page.screenshot({path:path.join(output,`android-shelf-${width}x${height}.png`),animations:'disabled'}); check(`every-record-on-the-shelf-is-reachable-${width}x${height}`);
    await closeLibrary(page);
  }
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.error = error.stack; report.passed = false; console.error(error); await page?.screenshot({ path: path.join(output, 'android-failure.png'), animations: 'disabled' }).catch(() => {}); process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'mobile-ui-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
