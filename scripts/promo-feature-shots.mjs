/** Focused screenshots from the real renderer, using synthetic journal notes and the built-in wordbook. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:4293';
const output = path.join(root, 'public/promo/shots');
let server;
let browser;
try {
 server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4293','--strictPort'],{cwd:root,stdio:'ignore'});
 for (let index = 0; ; index++) {
  if (server.exitCode !== null || index > 100) throw new Error('Vite did not start');
  if (await fetch(origin).then((response) => response.ok, () => false)) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
 }
 browser = await launchChromium();
 const context = await browser.newContext({viewport:{width:1100,height:820},locale:'zh-CN',timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
 await context.addInitScript(seed=>{
  if(location.origin==='null')return;
  localStorage.setItem('flow-cabin-onboarding-v1',seed);
  localStorage.setItem('flow-cabin-web-collection-v1',JSON.stringify({version:1,items:[{id:'demo-evening',title:'夜晚的旋律',artist:'小屋试听',tracks:['慢慢来'],source:'manual'}]}));
  localStorage.setItem('album-circle-focus-v1:local-owner',JSON.stringify({settings:{notify:false,chime:false}}));
 },onboardingSeed());
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page = await context.newPage();
 page.setDefaultTimeout(12000);
 const errors = [];
 page.on('pageerror', (error) => errors.push(error.message));
 await page.clock.install({time:new Date('2026-10-21T08:20:00Z')});
 await page.goto(origin);
 await page.locator('.focus-badge').waitFor();
 await page.evaluate(async()=>{
  const {saveJournalEntry}=await import('/src/focus/journal-entries.mjs');
  const notes=[['窗外下雨的时候','下午的雨来得很轻，把窗边的书翻到了下一页。\n\n没有急着做完所有事，先给自己倒了一杯热茶。',['日常']],['听完一张唱片','今天把桌上的东西收好，放了一张喜欢的唱片。\n\n写完两页，抬头看见窗外的天慢慢暗下来。原来安静坐一会儿，也算认真过了一天。\n\n明天想再留半小时，继续读那本没看完的书。',['阅读','音乐']]];
  for(let i=0;i<notes.length;i++){const [title,body,tags]=notes[i];const r=saveJournalEntry({storage:localStorage,body:title+'\n\n'+body,tags,now:Date.parse('2026-10-21T08:00:00Z')+i*600000});if(!r.ok)throw new Error(r.error);}
  window.dispatchEvent(new CustomEvent('cabin:open-journal',{detail:{tab:'entries'}}));
 });
 await page.locator('.journal-entry-list button').first().click();
 await page.getByLabel('这一页的内容').waitFor();
 await page.getByLabel('这一页的内容').blur();
 await page.evaluate(() => document.fonts.ready);
 await page.locator('.cabin-journal').screenshot({path:path.join(output,'journal-detail.png'),animations:'disabled'});
 await page.keyboard.press('Escape');
 await page.locator('.focus-badge').click();
 await page.getByRole('tab', { name: '学习', exact: true }).click();
 await page.getByRole('button', { name: '开始学习 / 复习', exact: true }).click();
 await page.getByRole('button', { name: '翻面 · 空格', exact: true }).click();
 await page.locator('.study-ratings').waitFor();
 await page.locator('.focus-dock').screenshot({path:path.join(output,'study-detail.png'),animations:'disabled'});
 assert.deepEqual(errors, []);
 console.log('Captured journal-detail.png and study-detail.png from the real renderer.');
} finally {
 await browser?.close();
 server?.kill();
}
