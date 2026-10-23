'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createMusicService } = require('../music-service.cjs');
const { createLocalMusic } = require('../local-music.cjs');
const { cleanSnapshot, cleanCompanion } = require('../wallpaper-model.cjs');
const { createNowPlaying } = require('../now-playing.cjs');
const storage = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from(v), decryptString: (v) => v.toString() };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-runtime-'));
  const service = createMusicService({ directory, safeStorage: storage, upstream: {}, login: async () => ({ ok: true, cookie: 'cookie' }), logout: async () => {}, ...options });
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  const request = (url, value) => service.proxy(new Request('https://album-circle.vercel.app/desktop-music' + url, value === undefined ? {} : { method: 'POST', body: JSON.stringify(value) }), url, fetch);
  return { directory, service, request };
}
test('Apple control route preserves the expected recording for the native guard', async (t) => {
  const calls = [], expectedTrack = { id: 'ABCDEF0123456789', title: 'Selected', artist: 'Artist', album: 'Album' };
  const { request } = fixture(t, { appleMusic: { available: true, control: async (...args) => { calls.push(args); return { ok: true }; } } });
  const response = await request('/apple/control', { action: 'pause', expectedTrack });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [['pause', expectedTrack]]);
});
test('changing Music Assistant origin cannot reuse the previous server credential', async (t) => {
  const requests = [];
  const { request } = fixture(t, { fetch: async (url, init) => { requests.push([url, init.headers.Authorization]); return Response.json([]); } });
  await request('/config', { maURL: 'https://one.example', maToken: 'first-secret' });
  await request('/ma/players');
  assert.deepEqual(requests, [['https://one.example/api', 'Bearer first-secret']]);
  const changed = await (await request('/config', { maURL: 'https://two.example' })).json();
  assert.equal(changed.maTokenSet, false);
  assert.equal((await request('/ma/players')).status, 502);
  assert.equal(requests.length, 1);
  await request('/config', { maURL: 'https://two.example/', maToken: 'second-secret' });
  await request('/config', { maURL: 'https://two.example', playerId: 'player' });
  await request('/ma/players');
  assert.deepEqual(requests.at(-1), ['https://two.example/api', 'Bearer second-secret']);
});
test('logout wins over pending login and still clears credentials if browser cleanup fails', async (t) => {
  const pending = deferred();
  const { service } = fixture(t, { login: () => pending.promise, logout: async () => { throw new Error('cleanup failed'); } });
  const signingIn = service.login('qq');
  await assert.rejects(service.logout('qq'), /cleanup/);
  pending.resolve({ ok: true, cookie: 'stale-login' });
  assert.equal((await signingIn).cancelled, true);
  assert.equal(service.config().qqLoggedIn, false);
  await assert.rejects(service.logout('ma'), /不支持/);
});
test('logout invalidates a pending signed audio resolution', async (t) => {
  const pending = deferred(), entered = deferred();
  const { service, request } = fixture(t, { upstream: { handleQQSongUrl: async () => { entered.resolve(); return pending.promise; } } });
  const resolving = request('/resolve', { provider: 'qq', id: 'abc' });
  await entered.promise;
  await service.logout('qq');
  pending.resolve({ url: 'https://ws.stream.qqmusic.qq.com/music.mp3', playable: true });
  const response = await resolving;
  assert.equal(response.status, 502); assert.match((await response.json()).error, /已更改/);
});
test('plaintext Linux safeStorage fallback cannot save credentials, but logout remains possible', async (t) => {
  const { service, request } = fixture(t, { safeStorage: { ...storage, getSelectedStorageBackend: () => 'basic_text' } });
  await assert.rejects(service.login('qq'), /安全凭据/);
  assert.equal((await request('/config', { maURL: 'https://server.example', maToken: 'secret' })).status, 502);
  await service.logout('qq'); assert.equal(service.config().qqLoggedIn, false);
});
test('removing a folder during scanning cannot restore its tracks', async (t) => {
  const { directory } = fixture(t), folder = path.join(directory, 'music'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'song.mp3'), 'audio');
  const pending = deferred(), entered = deferred();
  const library = createLocalMusic({ directory, loadParser: async () => async () => { entered.resolve(); await pending.promise; return { common: { title: 'Track' }, format: {} }; } });
  const scanning = library.addFolder(folder); await entered.promise;
  const removing = library.removeFolder(folder); pending.resolve();
  await Promise.all([scanning, removing]);
  assert.equal(library.summary().trackCount, 0); assert.equal(library.summary().folders.length, 0);
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'local-music.json'))); assert.deepEqual(saved.albums, []);
});
test('indexed local audio cannot follow a replaced symlink outside the chosen folder', async (t) => {
  const { directory } = fixture(t), folder = path.join(directory, 'music'); fs.mkdirSync(folder);
  const file = path.join(folder, 'song.mp3'), other = path.join(directory, 'private.mp3'); fs.writeFileSync(file, 'audio'); fs.writeFileSync(other, 'private');
  const library = createLocalMusic({ directory, loadParser: async () => async () => ({ common: { title: 'Track' }, format: {} }) });
  const complete = await library.addFolder(folder); assert.equal(complete.scanning, false); const id = library.albums()[0].tracks[0].id;
  assert.ok(library.track(id)); fs.unlinkSync(file);
  try { fs.symlinkSync(other, file); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('File symlinks require Windows Developer Mode or administrator rights'); return; } throw error; }
  assert.equal(library.track(id), null);
});
test('local folder removal accepts the selected alias after canonical indexing', async (t) => {
  const { directory } = fixture(t), folder = path.join(directory, 'music'), alias = path.join(directory, 'selected-music');
  fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'song.mp3'), 'audio'); fs.symlinkSync(folder, alias, 'junction');
  const library = createLocalMusic({ directory, loadParser: async () => async () => ({ common: { title: 'Track' }, format: {} }) });
  await library.addFolder(alias); assert.equal(library.summary().trackCount, 1);
  await library.removeFolder(alias); assert.equal(library.summary().trackCount, 0); assert.equal(library.summary().folders.length, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'local-music.json'))).albums, []);
});
test('malformed saved library recovers safely and refuses empty folder selection', async (t) => {
  const { directory } = fixture(t); fs.writeFileSync(path.join(directory, 'local-music.json'), JSON.stringify({ folders: [], albums: [null] }));
  const library = createLocalMusic({ directory }); assert.equal(library.summary().trackCount, 0);
  await assert.rejects(library.addFolder(''), /无法读取/);
});
test('all supported scenes and pets survive display-only snapshot validation', () => {
  for (const look of ['pixel', 'warm', 'forest', 'seaside', 'starlight']) for (const petId of ['cat', 'chick', 'bunny', 'bear', 'fox']) {
    assert.equal(cleanSnapshot({ look, petId }).petId, petId); assert.equal(cleanCompanion({ petId }).petId, petId);
  }
  assert.equal(cleanSnapshot({ look: 'pixel', petId: 'unknown' }).petId, 'cat'); assert.equal(cleanCompanion({}).petId, 'cat');
});
test('macOS control failure is reported rather than returning false success', async () => {
  const service = createNowPlaying({ platform: 'darwin', execFileProcess: (_a, _b, _c, callback) => callback(new Error('timeout'), '') });
  await assert.rejects(service.control('play'), /未响应/); assert.match((await service.get()).error, /未响应/);
});
test('cover proxy checks each redirect before fetching and bounds redirect loops', async () => {
  const { createSiteRouter } = require('../site-router.cjs');
  const request = new Request('https://album-circle.vercel.app/desktop-image?url=' + encodeURIComponent('https://coverartarchive.org/release/x/front'));
  const seen = [];
  const router = createSiteRouter({ webRoot: path.join(__dirname, 'fixtures/web'), forward: async (r) => { seen.push(r); return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }); } });
  assert.equal((await router(request)).status, 400); assert.equal(seen.length, 1); assert.equal(seen[0].redirect, 'manual');
  let calls = 0;
  const loop = createSiteRouter({ webRoot: path.join(__dirname, 'fixtures/web'), forward: async () => { calls++; return new Response(null, { status: 302, headers: { location: '/loop' } }); } });
  assert.equal((await loop(request)).status, 502); assert.equal(calls, 6);
});
test('stopping companion polling discards a delayed snapshot', async () => {
  const { createCompanionPoller } = require('../companion-sync.cjs');
  const pending = deferred(), sent = [];
  const poller = createCompanionPoller({ getSite: () => ({ isDestroyed: () => false, executeJavaScript: () => pending.promise }), clean: (v) => v, onValue: (v) => sent.push(v) });
  poller.start(); poller.stop(); pending.resolve({ petId: 'fox' });
  await new Promise((resolve) => setImmediate(resolve)); assert.deepEqual(sent, []);
});
test('failed pet page load leaves no active invisible companion', async (t) => {
  const { EventEmitter } = require('node:events');
  const electron = require.resolve('electron'), old = require.cache[electron];
  let created;
  class Window extends EventEmitter {
    constructor() { super(); created = this; this.destroyed = false; this.webContents = new EventEmitter(); Object.assign(this.webContents, { session: { protocol: { isProtocolHandled: async () => true, unhandle() {}, handle() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }, setWindowOpenHandler() {} }); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {}
    isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; this.emit('closed'); }
    getBounds() { return { x: 0, y: 0, width: 100, height: 100 }; }
    async loadURL() { throw new Error('missing pet page'); }
  }
  require.cache[electron] = { exports: { BrowserWindow: Window, Menu: {}, ipcMain: { handle() {}, on() {} }, screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) } } };
  const filename = require.resolve('../pet.cjs'); delete require.cache[filename];
  t.after(() => { if (old) require.cache[electron] = old; else delete require.cache[electron]; delete require.cache[filename]; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-pet-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const pet = require('../pet.cjs').createPet({ directory, getSite: () => null, status() {}, registerProtocol() {} });
  await assert.rejects(pet.start(), /missing/); assert.equal(pet.active, false); assert.equal(created.destroyed, true);
});
test('logout cancels an in-flight audio fetch and invalidates its playback URL', async (t) => {
  const entered = deferred(); let aborted = false;
  const { service, request } = fixture(t, {
    upstream: { handleQQSongUrl: async () => ({ url: 'https://ws.stream.qqmusic.qq.com/audio.mp3', playable: true }), audioProxyHeadersFor: () => ({}) },
    fetch: async (_url, { signal }) => { entered.resolve(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true })); }
  });
  const { audioPath } = await (await request('/resolve', { provider: 'qq', id: 'abc' })).json();
  const streamPath = audioPath.slice('/desktop-music'.length), streaming = request(streamPath);
  await entered.promise; await service.logout('qq');
  assert.equal((await streaming).status, 502); assert.equal(aborted, true); assert.equal((await request(streamPath)).status, 410);
});
test('legacy symlink folder migration preserves track IDs through playback, rescan and reload', async (t) => {
  const crypto = require('node:crypto'), hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
  const { directory } = fixture(t), realFolder = path.join(directory, 'real-music'), linkedFolder = path.join(directory, 'selected-music');
  fs.mkdirSync(realFolder); fs.writeFileSync(path.join(realFolder, 'song.mp3'), 'music');
  fs.symlinkSync(realFolder, linkedFolder, process.platform === 'win32' ? 'junction' : 'dir');
  const legacyFile = path.join(linkedFolder, 'song.mp3'), legacyId = hash('track:' + legacyFile);
  fs.writeFileSync(path.join(directory, 'local-music.json'), JSON.stringify({ folders: [linkedFolder], scannedAt: 1, albums: [{ id: hash('album:test'), title: 'Album', artist: 'Artist', tracks: [{ id: legacyId, title: 'Track', artist: 'Artist', file: legacyFile, type: 'audio/mpeg', duration: 10 }] }] }));
  const options = { directory, loadParser: async () => async () => ({ common: { title: 'Track', album: 'Album', artist: 'Artist' }, format: { duration: 10 } }) };
  const library = createLocalMusic(options);
  assert.equal(library.summary().folders[0].path, fs.realpathSync(realFolder));
  assert.equal(library.track(legacyId).file, fs.realpathSync(path.join(realFolder, 'song.mp3')));
  const migrated = JSON.parse(fs.readFileSync(path.join(directory, 'local-music.json')));
  assert.equal(migrated.albums[0].tracks[0].id, legacyId); assert.equal(migrated.folders[0], fs.realpathSync(realFolder));
  // Removing the old selection alias must not break the migrated library.
  fs.unlinkSync(linkedFolder); await library.rescan();
  assert.equal(library.albums()[0].tracks[0].id, legacyId); assert.ok(library.track(legacyId));
  const reloaded = createLocalMusic(options); assert.ok(reloaded.track(legacyId));
  assert.equal(reloaded.albums()[0].tracks[0].id, legacyId);
});
