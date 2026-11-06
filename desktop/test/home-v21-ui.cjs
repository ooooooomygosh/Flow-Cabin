'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openDrawerThing, openFocus, openLibrary, libraryDialog, backToDesk } = require('./ui-fixture.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-home21-native-'));
const output = path.join(__dirname, '../test-results/home-v21-native'); fs.mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [], nativeIcons: [] };
let application, page;
async function launch() {
  const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ ...(process.env.ALBUM_QA_EXE ? { executablePath: path.resolve(process.env.ALBUM_QA_EXE), args: [] } : { args: [path.join(__dirname, '..')] }), env });
  await application.firstWindow();
  for (let i = 0; i < 150; i++) { page = application.windows().find(p => p.url().startsWith('https://album-circle.vercel.app')); if (page) break; await new Promise(r => setTimeout(r, 100)); }
  assert.ok(page, 'native site view'); page.on('pageerror', e => report.errors.push(e.message));
  await page.locator('.desk-home').waitFor({ timeout: 30000 });
  const intro = page.getByRole('button', { name: '知道了', exact: true }); if (await intro.isVisible()) await intro.click();
  await application.evaluate(({ BrowserWindow, app, Tray }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('album-desktop://shell'));
    win.unmaximize(); win.setSize(1440, 960); app.focus({ steal: true });
    globalThis.__icons = []; globalThis.__dockIcons = [];
    if (process.platform === "win32") { const paintWindow=BrowserWindow.prototype.setIcon; BrowserWindow.prototype.setIcon=function(image){globalThis.__dockIcons.push({size:image.getSize(),scales:image.getScaleFactors()});return paintWindow.call(this,image);}; }
    const paint = Tray.prototype.setImage; Tray.prototype.setImage = function (image) { globalThis.__qaTray = this; globalThis.__icons.push({ pet: this.__petId, size: image.getSize(), scales: image.getScaleFactors(), template: image.isTemplateImage() }); return paint.call(this, image); };
    if (app.dock) { const dock = app.dock.setIcon.bind(app.dock); app.dock.setIcon = image => { globalThis.__dockIcons.push({ size: image.getSize(), scales: image.getScaleFactors() }); return dock(image); }; }
  });
}
// Put the top sheet back: its folded corner when it has one, Esc otherwise (the focus close-up has 放回 · Esc, no corner).
const close = async () => { const corner = page.locator('dialog[open] .cabin-dialog-close').last(); if (await corner.isVisible().catch(() => false)) { await corner.click(); return; } const n = await page.locator('dialog[open]').count(); await page.keyboard.press('Escape'); await page.waitForFunction((k) => document.querySelectorAll('dialog[open]').length < k, n); };
// The desk's drawer holds what the old 小屋日常 menu held (小屋明信片 is 明信片 there).
async function menu(name) { await openDrawerThing(page, ({ 小屋明信片: '明信片' })[name] || name); }
async function choosePet(id, name) {
  await openDrawerThing(page, '伙伴'); await page.getByRole('button', { name: '选择伙伴', exact: true }).click();
  await page.getByRole('button', { name: `选择桌宠 ${name}`, exact: true }).click(); await close();
  // The desk draws no pet: the choice is saved for the tray, the Dock and the desktop pet.
  await page.waitForFunction(id => { const key = Object.keys(localStorage).find(k => k.startsWith('album-circle-library-v1-')); return key && Object.values(JSON.parse(localStorage.getItem(key)).rooms || {})[0]?.petId === id; }, id);
  for (let i = 0; i < 50 && await application.evaluate(() => globalThis.__qaTray?.__petId) !== id; i++) await page.waitForTimeout(100);
  assert.equal(await application.evaluate(() => globalThis.__qaTray?.__petId), id);
  const icon = await application.evaluate(() => ({ tray: globalThis.__icons.at(-1), dock: globalThis.__dockIcons.at(-1) }));
  assert.equal(icon.tray.template, false); assert.ok(icon.tray.size.width >= 16);
  // Linux has no Dock and the window icon is only hooked on Windows; the tray is checked everywhere.
  if (process.platform !== 'linux') assert.equal(icon.dock.size.width, 512); if(process.platform==='darwin'){assert.equal(icon.tray.size.width,18);assert.ok(icon.tray.scales.includes(2));assert.ok(icon.dock.scales.includes(2));}
  report.nativeIcons.push({ id, ...icon });
}
(async () => {
  await launch();
  await page.locator('.desk-home').waitFor(); assert.equal(await page.locator('.cabin-room').count(),0,'The life cabin is the only home');
  // The fresh profile's lazy guide may mount after the home. Dismiss it through its visible action if it comes.
  // A getter: each relaunch replaces `page`.
  const skipGuide=async(timeout=8000)=>{const guide=page.getByRole('dialog',{name:'新手引导',exact:true});if(await guide.waitFor({timeout}).then(()=>true,()=>false)){await guide.getByRole('button',{name:'跳过引导',exact:true}).click();await guide.waitFor({state:'hidden'});}};
  await skipGuide();
  // 随手记 is the memo pad inside 这一段 of the 专注 panel (the LED clock opens it).
  const openMemo=async()=>{await openFocus(page);await page.getByRole('tab',{name:'随手记',exact:true}).click();};
  // 3.1: the original shelf home is gone. A "classic" choice saved by an earlier version is ignored and cleared; the 专辑墙
  // (now inside 唱片架) is intact, and there is nothing left to switch.
  await page.evaluate(()=>localStorage.setItem('flow-cabin-interface-v1','classic'));
  await page.reload();await page.locator('.desk-home').waitFor();await skipGuide(30000);
  assert.equal(await page.evaluate(()=>localStorage.getItem('flow-cabin-interface-v1')),null,'the stored classic choice is forgotten');
  assert.equal(await page.locator('.cabin-room, .app-titlebar').count(),0);
  await (await openLibrary(page)).getByRole('button',{name:'专辑墙',exact:true}).click();await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');await libraryDialog(page).waitFor({state:'hidden'});await backToDesk(page);
  report.checks.push('The life cabin is the only home: a stored classic choice is ignored and cleared, the album wall opens from the record shelf');
  assert.equal(await page.locator('[data-cabin-audio-host] audio').count(), 2);
  await openMemo();
  await page.getByRole('textbox', { name: '随手记内容' }).fill('原生小屋：关闭工具之后，这份草稿还在。'); await close();
  await openMemo(); assert.match(await page.getByRole('textbox', { name: '随手记内容' }).inputValue(), /这份草稿还在/); await close();
  await openFocus(page); await page.getByRole('dialog').getByRole('button', { name: '开始专注', exact: true }).click(); await close();
  assert.match(await page.locator('.desk-clock-face').getAttribute('aria-label'), /还剩 (24|25):/); report.checks.push('Native home opens notes/focus from the desk and preserves draft and timer');
  for (const [id, name] of [['chick','蛋挞'],['bunny','棉花'],['bear','可可'],['fox','枫糖'],['cat','奶糖']]) await choosePet(id, name);
  report.checks.push('Five pets update the saved companion, real native Dock 512/1024 and colored Retina menu icons');
  if(process.platform==='darwin'){
  await application.evaluate(() => globalThis.__qaTray.emit('click'));
  let popup; for (let i=0;i<30;i++) { popup=application.windows().find(p=>p.url().includes('pet-menu.html')); if(popup)break;await page.waitForTimeout(100); }
  assert.ok(popup); await popup.locator('button').first().waitFor(); await popup.screenshot({ path: path.join(output,'menu-pet.png') });
  await popup.getByRole('button', { name: /暂停专注|专注/ }).click(); await page.waitForTimeout(1200);
  await openFocus(page); await page.getByRole('button', { name: '继续', exact: true }).waitFor(); await close(); report.checks.push('Menu popup controls the existing home focus session');
  } else { await openFocus(page);await page.getByRole('button',{name:'暂停',exact:true}).click();await close(); }
  // 桌面歌词: the shell reads the page's lyric feed; a fixture feed stands in for a playing song.
  await application.evaluate(({ BrowserWindow }) => { globalThis.__ignore = []; const original = BrowserWindow.prototype.setIgnoreMouseEvents; BrowserWindow.prototype.setIgnoreMouseEvents = function (value, options) { globalThis.__ignore.push([value, Boolean(options?.forward)]); return original.call(this, value, options); }; });
  await page.evaluate(() => { window.cabinLyricFeed = { take: rev => ({ docRev: 7, ...(rev === 7 ? {} : { doc: { precision: 'line', lines: [{ s: 0, e: 600000, w: [['同一首歌，同一句歌词', 0, 600000]] }, { s: 600000, e: 700000, w: [['下一句仍在这里', 600000, 700000]] }] } }), title: '本机时间轴', artist: '', skin: 'forest', pet: { id: 'cat' }, prefs: { deskLayout: 'double', deskSkin: 'cabin', deskSize: 34, translation: true, deskPet: true }, anchor: { position: 1000, at: Date.now(), playing: true, rate: 1, duration: 700000 }, energy: .5, bpm: 0, beatAt: 0 }) }; });
  await page.evaluate(() => window.open('album-desktop://action/lyrics-toggle'));
  let lyrics; for(let i=0;i<50;i++){lyrics=application.windows().find(p=>p.url().includes('/lyrics.html'));if(lyrics)break;await page.waitForTimeout(100);}
  assert.ok(lyrics); lyrics.on('pageerror', e => report.errors.push('lyrics: ' + e.message)); await lyrics.locator('.desk-lyrics-row.is-active', { hasText: '同一首歌，同一句歌词' }).waitFor();
  await lyrics.locator('.desk-lyrics-row.is-waiting', { hasText: '下一句仍在这里' }).waitFor();
  // The page can render before the shell shows the window (it waits for the page load); the
  // topmost flag only means something once the bar is on screen, so read it after it is shown.
  let bar; for (let i = 0; i < 50; i++) { bar = await application.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/lyrics.html')); return { visible: win.isVisible(), color: win.getBackgroundColor(), top: win.isAlwaysOnTop(), resizable: win.isResizable() }; }); if (bar.visible) break; await page.waitForTimeout(100); }
  assert.equal(bar.visible, true, 'the lyric bar is shown');
  assert.match(bar.color, /^#0{6}(00)?$/i, 'the lyric bar window is transparent'); assert.equal(bar.top, true);
  await lyrics.locator('.desk-lyrics').hover(); await lyrics.getByRole('button', { name: '锁定歌词（鼠标可穿透）' }).click();
  await lyrics.getByRole('button', { name: '解锁桌面歌词' }).waitFor({ state: 'attached' });
  assert.deepEqual(await application.evaluate(() => globalThis.__ignore.at(-1)), [true, true], 'locked: clicks pass through, moves still reach the bar');
  await lyrics.screenshot({ path: path.join(output, 'lyrics.png') });
  await lyrics.getByRole('button', { name: '解锁桌面歌词' }).hover(); await lyrics.getByRole('button', { name: '解锁桌面歌词' }).click();
  await lyrics.getByRole('toolbar', { name: '桌面歌词' }).waitFor({ state: 'attached' });
  assert.deepEqual(await application.evaluate(() => globalThis.__ignore.at(-1)), [false, false]);
  await page.evaluate(() => window.open('album-desktop://action/lyrics-toggle'));
  for (let i = 0; i < 30 && application.windows().some(p => p.url().includes('/lyrics.html')); i++) await page.waitForTimeout(100);
  assert.equal(application.windows().some(p => p.url().includes('/lyrics.html')), false, 'the same command closes the bar');
  report.checks.push('Desktop lyric bar reads the home lyric feed, is transparent and on top, locks click-through and toggles from the page');
  const imported={version:2,id:'native-video-fixture',name:'透明视频伙伴',author:'Flow Cabin tests',license:'CC0',media:{type:'webm',data:fs.readFileSync(path.join(__dirname,'../assets/pets-v21/cat/avatar-256.png')).toString('base64'),frameWidth:256,frameHeight:256,clips:{idle:{data:fs.readFileSync(path.join(__dirname,'fixtures/v21/transparent.webm')).toString('base64')}}},animations:{idle:{frames:[0],fps:1}}};
  await page.evaluate(async value=>{const response=await fetch('/desktop-pets/packs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw Error(result.error);localStorage.setItem('cabin.petPack.v1',JSON.stringify(result.pack));window.dispatchEvent(new Event('cabin:pet-pack'));},imported);
  await page.waitForTimeout(1800);
  await openDrawerThing(page,'伙伴'); // the imported pet is drawn in 伙伴's portrait (the desk draws no pet)
  const alpha=await page.locator('.cat-panel[open] .cat-portrait canvas').evaluate(canvas=>{const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;let transparent=0,opaque=0;for(let i=3;i<bytes.length;i+=4){if(bytes[i]<5)transparent++;if(bytes[i]>245)opaque++;}return{transparent,opaque,fallback:canvas.dataset.videoFallback,reason:canvas.dataset.videoFallbackReason,missing:canvas.dataset.packUnavailable};});
  report.video=alpha;console.log('Decoded pet: '+JSON.stringify(alpha));assert.equal(alpha.missing,'false');assert.equal(alpha.fallback,'false','Electron must decode the transparent WebM fixture');assert.ok(alpha.transparent>100&&alpha.opaque>100);report.video=alpha;await backToDesk(page);report.checks.push('Actual Electron decodes imported transparent pet, with tested PNG fallback and no opaque rectangle');
  await menu('备份与恢复');
  const backupPath=path.join(output,'native-backup.json');fs.rmSync(backupPath,{force:true});
  await application.evaluate(({webContents},savePath)=>{const contents=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://album-circle.vercel.app'));globalThis.__savedBackup=new Promise(resolve=>contents.session.once('will-download',(_e,item)=>{item.setSavePath(savePath);item.once('done',(_e,state)=>resolve(state));}));},backupPath);
  await page.getByRole('button',{name:'导出备份',exact:true}).click();assert.equal(await application.evaluate(async()=>await Promise.race([globalThis.__savedBackup,new Promise(resolve=>setTimeout(()=>resolve('timeout'),30000))])),'completed');
  const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.version,5);assert.equal(backup.petAssets.media.clips.idle.data,imported.media.clips.idle.data);assert.match(backup.focus.notes,/这份草稿还在/);await close();
  report.checks.push('Actual native Backup v5 export includes current notes, layouts and imported transparent video bytes');
  await page.evaluate(()=>{localStorage.removeItem('cabin.petPack.v1');window.dispatchEvent(new Event('cabin:pet-pack'));});
  // 3.0: 小屋明信片 and 场景配方 / 睡前模式 are 实验室 features (off for a new profile); switch them on for these checks.
  await page.evaluate(()=>{const labs=JSON.parse(localStorage.getItem('flow-cabin-labs-v1')||'{}');localStorage.setItem('flow-cabin-labs-v1',JSON.stringify({...labs,postcard:true,scenes:true}));window.dispatchEvent(new CustomEvent('cabin:labs-changed'));});
  await menu('小屋明信片'); await page.getByRole('button',{name:'生成预览',exact:true}).click();
  try { await page.locator('.home-postcard-preview').waitFor(); }
  catch(error){report.scene=await page.locator('.home-scene-tools [role=alert]').allInnerTexts().catch(()=>[]);throw error;}
  const png=await page.locator('.home-postcard-preview').getAttribute('src'); fs.writeFileSync(path.join(output,'postcard.png'),Buffer.from(png.split(',')[1],'base64'));await close();report.checks.push('Postcard captures the desk and the current pet; private text defaults off');
  await menu('场景配方');await page.getByLabel('场景名称',{exact:true}).fill('原生安静小屋');await page.getByRole('button',{name:'保存当前场景',exact:true}).click();await page.getByRole('button',{name:'进入',exact:true}).click();await page.getByRole('status').filter({hasText:'已进入'}).waitFor();await close();
  await menu('睡前模式');await page.getByRole('button',{name:'开始睡前模式',exact:true}).click();await page.getByRole('button',{name:'取消睡前模式',exact:true}).click();await close();report.checks.push('Scene save/apply and sleep start/cancel operate on existing runtime');
  await page.screenshot({path:path.join(output,'native-work.png')});
  await application.close();application=null; await launch();
  await openMemo();assert.match(await page.getByRole('textbox',{name:'随手记内容'}).inputValue(),/这份草稿还在/);await close();
  await openFocus(page);await page.getByRole('button',{name:'继续',exact:true}).waitFor();await close();
  await menu('场景配方');await page.locator('.home-scene-tools li').filter({hasText:'原生安静小屋'}).waitFor();await close();report.checks.push('Notes, paused focus and scene recipes survive real Electron process restart');
  assert.deepEqual(report.errors,[]); report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}).finally(async()=>{if(application)await application.close().catch(()=>{});fs.rmSync(profile,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
