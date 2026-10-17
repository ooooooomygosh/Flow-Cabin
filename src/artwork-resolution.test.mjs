import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkResolution } from './artwork-resolution.mjs';
test('pixel covers use finer bounded sampling at responsive sizes and display density', () => {
  assert.equal(artworkResolution(150,1),96);
  assert.equal(artworkResolution(350,1),175);
  assert.equal(artworkResolution(140,2),140,'Retina shelf sleeve: an even 2x upscale (was 144 → 1.94x)');
  for(const [side,dpr] of [[200,1],[260,1],[150,2],[230,2]]) assert.equal(side*dpr/artworkResolution(side,dpr),2,'two physical px per grain inside the bounds');
  assert.equal(artworkResolution(350,2),256);
  assert.equal(artworkResolution(80,2),96);
  assert.equal(artworkResolution(2000,8),256);
  assert.equal(artworkResolution(350,2,64),64,'never invent detail in a small source');
  for(const side of [0,NaN,Infinity,-1]) assert.equal(artworkResolution(side),96);
});
