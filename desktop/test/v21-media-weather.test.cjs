'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validHost,createWeatherProfile,qweatherReport}=require('../qweather.cjs');
const {createWeather}=require('../weather.cjs');
const {validatePack,createPetPackStore}=require('../pet-pack.cjs');
const {webmInfo}=require('../webm-pet.cjs');
const qreport={condition:{code:'302'},temperature:{value:22,unit:'°C'},feelsLike:{value:24,unit:'°C'},humidity:.65,wind:{speed:{value:10,unit:'m/s'}},precipitation:{amount:{value:2,unit:'mm'},intensity:{value:3}}};
test('QWeather v1 parses units; credentials bind to assigned TLS hosts and never return to renderer',async()=>{
 for(const invalid of ['127.0.0.1','qweatherapi.com','a.qweatherapi.com.evil.test','https://a.qweatherapi.com','a.qweatherapi.com/path','a.qweatherapi.com:443'])assert.equal(validHost(invalid),null);
 assert.equal(validHost('abc.xy.qweatherapi.com'),'abc.xy.qweatherapi.com');assert.equal(qweatherReport(qreport).humidity,65);assert.equal(qweatherReport(qreport).wind,.72);assert.equal(qweatherReport({}),null);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'weather-v21-'));const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(v=>v^71),decryptString:b=>Buffer.from(b.map(v=>v^71)).toString()};
 try{const profile=createWeatherProfile({directory:dir,safeStorage:encryption});profile.set({provider:'qweather',host:'test.xy.qweatherapi.com',key:'fixture-key-123'});assert.ok(!(await fs.readFile(path.join(dir,'qweather-key.bin'))).includes(Buffer.from('fixture-key-123')));assert.equal(JSON.stringify(profile.state()).includes('fixture-key'),false);const restored=createWeatherProfile({directory:dir,safeStorage:encryption});assert.equal(restored.read().key,'fixture-key-123');assert.throws(()=>restored.set({provider:'qweather',host:'different.xy.qweatherapi.com',key:''}));restored.set({provider:'open-meteo'});assert.equal(restored.state().stored,false);await assert.rejects(fs.stat(path.join(dir,'qweather-key.bin')));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('provider switches invalidate weather cache and forward keys only in native headers',async()=>{
 const calls=[],weather=createWeather({publish(){},setTimer:()=>1,clearTimer(){},fetch:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.includes('qweather')?qreport:{current:{weather_code:0}}};}});
 await weather.set({enabled:true,lat:31.2345,lng:121.4767});assert.equal(weather.state().source,'open-meteo');await weather.configure({provider:'qweather',host:'fixture.xy.qweatherapi.com',key:'test-key-12345'});assert.equal(weather.state().source,'qweather');assert.equal(calls.length,2);assert.equal(calls[1].url,'https://fixture.xy.qweatherapi.com/weather/v1/current/31.23/121.48?lang=zh');assert.equal(calls[1].options.headers['X-QW-Api-Key'],'test-key-12345');await weather.set({enabled:true,lat:31.23,lng:121.48});assert.equal(calls.length,2);weather.dispose();
});
test('transparent WebM validates codec/alpha and restores media without overwriting another pet',async()=>{
 const video=await fs.readFile(path.join(__dirname,'fixtures/v21/transparent.webm'));assert.equal(webmInfo(video).width,64);
 const opaque=Buffer.from(video),at=opaque.indexOf(Buffer.from([0x53,0xc0,0x81,0x01]));assert.ok(at>0);opaque[at+3]=0;assert.throws(()=>webmInfo(opaque),/透明/);assert.throws(()=>webmInfo(video.subarray(0,80)));
 const atlas=await fs.readFile(path.join(__dirname,'../assets/pets-v21/cat/avatar-256.png'));
 const input={version:2,id:'video-fixture',name:'fixture',author:'Flow Cabin tests',license:'CC0',media:{type:'webm',data:atlas.toString('base64'),width:256,height:256,frameWidth:256,frameHeight:256,clips:{idle:{data:video.toString('base64')}}},animations:{idle:{frames:[0],fps:1}}};
 assert.equal(validatePack(input).manifest.media.clips.idle.file,'idle.webm');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pet-v21-'));
 try{const store=createPetPackStore({directory:dir});await store.import(input);const exported=await store.export(input.id);assert.deepEqual(await store.media(input.id,'idle.webm'),video);assert.equal((await store.restore(exported)).id,input.id);const changed=await store.restore({...exported,name:'changed'});assert.notEqual(changed.id,input.id);assert.equal((await store.export(input.id)).name,'fixture');assert.equal((await store.list()).length,2);const {normalizePetAssets}=await import('../../src/backup/pet-assets.mjs');const round=normalizePetAssets(exported);assert.deepEqual(validatePack(round).bytes,atlas);assert.throws(()=>normalizePetAssets({...exported,media:{...exported.media,data:'https://remote'}}));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
