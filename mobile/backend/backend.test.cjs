const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { startCabinBackend } = require('./main.cjs');
test('Portable backend survives login/restart, streams entitled fixtures, rejects unauthenticated control and clears credentials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cabin-native-backend-')), token = 'isolated-fixture-token', secret = crypto.randomBytes(32), observed = [];
  const safeStorage = { isEncryptionAvailable: () => true, encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secret, iv), data = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); }, decryptString(value) { const cipher = crypto.createDecipheriv('aes-256-gcm', secret, value.subarray(0,12)); cipher.setAuthTag(value.subarray(12,28)); return Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString(); } };
  const upstream = { searchQQSongs: async () => [{ mid: '003abc12345678', name: '测试曲目', artist: '歌手' }], getQQMediaMid: async () => '', handleQQSongUrl: async cookie => { observed.push(cookie); return { playable: true, url: 'https://audio.music.qqmusic.qq.com/fixture.mp3', quality: 'fixture' }; }, audioProxyHeadersFor: () => ({}) };
  let service;
  const request = async (resource, value, authenticated = true) => { const response = await fetch('http://127.0.0.1:' + service.port + resource, { headers: { ...(authenticated ? { 'x-cabin-native-token': token } : {}), ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(value === undefined ? {} : { method: 'POST', body: JSON.stringify(value) }) }); return { status: response.status, body: await response.json() }; };
  const start = () => startCabinBackend({ directory, token, safeStorage, upstream, fetch: (url, options) => String(url).startsWith('https://audio.music.qqmusic.qq.com/') ? Promise.resolve(new Response(Buffer.from('fixture-audio'), { headers: { 'content-type': 'audio/mpeg' } })) : fetch(url, options) });
  try {
    service = await start(); assert.equal((await request('/music/config', undefined, false)).status, 401);
    assert.equal((await request('/native/session', { provider: 'qq', cookie: 'uin=123; qm_keyst=fixture-only' })).body.ok, true);
    assert.equal((await request('/music/config')).body.qqLoggedIn, true);
    assert.doesNotMatch(await fs.readFile(path.join(directory,'music.json'),'utf8'), /fixture-only|qm_keyst/);
    service.stop(); service = await start(); assert.equal((await request('/music/config')).body.qqLoggedIn, true);
    assert.equal((await request('/music/search?provider=qq&query=fixture')).body.candidates[0].title, '测试曲目');
    const resolved = (await request('/music/resolve', { provider: 'qq', id: '003abc12345678' })).body;
    assert.match(resolved.audioPath, /^\/desktop-music\/audio\/[a-f0-9]{48}$/);
    const response = await fetch('http://127.0.0.1:' + service.port + '/music' + resolved.audioPath.slice('/desktop-music'.length), { headers: { 'x-cabin-native-token': token } }); assert.equal(await response.text(), 'fixture-audio'); assert.match(observed[0], /fixture-only/);
    await request('/native/session', { provider: 'qq', cookie: '' }); assert.equal((await request('/music/config')).body.qqLoggedIn, false);
  } finally { service?.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('Android native token bridge pairs its real HTTPS LAN service with a desktop instance and exchanges all sync domains', async () => {
  const { createLanService } = require('../../desktop/lan-service.cjs');
  const { emptySnapshot } = require('../../desktop/lan-model.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cabin-mobile-lan-'));
  const desktop = createLanService({ directory: path.join(directory, 'desktop') });
  const token = 'android-private-control-token';
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: v => Buffer.from(v), decryptString: v => v.toString() };
  const service = await startCabinBackend({ directory: path.join(directory, 'mobile'), token, safeStorage, upstream: {} });
  const request = async (route, body, authorized = true) => {
    const response = await fetch(`http://127.0.0.1:${service.port}/sync${route}`, { headers: { ...(authorized ? { 'x-cabin-native-token': token } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  };
  try {
    assert.equal((await request('/start', {}, false)).status, 401);
    assert.equal((await request('/status')).value.enabled, false);
    assert.equal((await request('/start', {})).value.enabled, true);
    const invite = await desktop.invite();
    assert.equal((await request('/pair', { address: desktop.status().addresses[0], pin: invite.pin, token: invite.token })).status, 200);
    const value = { ...emptySnapshot(), notes: [{ id: 'n', device: 'mobile', rev: 1, at: 1, deleted: false, value: { body: '手机手记' } }], layouts: [{ id: 'warm', device: 'mobile', rev: 1, at: 1, deleted: false, value: { theme: 'warm', items: [] } }], focus: [{ id: 's1', device: 'mobile', rev: 1, at: 1, deleted: false, value: { start: 1, end: 2 } }] };
    const synced = await request('/sync', { peerId: desktop.status().id, snapshot: value });
    assert.equal(synced.status, 200); assert.deepEqual(synced.value, value); assert.deepEqual(desktop.stage(emptySnapshot()), value);
    desktop.revoke((await request('/status')).value.id);
    assert.equal((await request('/sync', { peerId: desktop.status().id, snapshot: value })).status, 400);
    assert.equal((await request('/stop', {})).value.enabled, false);
  } finally { service.stop(); await desktop.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});
