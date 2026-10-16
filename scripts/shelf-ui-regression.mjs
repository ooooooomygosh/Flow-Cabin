/** Offline shelf/chrome regressions. Synthetic covers, muted Chromium, native window bridge mocked. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { showcaseAlbums } from './showcase-albums.mjs';
import { ROOM_SCENES } from '../src/scene-catalog.mjs';
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
    await context.addInitScript(native=>{
      if(location.origin==='null')return;
      localStorage.setItem('flow-cabin-onboarding-v1',JSON.stringify({version:1,status:'done',step:'done'}));
      window.__nativeCommands=[];window.open=url=>{window.__nativeCommands.push(String(url));return null;};
      window.albumDesktopAppearance={client:native,reduceMotion:true};
      const init=()=>{document.documentElement.dataset.desktopClient=String(native);document.documentElement.dataset.desktopReduceMotion='true';};
      if(document.documentElement)init();else new MutationObserver((_,o)=>{if(document.documentElement){init();o.disconnect();}}).observe(document,{childList:true});
    },native);
    await context.route('**/*',route=>{const u=new URL(route.request().url()),p=u.pathname;if(u.origin!==origin){report.unexpectedRequests.push(u.href);return route.abort();}if(p==='/api/items')return route.fulfill({json:{items:collectionItems}});if(p==='/desktop-music/config')return route.fulfill({json:{qqLoggedIn:false,neteaseLoggedIn:false}});if(p==='/desktop-music/now-playing'||p==='/desktop-music/apple/permission')return route.fulfill({json:{available:false}});if(p==='/desktop-music/local/summary')return route.fulfill({json:{folders:[],albumCount:0,trackCount:0}});if(p.startsWith('/api/')||p.startsWith('/desktop-music/')){report.unexpectedRequests.push(p);return route.fulfill({status:500,json:{error:'Unimplemented fixture'}});}return route.continue();});
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.pageErrors.push(e.message));
    try{await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('.room-record').first().waitFor();await test(page);report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
    catch(e){const state=await page.evaluate(()=>({fullscreen:Boolean(document.fullscreenElement),native:document.documentElement.dataset.desktopFullscreen,client:document.documentElement.dataset.desktopClient,zen:document.documentElement.classList.contains('room-zen'),dock:document.querySelector('.focus-badge')?.getAttribute('aria-expanded'),active:document.activeElement?.getAttribute('aria-label'),trace:window.__fullscreenTrace})).catch(()=>null);report.checks.push({name,passed:false,error:e.stack,state});await shot(page,`${name}-failure`).catch(()=>{});console.error(`FAIL ${name}: ${e.message}`);}
    finally{await context.close();}
  };
  for(const scene of ROOM_SCENES)await run(`shelf-${scene.id}-geometry-and-interaction`,async page=>{
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:'房间与桌宠',exact:true}).click();await page.getByRole('button',{name:`选择场景 ${scene.label}`,exact:true}).click();await page.keyboard.press('Escape');
    for(const [width,height] of [[1440,900],[960,600],[640,600]]){
      await page.setViewportSize({width,height});await page.waitForFunction(()=>[...document.querySelectorAll('.room-record .pixel-artwork canvas')].every(c=>c.classList.contains('is-painted')));
      await page.mouse.move(0,height-1);await shot(page,`${scene.id}-${width}x${height}`);
      const metrics=await page.locator('.room-record').evaluateAll(buttons=>buttons.map(b=>{const s=b.closest('.room-record-slot').getBoundingClientRect(),a=b.querySelector(':scope > .room-record-sleeve')||b.querySelector(':scope > .showroom-artwork'),r=a.getBoundingClientRect(),c=a.querySelector('canvas');return {slot:{x:s.x,y:s.y,w:s.width,h:s.height,bottom:s.bottom},sleeve:{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom},canvas:c?.width,pointer:getComputedStyle(a).pointerEvents,buttonTranslate:getComputedStyle(b).translate};}));
      report.measurements.push({scene:scene.id,width,height,metrics});
      if(process.env.SHELF_BASELINE)continue;
      for(const m of metrics){assert(Math.abs(m.sleeve.w-m.sleeve.h)<=1,'sleeves remain square');assert(m.sleeve.w<m.slot.w*.94&&m.sleeve.w>m.slot.w*.8,'recess is visible beside sleeve');assert(m.sleeve.y>=m.slot.y+1,'sleeve fits inside cell');assert(m.sleeve.bottom<=m.slot.bottom&&m.sleeve.bottom>=m.slot.bottom-m.slot.h*.055,'sleeve rests on cell floor');if(m.canvas)assert(m.canvas>=96&&m.sleeve.w/m.canvas<=2.6,'fine, bounded pixel grain');}
    }
    await page.setViewportSize({width:1440,height:900});await page.locator('.room-record').first().click({position:{x:2,y:4}});assert.equal(await page.locator('.room-record').first().getAttribute('aria-pressed'),'true','whole recess remains a hit target');const second=page.locator('.room-record').nth(1);await second.click();assert.equal(await second.getAttribute('aria-pressed'),'true');await second.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await second.evaluate(e=>e.matches(':focus-visible')),true);if(!process.env.SHELF_BASELINE)assert.equal(await second.locator('.room-record-sleeve').evaluate(e=>getComputedStyle(e).outlineStyle),'dashed');await shot(page,`${scene.id}-keyboard-focus`);await page.keyboard.press('Enter');assert.equal(await second.getAttribute('aria-pressed'),'true');
    await second.dblclick();await page.waitForFunction(()=>document.querySelector('.room-turntable')?.dataset.loadedId==='shelf-1');
    const third=page.locator('.room-record').nth(2);await third.dragTo(await page.locator('.scene-deck').isVisible()?page.locator('.scene-deck'):page.locator('.room-turntable'));
    await page.waitForFunction(()=>document.querySelector('.room-turntable')?.dataset.loadedId==='shelf-2');
  });
  const photos=await showcaseAlbums();
  await run('shelf-photographic-covers-and-fine-type',async page=>{
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:'房间与桌宠',exact:true}).click();await page.getByRole('button',{name:'选择场景 琥珀小屋',exact:true}).click();await page.keyboard.press('Escape');
    await page.setViewportSize({width:2560,height:1600});await page.mouse.move(0,1599);await page.waitForFunction(()=>[...document.querySelectorAll('.room-record .pixel-artwork canvas')].every(c=>c.classList.contains('is-painted')));await shot(page,'photos-warm-2560x1600');
    for(const index of [0,1,2,6])await page.locator('.room-record-slot').nth(index).screenshot({path:path.join(output,`photo-cell-${index}.png`),animations:'disabled'});
    report.measurements.push({photos:await page.locator('.room-record .pixel-artwork canvas').evaluateAll(cs=>cs.map(c=>({width:c.getBoundingClientRect().width,resolution:c.width})))});
    if(!process.env.SHELF_BASELINE)for(const m of report.measurements.at(-1).photos)assert(m.width/m.resolution<=2.6);
  },{collectionItems:photos});
  await run('shelf-artwork-dpr2-resize-and-error-recovery',async page=>{
    const data=cover('RECOVERY TEST',190);
    await page.evaluate(async data=>{
      const React=await import('/@id/react');const ReactDOM=await import('/@id/react-dom/client');const createRoot=ReactDOM.createRoot||ReactDOM.default?.createRoot;const {ShowroomArtwork}=await import('/src/RoomArtwork.jsx');
      const holder=document.createElement('div');holder.id='artwork-probe';Object.assign(holder.style,{position:'fixed',top:'150px',left:'350px',width:'320px',height:'320px',zIndex:'999'});document.body.append(holder);const root=createRoot(holder);window.__unmountProbe=()=>{root.unmount();holder.remove();};window.__probe=(cover)=>root.render((React.createElement||React.default.createElement)(ShowroomArtwork,{item:{title:'恢复检查',cover},pixel:true}));window.__probe(data);
    },data);
    const painted=page.locator('#artwork-probe canvas.is-painted');await painted.waitFor();assert.equal(await painted.getAttribute('width'),'256');
    await page.evaluate(()=>{document.getElementById('artwork-probe').style.width='100px';document.getElementById('artwork-probe').style.height='100px';});await page.waitForFunction(()=>document.querySelector('#artwork-probe canvas').width===100);
    await page.evaluate(()=>window.__probe('data:image/png;base64,not-a-png'));await page.locator('#artwork-probe .showroom-art-placeholder').waitFor();await page.evaluate(data=>window.__probe(data),data);await painted.waitFor();assert.equal(await painted.getAttribute('width'),'100');await shot(page,'artwork-recovered-dpr2');
    await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);window.__probe(c.toDataURL());});await page.waitForFunction(()=>document.querySelector('#artwork-probe canvas')?.width===32);await page.evaluate(()=>{window.__unmountProbe();window.dispatchEvent(new Event('resize'));});assert.equal(await page.locator('#artwork-probe').count(),0);
  },{dpr:2});
  await run('chrome-single-settings-and-native-fullscreen',async page=>{
    await shot(page,'header-before-interaction');
    assert.equal(await page.locator('.app-titlebar').getByRole('button',{name:/^(设置|软件设置)$/}).count(),1,'one settings gear');
    assert.equal(await page.getByRole('button',{name:'最大化或还原窗口',exact:true}).count(),0,'no second square');
    const settings=page.getByRole('button',{name:'设置',exact:true});assert.equal((await settings.innerText()).trim(),'','settings is icon-only');await settings.focus();await page.keyboard.press('Enter');await page.getByRole('tab',{name:'桌面',exact:true}).click();await page.getByRole('button',{name:'软件设置',exact:true}).click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/settings$/);await page.keyboard.press('Escape');await settings.waitFor();assert.equal(await settings.evaluate(e=>e===document.activeElement),true);
    const enter=page.getByRole('button',{name:'进入全屏模式',exact:true});await enter.click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/fullscreen$/);assert.equal(await enter.getAttribute('aria-pressed'),'false','wait for native confirmation');
    await page.evaluate(()=>{document.documentElement.dataset.desktopFullscreen='true';window.dispatchEvent(new CustomEvent('album-desktop-fullscreen',{detail:true}));});
    assert.equal(await page.getByRole('button',{name:'退出全屏模式',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'沉浸模式',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'显示工具',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^退出全屏(模式)?$/}).count(),1);await page.getByRole('button',{name:'收起工具',exact:true}).click();await page.getByRole('button',{name:'退出全屏',exact:true}).click();assert.match(await page.evaluate(()=>window.__nativeCommands.at(-1)),/\/fullscreen-exit$/);await shot(page,'immersive-fullscreen-recovery');
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
