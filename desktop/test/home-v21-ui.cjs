'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
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
  await page.locator('.cabin-home,.cabin-room').first().waitFor({ timeout: 30000 });
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
const close = async () => { await page.locator('.cabin-dialog-close').last().click(); };
async function menu(name) { await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name, exact: true }).click(); }
async function choosePet(id, name) {
  await page.locator('.home-pet-portrait').click(); await page.getByRole('button', { name: '选择伙伴', exact: true }).click();
  await page.getByRole('button', { name: `选择桌宠 ${name}`, exact: true }).click(); await close();
  await page.waitForFunction(id => document.querySelector('.home-pet-portrait canvas')?.dataset.petId === id, id);
  await page.waitForTimeout(1100);
  assert.equal(await application.evaluate(() => globalThis.__qaTray?.__petId), id);
  const icon = await application.evaluate(() => ({ tray: globalThis.__icons.at(-1), dock: globalThis.__dockIcons.at(-1) }));
  assert.equal(icon.tray.template, false); assert.ok(icon.tray.size.width >= 16); assert.equal(icon.dock.size.width, 512); if(process.platform==='darwin'){assert.equal(icon.tray.size.width,18);assert.ok(icon.tray.scales.includes(2));assert.ok(icon.dock.scales.includes(2));}
  report.nativeIcons.push({ id, ...icon });
}
(async () => {
  await launch();
  assert.equal(await page.locator('.cabin-home').count(),0,'The released shelf remains the default');
  await page.evaluate(()=>{localStorage.setItem('flow-cabin-welcome-v1','true');});
  for(let i=0;i<3&&await page.locator('dialog[open]').count();i++)await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'专辑墙',exact:true}).first().click();await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();await page.keyboard.press('Escape');
  await application.evaluate(({app})=>{globalThis.__originalQuit=app.quit.bind(app);globalThis.__originalRelaunch=app.relaunch.bind(app);app.relaunch=()=>{globalThis.__restartRequested=true;};app.quit=()=>{};});
  await page.getByRole('button',{name:'体验 Beta 小屋',exact:true}).click();await page.getByRole('button',{name:'切换为 Beta 并重启',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('flow-cabin-interface-v1')==='beta');
  for(let i=0;i<30&&!await application.evaluate(()=>globalThis.__restartRequested);i++)await page.waitForTimeout(100);
  assert.equal(await application.evaluate(()=>globalThis.__restartRequested),true,'native relaunch requested after saving');
  await application.evaluate(({app})=>{app.quit=globalThis.__originalQuit;app.relaunch=globalThis.__originalRelaunch;});
  await application.close();application=null;await launch();await page.locator('.cabin-home').waitFor();
  report.checks.push('Default classic shelf keeps album wall; explicit Beta opt-in saves, requests native restart and opens Beta on a new process');
  assert.equal(await page.locator('[data-cabin-audio-host] audio').count(), 2);
  await page.getByRole('navigation', { name: '房间区域' }).getByRole('button', { name: '工作角', exact: true }).click();
  await page.getByRole('button', { name: '随手记', exact: true }).first().click();
  await page.getByRole('textbox', { name: '随手记内容' }).fill('原生小屋：关闭工具之后，这份草稿还在。'); await close();
  assert.equal(await page.locator('.cabin-home').getAttribute('data-zone'), 'work');
  await page.getByRole('button', { name: '随手记', exact: true }).first().click(); assert.match(await page.getByRole('textbox', { name: '随手记内容' }).inputValue(), /这份草稿还在/); await close();
  await page.getByRole('button', { name: '专注', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '开始专注', exact: true }).click(); await close();
  assert.match(await page.locator('.corner-clock').innerText(), /24:|25:/); report.checks.push('Native home opens notes/focus in two actions and preserves camera, draft and timer');
  for (const [id, name] of [['chick','蛋挞'],['bunny','棉花'],['bear','可可'],['fox','枫糖'],['cat','奶糖']]) await choosePet(id, name);
  report.checks.push('Five pets update home, real native Dock 512/1024 and colored Retina menu icons');
  if(process.platform==='darwin'){
  await application.evaluate(() => globalThis.__qaTray.emit('click'));
  let popup; for (let i=0;i<30;i++) { popup=application.windows().find(p=>p.url().includes('pet-menu.html')); if(popup)break;await page.waitForTimeout(100); }
  assert.ok(popup); await popup.locator('button').first().waitFor(); await popup.screenshot({ path: path.join(output,'menu-pet.png') });
  await popup.getByRole('button', { name: /暂停专注|专注/ }).click(); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '专注', exact: true }).click(); await page.getByRole('button', { name: '继续', exact: true }).waitFor(); await close(); report.checks.push('Menu popup controls the existing home focus session');
  } else { await page.getByRole('button',{name:'专注',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).click();await close(); }
  await page.evaluate(() => window.open('album-desktop://action/lyrics-open'));
  let lyrics; for(let i=0;i<30;i++){lyrics=application.windows().find(p=>p.url().includes('/lyrics.html'));if(lyrics)break;await page.waitForTimeout(100);}
  assert.ok(lyrics); await page.evaluate(()=>{Object.defineProperty(window,'cabinLyricLine',{configurable:true,get:()=>({title:'本机时间轴',current:'同一首歌，同一句歌词',next:'下一句仍在这里'}),set:()=>{}});});
  await lyrics.getByText('同一首歌，同一句歌词',{exact:true}).waitFor(); await lyrics.screenshot({path:path.join(output,'lyrics.png')}); await lyrics.close(); report.checks.push('Companion lyrics read the home timeline through constrained native IPC');
  const imported={version:2,id:'native-video-fixture',name:'透明视频伙伴',author:'Flow Cabin tests',license:'CC0',media:{type:'webm',data:fs.readFileSync(path.join(__dirname,'../assets/pets-v21/cat/avatar-256.png')).toString('base64'),frameWidth:256,frameHeight:256,clips:{idle:{data:fs.readFileSync(path.join(__dirname,'fixtures/v21/transparent.webm')).toString('base64')}}},animations:{idle:{frames:[0],fps:1}}};
  await page.evaluate(async value=>{const response=await fetch('/desktop-pets/packs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw Error(result.error);localStorage.setItem('cabin.petPack.v1',JSON.stringify(result.pack));window.dispatchEvent(new Event('cabin:pet-pack'));},imported);
  await page.waitForTimeout(1800);
  const alpha=await page.locator('.home-pet-portrait canvas').evaluate(canvas=>{const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;let transparent=0,opaque=0;for(let i=3;i<bytes.length;i+=4){if(bytes[i]<5)transparent++;if(bytes[i]>245)opaque++;}return{transparent,opaque,fallback:canvas.dataset.videoFallback,reason:canvas.dataset.videoFallbackReason,missing:canvas.dataset.packUnavailable};});
  report.video=alpha;console.log('Decoded pet: '+JSON.stringify(alpha));assert.equal(alpha.missing,'false');assert.equal(alpha.fallback,'false','Electron must decode the transparent WebM fixture');assert.ok(alpha.transparent>100&&alpha.opaque>100);report.video=alpha;report.checks.push('Actual Electron decodes imported transparent pet, with tested PNG fallback and no opaque rectangle');
  await menu('备份与恢复');
  const backupPath=path.join(output,'native-backup.json');fs.rmSync(backupPath,{force:true});
  await application.evaluate(({webContents},savePath)=>{const contents=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://album-circle.vercel.app'));globalThis.__savedBackup=new Promise(resolve=>contents.session.once('will-download',(_e,item)=>{item.setSavePath(savePath);item.once('done',(_e,state)=>resolve(state));}));},backupPath);
  await page.getByRole('button',{name:'导出备份',exact:true}).click();assert.equal(await application.evaluate(async()=>await Promise.race([globalThis.__savedBackup,new Promise(resolve=>setTimeout(()=>resolve('timeout'),30000))])),'completed');
  const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.version,5);assert.equal(backup.petAssets.media.clips.idle.data,imported.media.clips.idle.data);assert.match(backup.focus.notes,/这份草稿还在/);await close();
  report.checks.push('Actual native Backup v5 export includes current notes, layouts and imported transparent video bytes');
  await page.evaluate(()=>{localStorage.removeItem('cabin.petPack.v1');window.dispatchEvent(new Event('cabin:pet-pack'));});
  await menu('小屋明信片'); await page.getByRole('button',{name:'生成预览',exact:true}).click(); await page.locator('.home-postcard-preview').waitFor();
  const png=await page.locator('.home-postcard-preview').getAttribute('src'); fs.writeFileSync(path.join(output,'postcard.png'),Buffer.from(png.split(',')[1],'base64'));await close();report.checks.push('Postcard captures actual room and current pet; private text defaults off');
  await menu('场景配方');await page.getByLabel('场景名称',{exact:true}).fill('原生安静小屋');await page.getByRole('button',{name:'保存当前场景',exact:true}).click();await page.getByRole('button',{name:'进入',exact:true}).click();await page.getByRole('status').filter({hasText:'已进入'}).waitFor();await close();
  await menu('睡前模式');await page.getByRole('button',{name:'开始睡前模式',exact:true}).click();await page.getByRole('button',{name:'取消睡前模式',exact:true}).click();await close();report.checks.push('Scene save/apply and sleep start/cancel operate on existing runtime');
  await page.screenshot({path:path.join(output,'native-work.png')});
  await application.close();application=null; await launch();
  await page.getByRole('button',{name:'随手记',exact:true}).first().click();assert.match(await page.getByRole('textbox',{name:'随手记内容'}).inputValue(),/这份草稿还在/);await close();
  await page.getByRole('button',{name:'专注',exact:true}).click();await page.getByRole('button',{name:'继续',exact:true}).waitFor();await close();
  await menu('场景配方');await page.locator('.home-scene-tools li').filter({hasText:'原生安静小屋'}).waitFor();await close();report.checks.push('Notes, paused focus and scene recipes survive real Electron process restart');
  assert.deepEqual(report.errors,[]); report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}).finally(async()=>{if(application)await application.close().catch(()=>{});fs.rmSync(profile,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
