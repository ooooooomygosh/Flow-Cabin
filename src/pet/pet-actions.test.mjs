import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_ACTIONS, createPetScheduler } from './pet-actions.mjs';
import { cachedPetFrame } from './pet-sprites.mjs';
import { PETS } from './pet-catalog.mjs';
test('all five companions have 24 readable semantic silhouettes',()=>{
  assert.equal(PET_ACTIONS.length,24);
  for(const pet of PETS) {
    const frames=PET_ACTIONS.map(action=>JSON.stringify(cachedPetFrame(pet.id,action,0,'')));
    assert.equal(new Set(frames).size,24,pet.id);
    for(const action of PET_ACTIONS) { const pixels=cachedPetFrame(pet.id,action,1,'headphones');assert.equal(pixels.length,32);assert(pixels.every(row=>row.length===32 && row.every(value=>Number.isInteger(value)&&value>=0&&value<20))); }
  }
});
test('scheduler expires details, respects quiet, cools down requests and preserves focus music',()=>{
  const s=createPetScheduler();
  assert.equal(s.resolve({now:0}).pose,'blink');assert.equal(s.resolve({now:500,base:'focus'}).pose,'focus');assert.equal(s.resolve({now:1200}).pose,'idle');
  assert(s.request('wave',2000));assert.equal(s.request('wave',3000),false);
  assert.equal(s.resolve({now:3500}).pose,'idle');
  assert.equal(s.resolve({now:30000,base:'focus',playing:true,synced:true}).music,'beat');
  assert.equal(s.resolve({now:30000,base:'focus',playing:true,synced:true}).pose,'focus');
  assert.equal(s.resolve({now:40000,quiet:true}).pose,'idle');assert.equal(s.request('wave',50000,{quiet:true}),false);
  assert.equal(s.resolve({now:60000,reduced:true}).pose,'idle');
});
