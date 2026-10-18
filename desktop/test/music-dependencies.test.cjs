'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createLocalMusic } = require('../local-music.cjs');

const requireForDesktop = createRequire(path.join(__dirname, '../package.json'));
const requireForNetease = createRequire(requireForDesktop.resolve('NeteaseCloudMusicApi/package.json'));
const forgePackage = requireForNetease('node-forge/package.json');
const forge = requireForNetease('node-forge');

test('Netease key encryption uses the narrow Node crypto adapter and produces its expected request fields', () => {
  assert.equal(forgePackage.version, '1.4.0-flowcabin.1');
  assert.match(requireForNetease.resolve('node-forge'), /vendor[\\/]node-forge-encrypt-only[\\/]index\.cjs$/);
  assert.equal(typeof forge.pki.publicKeyFromPem, 'function');
  assert.equal(typeof forge.pki.verify, 'undefined', 'Unused vulnerable signature verification must not be packaged');
  const crypto = requireForDesktop('NeteaseCloudMusicApi/util/crypto');
  const request = crypto.weapi({ s: 'flow cabin', limit: 10 });
  assert.match(request.encSecKey, /^[\da-f]{256}$/);
  assert.ok(request.params.length > 50);
});

test('malformed media tags are rejected without indexing the file', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-parser-limit-'));
  const music = path.join(directory, 'Music');
  fs.mkdirSync(music, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // A forged FLAC comment count must not allocate an array of four billion rows.
  const flac = Buffer.alloc(16);
  flac.write('fLaC');
  flac[4] = 0x84;
  flac.writeUIntBE(8, 5, 3);
  flac.writeUInt32LE(0xffffffff, 12);
  fs.writeFileSync(path.join(music, 'forged.flac'), flac);
  const { parseBuffer } = await import('music-metadata');
  const started = Date.now();
  await assert.rejects(parseBuffer(flac, 'audio/flac'), /bounds|content|invalid|comment/i);
  assert.ok(Date.now() - started < 2000, 'Malformed metadata must fail quickly instead of looping');
  const library = createLocalMusic({ directory });
  const summary = await library.addFolder(music);
  assert.equal(summary.trackCount, 0);
  assert.deepEqual(library.albums(), []);
});
