import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ART_THEMES, PET_ART_IDS, roomArtSpec, petArtSpec, checkedFrame } from './room-art.mjs';
const publicRoot = new URL('../../public/', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, publicRoot), 'utf8'));
function pngSize(path) { const b = fs.readFileSync(new URL(path.replace(/^\//, ''), publicRoot)); assert.equal(b.toString('ascii', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
test('each available theme resolves its own complete furniture atlas, with real in-bounds PNG frames', () => {
  const shells = new Set(), atlases = new Set();
  for (const theme of ART_THEMES) {
    const m = read(`room-scenes/modular/${theme}/asset-manifest.json`), spec = roomArtSpec(theme, m);
    shells.add(spec.shell); atlases.add(spec.furniture);
    const size = pngSize(spec.furniture);
    assert.deepEqual(size, m.assets.furniture.size || [m.assets.furniture.width, m.assets.furniture.height]);
    assert.ok(pngSize(spec.shell).every(n => n > 640));
    for (const f of Object.values(spec.frames)) checkedFrame(f, ...size);
    assert.equal(Object.keys(spec.frames).length, 14);
  }
  assert.equal(shells.size, ART_THEMES.length); assert.equal(atlases.size, ART_THEMES.length);
});
test('all five pets have their own idle, listening, music and focus poses', () => {
  for (const id of PET_ART_IDS) {
    const m = read(`pet-art/v2/${id}/manifest.json`), spec = petArtSpec(id, m);
    assert.deepEqual(pngSize(spec.atlas), [m.width, m.height]);
    for (const frame of Object.values(spec.frames)) checkedFrame(frame, m.width, m.height);
  }
});
test('invalid and cross-theme manifests cannot load arbitrary or mismatched assets', () => {
  const m = read('room-scenes/modular/warm/asset-manifest.json');
  assert.throws(() => roomArtSpec('forest', m), /不匹配/);
  assert.throws(() => roomArtSpec('warm', { ...m, assets: { ...m.assets, shell: { file: '../shell.png' } } }), /路径/);
  assert.throws(() => checkedFrame([0, 0, 1255, 1254], 1254, 1254), /边界/);
  assert.throws(() => checkedFrame([NaN, 0, 20, 20], 1254, 1254), /无效/);
});

test('all themes expose exactly eight real optional physical object frames, never weather sky tokens', () => {
  for (const theme of ART_THEMES) {
    const spec = roomArtSpec(theme, read(`room-scenes/modular/${theme}/asset-manifest.json`));
    assert.equal(Object.keys(spec.extras.frames).length, 8);
    assert.deepEqual(pngSize(spec.extras.url), spec.extras.size);
    for (const frame of Object.values(spec.extras.frames)) checkedFrame(frame, ...spec.extras.size);
    assert.equal(spec.extras.frames.sun, undefined);
  }
});
test('painted pets listen briefly, stay awake, and groove only to a detected phase anchor', async () => {
  const { roomPetPose } = await import('./room-art.mjs');
  assert.equal(roomPetPose({ playing: true, now: 1000 }), 'listen');
  assert.equal(roomPetPose({ playing: true, now: 2000 }), 'idle');
  assert.equal(roomPetPose({ playing: true, now: 13000 }), 'listen');
  assert.equal(roomPetPose({ playing: true, now: 2000, beat: { bpm: 100, known: true, detected: false, beatAt: 0 } }), 'idle');
  assert.equal(roomPetPose({ playing: true, beat: { bpm: 100, detected: true, beatAt: 1000 } }), 'groove');
  assert.equal(roomPetPose({ playing: true, reduced: true, beat: { bpm: 100, detected: true, beatAt: 1000 } }), 'idle');
});
