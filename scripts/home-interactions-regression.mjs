import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { lookUp, pressSpot, backToDesk, openDrawerThing, drawer } from './settings-actions.mjs';
// The home since 3.1 is DEsk's desk (src/desk/DeskHome.jsx): the back edge (唱机 plate · LED clock · post box), the 唱片架
// plate, the drawer, and the keys A / C / N / D / Esc. What the isometric room's checks (hotspots, corners, the room menu,
// 布置小屋, the calendar, plant and tea, the camera) covered is listed in docs/v3.1-desk.md › 返工删除的检查.
const origin='http://127.0.0.1:4295',output=path.resolve('desktop/test-results/home-interactions');
await fs.mkdir(output,{recursive:true});let browser,server,page;
const report={checks:[],errors:[],fixture:true},pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const looking=()=>page.locator('.desk-look').getAttribute('aria-label').catch(()=>null);
try{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4295','--strictPort'],{stdio:'ignore'});
 for(let i=0;!await fetch(origin).then(r=>r.ok,()=>false);i++){if(i>100||server.exitCode!==null)throw Error('Preview failed');await new Promise(r=>setTimeout(r,100));}
 browser=await launchChromium();const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(seed=>{if(sessionStorage.getItem('home-fixture'))return;sessionStorage.setItem('home-fixture','1');localStorage.setItem('flow-cabin-onboarding-v1',seed);localStorage.setItem('flow-cabin-home-intro-v1','done');localStorage.setItem('album-circle-focus-v1:local-owner',JSON.stringify({settings:{notify:false,chime:false},tasks:[{id:'first',text:'先读一页书',done:false,createdAt:Date.now()}]}));},onboardingSeed());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin);await page.locator('.desk-home.is-lit').waitFor();
 // The desk: four things at the back, everything else in the drawer (lab things only with their lab on).
 const desk=page.locator('.desk-home');
 for(const name of [/^唱机 · 抬头看控制面板（C）$/,/^专注 · /,/^信箱（N）$/,/^唱片架 · 抬头看书柜（A）$/,/^拉开抽屉（D）$/])assert.equal(await desk.getByRole('button',{name}).count(),1,String(name));
 assert.equal(await drawer(page).count(),0,'the drawer is shut (inert, hidden from assistive tech)');
 await page.locator('.desk-pull').click();await drawer(page).waitFor();
 assert.deepEqual(await drawer(page).getByRole('button').evaluateAll(n=>n.map(b=>b.getAttribute('aria-label'))),['唱片日记','伙伴','随手记','窗外与天气','备份与恢复','设置']);
 assert.equal(await page.locator('.desk-pull').getAttribute('aria-label'),'推回抽屉（D）');
 await drawer(page).getByRole('button',{name:'唱片日记',exact:true}).click();await page.getByRole('dialog',{name:'唱片日记'}).waitFor();
 assert.equal(await page.locator('.desk-pull').getAttribute('aria-expanded'),'false','taking a thing out pushes the drawer back');
 await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'唱片日记'}).waitFor({state:'hidden'});
 pass('desk-has-four-things-at-the-back-and-the-drawer-holds-the-rest');
 // The bookcase view: its 台历 opens the real task list, where a task is completed in one click.
 await pressSpot(page,'shelf','待办与日程（台历）');const focus=page.getByRole('dialog',{name:'专注',exact:true});await focus.waitFor();
 assert.equal(await focus.getByRole('tab',{name:'待办',exact:true}).getAttribute('aria-selected'),'true');
 await focus.getByRole('checkbox',{name:'完成：先读一页书',exact:true}).check();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('album-circle-focus-v1:local-owner')).tasks[0].done),true);
 await page.keyboard.press('Escape');await focus.waitFor({state:'hidden'});assert.equal(await looking(),'唱片架','closing the panel leaves the view of the bookcase');
 await backToDesk(page);pass('bookcase-calendar-completes-a-real-task');
 // Keys, as on DEsk: A the bookcase, C the Control Panel, N the post box, D the drawer, Esc one step back.
 await page.evaluate(()=>document.activeElement?.blur());
 for(const [key,name] of [['a','唱片架'],['c','唱机'],['n','信箱']]){
   await page.keyboard.press(key);await page.locator('.desk-look.is-there').waitFor();assert.equal(await looking(),name,key);
   await page.keyboard.press('d');assert.equal(await page.locator('.desk-pull').getAttribute('aria-expanded'),'false','no drawer while looking up');
   await page.keyboard.press('Escape');await page.locator('.desk-look').waitFor({state:'detached'});
 }
 await page.keyboard.press('d');await drawer(page).waitFor();await page.keyboard.press('Escape');await drawer(page).waitFor({state:'detached'});
 await page.keyboard.press('d');await drawer(page).waitFor();await page.keyboard.press('d');await drawer(page).waitFor({state:'detached'});
 await openDrawerThing(page,'随手记');await page.getByRole('textbox',{name:'随手记内容'}).fill('a c n d');await page.keyboard.press('a');
 assert.equal(await page.locator('.desk-look').count(),0,'typing in a dialog never moves the desk');await backToDesk(page);
 pass('keys-a-c-n-d-and-escape-move-around-the-desk');
 // A click on the bare view (here the post box) looks back down.
 await lookUp(page,'post');await page.locator('.desk-view').click({position:{x:40,y:40}});await page.locator('.desk-look').waitFor({state:'detached'});
 pass('a-click-on-the-bare-view-looks-back-down');
 await page.screenshot({path:path.join(output,'desk.png')});
 // 小屋明信片 (实验室) prints the desk, also without WebGL.
 const fallback=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await fallback.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await fallback.addInitScript(seed=>localStorage.setItem('flow-cabin-onboarding-v1',seed),onboardingSeed()); // the first-run guide is covered by onboarding-checks
 await fallback.addInitScript(()=>{
   localStorage.setItem('flow-cabin-home-intro-v1','done');
   localStorage.setItem('flow-cabin-labs-v1',JSON.stringify({postcard:true})); // 小屋明信片 is a 实验室 feature since 3.0
   const getContext=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:getContext.call(this,kind,...args);};
   if (globalThis.OffscreenCanvas) { const offscreen=OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:offscreen.call(this,kind,...args);}; }
   Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});
 });
 const noGpu=await fallback.newPage();noGpu.on('pageerror',e=>report.errors.push(e.message));await noGpu.goto(origin);await noGpu.locator('.desk-home.is-lit').waitFor();
 await openDrawerThing(noGpu,'明信片');
 await noGpu.getByRole('button',{name:'生成预览',exact:true}).click();await noGpu.locator('.home-postcard-preview').waitFor();
 assert.match(await noGpu.locator('.home-postcard-preview').getAttribute('src'),/^data:image\/png;base64,/);
 // The card shows the desk (its walnut), not an empty frame.
 assert.ok(await noGpu.locator('.home-postcard-preview').evaluate(async img=>{await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);const [r,gr,b]=g.getImageData(600,400,1,1).data;return r+gr+b>30&&!(r===0x2a&&gr===0x1a&&b===0x10);}),'the postcard prints the desk picture');
 await noGpu.screenshot({path:path.join(output,'postcard-no-webgl.png')});await fallback.close();
 pass('postcard-prints-the-desk-without-webgl');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await browser?.close();server?.kill();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
