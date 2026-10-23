import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSoundscapeController } from './native-soundscape.mjs';
test('native soundscape serializes mix/volume/pause without a Web Audio player',async()=>{
 const calls=[], changes=[];let poll;
 const native={ambience:async value=>calls.push(value),ambienceState:async()=>({enabled:false})};
 const controller=createNativeSoundscapeController({native,onChange:value=>changes.push(value),schedule:fn=>{poll=fn;return 1},cancel:()=>{}});
 controller.activate();await Promise.resolve();
 controller.setTrack('fire',.65);await controller.setMaster(.4);await controller.turnOn();
 assert.equal(calls.at(-1).mix.tracks.fire,.65);assert.equal(calls.at(-1).mix.master,.4);assert.equal(calls.at(-1).enabled,true);
 controller.setDucked(true);await controller.turnOff();assert.equal(calls.at(-1).enabled,false);assert.equal(calls.at(-1).ducked,true);
 assert.equal(controller.lofiBeatAt(),0);
 await controller.turnOn();controller.dispose();await Promise.resolve();assert.equal(calls.at(-1).enabled,true,'WebView unmount leaves native background audio alive');
});
test('native audio failure reports disabled state',async()=>{
 let status={enabled:true};const controller=createNativeSoundscapeController({native:{ambience:async()=>{throw Error('device')},ambienceState:async()=>status},schedule:()=>1,cancel:()=>{}});
 controller.activate();await Promise.resolve();assert.equal(controller.getState().enabled,true);
 await controller.turnOn();assert.equal(controller.getState().enabled,false);assert.match(controller.getState().error,/环境音/);controller.dispose();
});

test('native polling restores running audio and observes a notification stop',async()=>{
 let poll,enabled=true;const seen=[];
 const controller=createNativeSoundscapeController({native:{ambience:async()=>{},ambienceState:async()=>({enabled})},onChange:value=>seen.push(value.enabled),schedule:fn=>{poll=fn;return 1},cancel:()=>{}});
 controller.activate();await Promise.resolve();assert.equal(controller.getState().enabled,true);
 enabled=false;await poll();assert.equal(controller.getState().enabled,false);assert.deepEqual(seen,[true,false]);controller.dispose();
});
