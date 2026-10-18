const { test } = require('node:test');
const assert = require('node:assert/strict');

test('cover sampling resizes and releases temporary bitmaps without touching wall export cache', async (t) => {
  // The module-level wall cache keeps a 90 s idle timer plus a 60 s delayed
  // bitmap close. Capture those timers so the test can advance them instead
  // of keeping this test process alive for 150 seconds.
  const timers = [], nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const timer = { fn, ms, cancelled: false }; timers.push(timer); return timer; };
  globalThis.clearTimeout = (timer) => { if (timer) timer.cancelled = true; };
  let loadWallCover, readCoverPixels;
  try {
    ({ loadWallCover, readCoverPixels } = await import('../../src/album-wall-canvas.mjs'));
  } finally {
    globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
  }
  const { dominantColour } = await import('../../src/cover-colour.mjs');
  const originals = new Map(['window', 'document', 'fetch', 'createImageBitmap'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const bitmaps = [], requests = [], pixels = Uint8ClampedArray.from([210, 60, 30, 255]);
  let failRead = false, invalidImage = false;
  globalThis.window = { location: { href: 'https://album-circle.vercel.app/' } };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, blob: async () => ({ type: invalidImage ? 'text/html' : 'image/png', size: 1024 }) };
  };
  globalThis.createImageBitmap = async (blob, options) => {
    const image = { options, closed: false, close() { this.closed = true; } };
    bitmaps.push(image); return image;
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({
    drawImage(image, x, y, width, height) { assert.equal(image.closed, false); assert.equal(width, 48); assert.equal(height, 48); },
    getImageData() { if (failRead) throw new Error('Canvas readback failed'); return { data: pixels }; }
  }) }) };
  const cover = 'https://y.qq.com/test-cover.png';
  const wall = await loadWallCover(cover);
  assert.equal(wall.options, undefined); assert.equal(wall.closed, false);
  assert.equal(dominantColour(await readCoverPixels(cover)), '#d23c1e');
  assert.deepEqual(bitmaps[1].options, { resizeWidth: 48, resizeHeight: 48, resizeQuality: 'low' });
  assert.equal(bitmaps[1].closed, true); assert.equal(wall.closed, false);
  assert.equal(await loadWallCover(cover), wall); assert.equal(bitmaps.length, 2);
  assert.equal(requests[1].url, '/desktop-image?url=' + encodeURIComponent(cover));
  assert.equal(requests[1].options.credentials, 'omit');
  failRead = true;
  assert.equal(await readCoverPixels(cover), null); assert.equal(bitmaps[2].closed, true);
  assert.equal(wall.closed, false);
  invalidImage = true;
  assert.equal(await readCoverPixels(cover), null); assert.equal(bitmaps.length, 3);
  assert.equal(await readCoverPixels(''), null);
  for (;;) {
    const index = timers.findIndex((timer) => !timer.cancelled);
    if (index < 0) break;
    const [timer] = timers.splice(index, 1);
    timer.fn(); await Promise.resolve();
  }
  assert.equal(wall.closed, true);
});
