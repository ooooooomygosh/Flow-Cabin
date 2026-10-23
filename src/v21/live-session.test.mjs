import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceSession} from '../sync/device-session.mjs';
import {readHandoff,writeHandoff,focusHeld,transferTimer} from '../sync/focus-handoff.mjs';
function memory(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function rig(storage=memory()) {
 let next,commands=[],now=100000,toggles=0,transfers=0,failCommit=false;const acks=[],sent=[];
 const focus={state:{notes:'',timer:{phase:'idle',paused:false,endsAt:0}},saveNotes(text){this.state.notes=text;return true;},prepareTransfer(){this.state.timer.paused=true;return{sessionId:'focus-1',version:2,phase:'focus',duration:60000,remaining:40000};},acceptTransfer(data){transfers++;this.state.timer={...data,phase:'focus',paused:false,endsAt:now+data.remaining,ownerVersion:data.version};},releaseTransfer(){this.state.timer={phase:'idle'};return true;}};
 const runtime={focus,deck:{deckItem:{id:'album'},provider:'local',audible:false,playback:{}},identity:{builtinId:'fox',accessory:''},lyricsTrack:{title:'',provider:'local'},notify(){},commands:{play:async()=>{toggles++;},next:async()=>{},previous:async()=>{} }};
 const request=async(path,data)=>{
  if(path==='/status')return{enabled:true,id:'self'};
  if(path==='/live/publish'){const batch=commands;commands=[];return{connections:['peer'],peers:[],commands:batch};}
  if(path==='/live/ack'){acks.push(data);return{ok:true};}
  if(path==='/live/send'){sent.push(data);if(failCommit&&data.action==='focus.commit')throw Error('ACK lost');return{result:data.action==='focus.offer'?'prepared':'committed'};}
  throw Error(path);
 };
 const service=createDeviceSession(()=>runtime,{storage,now:()=>now,request,setTimer:fn=>{next=fn;return 1;},clearTimer:()=>{next=null;}});
 const poll=async()=>{if(next){const fn=next;next=null;await fn();}else{service.start();for(let i=0;i<8;i++)await settle();}};
 return{service,storage,focus,acks,sent,get toggles(){return toggles;},get transfers(){return transfers;},setNow:v=>{now=v;},failCommit:()=>{failCommit=true;},push:(action,payload={},id=String(Math.random()),expiresAt=now+10000)=>commands.push({id,peerId:'peer',action,payload,expiresAt}),poll};
}
test('duplicate and expired controls never execute twice, including renderer restart',async()=>{
 const f=rig();f.push('music.toggle',{},'same');await f.poll();assert.equal(f.toggles,1);f.push('music.toggle',{},'same');f.push('music.toggle',{},'old',1);await f.poll();assert.equal(f.toggles,1);assert.equal(f.acks.at(-1).ok,false);f.service.stop();
 const restarted=rig(f.storage);restarted.push('music.toggle',{},'same');await restarted.poll();assert.equal(restarted.toggles,0);assert.equal(restarted.acks[0].ok,true);restarted.service.stop();
});
test('focus commit requires valid prepare, starts only once and survives duplicate commits',async()=>{
 const f=rig(),payload={sessionId:'session-1',version:1,phase:'focus',duration:60000,remaining:50000};
 f.push('focus.commit',payload);await f.poll();assert.equal(f.transfers,0);assert.equal(f.acks.at(-1).ok,false);
 f.push('focus.offer',payload);await f.poll();assert.equal(f.transfers,0);assert.equal(readHandoff(f.storage).role,'prepared');
 f.push('focus.commit',payload);await f.poll();assert.equal(f.transfers,1);assert.equal(readHandoff(f.storage).role,'owner');
 f.push('focus.commit',payload);await f.poll();assert.equal(f.transfers,1);f.service.stop();
});
test('expired prepare cannot start focus; lost commit ACK holds the source paused without resuming',async()=>{
 const f=rig(),payload={sessionId:'session-1',version:1,phase:'focus',duration:60000,remaining:50000};
 f.push('focus.offer',payload);await f.poll();f.setNow(140001);f.push('focus.commit',payload);await f.poll();assert.equal(f.transfers,0);f.service.stop();
 const source=rig();source.focus.state.timer={phase:'focus',sessionId:'focus-1',paused:false,endsAt:160000};source.failCommit();await assert.rejects(source.service.transferFocus('peer'),/保持暂停/);assert.equal(source.focus.state.timer.paused,true);assert.equal(focusHeld(source.focus.state.timer,source.storage),true);source.service.discardTransfer();assert.equal(source.focus.state.timer.phase,'idle');assert.equal(readHandoff(source.storage).role,'sent');
});
test('focus transfer keeps session/version and computes pause remainder without restarting elapsed work',()=>{
 const data=transferTimer({phase:'focus',sessionId:'id',ownerVersion:4,duration:1500000,paused:false,endsAt:110000},100000);assert.equal(data.remaining,10000);assert.equal(data.sessionId,'id');assert.equal(data.version,5);assert.throws(()=>transferTimer({phase:'focus',paused:false,endsAt:99999},100000));
});
test('restart recovers a committed owner write without restarting an already installed timer or awarding an expired transfer',async()=>{
 const f=rig();writeHandoff({role:'owner',sessionId:'committed',version:3,phase:'focus',duration:60000,remaining:50000,committedAt:90000,activated:false},f.storage);
 await f.poll();assert.equal(f.transfers,1);assert.equal(f.focus.state.timer.remaining,40000);assert.equal(readHandoff(f.storage).activated,true);await f.poll();assert.equal(f.transfers,1);f.service.stop();
 const g=rig();writeHandoff({role:'owner',sessionId:'expired',version:3,phase:'focus',duration:60000,remaining:50000,committedAt:1,activated:false},g.storage);await g.poll();assert.equal(g.transfers,0);assert.equal(readHandoff(g.storage).activated,true);g.service.stop();
});
