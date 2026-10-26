/** Serve the actual production files. No collection/backend mocks are allowed. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openSettingsSection, openAddToShelf } from './settings-actions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'desktop/test-results/web-static'),origin='http://127.0.0.1:4287';
await fs.mkdir(output,{recursive:true});
let browser,page,server;
const report={checks:[],pageErrors:[],consoleErrors:[],backendRequests:[],externalRequests:[]};
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
try {
 server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4287','--strictPort'],{cwd:root,stdio:'ignore'});
 for(let i=0;;i++){if(server.exitCode!==null||i>100)throw new Error('Preview did not start');if(await fetch(origin).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await launchChromium();const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>localStorage.setItem('flow-cabin-interface-v1','beta'));
  await context.addInitScript(seed=>{if(location.origin==='null'||sessionStorage.getItem('static-seeded'))return;sessionStorage.setItem('static-seeded','1');localStorage.setItem('flow-cabin-onboarding-v1',seed);localStorage.setItem('album-circle-focus-v1:local-owner',JSON.stringify({settings:{notify:false,chime:false}}));},onboardingSeed());
 const policy=JSON.parse(await fs.readFile(path.join(root,'vercel.json'),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin){report.externalRequests.push(u.href);return route.abort();}if(route.request().resourceType()==='document'){const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});}return route.continue();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('request',r=>{if(/\/(api|desktop-music)\//.test(new URL(r.url()).pathname))report.backendRequests.push(new URL(r.url()).pathname);});
 await page.goto(origin);await page.locator('.focus-badge').waitFor();assert.equal(await page.locator('.app-error').count(),0);check('static-production-opens-without-a-collection-server');
 await openAddToShelf(page,'手动填写');await page.getByLabel('专辑名',{exact:true}).fill('浏览器里的第一张唱片');await page.getByLabel('歌手',{exact:true}).fill('本地试用');await page.getByLabel('曲目',{exact:true}).fill('慢慢来');await page.getByRole('button',{name:'放上唱片架',exact:true}).click();await page.getByText('《浏览器里的第一张唱片》已放上唱片架。',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.locator('.home-record-title').waitFor();check('manual-record-saves-in-the-browser');
 await page.reload();await page.locator('.home-shortcuts').getByRole('button',{name:'唱片架',exact:true}).click();await page.locator('.home-record-title').waitFor();assert.equal(await page.locator('.home-record-title').count(),1);check('shelf-survives-a-real-page-reload');
 await page.locator('.home-record-title').first().click();await page.getByLabel('我的笔记').fill('这张唱片保存在当前浏览器。');await page.getByLabel('我的笔记').blur();await page.getByText('已保存在这台电脑',{exact:true}).waitFor();await page.keyboard.press('Escape');check('record-notes-persist-without-http-patches');
 await openSettingsSection(page,'数据与备份');await page.getByRole('button',{name:'收藏与备份',exact:true}).click();const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出备份',exact:true}).click();const file=await downloaded;const saved=path.join(output,'synthetic-backup.json');await file.saveAs(saved);const backup=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(backup.items.length,1);assert.equal(backup.items[0].notes,'这张唱片保存在当前浏览器。');check('existing-backup-export-includes-the-web-collection');
 await page.keyboard.press('Escape');
 await page.evaluate(()=>localStorage.removeItem('flow-cabin-web-collection-v1'));await page.reload();await page.locator('.focus-badge').waitFor();
 await openSettingsSection(page,'数据与备份');await page.getByRole('button',{name:'收藏与备份',exact:true}).click();await page.getByLabel('导入备份文件').setInputFiles(saved);await page.getByText('导入完成：新增 1 张唱片，唱片架现在共有 1 张。',{exact:true}).waitFor();check('exported-backup-restores-to-an-empty-browser-collection');
 await page.getByLabel('导入备份文件').setInputFiles(saved);await page.getByText('导入完成：新增 0 张唱片，唱片架现在共有 1 张。',{exact:true}).waitFor();check('importing-the-same-backup-does-not-duplicate-records');
 await page.keyboard.press('Escape');await page.reload();await page.locator('.home-shortcuts').getByRole('button',{name:'唱片架',exact:true}).click();await page.locator('.home-record-title').waitFor();await page.screenshot({path:path.join(output,'web-collection.png'),animations:'disabled'});
 assert.deepEqual(report.backendRequests,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.externalRequests,[]);check('no-backend-requests-or-runtime-errors');
} catch(error){report.error=error.stack;console.error(error);await page?.screenshot({path:path.join(output,'failure.png'),animations:'disabled'}).catch(()=>{});process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();server?.kill();}
