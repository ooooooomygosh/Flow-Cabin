'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
function cleanLocation(value,now=Date.now()){
 const status=['available','denied','timeout','disabled','unavailable'].includes(value?.status)?value.status:'unavailable';
 if(status!=='available')return {status};
 const lat=Number(value.lat),lng=Number(value.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return {status:'unavailable'};
 let zone;try{if(value.zone && new Intl.DateTimeFormat('en',{timeZone:value.zone})){zone=value.zone;}}catch{}
 return {status,lat:Math.round(lat*100)/100,lng:Math.round(lng*100)/100,name:typeof value.name==='string'?value.name.slice(0,80):'附近',...(zone?{zone}:{}),at:now};
}
function createLocation({platform=process.platform,packaged=false,resourcesPath=process.resourcesPath,load=require,run=execFile}={}){
 let inflight=null;
 return {request(){if(inflight)return inflight;inflight=new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(cleanLocation(value));};const timer=setTimeout(()=>finish({status:'timeout'}),23000);timer.unref?.();
 try{if(platform==='darwin')load(path.join(__dirname,'native','mac-location.node')).request(text=>{try{finish(JSON.parse(text));}catch{finish({status:'unavailable'});}});
 else if(platform==='win32')run(path.join(packaged?path.join(resourcesPath,'native'):path.join(__dirname,'native','bin'),'ApproximateLocation.exe'),[],{timeout:21000,maxBuffer:4096,windowsHide:true},(error,output)=>{if(error)return finish({status:error.killed?'timeout':'unavailable'});try{finish(JSON.parse(output));}catch{finish({status:'unavailable'});}});
 else finish({status:'unavailable'});}catch{finish({status:'unavailable'});}}).finally(()=>{inflight=null;});return inflight;}};
}
module.exports={createLocation,cleanLocation};
