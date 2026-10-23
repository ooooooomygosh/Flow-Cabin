import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, defaultLayout, validateLayout, placeFurniture, createHistory, readLayout, LAYOUT_PREFIX, LEGACY_LAYOUT_PREFIX, petPath } from '../home/spatial-layout.mjs';
import { defaultLayout as legacyLayout } from '../room2/layout.mjs';
import { restoreRoomData, readRoomData } from '../backup/room-data.mjs';
import { saveRecovery, readRecovery, RECOVERY_KEY } from '../backup/recovery.mjs';
import { buildBackup, parseBackup } from '../backup-model.mjs';
import { prepareDataUpgrade, DATA_VERSION_KEY } from '../backup/upgrade.mjs';
import { createLivingPet } from '../pet/living-pet.mjs';
import { createSleepController } from '../home/sleep-controller.mjs';
import { normalizeLocation, readLocation, shouldRefreshLocation, LOCATION_KEY } from '../location/location-state.mjs';
import { waterPlant, plantStage } from '../home/life-state.mjs';
export function memory(seed={}) { const map=new Map(Object.entries(seed));return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}; }
test('24 room presets validate; undo and redo preserve mounted objects and reject furniture collisions',()=>{
 for(const {id}of THEMES)for(const preset of ['work','listen','rest'])assert.deepEqual(validateLayout(defaultLayout(id,preset)),defaultLayout(id,preset));
 const initial=defaultLayout(),changed=placeFurniture(initial,'desk',{u:190,v:500}),history=createHistory(initial);
 assert.equal(changed.items.find(i=>i.id==='notes').u,210);history.apply(changed);assert.deepEqual(history.undo(),initial);assert.deepEqual(history.redo(),changed);
 assert.throws(()=>placeFurniture(initial,'desk',{u:710,v:280}),/家具/);
 assert.throws(()=>placeFurniture(initial,'notes',{u:700,v:600}),/桌面/);
 const route=petPath(initial,{u:400,v:500},{u:550,v:700});assert.ok(route.length>1);for(let i=1;i<route.length;i++)assert.equal(Math.abs(route[i].u-route[i-1].u)+Math.abs(route[i].v-route[i-1].v),40);
});
test('legacy migration preserves every furniture ID and exact original, including quota failure',()=>{
 for(const {id}of THEMES){const old=JSON.stringify(legacyLayout(id)),storage=memory({[LEGACY_LAYOUT_PREFIX+id]:old}),next=readLayout(storage,id);assert.equal(storage.getItem(LAYOUT_PREFIX+'original:'+id),old);for(const item of JSON.parse(old).items)assert.ok(next.items.some(i=>i.id===item.id));assert.equal(readLayout(storage,id).version,2);}
 const old=JSON.stringify(legacyLayout()),storage=memory({[LEGACY_LAYOUT_PREFIX+'pixel']:old});storage.setItem=()=>{throw Error('quota');};assert.throws(()=>readLayout(storage,'pixel'),/quota/);assert.equal(storage.getItem(LEGACY_LAYOUT_PREFIX+'pixel'),old);assert.equal(storage.getItem(LAYOUT_PREFIX+'pixel'),null);
});
test('Backup v5 room data round trip and transactional rollback retain original configuration',async()=>{
 const source=memory();restoreRoomData({version:1,layouts:{pixel:defaultLayout()},life:{resting:true},petPack:null},{storage:source});
 const backup=buildBackup({storage:source}),parsed=parseBackup(JSON.stringify(backup)),target=memory();restoreRoomData(parsed.cabin,{storage:target});assert.deepEqual(readRoomData(target),readRoomData(source));
 const before=target.getItem(LAYOUT_PREFIX+'pixel'),write=target.setItem;target.setItem=(key,value)=>{if(key==='flow-cabin-life-v1')throw Error('quota');write(key,value);};assert.throws(()=>restoreRoomData({version:1,layouts:{pixel:defaultLayout('pixel','rest')},life:{resting:false}},{storage:target}),/已还原/);assert.equal(target.getItem(LAYOUT_PREFIX+'pixel'),before);
 const recovery=await saveRecovery(backup,{storage:source,now:1000});assert.deepEqual(parseBackup(await readRecovery(recovery.id,source)).cabin,parsed.cabin);
 const entries=JSON.parse(source.getItem(RECOVERY_KEY));entries[0].text+=' ';source.setItem(RECOVERY_KEY,JSON.stringify(entries));await assert.rejects(readRecovery(recovery.id,source),/校验失败/);
});
test('upgrade checkpoint precedes the version marker and does not run twice',async()=>{
 const storage=memory({[LEGACY_LAYOUT_PREFIX+'pixel']:JSON.stringify(legacyLayout())});await prepareDataUpgrade([],storage);assert.equal(storage.getItem(DATA_VERSION_KEY),'2.1');assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).length,1);await prepareDataUpgrade([],storage);assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).length,1);
 const full=memory({[LEGACY_LAYOUT_PREFIX+'pixel']:JSON.stringify(legacyLayout())});full.setItem=()=>{throw Error('quota');};await assert.rejects(prepareDataUpgrade([],full));assert.equal(full.getItem(DATA_VERSION_KEY),null);
});
test('pet lifecycle has real transition poses and keeps focus work while music reacts',()=>{
 const pet=createLivingPet();assert.equal(pet.resolve({now:1,resting:true}).pose,'sleep');assert.equal(pet.resolve({now:10}).pose,'wake');assert.equal(pet.resolve({now:2000,dragging:true}).pose,'dragged');assert.equal(pet.resolve({now:2100,dragging:false}).pose,'land');pet.resolve({now:4000,walking:true,facing:'left'});assert.equal(pet.resolve({now:4010,walking:true,facing:'right'}).pose,'turn');
 const work=pet.resolve({now:100000,focus:true,playing:true,synced:true});assert.ok(['read','write','think'].includes(work.pose));assert.equal(work.music,true);
 pet.request('eat',200000,100);assert.equal(pet.resolve({now:200001}).pose,'eat');assert.equal(pet.resolve({now:200101}).pose,'satisfied');assert.equal(pet.resolve({now:200102,reduced:true,focus:true}).pose,'read');
});
test('system location is coarse; stale permission requests expire; denied fixes remain available without auto retry',()=>{
 const state=normalizeLocation({status:'available',automatic:true,attemptedAt:1,fix:{lat:31.234567,lng:121.477777,at:1,zone:'Asia/Shanghai'}});assert.equal(state.fix.lat,31.23);assert.equal(state.fix.lng,121.48);assert.equal(state.fix.name,'附近');assert.equal(shouldRefreshLocation(state,7*3600000),true);assert.equal(shouldRefreshLocation({...state,status:'denied'},7*3600000),false);
 assert.equal(readLocation(memory({[LOCATION_KEY]:JSON.stringify({...state,status:'requesting'})}),40000).status,'timeout');
 const storage=memory();for(let d=1;d<=10;d++){waterPlant(storage,new Date(2026,0,d));waterPlant(storage,new Date(2026,0,d));}assert.equal(plantStage(JSON.parse(storage.getItem('flow-cabin-life-v1'))),2);
});
test('sleep fade uses absolute deadline; cancelling restores volume/light and failed pause is not completion',async()=>{
 let now=0,next,volume=.8,master=.5,light=false,rest=false,audible=true;
 const runtime={look:'pixel',dim:false,deck:{provider:'local',record:{id:'a'},get audible(){return audible;},playback:{volume:.8,setVolume:v=>{volume=v;}}},sound:{mix:{master:.5},setMaster:v=>{master=v;},turnOff(){}},commands:{play:async()=>{audible=false;}}};
 const controller=createSleepController({getRuntime:()=>runtime,setLight:(_t,v)=>{light=v;},setResting:v=>{rest=v;},now:()=>now,setTimer:fn=>{next=fn;return 1;},clearTimer:()=>{next=null;}});
 controller.start(1);now=45000;await next();assert.equal(volume,.4);assert.equal(master,.25);assert.equal(light,true);controller.cancel();assert.equal(volume,.8);assert.equal(master,.5);assert.equal(light,false);assert.equal(rest,false);
 controller.start(1);now=106000;await next();assert.equal(audible,false);assert.equal(rest,true);assert.equal(controller.getSnapshot().completed,true);
 audible=true;runtime.commands.play=async()=>{throw Error('播放器断线');};controller.start(1);now=170000;await next();assert.equal(controller.getSnapshot().completed,undefined);assert.match(controller.getSnapshot().error,/断线/);
});
