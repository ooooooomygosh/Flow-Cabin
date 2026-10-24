import test from 'node:test';
import assert from 'node:assert/strict';
import { positionState, sessionMetadata, artworkList, needsConversion, coverDataUrl } from './media-session.mjs';
import { deckCapabilities } from './providers.mjs';
import { sliderToGain, gainToSlider, volumePercent, wheelVolume } from './volume-curve.mjs';

test('position state: valid arguments for MediaSession.setPositionState or null', () => {
  assert.deepEqual(positionState({ duration: 200, position: 42.5, rate: 1 }), { duration: 200, position: 42.5, playbackRate: 1 });
  assert.deepEqual(positionState({ duration: 200, position: 260 }), { duration: 200, position: 200, playbackRate: 1 }, 'position never passes the end');
  assert.deepEqual(positionState({ duration: 200, position: -3, rate: 1.33 }), { duration: 200, position: 0, playbackRate: 1.33 });
  assert.deepEqual(positionState({ duration: 90, position: NaN, rate: 0 }), { duration: 90, position: 0, playbackRate: 1 }, 'a zero rate would throw');
  for (const duration of [0, -1, NaN, Infinity, undefined]) assert.equal(positionState({ duration, position: 1 }), null);
});

test('metadata: a playlist song carries its own artist and album', () => {
  const playlist = { id: 'p', type: 'playlist', title: '我的歌单', artist: '歌单作者', tracks: ['晴天', '夜曲'], trackDetails: [{ title: '晴天', artist: '周杰伦', album: '叶惠美' }, { title: '夜曲', artist: '周杰伦' }] };
  assert.deepEqual(sessionMetadata(playlist, 0), { title: '晴天', artist: '周杰伦', album: '叶惠美' });
  assert.deepEqual(sessionMetadata(playlist, 1), { title: '夜曲', artist: '周杰伦', album: '我的歌单' }, 'no album: the playlist name, never the playlist owner as artist');
  const album = { id: 'a', type: 'album', title: 'Blue', artist: 'Joni Mitchell', tracks: ['All I Want', 'My Old Man'] };
  assert.deepEqual(sessionMetadata(album, 1), { title: 'My Old Man', artist: 'Joni Mitchell', album: 'Blue' });
  assert.equal(sessionMetadata(album, 0, 'All I Want (Remastered)').title, 'All I Want (Remastered)', 'the matched recording title wins');
  assert.equal(sessionMetadata(null), null);
});

test('artwork: only covers the OS can load, local ones are converted first', () => {
  assert.deepEqual(artworkList('https://example.com/c.jpg'), [{ src: 'https://example.com/c.jpg', sizes: '512x512' }]);
  assert.deepEqual(artworkList('data:image/jpeg;base64,AAAA'), [{ src: 'data:image/jpeg;base64,AAAA', sizes: '512x512', type: 'image/jpeg' }]);
  for (const cover of ['', null, 'http://insecure/c.jpg', '/desktop-music/local/cover/1', 'blob:abc']) assert.deepEqual(artworkList(cover), []);
  assert.equal(needsConversion('/desktop-music/local/cover/1'), true);
  assert.equal(needsConversion('https://example.com/c.jpg'), false);
  assert.equal(needsConversion('data:image/png;base64,AA'), false);
  assert.equal(needsConversion(''), false);
});

test('artwork: conversion draws the cover into a JPEG data URL, failures give no artwork', async () => {
  const drawn = [];
  class FakeImage { set src(value) { this.naturalWidth = 600; this.naturalHeight = 400; queueMicrotask(() => value.includes('broken') ? this.onerror() : this.onload()); } }
  const doc = { defaultView: { Image: FakeImage }, createElement: () => ({ getContext: () => ({ drawImage: (...args) => drawn.push(args) }), toDataURL: (type) => `data:${type};base64,AAA` }) };
  assert.equal(await coverDataUrl('/local/cover.png', { doc }), 'data:image/jpeg;base64,AAA');
  assert.deepEqual(drawn[0].slice(1), [100, 0, 400, 400, 0, 0, 256, 256], 'centre square, scaled to 256');
  assert.equal(await coverDataUrl('/local/broken.png', { doc }), '');
  assert.equal(await coverDataUrl('https://example.com/c.jpg', { doc }), 'https://example.com/c.jpg');
});

test('capabilities: Apple Music and Music Assistant cannot be scrubbed or have their volume set', () => {
  assert.deepEqual({ ...deckCapabilities('local') }, { progress: true, seek: true, volume: true, readOnlyProgress: false });
  assert.deepEqual({ ...deckCapabilities('appleMusic') }, { progress: true, seek: false, volume: false, readOnlyProgress: true });
  assert.deepEqual({ ...deckCapabilities('ma') }, { progress: true, seek: false, volume: false, readOnlyProgress: true });
  assert.deepEqual({ ...deckCapabilities('auto', { remote: true }) }, { progress: true, seek: false, volume: false, readOnlyProgress: true }, 'auto matching that handed off to a remote player');
  assert.deepEqual({ ...deckCapabilities('system') }, { progress: true, seek: false, volume: false, readOnlyProgress: true });
  assert.deepEqual({ ...deckCapabilities('visual') }, { progress: false, seek: false, volume: false, readOnlyProgress: false });
});

test('volume: perceptual curve, percent readout and wheel steps', () => {
  assert.equal(sliderToGain(0), 0); assert.equal(sliderToGain(1), 1); assert.equal(sliderToGain(.5), .125);
  assert.ok(Math.abs(gainToSlider(sliderToGain(.37)) - .37) < 1e-9);
  assert.equal(sliderToGain(2), 1); assert.equal(sliderToGain(-1), 0); assert.equal(sliderToGain('x'), 0);
  assert.equal(volumePercent(.654), 65);
  assert.equal(wheelVolume(.5, -120), .55, 'wheel up is louder'); assert.equal(wheelVolume(.5, 3), .45); assert.equal(wheelVolume(.98, -1), 1); assert.equal(wheelVolume(.02, 1), 0); assert.equal(wheelVolume(.5, 0), .5);
});
