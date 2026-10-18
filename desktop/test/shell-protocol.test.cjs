'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture() {
  let route, missing = false;
  const protocol = { handle(scheme, handler) { assert.equal(scheme, 'album-desktop'); route = handler; } };
  const fakeFS = {
    readdirSync(directory) { return directory.endsWith('web') ? ['wallpaper.html', 'pet.html'].map((name) => ({ name, isSymbolicLink: () => false, isDirectory: () => false })) : []; },
    existsSync() { return true; }, // Simulate a read failure after lookup/stat (e.g. removed or inaccessible asset).
    readFileSync() { if (missing) throw new Error('ENOENT'); return Buffer.from('<html>wallpaper</html>'); }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shell-protocol.cjs'), 'utf8'), { module, __dirname: '/packaged/desktop', Buffer, Response, URL, require: (name) => name === 'electron' ? { protocol } : name === 'node:fs' ? fakeFS : require(name) });
  module.exports.registerShellProtocol(protocol);
  return { fetch: (url, method = 'GET') => route({ url, method }), breakAsset: () => { missing = true; } };
}
test('isolated companion route serves its own entry and rejects other pages, methods and credentials', async () => {
  const f = fixture();
  assert.equal(await f.fetch('album-desktop://wallpaper/wallpaper.html').text(), '<html>wallpaper</html>');
  assert.equal(await f.fetch('album-desktop://wallpaper/wallpaper.html', 'HEAD').text(), '');
  for (const url of ['album-desktop://wallpaper/pet.html', 'album-desktop://pet/wallpaper.html', 'album-desktop://wallpaper/private.json', 'album-desktop://user@wallpaper/wallpaper.html', 'album-desktop://wallpaper:100/wallpaper.html']) assert.equal(f.fetch(url).status, 404);
  assert.equal(f.fetch('album-desktop://wallpaper/wallpaper.html', 'POST').status, 404);
});
test('asset I/O failure returns a diagnosable 404 instead of throwing ERR_FAILED from the protocol handler', async () => {
  const f = fixture(); f.breakAsset();
  const result = f.fetch('album-desktop://wallpaper/wallpaper.html');
  assert.equal(result.status, 404); assert.equal(await result.text(), 'Asset unavailable');
});

test('shell route keeps exact authority, method and HEAD restrictions after extraction', async () => {
  const f = fixture();
  assert.equal(f.fetch('album-desktop://shell/index.html').status, 200);
  assert.equal(await f.fetch('album-desktop://shell/index.html', 'HEAD').text(), '');
  for (const url of ['album-desktop://shell:100/index.html', 'album-desktop://user@shell/index.html', 'album-desktop://user:password@shell/index.html', 'album-desktop://shell.invalid/index.html', 'album-desktop://shell/private.json']) assert.equal(f.fetch(url).status, 404, url);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) assert.equal(f.fetch('album-desktop://shell/index.html', method).status, 404, method);
  f.breakAsset();
  for (const method of ['GET', 'HEAD']) assert.equal(f.fetch('album-desktop://shell/index.html', method).status, 404);
});
test('desk pet CSP allows data: images (pet-life hearts / sparkles) and nothing else new', async () => {
  const f = fixture(), csp = f.fetch('album-desktop://pet/pet.html').headers.get('Content-Security-Policy');
  const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives['img-src'], ["'self'", 'https:', 'data:']);
  for (const [name, values] of Object.entries(directives)) if (name !== 'img-src') assert.ok(!values.includes('data:') && !values.includes('*') && !values.includes("'unsafe-eval'"), `${name} stays strict`);
  assert.deepEqual(directives['script-src'], ["'self'"]); assert.deepEqual(directives['connect-src'], ["'none'"]); assert.deepEqual(directives['default-src'], ["'self'"]);
});
