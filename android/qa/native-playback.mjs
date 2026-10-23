import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {launchChromium} from '../../scripts/launch-browser.mjs';
const root=new URL('../../',import.meta.url).pathname;
const server=spawn(process.execPath,[root+'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4297','--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try {
for(let i=0;i<100;i++){if(await fetch('http://127.0.0.1:4297/android/qa/native-playback.html').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
browser=await launchChromium();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4297/android/qa/native-playback.html');await page.waitForFunction(()=>window.api?.playback.playing);
await page.evaluate(()=>window.emit({index:2,mediaId:'content://qa/album/2',title:'three'}));await page.waitForFunction(()=>window.api.index===2);assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).length),1);console.log('PASS native background multiple-track jump synchronizes without restarting');
await page.evaluate(()=>window.api.setIndex(1));await page.waitForFunction(()=>calls.filter(x=>x.items).length===2);assert.equal(await page.evaluate(()=>window.api.index),1);console.log('PASS manual next is not reverted by prior native snapshot');
await page.evaluate(()=>window.api.playback.retry());await page.waitForFunction(()=>calls.filter(x=>x.items).length===3);await page.evaluate(()=>window.emit({index:2,mediaId:'content://qa/album/2',title:'three'}));await page.waitForFunction(()=>window.api.index===2);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).length),3);console.log('PASS retry epoch does not restart subsequent native transitions');
await page.evaluate(()=>{window.api.playback.hold();window.api.setRecord({id:'second',tracks:['new']});window.api.setIndex(0)});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).length),3);await page.evaluate(()=>window.api.playback.toggle());await page.waitForFunction(()=>calls.filter(x=>x.items).length===4);assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).at(-1).items[0].uri),'content://qa/second/0');console.log('PASS held record resumes selected source');
await page.evaluate(()=>{window.nextAlbums=[{id:'third',tracks:['later','last']}];window.api.playback.syncQueue()});
await page.waitForFunction(()=>calls.filter(x=>x.items).at(-1).items.length===3);
assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).at(-1).items[1].recordId),'third');
const before=await page.evaluate(()=>calls.filter(x=>x.items).length);
await page.evaluate(()=>window.emit({index:0,recordId:'third',trackIndex:1,mediaId:'content://qa/third/1',title:'last'}));
await page.waitForFunction(()=>window.api.index===1);await page.waitForTimeout(200);
assert.equal(await page.evaluate(()=>calls.filter(x=>x.items).length),before);
console.log('PASS cross-album stable identity survives background queue compaction without restarting');
await page.evaluate(()=>window.api.playback.setModes({shuffle:true,repeat:'one'}));
assert.deepEqual(await page.evaluate(()=>calls.filter(x=>['shuffle','repeat'].includes(x.action)).slice(-2)),[{action:'shuffle',enabled:true},{action:'repeat',mode:'one'}]);
console.log('PASS shuffle and repeat settings reach the sole native player');
assert.deepEqual(errors,[]);
} finally {await browser?.close();server.kill()}
