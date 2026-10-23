// Production Android assets in Chromium with a deterministic native bridge double.
// This verifies layout/renderer behavior, not Android SQLite or system pickers.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output = path.join(root, 'mobile-test-results');
await fs.mkdir(output, { recursive: true });
const report = { bridge: 'deterministic mock', nativeDeviceTested: false, checks: [], errors: [] };
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const wav = Buffer.alloc(44 + 8000 * 2 * 60);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let server, browser, page;
const db = new Map([
  ['flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.6' })],
  ['album-circle-focus-v1:local-owner', JSON.stringify({ settings: { notify: false, chime: false } })],
  ['album-circle-performance-v1', 'low']
]), files = [], account = { qqLoggedIn: false, neteaseLoggedIn: false, quality: 'exhigh', qualities: [{ id: 'standard', label: '标准' }, { id: 'exhigh', label: '高品质' }] };
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--config', 'vite.android.config.js', '--host', '127.0.0.1', '--port', '4293', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 100) throw new Error('Android preview did not start'); if (await fetch('http://127.0.0.1:4293').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium(); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.exposeBinding('__qaNativePromise', async (_source, { plugin, method, options }) => {
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
      PluginHeaders: [{ name: 'CabinDevice', methods: ['loadData', 'saveData', 'saveFile', 'pickMusic', 'setImmersive', 'startMusic', 'musicRequest', 'musicLogin', 'musicLogout', 'catalogRequest'].map(name => ({ name, rtype: 'promise' })) }, { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }, { name: 'minimizeApp', rtype: 'promise' }] }],
      nativePromise: (plugin, method, options) => window.__qaNativePromise({ plugin, method, options }),
      nativeCallback: () => 'mock-listener'
    };
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.setProperty('--safe-area-inset-top', '28px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px'); });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.errors.push(e.message));
  await page.route('**/_capacitor_content_/**', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'accept-ranges': 'bytes' } }));
  await page.goto('http://127.0.0.1:4293'); await page.locator('html[data-platform=android] .focus-badge').waitFor();
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).tap();
  await page.getByRole('tab', { name: '手动填写', exact: true }).tap();
  await page.getByLabel('专辑名', { exact: true }).fill('手机里的唱片'); await page.getByLabel('歌手', { exact: true }).fill('本地艺人'); await page.getByLabel('曲目', { exact: true }).fill('第一首\n第二首');
  await page.getByRole('button', { name: '放上唱片架', exact: true }).tap(); await page.getByText('《手机里的唱片》已放上唱片架。', { exact: true }).waitFor(); await page.keyboard.press('Escape');
  assert.match(db.get('flow-cabin-web-collection-v1'), /手机里的唱片/); check('touch-add-persists-to-native-transaction-before-confirmation');
  const assertWithin = async selector => { const box = await page.locator(selector).first().boundingBox(), viewport = page.viewportSize(); assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, selector + ': ' + JSON.stringify(box)); };
  const assertFullBleed = async () => {
    assert.equal(await page.locator('.cabin-scene-canvas').count(), 1, 'The scene must use one camera, without a duplicated background cabinet');
    const art = await page.locator('.cabin-scene-art').boundingBox(), viewport = page.viewportSize();
    assert.ok(art.x <= .5 && art.y <= .5 && art.x + art.width >= viewport.width - .5 && art.y + art.height >= viewport.height - .5, 'Scene leaves a solid-filled edge: ' + JSON.stringify({ art, viewport }));
  };
  for (const [width, height] of [[360, 640], [390, 844], [412, 915], [844, 390], [800, 1280]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const selector of ['.app-titlebar', '.cabin-toolbar', '.room-now-playing', '.room-turntable']) await assertWithin(selector);
    const consoleBox = await page.locator('.turntable-console').boundingBox(), footerBox = await page.locator('.room-now-playing').boundingBox();
    assert.ok(consoleBox.y + consoleBox.height <= footerBox.y - 2 || consoleBox.x + consoleBox.width <= footerBox.x - 2 || consoleBox.x >= footerBox.x + footerBox.width + 2, 'Console content overlaps footer: ' + JSON.stringify({ consoleBox, footerBox }));
    const ratio = await page.locator('.cabin-scene-art').evaluate(e => { const b = e.getBoundingClientRect(); return b.width / b.height; }); assert.ok(Math.abs(ratio - 4 / 3) < .01);
    await assertFullBleed();
    await page.screenshot({ path: path.join(output, `android-layout-${width}x${height}.png`), animations: 'disabled' }); check(`phone-tablet-layout-${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '唱片卡片', exact: true }).tap();
  await page.getByLabel('我的笔记').fill('重启后也留下的手机笔记'); await page.getByLabel('我的笔记').blur(); await page.getByText('已保存在这台手机', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'android-record-card.png'), animations: 'disabled' }); await page.keyboard.press('Escape');
  await page.reload(); await page.locator('.room-record').waitFor(); assert.match(db.get('flow-cabin-web-collection-v1'), /重启后也留下的手机笔记/); check('reload-restores-native-collection-and-notes');
  await page.getByRole('button', { name: '设置', exact: true }).first().tap(); await page.getByRole('tab', { name: '数据与备份', exact: true }).tap();
  await page.getByText('这台手机的小屋', { exact: true }).waitFor(); await page.getByRole('button', { name: '收藏与备份', exact: true }).tap();
  await page.getByRole('button', { name: '导出备份', exact: true }).tap(); await page.getByText('备份已保存到你选择的位置。', { exact: true }).waitFor();
  const backup = JSON.parse(Buffer.from(files.at(-1).data, 'base64').toString('utf8')); assert.equal(backup.items[0].notes, '重启后也留下的手机笔记'); assert.equal(files.at(-1).mime, 'application/json'); check('backup-goes-through-native-save-picker-with-real-backup-data');
  await page.keyboard.press('Escape'); if (await page.getByRole('dialog', { name: '设置', exact: true }).count()) await page.keyboard.press('Escape');
  await page.locator('.focus-badge').tap(); await page.getByRole('tab', { name: '待办', exact: true }).tap();
  await page.screenshot({ path: path.join(output, 'android-focus.png'), animations: 'disabled' }); await assertWithin('.focus-dock'); check('focus-sheet-fits-safe-area-and-touch-tabs');
  await page.locator('.focus-dock-close').tap();
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).tap(); await page.getByRole('tab', { name: '本地音乐', exact: true }).tap();
  assert.equal(await page.getByRole('button', { name: '添加音乐文件夹', exact: true }).count(), 0);
  await page.getByRole('button', { name: '选择手机音乐', exact: true }).tap(); await page.getByRole('button', { name: '放上唱片架', exact: true }).tap();
  await page.getByText('《手机离线专辑》已放上唱片架。', { exact: true }).waitFor(); await page.keyboard.press('Escape'); await page.reload();
  await page.getByRole('button', { name: '选择 测试歌手 的 手机离线专辑', exact: true }).tap();
  assert.match(db.get('flow-cabin-android-music-v1'), /content:\/\/qa\/music\/2.wav/); check('system-picked-music-mapping-survives-renderer-reload');
  await page.getByRole('button', { name: '设置', exact: true }).first().tap(); await page.getByRole('tab', { name: '音源', exact: true }).tap();
  await page.getByRole('radio', { name: '本地音乐', exact: true }).tap(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '选择 测试歌手 的 手机离线专辑', exact: true }).dblclick();
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(a => a.src.includes('/music/1.wav') && !a.paused && a.currentTime > .1));
  await page.getByLabel('唱机展示曲目', { exact: true }).selectOption('1');
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(a => a.src.includes('/music/2.wav') && !a.paused && a.currentTime > .1));
  check('restored-phone-uri-plays-and-track-dropdown-autoplays-with-fixture-audio');
  for (const [width, height, left, right, top, bottom] of [[393, 852, 0, 0, 44, 28], [852, 393, 44, 0, 0, 24], [852, 393, 0, 44, 0, 24], [360, 740, 0, 0, 32, 48]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(({ left, right, top, bottom }) => { for (const [side, value] of Object.entries({left,right,top,bottom})) document.documentElement.style.setProperty('--safe-area-inset-' + side, value + 'px'); window.dispatchEvent(new Event('resize')); }, {left,right,top,bottom}); await page.waitForTimeout(300);
    for (const selector of ['.cabin-toolbar', '.room-turntable', '.room-now-playing']) { const box = await page.locator(selector).first().boundingBox(); assert.ok(box.x >= left && box.x + box.width <= width - right + 1 && box.y + box.height <= height - bottom + 1, 'safe-area ' + selector + JSON.stringify(box)); }
    const buttons = await page.locator('.pocket-wheel button').evaluateAll(elements => elements.map(e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}; }));
    for (let i=0;i<buttons.length;i++) for(let j=i+1;j<buttons.length;j++) { const a=buttons[i],b=buttons[j]; assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y, 'Player buttons overlap'); }
    const center = await page.locator('.pocket-center').evaluate(e => { const r=e.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return e===hit||e.contains(hit); }); assert.equal(center,true,'Play button is covered or clipped');
    const source = await page.locator('.turntable-source-chip').boundingBox(), consoleBounds = await page.locator('.turntable-console').boundingBox(); assert.ok(source.x >= consoleBounds.x && source.x+source.width<=consoleBounds.x+consoleBounds.width,'Source chip is clipped');
    const sleeves = await page.locator('.room-record').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,hit:element===hit||element.contains(hit)};}));
    for(const sleeve of sleeves){assert.ok(sleeve.left>=left-.5&&sleeve.right<=width-right+.5&&sleeve.top>=top-.5&&sleeve.bottom<=height-bottom+.5,'Sleeve did not refit after safe-area change: '+JSON.stringify({left,right,sleeve}));assert.equal(sleeve.hit,true,'Sleeve is blocked after same-size cutout side change');}
    await assertFullBleed();
    await page.screenshot({ path: path.join(output, `android-cutout-${width}x${height}-${left}-${right}.png`), animations:'disabled' }); check(`loaded-player-cutout-${width}x${height}-${left}-${right}`);
  }
  await page.setViewportSize({width:393,height:852}); await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-left','0px');document.documentElement.style.setProperty('--safe-area-inset-right','0px'); });
  await page.getByRole('button', { name:'设置',exact:true }).first().tap(); await page.getByRole('tab', {name:'音源',exact:true}).tap();
  assert.equal(await page.getByRole('radio', {name:'QQ 音乐',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('radio', {name:'网易云音乐',exact:true}).isEnabled(),true);
  await page.getByRole('button', {name:'账户与文件夹',exact:true}).tap(); await page.getByRole('button', {name:'登录',exact:true}).first().tap();
  await page.getByRole('button', {name:'重新登录',exact:true}).waitFor(); assert.equal(account.qqLoggedIn,true);
  await page.screenshot({path:path.join(output,'android-platform-accounts.png'),animations:'disabled'});
  await page.getByRole('button', {name:'退出平台',exact:true}).tap(); await page.waitForFunction(() => document.querySelector('.music-account button')?.textContent==='登录'); assert.equal(account.qqLoggedIn,false); check('phone-platform-login-and-logout-use-native-account-bridge');
  await page.keyboard.press('Escape'); await page.getByRole('button',{name:'唱片卡片',exact:true}).tap(); await page.getByLabel('我的笔记').focus(); await page.setViewportSize({width:393,height:490}); await page.waitForTimeout(250);
  assert.equal(await page.locator('html').getAttribute('data-mobile-keyboard'),'true'); assert.equal(await page.locator('.room-turntable').isVisible(),false); await assertWithin('dialog[open]');
  await page.screenshot({path:path.join(output,'android-keyboard-note.png'),animations:'disabled'}); check('keyboard-note-dialog-remains-reachable-without-player-overlay');
  // More records than any viewport can show: every page must remain reachable,
  // and the visible sleeves must be the original scene's clickable shelf cells.
  await page.getByLabel('我的笔记').blur(); await page.keyboard.press('Escape'); await page.setViewportSize({width:393,height:852});
  const fixtureItems = Array.from({length:29},(_,index)=>({id:`mobile-page-${index}`,type:'album',title:`全面屏唱片 ${index+1}`,artist:'布局测试',tracks:['测试曲目'],addedAt:new Date(2026,0,1,index).toISOString()}));
  db.set('flow-cabin-web-collection-v1',JSON.stringify({version:1,items:fixtureItems}));
  for (const look of ['pixel','warm','night-study','forest','seaside','starlight']) for (const [width,height] of [[393,852],[852,393]]) {
    db.set('album-circle-library-v1-local-owner',JSON.stringify({version:1,rooms:{'local-room':{look,petId:'cat',boxes:[]}}}));
    await page.setViewportSize({width,height}); await page.reload(); await page.locator('.room-record').first().waitFor(); await page.waitForTimeout(300);
    const visited = new Set();
    for (let index=0;index<fixtureItems.length;index++) {
      await assertFullBleed();
      const sleeves = await page.locator('.room-record').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:element.getAttribute('aria-label'),hit:element===hit||element.contains(hit),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}};}));
      assert.ok(sleeves.length>0,`${look} ${width}x${height}: no accessible shelf slots`);
      for(const sleeve of sleeves){assert.equal(sleeve.hit,true,`${look} ${width}x${height}: sleeve blocked by controls: ${JSON.stringify(sleeve)}`);visited.add(sleeve.label);}
      const next=page.getByRole('button',{name:'下一页唱片',exact:true});
      if(await next.count()===0||await next.isDisabled())break;
      const previous=await page.locator('.room-rack-grid').getAttribute('data-start-row');await next.tap();await page.waitForFunction(value=>document.querySelector('.room-rack-grid')?.dataset.startRow!==value,previous);await page.waitForTimeout(250);
    }
    assert.equal(visited.size,fixtureItems.length,`${look} ${width}x${height}: some records cannot be reached`);
    await page.screenshot({path:path.join(output,`android-fullbleed-${look}-${width}x${height}.png`),animations:'disabled'});check(`fullbleed-aligned-clickable-shelf-pages-${look}-${width}x${height}`);
  }
  const selectedSleeve=await page.locator('.room-record[aria-pressed=true]').getAttribute('aria-label');await page.setViewportSize({width:393,height:852});await page.waitForTimeout(400);
  assert.equal(await page.locator('.room-record[aria-pressed=true]').getAttribute('aria-label'),selectedSleeve);check('rotation-keeps-selected-record-on-its-new-page');
  await page.setViewportSize({width:640,height:240});await page.waitForTimeout(500);await assertFullBleed();
  assert.equal(await page.locator('.cabin-room').getAttribute('data-mobile-shelf-compact'),'true');
  await page.getByRole('button',{name:'打开播放器',exact:true}).tap();await page.getByRole('dialog',{name:'唱机特写',exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.setViewportSize({width:393,height:852});await page.waitForTimeout(400);assert.equal(await page.locator('.room-turntable').isVisible(),true);assert.equal(await page.locator('.cabin-room').getAttribute('data-mobile-shelf-compact'),'false');check('short-viewport-folds-console-but-retains-player-access-and-restores-on-resize');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.error = error.stack; report.passed = false; console.error(error); await page?.screenshot({ path: path.join(output, 'android-failure.png'), animations: 'disabled' }).catch(() => {}); process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'mobile-ui-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
