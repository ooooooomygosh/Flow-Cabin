import test from 'node:test';
import assert from 'node:assert/strict';
import { readCabinFullscreen, requestCabinFullscreen } from './fullscreen-client.mjs';
const native = () => { const commands=[];return {commands,document:{documentElement:{dataset:{desktopClient:'true',desktopFullscreen:'false'}},fullscreenElement:{}},open:(...args)=>commands.push(args)}; };
const web = () => {const document={documentElement:{dataset:{}},fullscreenElement:null};document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;};document.exitFullscreen=async()=>{document.fullscreenElement=null;};return {document,open:()=>assert.fail('web must not invoke native commands')};};
test('native fullscreen keeps shell-confirmed state and delegates toggle intent without maximizing',async()=>{
  const env=native();assert.equal(readCabinFullscreen(env),false);await requestCabinFullscreen({env});await requestCabinFullscreen({env});assert.equal(readCabinFullscreen(env),false);env.document.documentElement.dataset.desktopFullscreen='true';assert.equal(readCabinFullscreen(env),true);await requestCabinFullscreen({exit:true,env});assert.deepEqual(env.commands.map(x=>x[0]),['album-desktop://action/fullscreen','album-desktop://action/fullscreen','album-desktop://action/fullscreen-exit']);
});
test('browser fullscreen follows actual enter/exit and keeps external Escape state',async()=>{
  const env=web();for(let i=0;i<5;i++){await requestCabinFullscreen({env});assert.equal(readCabinFullscreen(env),true);await requestCabinFullscreen({env});assert.equal(readCabinFullscreen(env),false);}await requestCabinFullscreen({env});env.document.fullscreenElement=null;assert.equal(readCabinFullscreen(env),false);await requestCabinFullscreen({exit:true,env});assert.equal(readCabinFullscreen(env),false);
});
test('browser exit during pending enter retains last intent and avoids duplicate requests',async()=>{
  const env=web();let release,enters=0;env.document.documentElement.requestFullscreen=()=>{enters++;return new Promise(resolve=>{release=()=>{env.document.fullscreenElement=env.document.documentElement;resolve();};});};const enter=requestCabinFullscreen({env});const exit=requestCabinFullscreen({exit:true,env});assert.equal(enters,1);assert.equal(readCabinFullscreen(env),false);release();await Promise.all([enter,exit]);assert.equal(readCabinFullscreen(env),false);
});
test('rejected/unsupported browser fullscreen is reported and can retry without optimistic state',async()=>{
  const env=web();env.document.documentElement.requestFullscreen=async()=>{throw new Error('Denied');};await assert.rejects(requestCabinFullscreen({env}),/Denied/);assert.equal(readCabinFullscreen(env),false);delete env.document.documentElement.requestFullscreen;await assert.rejects(requestCabinFullscreen({env}),/unavailable/);env.document.documentElement.requestFullscreen=async()=>{env.document.fullscreenElement=env.document.documentElement;};await requestCabinFullscreen({env});assert.equal(readCabinFullscreen(env),true);
});
