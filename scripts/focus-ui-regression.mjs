/** Silent, offline state/data regression pass. Native fullscreen is a mock. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.FOCUS_OUTPUT || path.join(root, 'desktop/test-results/focus-ui');
const port = Number(process.env.FOCUS_PORT || 4188), origin = `http://127.0.0.1:${port}`;
const KEY = 'album-circle-focus-v1:local-owner';
const items = Array.from({ length: 8 }, (_, i) => ({ id: `focus-${i}`, type: 'album', title: `测试唱片 ${i + 1}`, artist: '离线测试', cover: '', tracks: ['晨光'], source: 'manual' }));
const report = { fixtureData: true, muted: true, nativeFullscreen: 'mocked', checks: [], pageErrors: [], unexpectedRequests: [] };
await fs.mkdir(output, { recursive: true });
let browser, server;
const focusState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
// 专辑墙 opens from 整理唱片架 (the console's shelf panel).
const openAlbumWall = async page => { const tools = page.getByRole('button',{name:'整理唱片架',exact:true}); if (await tools.getAttribute('aria-expanded') !== 'true') await tools.click(); await page.getByRole('region',{name:'整理唱片架',exact:true}).getByRole('button',{name:'专辑墙',exact:true}).click(); };
const openFocus = async (page, tab = '番茄钟') => { const badge = page.locator('.focus-badge'); await badge.waitFor({timeout:30000}); if (await badge.getAttribute('aria-expanded') === 'false') await badge.click(); await page.locator('.focus-dock').waitFor(); await page.locator('.focus-dock').getByRole('tab', { name: tab, exact: true }).click(); };
const screenshot = async (page, name) => { for (const [width, height] of [[1440,900],[960,600]]) { await page.setViewportSize({width,height}); await page.screenshot({ path: path.join(output, `${name}-${width}x${height}.png`), animations:'disabled', timeout:15000 }); } };
const failStorage = (page, fail) => page.evaluate(fail => { window.__failFocusStorage = fail; if (window.__focusStorageOriginal) return; window.__focusStorageOriginal = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (window.__failFocusStorage && key === 'album-circle-focus-v1:local-owner') throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return window.__focusStorageOriginal.call(this,key,value); }; }, fail);
try {
  server = spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd:root,env:{...process.env,FLOW_CABIN_VITE_CACHE_DIR:path.join(output,'vite-cache')},stdio:['ignore','pipe','pipe']});
  let log=''; server.stdout.on('data',b=>log+=b); server.stderr.on('data',b=>log+=b);
  for (let i=0;;i++) { if (server.exitCode!==null || i>150) throw new Error(log); if (hasViteLocalOrigin(log,origin) && await fetch(origin).then(r=>r.ok,()=>false)) break; await new Promise(r=>setTimeout(r,100)); }
  browser = await launchChromium();
  const run = async (name,test,{firstVisit=false,collection}={}) => {
    if (process.env.FOCUS_FILTER && !process.env.FOCUS_FILTER.split(',').some(filter=>name.includes(filter))) return;
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
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cabin-open-settings',{detail:{section:'focus'}})));const goalHub=page.getByRole('dialog',{name:'设置',exact:true});await goalHub.getByLabel('每日专注目标分钟').fill('120');await goalHub.getByLabel('每日专注目标分钟').press('Enter');assert.equal((await focusState(page)).settings.dailyGoal,100,'settings cannot bypass unresolved conflict');await page.keyboard.press('Escape');await goalHub.waitFor({state:'detached'});
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
  await run('stats-card-and-cabin-journal',async page=>{
    // Seeded demo data: legacy pomodoro sessions + the assumed focus-session log.
    await page.evaluate(({key})=>{
      const day=86400000,start=new Date();start.setHours(0,0,0,0);const base=start.getTime();
      const tasks=[{id:'t-ch3',text:'写第三章',done:true,doneAt:base-3*day+18*3600e3},{id:'t-rev',text:'复习线代',done:false},{id:'t-mail',text:'回邮件',done:true,doneAt:base-9*day+11*3600e3}];
      const albums=[{id:'a1',title:'夜航星',artist:'林间'},{id:'a2',title:'晨光练习曲',artist:'小屋乐队'},{id:'a3',title:'雨天唱片',artist:'Lo-fi Cat'}];
      const sessions=[],log=[];
      for(let d=1;d<200;d++){ if(d%9===4||(d>60&&d%3===0)) continue; const n=1+(d*7)%3; for(let i=0;i<n;i++){ const h=[9,14,21][(d+i)%3],s=base-d*day+h*3600e3+i*40*60e3,len=25+((d+i)%3)*12; const taskId=['t-ch3','t-rev','','t-mail'][(d+i)%4]; sessions.push({start:s,end:s+len*60e3,taskId,completed:(d+i)%5!==0}); if(d<21) log.push({start:s,end:s+len*60e3,durationMs:len*60e3,completed:(d+i)%5!==0,taskId,album:albums[(d+i)%3]}); } }
      sessions.push({start:base+9*3600e3,end:base+9*3600e3+25*60e3,taskId:'t-ch3',completed:true});
      const old=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...old,tasks,sessions:sessions.sort((a,b)=>a.start-b.start),settings:{...old.settings,dailyGoal:90}}));
      localStorage.setItem('flow-cabin-focus-sessions-v1',JSON.stringify(log));
    },{key:KEY});
    await page.reload();await openFocus(page,'统计');
    const card=page.locator('.fs-compact');await card.waitFor();
    assert.equal(await card.getByRole('progressbar',{name:'每日目标进度'}).count(),1);assert.equal(await card.locator('.fs-bar').count(),7);
    assert.equal(await page.locator('.focus-dock').getByLabel('每日专注目标分钟').count(),0,'goal is edited in Settings only');
    const scrolls=await page.locator('.focus-dock').evaluate(dock=>[...dock.querySelectorAll('*')].filter(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.className));
    for(const [w,h] of [[1280,800],[1440,900]]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:path.join(output,`stats-card-${w}x${h}.png`),animations:'disabled'});}
    assert.deepEqual(scrolls,[],'stats card does not scroll');
    await page.getByRole('button',{name:'打开小屋日记 →'}).click();
    const journal=page.getByRole('dialog',{name:'小屋日记'});await journal.waitFor();
    assert.equal(await journal.getByRole('tab',{name:'概览'}).getAttribute('aria-selected'),'true');assert.equal(await journal.locator('.fs-year-grid span').count(),53*7);
    assert.match(await journal.locator('.fs-sessions li').first().innerText(),/写第三章/);
    for(const [w,h] of [[1280,800],[1440,900]]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:path.join(output,`journal-overview-${w}x${h}.png`),animations:'disabled'});}
    await journal.getByRole('button',{name:'近 30 天'}).click();assert.equal(await journal.locator('.fs-bar').count(),30);
    await journal.getByRole('tab',{name:'待办'}).click();const rows=await journal.locator('.fs-rank li .fs-rank-name').allInnerTexts();assert(rows.some(t=>t.includes('自由专注')));assert(rows.some(t=>t.includes('写第三章')));
    for(const [w,h] of [[1280,800],[1440,900]]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:path.join(output,`journal-tasks-${w}x${h}.png`),animations:'disabled'});}
    await page.keyboard.press('Escape');await journal.waitFor({state:'hidden'});
    await page.keyboard.press('l');await journal.waitFor();await page.getByRole('button',{name:'返回小屋'}).click();await journal.waitFor({state:'hidden'});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cabin:open-journal',{detail:{tab:'weekly'}})));await journal.waitFor();
    assert.equal(await journal.getByRole('tab',{name:'周报'}).getAttribute('aria-selected'),'true');assert.match(await journal.locator('.fs-weekpick strong').innerText(),/上周/);
    assert.match(await journal.locator('.fs-facts').innerText(),/《/,'most played album comes from the session log');
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});await journal.getByRole('button',{name:'复制文字'}).click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/^## 心流小屋周报 · /);
    const [download]=await Promise.all([page.waitForEvent('download'),journal.getByRole('button',{name:'导出图片'}).click()]);assert.match(download.suggestedFilename(),/^心流小屋周报-.*\.png$/);await download.saveAs(path.join(output,'weekly-card-export.png'));
    for(const [w,h] of [[1280,800],[1440,900]]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:path.join(output,`journal-weekly-${w}x${h}.png`),animations:'disabled'});}
    await journal.getByRole('button',{name:'上一周'}).click();assert.match(await journal.locator('.fs-weekpick strong').innerText(),/2 周前/);
    await page.keyboard.press('Escape');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cabin-open-settings',{detail:{section:'focus'}})));
    const hub=page.getByRole('dialog',{name:'设置',exact:true});await hub.getByLabel('每日专注目标分钟').fill('60');await hub.getByLabel('每日专注目标分钟').press('Enter');assert.equal((await focusState(page)).settings.dailyGoal,60);
  });
  await run('timer-pause-reload-resume-keeps-remaining-work',async page=>{
    await openFocus(page);await page.getByRole('button',{name:'开始专注',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=await focusState(page);assert.equal(paused.timer.paused,true);
    await page.reload();await openFocus(page);assert.equal((await focusState(page)).timer.remaining,paused.timer.remaining);await page.getByRole('button',{name:'继续',exact:true}).click();const resumed=await focusState(page);assert.equal(resumed.timer.paused,false);assert.equal(resumed.timer.duration,paused.timer.duration);assert.equal(resumed.sessions.length,0);await screenshot(page,'timer-reloaded-resumed');
  });
  await run('backup-focus-failure-is-transactional-and-visible',async page=>{
    await failStorage(page,true);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:'数据与备份',exact:true}).click();await page.getByRole('button',{name:'收藏与备份',exact:true}).click();
    await page.getByLabel('导入备份文件').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'FlowCabinBackup',items:[],focus:{notes:'导入的新内容',tasks:[],settings:{notify:false,chime:false}}}))});
    await page.getByRole('status').filter({hasText:'导入完成'}).waitFor();assert.equal((await focusState(page)).notes,'原有随手记','nothing is replaced before the inline confirm');
    await page.getByRole('group',{name:'替换本机记录'}).getByRole('button',{name:'替换这些内容',exact:true}).click();await page.getByRole('alert').filter({hasText:'未能保存'}).waitFor();
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
    await openAlbumWall(page);await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();await screenshot(page,'album-wall-over-focus');await page.keyboard.press('Escape');
    assert.equal(await page.locator('.album-wall-overlay').count(),0);assert.equal(await page.locator('.focus-dock').count(),1,'only the top album-wall modal should close');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('room-zen')),true);assert.equal(await page.evaluate(()=>window.__nativeCommands.some(x=>x.endsWith('/fullscreen-exit'))),false);
    await openAlbumWall(page);await page.getByRole('dialog',{name:'专辑墙编辑器',exact:true}).waitFor();
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
  const STUDY_KEY = 'album-circle-study-v1:local-owner';
  const studyState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STUDY_KEY);
  const failStudyStorage = (page, fail) => page.evaluate(fail => {
    window.__failStudyStorage = fail;
    if (window.__studyStorageOriginal) return;
    window.__studyStorageOriginal = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if(window.__failStudyStorage && key==='album-circle-study-v1:local-owner') throw new DOMException('Synthetic quota failure','QuotaExceededError'); return window.__studyStorageOriginal.call(this,key,value); };
  },fail);
  const seedStudy = async (page, state) => { await page.evaluate(({key,state}) => localStorage.setItem(key,JSON.stringify(state)),{key:STUDY_KEY,state});await page.reload();await openFocus(page,'学习'); };
  const assertStudyError = async page => { const alert=page.locator('.focus-dock [role=alert]');await alert.waitFor();assert.match(await alert.innerText(),/无法保存|上限/); };
  await run('productivity-study-layout-stays-within-dock',async page=>{
    await openFocus(page,'学习');
    for(const [width,height] of [[1440,900],[960,600],[640,600]]) {
      await page.setViewportSize({width,height});await page.getByLabel('新卡组名称').scrollIntoViewIfNeeded();
      const layout=await page.locator('.focus-dock-body').evaluate(body=>{const r=body.getBoundingClientRect();return {width:body.clientWidth,scrollWidth:body.scrollWidth,scrollLeft:body.scrollLeft,overflow:[...body.querySelectorAll('*')].map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.left<r.left||e.right>r.right).slice(0,10)};});
      await page.screenshot({path:path.join(output,`study-layout-${width}x${height}.png`),animations:'disabled'});assert.ok(layout.scrollWidth<=layout.width+1,JSON.stringify(layout));assert.equal(layout.scrollLeft,0);
    }
  });
  await run('productivity-deck-draft-survives-save-failure',async page=>{
    await openFocus(page,'学习');await failStudyStorage(page,true);await page.getByLabel('新卡组名称').fill('高数复习草稿');await page.locator('.study-new-deck button').click();
    assert.equal((await studyState(page)).decks?.length||0,0);await assertStudyError(page);assert.equal(await page.getByLabel('新卡组名称').inputValue(),'高数复习草稿');await screenshot(page,'study-deck-unsaved');
    await failStudyStorage(page,false);await page.locator('.study-new-deck button').click();assert.equal(await page.getByLabel('新卡组名称').inputValue(),'');await page.reload();await openFocus(page,'学习');assert.equal((await studyState(page)).decks.length,1);assert.equal((await studyState(page)).decks[0].name,'高数复习草稿');
  });
  await run('productivity-countdown-draft-survives-save-failure',async page=>{
    await openFocus(page,'学习');await failStudyStorage(page,true);await page.getByLabel('倒计时名称').fill('期末考试');await page.getByLabel('倒计时日期').fill('2027-01-15');await page.getByRole('button',{name:'添加倒计时',exact:true}).click();
    assert.equal((await studyState(page)).countdowns?.length||0,0);await assertStudyError(page);assert.equal(await page.getByLabel('倒计时名称').inputValue(),'期末考试');assert.equal(await page.getByLabel('倒计时日期').inputValue(),'2027-01-15');await screenshot(page,'study-countdown-unsaved');
    await failStudyStorage(page,false);await page.getByRole('button',{name:'添加倒计时',exact:true}).click();await page.reload();await openFocus(page,'学习');assert.equal((await studyState(page)).countdowns.length,1);assert.equal((await studyState(page)).countdowns[0].date,'2027-01-15');
  });
  await run('productivity-limits-keep-drafts-and-explain',async page=>{
    await seedStudy(page,{decks:Array.from({length:40},(_,i)=>({id:`d${i}`,name:`已有卡组${i}`,createdAt:i+1})),countdowns:Array.from({length:12},(_,i)=>({id:`c${i}`,title:`已有计划${i}`,date:'2027-01-15'}))});
    await page.getByLabel('新卡组名称').fill('第41组草稿');await page.locator('.study-new-deck button').click();assert.equal(await page.getByLabel('新卡组名称').inputValue(),'第41组草稿');await assertStudyError(page);assert.equal((await studyState(page)).decks.length,40);await screenshot(page,'study-deck-limit');
    await page.getByLabel('倒计时名称').fill('第13个计划');await page.getByLabel('倒计时日期').fill('2027-01-16');await page.getByRole('button',{name:'添加倒计时',exact:true}).click();assert.equal(await page.getByLabel('倒计时名称').inputValue(),'第13个计划');assert.equal((await studyState(page)).countdowns.length,12);await assertStudyError(page);await screenshot(page,'study-countdown-limit');
  });
  await run('productivity-cards-save-edit-and-cancel',async page=>{
    await seedStudy(page,{decks:[{id:'qa-deck',name:'测试卡组',createdAt:1}]});await page.locator('.study-deck-edit').click();await failStudyStorage(page,true);await page.getByLabel('新卡片',{exact:true}).fill('alpha - 第一\nbeta - 第二');await page.getByRole('button',{name:'添加 2 张',exact:true}).click();
    assert.equal(await page.getByLabel('新卡片',{exact:true}).inputValue(),'alpha - 第一\nbeta - 第二');await assertStudyError(page);assert.doesNotMatch(await page.locator('.study-add').innerText(),/没有新卡片|添加了/,'storage failure must not claim duplicate input or success');await screenshot(page,'study-card-unsaved');
    await failStudyStorage(page,false);await page.getByRole('button',{name:'添加 2 张',exact:true}).click();assert.equal((await studyState(page)).cards.length,2);await page.getByRole('button',{name:'编辑卡片 alpha',exact:true}).click();await page.getByLabel('编辑卡片背面').fill('编辑后的背面');await failStudyStorage(page,true);await page.getByRole('button',{name:'保存卡片',exact:true}).click();assert.equal(await page.getByLabel('编辑卡片背面').inputValue(),'编辑后的背面');assert.equal((await studyState(page)).cards.find(x=>x.front==='alpha').back,'第一');
    await failStudyStorage(page,false);await page.getByRole('button',{name:'保存卡片',exact:true}).click();assert.equal((await studyState(page)).cards.find(x=>x.front==='alpha').back,'编辑后的背面');await page.getByRole('button',{name:'删除卡组',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await studyState(page)).decks.length,1);await screenshot(page,'study-card-edit-recovered');
  });
  await run('productivity-word-import-failure-does-not-claim-success',async page=>{
    await seedStudy(page,{decks:[{id:'qa-import',name:'导入测试',createdAt:1}]});await page.locator('.study-deck-edit').click();await page.locator('.study-import summary').click();
    const file={name:'synthetic-words.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{front:'window',back:'窗户'},{front:'garden',back:'花园'}]))};
    await page.getByLabel('选择词书文件').setInputFiles(file);await page.getByRole('button',{name:'确认追加 2 张',exact:true}).waitFor();await failStudyStorage(page,true);await page.getByRole('button',{name:'确认追加 2 张',exact:true}).click();
    await assertStudyError(page);assert.doesNotMatch(await page.locator('.study-import').innerText(),/已追加/);assert.equal((await studyState(page)).cards?.length||0,0);assert.equal(await page.locator('.study-import-preview li').count(),2);await screenshot(page,'study-word-import-unsaved');
    await failStudyStorage(page,false);await page.getByRole('button',{name:'确认追加 2 张',exact:true}).click();assert.equal((await studyState(page)).cards.length,2);assert.match(await page.locator('.study-import').innerText(),/已追加 2/);
    await page.getByLabel('选择词书文件').setInputFiles(file);await page.getByRole('button',{name:'确认追加 0 张',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'确认追加 0 张',exact:true}).isDisabled(),true);assert.equal((await studyState(page)).cards.length,2);await screenshot(page,'study-word-import-duplicates');
  });
  await run('productivity-review-failure-keeps-card-and-keyboard',async page=>{
    await seedStudy(page,{decks:[{id:'qa-review',name:'复习测试',createdAt:1}],cards:[{id:'qa-card',deckId:'qa-review',front:'orbit',back:'轨道',createdAt:1,memory:null}]});await page.locator('.study-deck-open').click();await page.locator('.study-review').focus();await page.keyboard.press('Space');assert.equal(await page.getByRole('button',{name:'卡片背面',exact:true}).count(),1);await failStudyStorage(page,true);await page.keyboard.press('3');await assertStudyError(page);assert.equal((await studyState(page)).cards[0].memory,null);assert.equal(await page.getByRole('button',{name:'卡片背面',exact:true}).count(),1);await screenshot(page,'study-review-unsaved');
    await failStudyStorage(page,false);await page.locator('.study-review').focus();await page.keyboard.press('3');assert.equal((await studyState(page)).cards[0].memory.reps,1);await page.keyboard.press('Escape');assert.equal(await page.locator('.study-panel').count(),1);assert.equal(await page.locator('.focus-dock').count(),1);await screenshot(page,'study-review-returned');
  });
  await run('productivity-settings-keyboard-navigation',async page=>{
    await page.getByRole('button',{name:'设置',exact:true}).click();const nav=page.getByRole('tablist',{name:'设置分区',exact:true});await nav.getByRole('tab',{name:'音源',exact:true}).focus();await page.keyboard.press('ArrowDown');
    assert.equal(await nav.getByRole('tab',{name:'房间与桌宠',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-room');assert.equal(await nav.locator('[tabindex="0"]').count(),1);await screenshot(page,'settings-keyboard-room');
    await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-about');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-music');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-about');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-music');
    await page.setViewportSize({width:640,height:600});await page.waitForFunction(()=>document.querySelector('[aria-label="设置分区"]')?.getAttribute('aria-orientation')==='horizontal');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement?.id),'hub-tab-room');await page.screenshot({path:path.join(output,'settings-keyboard-640x600.png'),animations:'disabled'});await page.keyboard.press('Home');
    await page.keyboard.press('Tab');assert.equal(await page.locator('#hub-tab-panel').evaluate(e=>e.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'设置',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'设置',exact:true}).evaluate(e=>e===document.activeElement),true);
  });
  await run('productivity-settings-sections-and-shortcut-return',async page=>{
    await openFocus(page,'随手记');await page.getByLabel('随手记内容').fill('设置面板往返保留');await page.getByRole('button',{name:'设置',exact:true}).click();
    for(const [index,name] of ['音源','房间与桌宠','专注工具','显示与桌面','数据与备份','关于'].entries()) { await page.getByRole('tablist',{name:'设置分区',exact:true}).getByRole('tab',{name,exact:true}).click();await screenshot(page,`settings-section-${index}`);if(name==='显示与桌面')assert.equal(await page.locator('.hub-row-actions .segmented button').evaluateAll(buttons=>buttons.every(button=>{const range=document.createRange();range.selectNodeContents(button);return range.getClientRects().length===1;})),true,'performance option labels stay on one line'); }
    // 专注工具 holds the timer preferences (the dock's own form), not shortcuts into the dock.
    const hub=page.getByRole('dialog',{name:'设置',exact:true});await page.getByRole('tablist',{name:'设置分区',exact:true}).getByRole('tab',{name:'专注工具',exact:true}).click();assert.equal(await hub.getByRole('button',{name:/打开学习|打开番茄钟|查看统计|随手记/}).count(),0,'no action rows');
    await hub.getByLabel('专注（分）').fill('31');await hub.getByLabel('专注（分）').press('Enter');await page.keyboard.press('Escape');assert.equal(await hub.count(),0);
    assert.equal(await page.locator('.focus-badge').innerText().then(text=>text.includes('31')),true,'a 设置 change reaches the timer');await openFocus(page,'随手记');assert.equal(await page.getByLabel('随手记内容').inputValue(),'设置面板往返保留');await screenshot(page,'settings-shortcut-restored');
  });
  await run('companion-compact-header-keeps-brand-and-controls',async page=>{
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [1440,960,640]) {
      await page.setViewportSize({width,height:600});
      const bounds=await page.locator('.app-titlebar').evaluate(header=>{const r=header.getBoundingClientRect(), brand=header.querySelector('.app-brand strong'), count=header.querySelector('.app-brand small'), range=document.createRange();range.selectNodeContents(brand);return {lines:range.getClientRects().length,brandBottom:brand.getBoundingClientRect().bottom,countBottom:count.getBoundingClientRect().bottom,headerBottom:r.bottom,buttons:[...header.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return {name:button.getAttribute('aria-label'),left:b.left,right:b.right,top:b.top,bottom:b.bottom,reachable:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('button')===button};})};});
      await page.screenshot({path:path.join(output,`compact-header-${width}x600.png`),animations:'disabled'});assert.equal(bounds.lines,1,JSON.stringify(bounds));assert.ok(bounds.countBottom<=bounds.headerBottom);assert.ok(bounds.buttons.every(b=>b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=bounds.headerBottom&&b.reachable),JSON.stringify(bounds.buttons));
    }
    await page.getByRole('button',{name:'添加到唱片架',exact:true}).click();await page.getByRole('dialog',{name:'添加到唱片架',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'添加到唱片架',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog',{name:'设置',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'设置',exact:true}).evaluate(e=>e===document.activeElement),true);
  });
  await run('companion-generated-lofi-tempo-reaches-pet',async page=>{
    const { cleanCompanion } = createRequire(path.join(root,'desktop/package.json'))('./wallpaper-model.cjs');
    await openFocus(page,'声音');await page.getByRole('checkbox',{name:'Lo-fi 电台 · 实时生成',exact:true}).check(); // enabling lo-fi starts sound itself
    await page.waitForFunction(()=>window.albumCompanionSnapshot?.().sound?.lofi===true,null,{timeout:30000});
    const source=await page.evaluate(()=>window.albumCompanionSnapshot());const tempo=Number((await page.locator('.sound-section').innerText()).match(/(\d+) BPM/)[1]);
    await screenshot(page,'lofi-source-playing');assert.equal(source.lofiBpm,tempo,'generated lo-fi snapshot carries its actual section tempo');assert.equal(source.musicPlaying,false);assert.equal(source.bpm,0);assert.equal(source.energy,0);
    const pet=await page.context().newPage();pet.on('pageerror',e=>report.pageErrors.push(e.message));await pet.emulateMedia({reducedMotion:'no-preference'});await pet.addInitScript(()=>{window.albumPet={getSnapshot:async()=>null,onSnapshot:fn=>{window.__pushTempo=fn;return()=>{};},setHit(){},moveBy(){},dragEnd(){},menu(){},open(){}};window.__tempoEvents=[];window.addEventListener('cabin:playback',e=>window.__tempoEvents.push(e.detail));});
    await pet.setViewportSize({width:420,height:420});await pet.goto(origin+'/pet.html',{waitUntil:'domcontentloaded',timeout:30000});await pet.locator('.pet-cat .pixel-cat').waitFor();
    const push=async value=>{await pet.evaluate(companion=>window.__pushTempo({companion,size:192}),cleanCompanion({...value,reduceMotion:false}));};
    const beat=()=>pet.evaluate(async()=>({...((await import('/src/player/beat-clock.mjs')).currentBeat())}));
    const duration=async bpm=>{await pet.waitForFunction(bpm=>document.querySelector('.pet-cat .pixel-cat')?.getAnimations().some(a=>Math.abs(a.effect.getTiming().duration-60000/bpm)<1),bpm,{timeout:7000});};
    try {
      await push(source);await duration(tempo);assert.equal((await beat()).bpm,tempo);assert.equal((await beat()).detected,false);assert.equal(await pet.evaluate(()=>window.__tempoEvents.at(-1).playing),false);await pet.screenshot({path:path.join(output,'lofi-pet-tempo.png'),animations:'allow'});
      await push({...source,lofiBpm:80});await duration(80);await push({...source,lofiBpm:85});await duration(85);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cabin:playback',{detail:{playing:true,energy:.4,bpm:120,beatAt:Date.now()}})));const music=await page.evaluate(()=>window.albumCompanionSnapshot());assert.equal(music.lofiBpm,0);await push(music);await duration(120);assert.equal((await beat()).detected,true);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cabin:playback',{detail:{playing:false,energy:0}})));await push(await page.evaluate(()=>window.albumCompanionSnapshot()));await duration(tempo);
      await page.getByRole('button',{name:'声音已开启',exact:true}).click();await page.waitForFunction(()=>window.albumCompanionSnapshot?.().sound?.lofi===false);const stopped=await page.evaluate(()=>window.albumCompanionSnapshot());assert.equal(stopped.lofiBpm,0);await push(stopped);assert.equal((await beat()).bpm,96);assert.equal((await beat()).detected,false);await screenshot(page,'lofi-source-stopped');await pet.screenshot({path:path.join(output,'lofi-pet-stopped.png'),animations:'disabled'});
    } finally { await pet.close(); }
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpectedRequests,[]);if(report.checks.some(x=>!x.passed))process.exitCode=1;
}finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();server?.kill();}
