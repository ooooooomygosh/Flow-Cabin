/** Silent, offline state/data regression pass. Native fullscreen is a mock. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'desktop/package.json'))('playwright');
const output = process.env.FOCUS_OUTPUT || path.join(root, 'desktop/test-results/focus-ui');
const port = Number(process.env.FOCUS_PORT || 4188), origin = `http://127.0.0.1:${port}`;
const KEY = 'album-circle-focus-v1:local-owner';
const items = Array.from({ length: 8 }, (_, i) => ({ id: `focus-${i}`, type: 'album', title: `测试唱片 ${i + 1}`, artist: '离线测试', cover: '', tracks: ['晨光'], source: 'manual' }));
const report = { fixtureData: true, muted: true, nativeFullscreen: 'mocked', checks: [], pageErrors: [], unexpectedRequests: [] };
await fs.mkdir(output, { recursive: true });
let browser, server;
const focusState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const openFocus = async (page, tab = '番茄钟') => { const badge = page.locator('.focus-badge'); await badge.waitFor({timeout:30000}); if (await badge.getAttribute('aria-expanded') === 'false') await badge.click(); await page.locator('.focus-dock').waitFor(); await page.locator('.focus-dock').getByRole('tab', { name: tab, exact: true }).click(); };
const screenshot = async (page, name) => { for (const [width, height] of [[1440,900],[960,600]]) { await page.setViewportSize({width,height}); await page.screenshot({ path: path.join(output, `${name}-${width}x${height}.png`), animations:'disabled', timeout:15000 }); } };
const failStorage = (page, fail) => page.evaluate(fail => { window.__failFocusStorage = fail; if (window.__focusStorageOriginal) return; window.__focusStorageOriginal = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (window.__failFocusStorage && key === 'album-circle-focus-v1:local-owner') throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return window.__focusStorageOriginal.call(this,key,value); }; }, fail);
try {
  server = spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd:root,env:{...process.env,FLOW_CABIN_VITE_CACHE_DIR:path.join(output,'vite-cache')},stdio:['ignore','pipe','pipe']});
  let log=''; server.stdout.on('data',b=>log+=b); server.stderr.on('data',b=>log+=b);
  for (let i=0;;i++) { if (server.exitCode!==null || i>150) throw new Error(log); if (hasViteLocalOrigin(log,origin) && await fetch(origin).then(r=>r.ok,()=>false)) break; await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || (process.env.CI?chromium.executablePath():'/usr/bin/chromium'),headless:true,args:['--no-sandbox','--mute-audio']});
  const run = async (name,test,{firstVisit=false,collection}={}) => {
    if (process.env.FOCUS_FILTER && !name.includes(process.env.FOCUS_FILTER)) return;
    const context = await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',reducedMotion:'reduce'});
    await context.addInitScript(({key,firstVisit}) => {
      if (location.origin==='null') return;
      if (!firstVisit) localStorage.setItem('flow-cabin-onboarding-v1',JSON.stringify({version:1,status:'done',step:'done'}));
      if (!firstVisit && !localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({notes:'原有随手记',settings:{focusMin:1,shortMin:1,notify:false,chime:false}}));
      window.__nativeCommands=[];
      window.albumDesktopAppearance={client:true,reduceMotion:true};
      window.open=url=>{ window.__nativeCommands.push(String(url)); return null; };
      const init=()=>{document.documentElement.dataset.desktopClient='true';document.documentElement.dataset.desktopReduceMotion='true';};
      if(document.documentElement) init(); else new MutationObserver((_,o)=>{if(document.documentElement){init();o.disconnect();}}).observe(document,{childList:true});
    },{key:KEY,firstVisit});
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url()), p=u.pathname;
      if(u.origin!==origin){report.unexpectedRequests.push(u.href);return route.abort();}
      if(p==='/api/items') return collection ? collection(route) : route.fulfill({json:{items}});
      if(p==='/api/items/import') return route.fulfill({json:{added:0,total:items.length}});
      if(p==='/desktop-music/config') return route.fulfill({json:{qqLoggedIn:false,neteaseLoggedIn:false}});
      if(p==='/desktop-music/now-playing'||p==='/desktop-music/apple/permission') return route.fulfill({json:{available:false}});
      if(p==='/desktop-music/local/summary') return route.fulfill({json:{folders:[],albumCount:0,trackCount:0}});
      if(p.startsWith('/api/')||p.startsWith('/desktop-music/')){report.unexpectedRequests.push(p);return route.fulfill({status:500,json:{error:'Unimplemented fixture'}});}
      return route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.pageErrors.push(e.message));
    let phase='initial-render';
    try {await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.focus-badge').waitFor({timeout:30000});phase='interaction';await test(page);report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
    catch(error){report.checks.push({name,passed:false,phase,error:error.stack});console.error(`FAIL ${name}: ${error.message}`);await screenshot(page,`${name}-failure`).catch(()=>{});}
    finally{await context.close();}
  };
  await run('todo-storage-warning-and-recovery',async page=>{
    await openFocus(page,'待办');await failStorage(page,true);await page.getByLabel('新的待办').fill('未保存的测试任务');await page.getByRole('button',{name:'添加待办',exact:true}).click();
    assert.equal((await focusState(page)).tasks?.length||0,0,'failed write must not pretend to persist');
    assert.match(await page.locator('.focus-dock [role=alert]').innerText(),/无法保存|尚未保存|未保存/,'the active todo panel must explain failed persistence');
    assert.equal(await page.getByLabel('新的待办').inputValue(),'未保存的测试任务','failed task draft stays editable');assert.equal(await page.getByRole('button',{name:'重试保存',exact:true}).count(),0,'snapshot retry must not pretend to replay a rejected task edit');
    await screenshot(page,'todo-unsaved');await failStorage(page,false);await page.getByRole('button',{name:'添加待办',exact:true}).click();await page.getByRole('checkbox',{name:'完成：未保存的测试任务',exact:true}).click();
    await page.reload();await openFocus(page,'待办');assert.equal((await focusState(page)).tasks[0].done,true);assert.equal(await page.locator('.focus-task-list li.is-done').count(),1);
  });
  await run('notes-draft-survives-storage-failure-and-recovers',async page=>{
    await openFocus(page,'随手记');await failStorage(page,true);const draft='临时草稿\n第二行 🎵 <script>只是文字</script>';
    await page.getByLabel('随手记内容').fill(draft);assert.equal(await page.getByLabel('随手记内容').inputValue(),draft);assert.match(await page.locator('.focus-dock').innerText(),/请先复制|未保存/);
    assert.equal((await focusState(page)).notes,'原有随手记');await screenshot(page,'notes-unsaved');await failStorage(page,false);await page.getByLabel('随手记内容').fill(draft+' 已恢复');
    await page.reload();await openFocus(page,'随手记');assert.equal(await page.getByLabel('随手记内容').inputValue(),draft+' 已恢复');
  });
  await run('unsaved-notes-survive-another-window-update',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();const deadline=(await focusState(page)).timer.endsAt;
    await openFocus(page,'随手记');await failStorage(page,true);await page.getByLabel('随手记内容').fill('当前窗口未保存草稿');
    await page.evaluate(key=>{ const raw=JSON.stringify({notes:'另一窗口保存的笔记',tasks:[{id:'other-task',text:'另一窗口的任务',createdAt:1}],settings:{notify:false,chime:false,dailyGoal:100}});window.__focusStorageOriginal.call(localStorage,key,raw);window.dispatchEvent(new StorageEvent('storage',{key,newValue:raw,storageArea:localStorage})); },KEY);
    assert.equal(await page.getByLabel('随手记内容').inputValue(),'当前窗口未保存草稿');assert.match(await page.locator('.focus-dock [role=alert]').innerText(),/另一窗口/);assert.equal((await focusState(page)).notes,'另一窗口保存的笔记');
    await page.getByRole('button',{name:'重试保存',exact:true}).click();assert.match(await page.locator('.focus-dock [role=alert]').innerText(),/另一窗口.*本窗口.*仍失败/,'failed explicit retry retains the conflict explanation');
    await failStorage(page,false);await page.evaluate(end=>{Date.now=()=>end+1;window.dispatchEvent(new Event('focus'));},deadline);await page.waitForFunction(()=>window.albumCompanionSnapshot?.().focus.fish===1);
    await page.getByLabel('随手记内容').fill('当前窗口继续写的草稿');assert.equal((await focusState(page)).notes,'另一窗口保存的笔记','automatic timer and note writes must remain paused during conflict');await screenshot(page,'notes-storage-conflict');
    await openFocus(page,'统计');await page.getByLabel('每日专注目标分钟').fill('120');assert.equal((await focusState(page)).settings.dailyGoal,100,'settings cannot bypass unresolved conflict');
    await openFocus(page,'待办');await page.getByLabel('新的待办').fill('冲突期间的任务草稿');await page.getByRole('button',{name:'添加待办',exact:true}).click();assert.equal(await page.getByLabel('新的待办').inputValue(),'冲突期间的任务草稿');assert.equal((await focusState(page)).tasks[0].id,'other-task','tasks cannot bypass unresolved conflict');
    await page.getByRole('button',{name:'重试保存',exact:true}).click();const resolved=await focusState(page);assert.equal(resolved.notes,'当前窗口继续写的草稿');assert.equal(resolved.rewards.fish,1);assert.equal(resolved.sessions.length,1);
    await page.getByRole('button',{name:'添加待办',exact:true}).click();assert.equal((await focusState(page)).tasks.length,1);assert.equal((await focusState(page)).tasks[0].text,'冲突期间的任务草稿');
  });
  await run('timer-storage-failure-settles-once-and-recovers',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();const before=await focusState(page);await failStorage(page,true);
    await page.evaluate(end=>{window.__phaseEvents=[];window.addEventListener('album-focus-phase',event=>window.__phaseEvents.push(event.detail));Date.now=()=>end+1;window.dispatchEvent(new Event('focus'));},before.timer.endsAt);
    await page.waitForFunction(()=>window.albumCompanionSnapshot?.().focus.fish===1);
    for(let i=0;i<4;i++)await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>window.__phaseEvents.length),1);assert.equal((await focusState(page)).rewards.fish,0);assert.match(await page.locator('.focus-dock [role=alert]').innerText(),/无法保存/);await screenshot(page,'timer-unsaved-completion');
    await failStorage(page,false);await page.getByRole('button',{name:'重试保存',exact:true}).click();const after=await focusState(page);assert.equal(after.sessions.length,1);assert.equal(after.rewards.fish,1);assert.equal(after.timer.phase,'shortBreak');assert.equal(await page.evaluate(()=>window.__phaseEvents.length),1);
  });
  await run('timer-pause-reload-resume-keeps-remaining-work',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=await focusState(page);assert.equal(paused.timer.paused,true);
    await page.reload();await openFocus(page);assert.equal((await focusState(page)).timer.remaining,paused.timer.remaining);await page.getByRole('button',{name:'继续',exact:true}).click();const resumed=await focusState(page);assert.equal(resumed.timer.paused,false);assert.equal(resumed.timer.duration,paused.timer.duration);assert.equal(resumed.sessions.length,0);await screenshot(page,'timer-reloaded-resumed');
  });
  await run('backup-focus-failure-is-transactional-and-visible',async page=>{
    await failStorage(page,true);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:'数据与备份',exact:true}).click();await page.getByRole('button',{name:'收藏与备份',exact:true}).click();
    page.on('dialog',dialog=>dialog.accept());
    await page.getByLabel('导入备份文件').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'FlowCabinBackup',items:[],focus:{notes:'导入的新内容',tasks:[],settings:{notify:false,chime:false}}}))});
    await page.getByRole('status').filter({hasText:'导入完成'}).waitFor();
    assert.match(await page.locator('.backup-dialog').innerText(),/专注.*未能保存|专注.*保存失败/,'backup must not report a successful focus restore');
    await screenshot(page,'backup-storage-error');await page.keyboard.press('Escape');await openFocus(page,'随手记');assert.equal(await page.getByLabel('随手记内容').inputValue(),'原有随手记');
    assert.equal((await focusState(page)).notes,'原有随手记');
  });
  await run('expired-reset-settles-one-completed-round',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();const before=await focusState(page);
    await page.evaluate(end=>{Date.now=()=>end+1;document.querySelector('[aria-label="重置计时"]').click();},before.timer.endsAt);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).rewards?.fish===1,KEY);
    const after=await focusState(page);assert.equal(after.sessions.length,1);assert.equal(after.rewards.xp,1);assert.equal(after.timer.phase,'idle','Reset still stops the timer after settling credit');
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await focusState(page)).sessions.length,1);await screenshot(page,'timer-expired-reset');
  });
  await run('long-sleep-credits-once-and-waits',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();const before=await focusState(page);
    await page.evaluate(end=>{Date.now=()=>end+5*60000;window.dispatchEvent(new Event('focus'));},before.timer.endsAt);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).timer.phase==='idle',KEY);
    for(let i=0;i<4;i++)await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    const after=await focusState(page);assert.equal(after.sessions.length,1);assert.equal(after.rewards.fish,1);await screenshot(page,'timer-after-long-sleep');
  });
  await run('immersive-tools-keep-focus-button-clickable',async page=>{
    await page.getByRole('button',{name:'沉浸',exact:true}).click();await page.getByRole('button',{name:'显示工具',exact:true}).click();await screenshot(page,'immersive-tools-focus-entry');await openFocus(page);assert.equal(await page.locator('.focus-dock').count(),1);await screenshot(page,'immersive-tools-focus-open');
  });
  await run('album-wall-escape-preserves-lower-layers',async page=>{
    await openFocus(page,'随手记');
    await page.evaluate(()=>{document.documentElement.dataset.desktopFullscreen='true';window.dispatchEvent(new CustomEvent('album-desktop-fullscreen',{detail:true}));});
    await page.getByRole('button',{name:'沉浸模式',exact:true}).click();await page.getByRole('button',{name:'显示工具',exact:true}).click();
    await page.getByRole('button',{name:'专辑墙',exact:true}).click();await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();await screenshot(page,'album-wall-over-focus');await page.keyboard.press('Escape');
    assert.equal(await page.locator('.album-wall-overlay').count(),0);assert.equal(await page.locator('.focus-dock').count(),1,'only the top album-wall modal should close');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('room-zen')),true);assert.equal(await page.evaluate(()=>window.__nativeCommands.some(x=>x.endsWith('/fullscreen-exit'))),false);
    await page.getByRole('button',{name:'专辑墙',exact:true}).click();await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭专辑墙编辑器',exact:true}).dispatchEvent('keydown',{key:'Escape',repeat:true});assert.equal(await page.locator('.album-wall-overlay').count(),1,'held Escape must not unwind layers');
    await page.keyboard.press('Escape');await screenshot(page,'album-wall-escape-restored');
  });
  await run('twenty-mode-cycles-preserve-timer-and-notes',async page=>{
    await openFocus(page,'随手记');await page.getByLabel('随手记内容').fill('模式切换保留的草稿');await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();const before=await focusState(page);await page.getByRole('button',{name:'收起专注工具',exact:true}).click();
    for(let i=0;i<20;i++){
      await page.getByRole('button',{name:'进入全屏模式',exact:true}).click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/fullscreen$/);
      await page.evaluate(()=>{document.documentElement.dataset.desktopFullscreen='true';window.dispatchEvent(new CustomEvent('album-desktop-fullscreen',{detail:true}));});
      await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('z');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('room-zen')),true);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('room-zen')),false);
      await page.getByRole('button',{name:'退出全屏模式',exact:true}).click();await page.evaluate(()=>{document.documentElement.dataset.desktopFullscreen='false';window.dispatchEvent(new CustomEvent('album-desktop-fullscreen',{detail:false}));});
    }
    const after=await focusState(page);assert.equal(after.timer.endsAt,before.timer.endsAt);assert.equal(after.notes,before.notes);assert.equal(after.sessions.length,0);
    await openFocus(page,'随手记');await page.getByLabel('随手记内容').focus();await page.keyboard.type(' z m ');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('room-zen')),false);await screenshot(page,'twenty-modes-retained-state');
  });
  let calls=0,pending;
  await run('collection-error-retry-has-distinct-states',async page=>{
    await page.getByRole('alert').filter({hasText:'模拟收藏读取失败'}).waitFor();assert.doesNotMatch(await page.locator('.room-empty').innerText(),/正在整理/,'failed collection is not still loading');
    assert.equal(await page.locator('.onboarding-wizard').count(),0);await screenshot(page,'collection-error');
    await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.app-error button')?.disabled);
    assert.match(await page.locator('.room-empty').innerText(),/正在整理/);await screenshot(page,'collection-retrying');await pending.fulfill({json:{items}});
    await page.locator('.room-record').first().waitFor();assert.equal(await page.locator('.app-error').count(),0);await screenshot(page,'collection-retry-success');
  },{firstVisit:true,collection:route=>++calls===1?route.fulfill({status:503,json:{error:'模拟收藏读取失败'}}):(pending=route,undefined)});
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpectedRequests,[]);if(report.checks.some(x=>!x.passed))process.exitCode=1;
}finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();server?.kill();}
