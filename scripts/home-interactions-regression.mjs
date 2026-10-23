import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
const origin='http://127.0.0.1:4295',output=path.resolve('desktop/test-results/home-interactions');
await fs.mkdir(output,{recursive:true});let browser,server,page;
const report={checks:[],errors:[],fixture:true},pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const close=()=>page.locator('.cabin-dialog-close').last().click();
const zone=name=>page.getByRole('navigation',{name:'房间区域'}).getByRole('button',{name,exact:true}).click();
try{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4295','--strictPort'],{stdio:'ignore'});
 for(let i=0;!await fetch(origin).then(r=>r.ok,()=>false);i++){if(i>100||server.exitCode!==null)throw Error('Preview failed');await new Promise(r=>setTimeout(r,100));}
 browser=await launchChromium();const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>localStorage.setItem('flow-cabin-interface-v1','beta'));
  await context.addInitScript(()=>{if(sessionStorage.getItem('home-fixture'))return;sessionStorage.setItem('home-fixture','1');localStorage.setItem('flow-cabin-home-intro-v1','done');localStorage.setItem('album-circle-focus-v1:local-owner',JSON.stringify({settings:{notify:false,chime:false},tasks:[{id:'first',text:'先读一页书',done:false,createdAt:Date.now()}]}));});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin);await page.locator('.home-canvas[data-art-ready=true]').waitFor();
 await zone('工作角');await page.getByRole('button',{name:'完成任务：先读一页书',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('album-circle-focus-v1:local-owner')).tasks[0].done),true);pass('task-paper-completes-real-task-without-opening-another-page');
 await zone('返回全屋');await page.locator('[data-furniture=calendar]').click();await page.getByRole('dialog',{name:'挂历与日程',exact:true}).waitFor();
 await page.getByLabel('查看日期',{exact:true}).fill('2026-11-01');await page.getByLabel('记一个重要日子',{exact:true}).fill('小屋纪念日');await page.getByRole('button',{name:'记在这一天',exact:true}).click();await page.getByText('小屋纪念日',{exact:true}).waitFor();await close();
 await page.reload();await page.locator('.home-canvas[data-art-ready=true]').waitFor();await page.locator('[data-furniture=calendar]').click();await page.getByLabel('查看日期',{exact:true}).fill('2026-11-01');await page.getByText('小屋纪念日',{exact:true}).waitFor();await close();pass('calendar-selects-dates-and-persists-important-days-through-reload');
 await page.getByRole('button',{name:'布置',exact:true}).click();const editor=page.getByRole('dialog',{name:'布置小屋',exact:true});
 await editor.getByRole('button',{name:'恢复默认',exact:true}).click();
 await editor.getByRole('button',{name:'工作桌 已摆放',exact:true}).click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('flow-cabin-room-layout-v2:pixel')).items.length);
 await editor.getByRole('button',{name:'收起家具和桌面小物',exact:true}).click();
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('flow-cabin-room-layout-v2:pixel')).items.length)<before);
 await editor.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('flow-cabin-room-layout-v2:pixel')).items.length),before);
 await editor.getByRole('button',{name:'重做',exact:true}).click();await editor.getByRole('button',{name:'撤销',exact:true}).click();
 const download=page.waitForEvent('download');await editor.getByRole('button',{name:'另存布局',exact:true}).click();const saved=await download;const layoutFile=path.join(output,'layout.json');await saved.saveAs(layoutFile);
 await editor.getByRole('button',{name:'休息',exact:true}).click();await editor.getByLabel('导入布局').setInputFiles(layoutFile);await editor.getByRole('button',{name:'完成布置',exact:true}).click();
 await page.locator('.home-canvas[data-art-ready=true]').waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('flow-cabin-room-layout-v2:pixel')).items.length),before);pass('editor-removes-supported-items-with-undo-redo-and-layout-file-roundtrip');
 await page.locator('[data-furniture=plant]').click();await page.getByRole('button',{name:'浇一点水',exact:true}).click();await page.getByRole('button',{name:'浇一点水',exact:true}).click();assert.match(await page.getByRole('dialog').innerText(),/照顾它的 1 天/);await close();
 await zone('生活角');await page.getByRole('button',{name:'喝杯茶',exact:true}).click();await page.getByRole('button',{name:'喝了一杯',exact:true}).click();assert.match(await page.getByRole('dialog').innerText(),/最近一次/);await close();pass('plant-watering-is-once-per-day-and-tea-works-with-reminders-off');
 await page.setViewportSize({width:390,height:844});await zone('听歌角');await page.locator('.corner-art').waitFor();
 const viewport=page.locator('.home-viewport');await viewport.dispatchEvent('pointerdown',{pointerId:11,clientX:320,clientY:450,button:0,pointerType:'touch'});await viewport.dispatchEvent('pointerup',{pointerId:11,clientX:100,clientY:450,button:0,pointerType:'touch'});
 await page.waitForFunction(()=>document.querySelector('.cabin-home').dataset.zone==='work');
 await page.locator('.corner-hotspot[aria-label=随手记]').dispatchEvent('click');assert.equal(await page.locator('dialog[open]').count(),0);pass('touch-swipe-changes-corner-without-opening-a-furniture-panel');
 await page.screenshot({path:path.join(output,'mobile-work.png')});
 const fallback=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await fallback.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await fallback.addInitScript(()=>{
   localStorage.setItem('flow-cabin-interface-v1','beta');localStorage.setItem('flow-cabin-home-intro-v1','done');
   const getContext=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:getContext.call(this,kind,...args);};
   if (globalThis.OffscreenCanvas) { const offscreen=OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:offscreen.call(this,kind,...args);}; }
   Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});
 });
 const noGpu=await fallback.newPage();noGpu.on('pageerror',e=>report.errors.push(e.message));await noGpu.goto(origin);
 await noGpu.locator('.home-canvas[data-renderer=canvas2d][data-art-ready=true]').waitFor();
 assert.ok(await noGpu.locator('.home-static-scene canvas').evaluate(c=>c.getContext('2d').getImageData(600,400,1,1).data[3])>0,'visible room survives unavailable WebGL');
 await noGpu.getByRole('button',{name:'设置',exact:true}).click();await noGpu.getByRole('button',{name:'小屋明信片',exact:true}).click();
 await noGpu.getByRole('button',{name:'生成预览',exact:true}).click();await noGpu.locator('.home-postcard-preview').waitFor();
 assert.match(await noGpu.locator('.home-postcard-preview').getAttribute('src'),/^data:image\/png;base64,/);
 await noGpu.screenshot({path:path.join(output,'postcard-no-webgl.png')});await fallback.close();
 pass('room-and-postcard-render-current-layout-without-webgl');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await browser?.close();server?.kill();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
