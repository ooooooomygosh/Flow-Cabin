/** Offline 唱片架 (bookcase close-up) and desk-chrome regressions. Synthetic covers, muted Chromium, native window bridge mocked. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { showcaseAlbums } from './showcase-albums.mjs';
import { openLibrary, closeLibrary, takeBinder, openSettingsSection, libraryDialog, openDrawerThing } from './settings-actions.mjs';
import { onboardingSeed } from './app-version.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SHELF_OUTPUT || path.join(root, 'desktop/test-results/shelf-ui');
const port = Number(process.env.SHELF_PORT || 4191), origin = `http://127.0.0.1:${port}`;
const cover = (name, hue) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="hsl(${hue} 40% 66%)"/><stop offset="1" stop-color="hsl(${hue} 30% 22%)"/></linearGradient><pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0h4v1H0z" fill="#fff" opacity=".15"/></pattern></defs><rect width="800" height="800" fill="url(#sky)"/><circle cx="560" cy="290" r="105" fill="#f7dfb1"/><path d="M0 600 190 290 440 620 625 440 800 590v210H0Z" fill="#213936"/><path d="m140 370 50-80 74 98-75-33Z" fill="#f8efda"/><path d="M0 655q200-110 400 0t400 0v145H0Z" fill="#497b75"/><path d="M0 690h800M0 700h800M0 710h800M0 720h800" stroke="#cfdfc2" stroke-width="2"/><rect width="800" height="800" fill="url(#grain)"/><text x="52" y="105" font-family="serif" font-size="60" fill="#fff5dc">${name}</text><text x="55" y="152" font-family="sans-serif" font-size="22" letter-spacing="6" fill="#fff5dc">SYNTHETIC QA · VOL. 01</text><text x="50" y="758" font-family="sans-serif" font-size="18" letter-spacing="3" fill="#fff5dc">QUIET HOURS / SIDE A</text></svg>`)}`;
const items = Array.from({length:8},(_,i)=>({id:`shelf-${i}`,type:i===3?'playlist':'album',title:['MORNING LIGHT','OCEAN STUDY','无封面唱片','EVENING TAPE'][i%4],artist:'离线视觉测试',cover:i===2?'':cover(['MORNING LIGHT','OCEAN STUDY','QUIET HOURS','EVENING TAPE'][i%4],160+i*18),source:'manual',tracks:['静音展示'],addedAt:new Date(2026,9,10-i).toISOString()}));
const report={fixtureData:true,muted:true,nativeIntegrationTested:false,checks:[],measurements:[],pageErrors:[],unexpectedRequests:[]};
await fs.mkdir(output,{recursive:true});
let server,browser;
const shot=async(page,name)=>page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});
try {
  server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,FLOW_CABIN_VITE_CACHE_DIR:path.join(output,'vite-cache')},stdio:['ignore','pipe','pipe']});
  let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
  for(let i=0;;i++){if(server.exitCode!==null||i>300)throw new Error(`Vite startup: ${log}`);if(hasViteLocalOrigin(log,origin)&&await fetch(origin).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
  browser = await launchChromium();
  const run=async(name,test,{native=true,dpr=1,collectionItems=items}={})=>{
    if(process.env.SHELF_FILTER&&!process.env.SHELF_FILTER.split(',').some(s=>name.includes(s)))return;
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:dpr,locale:'zh-CN',reducedMotion:'reduce'});
    await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
    await context.addInitScript(native=>{
      if(location.origin==='null')return;
      localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
      window.__nativeCommands=[];window.open=url=>{window.__nativeCommands.push(String(url));return null;};
      window.albumDesktopAppearance={client:native,reduceMotion:true};
      const init=()=>{document.documentElement.dataset.desktopClient=String(native);document.documentElement.dataset.desktopReduceMotion='true';};
      if(document.documentElement)init();else new MutationObserver((_,o)=>{if(document.documentElement){init();o.disconnect();}}).observe(document,{childList:true});
    },native);
    await context.route('**/*',route=>{const u=new URL(route.request().url()),p=u.pathname;if(u.origin!==origin){report.unexpectedRequests.push(u.href);return route.abort();}if(p==='/api/items')return route.fulfill({json:{items:collectionItems}});if(p==='/desktop-music/lyrics')return route.fulfill({json:{text:'',source:'fixture',reason:'No fixture lyrics'}});if(p==='/desktop-music/config')return route.fulfill({json:{qqLoggedIn:false,neteaseLoggedIn:false}});if(p==='/desktop-music/now-playing'||p==='/desktop-music/apple/permission')return route.fulfill({json:{available:false}});if(p==='/desktop-music/local/summary')return route.fulfill({json:{folders:[],albumCount:0,trackCount:0}});if(p.startsWith('/api/')||p.startsWith('/desktop-music/')){report.unexpectedRequests.push(p);return route.fulfill({status:500,json:{error:'Unimplemented fixture'}});}return route.continue();});
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.pageErrors.push(e.message));
    try{await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('.desk-home').waitFor();await test(page);report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
    catch(e){const state=await page.evaluate(()=>({fullscreen:Boolean(document.fullscreenElement),native:document.documentElement.dataset.desktopFullscreen,client:document.documentElement.dataset.desktopClient,zen:document.documentElement.classList.contains('room-zen'),dock:document.querySelector('.focus-badge')?.getAttribute('aria-expanded'),active:document.activeElement?.getAttribute('aria-label'),trace:window.__fullscreenTrace})).catch(()=>null);report.checks.push({name,passed:false,error:e.stack,state});await shot(page,`${name}-failure`).catch(()=>{});console.error(`FAIL ${name}: ${e.message}`);}
    finally{await context.close();}
  };
  // The bookcase: ring binders and the index book stand inside the window at every size; taking one down opens it on
  // the desk without overflow, and the record covers (cover button → deck, title → 唱片卡片, index book + Enter) work.
  await run('shelf-bookcase-fits-and-plays-at-three-sizes',async page=>{
    for(const [width,height] of [[1440,900],[960,600],[640,600]]){
      await page.setViewportSize({width,height});const dialog=await openLibrary(page);await shot(page,`bookcase-${width}x${height}`);
      const spines=await dialog.locator('.shelf-binder, .shelf-book, .shelf-frame').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {name:n.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
      assert(spines.length>=5,`binders, index book and wall frame stand on the shelf (${spines.length})`);
      report.measurements.push({shelf:'bookcase',width,height,spines});
      await takeBinder(page,'唱片');
      const cells=await dialog.locator('.listen-grid li').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,top:r.top,w:r.width};}));
      assert.equal(cells.length,8,'every record is filed in the 唱片 binder');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal page overflow at ${width}x${height}`);
      assert(await dialog.locator('.shelf-object').evaluate(o=>{const r=o.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1;}),'the open binder sits inside the window');
      await closeLibrary(page);
    }
    await page.setViewportSize({width:1440,height:900});
    const dialog=await takeBinder(page,'唱片');
    await dialog.locator('.listen-grid-cover').nth(1).click();
    await page.waitForFunction(()=>window.__cabinDeckItem?.title==='OCEAN STUDY');
    const title=dialog.locator('.listen-grid-title').first();await title.click();
    const card=page.getByRole('dialog',{name:/^唱片卡片/});await card.waitFor();await page.keyboard.press('Escape');await card.waitFor({state:'hidden'});
    // 索引本: typing finds a record, Enter puts it on the deck.
    const book=await takeBinder(page,'索引本');
    const search=book.getByRole('combobox',{name:'搜索唱片架'});await search.fill('MORNING');await search.press('Enter');
    await page.waitForFunction(()=>window.__cabinDeckItem?.title==='MORNING LIGHT');
    await closeLibrary(page);
  });
  const photos=await showcaseAlbums();
  await run('shelf-photographic-covers-and-fine-type',async page=>{
    await page.setViewportSize({width:2560,height:1600});const dialog=await takeBinder(page,'唱片');
    await page.waitForFunction(()=>[...document.querySelectorAll('.listen-grid img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:15000});await shot(page,'photos-bookcase-2560x1600');
    for(const index of [0,1,2,6])await dialog.locator('.listen-grid li').nth(index).screenshot({path:path.join(output,`photo-cell-${index}.png`),animations:'disabled'});
    const covers=await dialog.locator('.listen-grid .listen-cover').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,bottom:r.bottom};}));
    report.measurements.push({photos:covers});
    if(!process.env.SHELF_BASELINE)for(const m of covers){assert(Math.abs(m.width-m.height)<=1,'sleeves stay square at large window sizes');assert(m.right<=2560&&m.bottom<=1600,'covers stay inside the window');}
  },{collectionItems:photos});
  await run('shelf-artwork-dpr2-resize-and-error-recovery',async page=>{
    const data=cover('RECOVERY TEST',190);
    await page.evaluate(async data=>{
      const React=await import('/@id/react');const ReactDOM=await import('/@id/react-dom/client');const createRoot=ReactDOM.createRoot||ReactDOM.default?.createRoot;const {ShowroomArtwork}=await import('/src/RoomArtwork.jsx');
      const holder=document.createElement('div');holder.id='artwork-probe';Object.assign(holder.style,{position:'fixed',top:'150px',left:'350px',width:'320px',height:'320px',zIndex:'999'});document.body.append(holder);const root=createRoot(holder);window.__unmountProbe=()=>{root.unmount();holder.remove();};window.__probe=(cover)=>root.render((React.createElement||React.default.createElement)(ShowroomArtwork,{item:{title:'恢复检查',cover},pixel:true}));window.__probe(data);
    },data);
    const painted=page.locator('#artwork-probe canvas.is-painted');await painted.waitFor();assert.equal(await painted.getAttribute('width'),'64');
    await page.evaluate(()=>{document.getElementById('artwork-probe').style.width='100px';document.getElementById('artwork-probe').style.height='100px';});await page.waitForFunction(()=>document.querySelector('#artwork-probe canvas').width===64);
    await page.evaluate(()=>window.__probe('data:image/png;base64,not-a-png'));await page.locator('#artwork-probe .showroom-art-placeholder').waitFor();await page.evaluate(data=>window.__probe(data),data);await painted.waitFor();assert.equal(await painted.getAttribute('width'),'64');await shot(page,'artwork-recovered-dpr2');
    await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);window.__probe(c.toDataURL());});await page.waitForFunction(()=>document.querySelector('#artwork-probe canvas')?.width===32);await page.evaluate(()=>{window.__unmountProbe();window.dispatchEvent(new Event('resize'));});assert.equal(await page.locator('#artwork-probe').count(),0);
  },{dpr:2});
  await run('chrome-single-settings-and-native-fullscreen',async page=>{
    await shot(page,'header-before-interaction');
    // One way into 设置 on the whole desk: the screwdriver in the drawer (the window controls carry none).
    assert.equal(await page.locator('.desk-home').getByRole('button',{name:/^(设置|软件设置|显示与字体)$/,includeHidden:true}).count(),1,'one settings entry');
    assert.equal(await page.getByRole('button',{name:'最大化或还原窗口',exact:true}).count(),0,'no second square');
    // 设置 › 桌面 has the native 显示与字体 command.
    await openDrawerThing(page,'设置');await page.getByRole('tab',{name:'桌面',exact:true}).click();await page.getByRole('button',{name:'打开显示与字体',exact:true}).click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/settings$/);await page.keyboard.press('Escape');await page.locator('.desk-pull').waitFor();
    const enter=page.getByRole('button',{name:'进入全屏模式',exact:true});await enter.click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/fullscreen$/);assert.equal(await enter.getAttribute('aria-pressed'),'false','wait for native confirmation');
    await page.evaluate(()=>{document.documentElement.dataset.desktopFullscreen='true';window.dispatchEvent(new CustomEvent('album-desktop-fullscreen',{detail:true}));});
    assert.equal(await page.getByRole('button',{name:'退出全屏模式',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'收起工具',exact:true}).click();assert.equal(await page.locator('.focus-badge').isVisible(),true,'the LED clock stays');assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'显示工具',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'隐藏工具',exact:true}).click();await page.getByRole('button',{name:'退出全屏',exact:true}).click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/fullscreen-exit$/);await shot(page,'immersive-fullscreen-recovery');
  });
  await run('chrome-browser-fullscreen-and-escape',async page=>{
    await page.evaluate(()=>{window.__fullscreenTrace=[];document.addEventListener('keydown',e=>window.__fullscreenTrace.push({type:'key',key:e.key,prevented:e.defaultPrevented,fullscreen:Boolean(document.fullscreenElement)}));document.addEventListener('fullscreenchange',()=>window.__fullscreenTrace.push({type:'change',fullscreen:Boolean(document.fullscreenElement)}));});
    for(let i=0;i<6;i++){
      await page.getByRole('button',{name:'进入全屏模式',exact:true}).click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.getByRole('button',{name:'退出全屏模式',exact:true}).waitFor();
      if(i===0)await shot(page,'browser-fullscreen');
      if(i%2===0)await page.getByRole('button',{name:'退出全屏模式',exact:true}).click();else{await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Escape');}
      await page.waitForFunction(()=>!document.fullscreenElement);await page.getByRole('button',{name:'进入全屏模式',exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>window.__nativeCommands.length),0);
  },{native:false});
  await run('chrome-browser-fullscreen-denial-and-retry',async page=>{
    await page.evaluate(()=>{window.__requestFullscreen=document.documentElement.requestFullscreen;document.documentElement.requestFullscreen=()=>Promise.reject(new DOMException('Synthetic denial','NotAllowedError'));});
    await page.getByRole('button',{name:'进入全屏模式',exact:true}).click();await page.getByRole('alert').filter({hasText:'无法切换全屏'}).waitFor();assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),false);await shot(page,'browser-fullscreen-denied');
    await page.evaluate(()=>{document.documentElement.requestFullscreen=window.__requestFullscreen;});await page.getByRole('button',{name:'进入全屏模式',exact:true}).click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.getByRole('button',{name:'退出全屏模式',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);
  },{native:false});
} finally {
  await browser?.close();server?.kill();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
if(report.checks.some(c=>!c.passed)||report.pageErrors.length||report.unexpectedRequests.length)process.exitCode=1;
