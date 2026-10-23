import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_PHOTO_KEY, FRAME_PHOTO_SIZE, clearFramePhoto, coverCrop, normalizeFramePhoto, readFramePhoto, writeFramePhoto } from './frame-photo.mjs';

const memory = () => { const data = {}; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data }; };
const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('only small inline images are accepted; paths and remote URLs are not', () => {
  assert.deepEqual(normalizeFramePhoto({ src: tiny, name: 'cat.jpg', at: 5 }), { src: tiny, name: 'cat.jpg', at: 5 });
  for (const src of ['https://example.com/a.jpg', 'file:///Users/me/a.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', `data:image/png;base64,${'A'.repeat(200_001)}`, 'javascript:alert(1)']) assert.equal(normalizeFramePhoto({ src }), null, src);
  assert.equal(normalizeFramePhoto(null), null);
});

test('the frame photo round-trips through storage and can be taken down', () => {
  const storage = memory();
  assert.equal(readFramePhoto(storage), null);
  writeFramePhoto({ src: tiny, name: 'x'.repeat(200) }, storage);
  assert.equal(readFramePhoto(storage).src, tiny);
  assert.equal(readFramePhoto(storage).name.length, 80);
  assert.throws(() => writeFramePhoto({ src: 'https://example.com/a.png' }, storage), /格式不支持/);
  clearFramePhoto(storage);
  assert.equal(storage.getItem(FRAME_PHOTO_KEY), null);
  storage.setItem(FRAME_PHOTO_KEY, '{broken');
  assert.equal(readFramePhoto(storage), null, 'a damaged value shows an empty frame');
});

test('photos are centre-cropped to the frame without stretching', () => {
  const ratio = FRAME_PHOTO_SIZE.width / FRAME_PHOTO_SIZE.height;
  const wide = coverCrop(4000, 2000);
  assert.ok(Math.abs(wide.sw / wide.sh - ratio) < 1e-9);
  assert.equal(wide.sy, 0); assert.ok(wide.sx > 0);
  const tall = coverCrop(1000, 4000);
  assert.ok(Math.abs(tall.sw / tall.sh - ratio) < 1e-9);
  assert.equal(tall.sx, 0); assert.ok(tall.sy > 0);
  assert.throws(() => coverCrop(0, 10));
});
