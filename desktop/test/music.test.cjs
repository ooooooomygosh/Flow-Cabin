'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createMusicService } = require('../music-service.cjs'), { safeAudioURL, serverURL } = require('../music-policy.cjs'), { cleanSnapshot } = require('../wallpaper-model.cjs');
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from([...v].reverse().join('')), decryptString: (b) => [...b.toString()].reverse().join('') };
const upstream = { handleQQSearch: async () => [{ mid: '001n4C3p1yv0FU', name: '以父之名', artists: [{ name: '周杰伦' }], album: { name: '叶惠美' } }], handleSearch: async () => [], handleQQSongUrl: async () => ({ url: 'https://ws.stream.qqmusic.qq.com/test.mp3?vkey=SECRET', playable: true }), normalizeLoginInfo: () => ({}), handleSongUrl: async () => ({ playable: false, message: '需要平台权限' }), audioProxyHeadersFor: (_url, range) => ({ Range: range }) };
async function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-music-test-'));
  const service = createMusicService({ directory, safeStorage, login: async () => ({ ok: true, cookie: 'uin=12345; qm_keyst=LOGIN_SECRET' }), logout: async () => {}, upstream: { ...upstream, ...overrides }, fetch: async (_url, options) => new Response(Buffer.from('audio bytes'), { status: options.headers.Range ? 206 : 200, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-10/11' } }) });
  const request = (url, value, headers) => service.proxy(new Request('https://album-circle.vercel.app/desktop-music' + url, { ...(value === undefined ? {} : { method: 'POST', body: JSON.stringify(value) }), headers }), url, fetch);
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); }); return { service, request, directory };
}
test('audio address boundary excludes credentials, arbitrary servers and local networks', () => {
  assert.ok(safeAudioURL('https://ws.stream.qqmusic.qq.com/a.mp3')); assert.ok(safeAudioURL('https://m8.music.126.net/a.mp3'));
  for (const url of ['http://127.0.0.1/a.mp3', 'https://evil.test/a.mp3', 'https://qqmusic.qq.com.evil.test/a', 'https://x:y@ws.stream.qqmusic.qq.com/a', 'file:///C:/x']) assert.equal(safeAudioURL(url), false);
  assert.equal(serverURL('http://192.168.1.8:8095'), 'http://192.168.1.8:8095'); assert.throws(() => serverURL('http://169.254.169.254')); assert.throws(() => serverURL('https://x:y@example.com')); assert.throws(() => serverURL('https://example.com/path'));
});
test('loopback service requires a native token and rejects unrelated origins', async (t) => {
  const { service, request } = await fixture(t), port = await service.start();
  assert.equal((await fetch(`http://127.0.0.1:${port}/config`)).status, 401);
  let credentials;
  await service.proxy(new Request('https://album-circle.vercel.app/desktop-music/config'), '/config', (url, opts) => { credentials = { url, opts }; return fetch(url, opts); });
  assert.equal((await fetch(credentials.url, { headers: { ...credentials.opts.headers, Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await request('/unknown')).status, 404);
});
test('music account credentials are persisted encrypted and never returned to renderer', async (t) => {
  const { service, request, directory } = await fixture(t); await service.login('qq');
  const raw = fs.readFileSync(path.join(directory, 'music.json'), 'utf8'); assert.ok(!raw.includes('LOGIN_SECRET')); assert.ok(!raw.includes('uin=12345'));
  const config = await (await request('/config')).json(); assert.equal(config.qqLoggedIn, true); assert.equal(config.qq, undefined);
  await service.logout('qq'); assert.equal((await (await request('/config')).json()).qqLoggedIn, false);
});
test('exact track resolution proxies audio with Range without exposing signed URL', async (t) => {
  const { request } = await fixture(t); const result = await (await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' })).json();
  assert.match(result.audioPath, /^\/desktop-music\/audio\/[a-f\d]{48}$/); assert.equal(JSON.stringify(result).includes('SECRET'), false);
  const audio = await request(result.audioPath.slice('/desktop-music'.length), undefined, { Range: 'bytes=0-10' }); assert.equal(audio.status, 206); assert.equal(await audio.text(), 'audio bytes');
  assert.equal((await request(result.audioPath.slice('/desktop-music'.length), undefined, { Range: 'bytes=1-2,5-6' })).status, 416);
});
test('restricted audio and unexpected URLs cannot produce playable sources', async (t) => {
  const { request } = await fixture(t, { handleQQSongUrl: async () => ({ url: 'http://127.0.0.1/secret', playable: true }) });
  assert.equal((await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' })).status, 502);
  const restricted = await (await request('/resolve', { provider: 'netease', id: '12345' })).json(); assert.match(restricted.error, /权限/);
});
test('QQ resolves a validated mirror when the preferred CDN is outside the audio boundary', async (t) => {
  let proxiedURL;
  const { request } = await fixture(t, {
    handleQQSongUrl: async () => ({ url: 'http://aqqmusic.tc.qq.com/test.mp3?vkey=SECRET', playable: true, trial: false, quality: '128k MP3', candidates: [
      { url: 'http://aqqmusic.tc.qq.com/test.mp3?vkey=SECRET' },
      { url: 'http://127.0.0.1/private' },
      { url: 'https://sjy6.stream.qqmusic.qq.com/test.mp3?vkey=SECRET', trial: true, quality: 'AAC/M4A' }
    ] }),
    audioProxyHeadersFor: (url, range) => { proxiedURL = url; return { Range: range }; }
  });
  const response = await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' });
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.trial, true); assert.equal(result.quality, 'AAC/M4A'); assert.equal(JSON.stringify(result).includes('SECRET'), false);
  const audio = await request(result.audioPath.slice('/desktop-music'.length));
  assert.equal(audio.status, 200); assert.equal(await audio.text(), 'audio bytes');
  assert.equal(proxiedURL, 'https://sjy6.stream.qqmusic.qq.com/test.mp3?vkey=SECRET');
});
test('QQ mirror fallback rejects every unsafe candidate and restricted upstream results', async (t) => {
  const unsafe = [null, { url: 'http://127.0.0.1/private' }, { url: 'https://qqmusic.qq.com.evil.test/a' }, { url: 'https://x:y@sjy6.stream.qqmusic.qq.com/a' }, { url: 'https://sjy6.stream.qqmusic.qq.com/a', playable: false }];
  const { request } = await fixture(t, { handleQQSongUrl: async () => ({ url: 'http://aqqmusic.tc.qq.com/a', playable: true, candidates: unsafe }) });
  assert.equal((await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' })).status, 502);
  const restricted = await fixture(t, { handleQQSongUrl: async () => ({ url: 'http://aqqmusic.tc.qq.com/a', playable: false, message: '需要平台权限', candidates: [{ url: 'https://sjy6.stream.qqmusic.qq.com/a' }] }) });
  assert.match((await (await restricted.request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' })).json()).error, /权限/);
});
test('search preserves version metadata and cached results avoid repeated upstream calls', async (t) => {
  let count = 0; const { request } = await fixture(t, { handleQQSearch: async () => { count++; return [{ mid: '001n4C3p1yv0FU', name: '以父之名', artists: [{ name: '周杰伦' }], album: { name: '叶惠美' } }]; } });
  const result = await (await request('/search?provider=qq&query=test')).json(); await request('/search?provider=qq&query=test');
  assert.equal(count, 1); assert.equal(result.candidates[0].album, '叶惠美'); assert.equal(result.candidates[0].artist, '周杰伦');
});
test('wallpaper snapshot drops credentials and fixes counts, tracks and colour bounds', () => {
  const item = { id: 'a', title: '原专辑', artist: '歌手', tracks: ['第一首'], token: 'PRIVATE', cover: 'https://user:secret@evil.test/x' };
  const clean = cleanSnapshot({ look: 'warm', items: Array(100).fill(item), record: item, token: 'PRIVATE', trackIndex: 500, recordStyle: { opacity: 999, splashes: ['#ffffff', '#ffffff', '#ffffff', '#ffffff'] }, statusText: '正在播放' });
  assert.equal(clean.items.length, 12); assert.equal(clean.trackIndex, 0); assert.equal(clean.recordStyle.opacity, 100); assert.equal(clean.recordStyle.splashes.length, 3); assert.equal(clean.record.cover, ''); assert.equal(JSON.stringify(clean).includes('PRIVATE'), false);
});
test('shelf row navigation covers final partial row and preserves fixed geometry', async () => {
  const { shelfWindow, roomGeometry } = await import('../../src/room-model.mjs');
  const items = Array.from({ length: 14 }, (_, id) => ({ id })); const view = shelfWindow(items, 200);
  assert.equal(view.startRow, 1); assert.equal(view.items.length, 10); assert.equal(view.items.at(-1).id, 13); assert.equal(shelfWindow([], -1).startRow, 0);
  for (const [width, height] of [[960, 600], [1920, 1080], [3440, 1440], [3840, 2160]]) { const g = roomGeometry(width, height); assert.ok(g.left <= 0 && g.top <= 0 && g.left + g.width >= width && g.top + g.height >= height); }
});
test('small-window shelf stays between the top controls and album footer', async () => {
  const { roomGeometry } = await import('../../src/room-model.mjs');
  for (const [width, height] of [[800, 600], [1024, 768], [1440, 600], [1920, 1080]]) {
    const geometry = roomGeometry(width, height, { top: 190, bottom: 120 }), scale = geometry.width / 1448;
    assert.ok(geometry.top + 200 * scale >= 190 - 0.01);
    assert.ok(geometry.top + 701 * scale <= height - 120 + 0.01);
  }
});
test('audio identifiers come from original QQ track IDs, other catalogs require version selection', async () => {
  const { exactTrack } = await import('../../src/room-playback.mjs'); const item = { tracks: ['原曲名'], trackDetails: [{ providerId: '001n4C3p1yv0FU' }] };
  assert.equal(exactTrack(item, 0, 'qq').id, '001n4C3p1yv0FU'); assert.equal(exactTrack(item, 0, 'netease'), null); assert.equal(exactTrack({ tracks: ['原曲名'] }, 0, 'qq'), null);
  item.trackDetails[0].mediaMid = '0025nWDH4PCVfs'; assert.equal(exactTrack(item, 0, 'qq').mediaMid, '0025nWDH4PCVfs');
  item.trackDetails[0].mediaMid = 'invalid/path'; assert.equal(exactTrack(item, 0, 'qq').mediaMid, '');
});
test('NetEase resolution passes server-verified identity without inventing entitlement', async (t) => {
  let received;
  const { service, request } = await fixture(t, {
    getNeteaseLoginInfo: async (cookie) => { assert.match(cookie, /LOGIN_SECRET/); return { loggedIn: true, userId: 42, isVip: false }; },
    handleSongUrl: async (_id, info, _quality, cookie) => { received = { info, cookie }; return { playable: false, message: '需要平台权限' }; }
  });
  await service.login('netease'); await request('/resolve', { provider: 'netease', id: '12345' });
  assert.equal(received.info.userId, 42); assert.equal(received.info.isVip, false); assert.match(received.cookie, /LOGIN_SECRET/);
});
test('logout during NetEase account verification prevents a later playback request', async (t) => {
  let verify, entered, calls = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const { service, request } = await fixture(t, {
    getNeteaseLoginInfo: () => { entered(); return new Promise(resolve => { verify = resolve; }); },
    handleSongUrl: async () => { calls++; return { playable: false }; }
  });
  await service.login('netease'); const pending = request('/resolve', { provider: 'netease', id: '12345' });
  await ready; await service.logout('netease'); verify({ loggedIn: true, userId: 42 });
  assert.equal((await pending).status, 502); assert.equal(calls, 0);
});
test('audio quality: the chosen tier is requested, the actual tier is reported', async (t) => {
  const asked = [];
  const { request } = await fixture(t, { handleQQSongUrl: async (_cookie, _mid, _media, quality) => { asked.push(quality); return { url: 'https://ws.stream.qqmusic.qq.com/a.mp3', playable: true, quality: '320k MP3' }; } });
  const config = await (await request('/config')).json();
  assert.equal(config.quality, 'exhigh'); assert.deepEqual(config.qualities.map((q) => q.id), ['standard', 'exhigh', 'lossless']);
  assert.equal((await (await request('/quality', { quality: 'lossless' })).json()).quality, 'lossless');
  assert.equal((await request('/quality', { quality: 'jymaster' })).status, 502, 'unknown tiers are refused');
  const resolved = await (await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' })).json();
  assert.deepEqual(asked, ['lossless']);
  assert.equal(resolved.quality, '320k MP3', 'no VIP: the deck shows the tier really returned');
  assert.equal(resolved.requestedQuality, 'lossless');
});
test('system Apple Music and local app routes are explicit about what they do', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await (await request('/apple/permission')).json()).available, false);
  assert.match((await (await request('/apple/state')).json()).error, /macOS/);
  assert.match((await (await request('/open-local', { provider: 'qq', query: 'x' })).json()).error, /不可用/);
});

test('playlist continuation rejects changed account revisions and in-flight account changes', async t => {
  let finish, calls = 0;
  const { service, request } = await fixture(t, { neteasePlaylistTracks: async (_cookie, id, { offset }) => {
    calls++; if (offset) await new Promise(resolve => { finish = resolve; });
    return { playlist: { id, name: 'Large', trackCount: 620 }, tracks: [{ id: String(offset + 1), name: 'Song' }], page: { offset, nextOffset: offset ? null : 500, snapshot: 'a' } };
  } });
  const first = await (await request('/playlist?provider=netease&id=1')).json();
  await service.logout('netease');
  const stale = await request(`/playlist?provider=netease&id=1&offset=500&revision=${first.revision}`);
  assert.equal(stale.status, 502); assert.match((await stale.json()).error, /更改/); assert.equal(calls, 1);
  const staleFirst = await request(`/playlist?provider=netease&id=1&offset=0&revision=${first.revision}`); assert.equal(staleFirst.status, 502); assert.equal(calls, 1);
  const fresh = await (await request('/playlist?provider=netease&id=1')).json();
  const pending = request(`/playlist?provider=netease&id=1&offset=500&revision=${fresh.revision}`);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await service.logout('netease'); finish();
  const rejected = await pending; assert.equal(rejected.status, 502); assert.match((await rejected.json()).error, /更改/);
});

test('legacy QQ collection resolves missing mediaMid by exact song id without changing the collection', async t => {
  const id = '001n4C3p1yv0FU', media = '0025nWDH4PCVfs', calls = [];
  const legacy = { provider: 'qq', id }, before = structuredClone(legacy);
  const { request } = await fixture(t, {
    getQQMediaMid: async (_cookie, mid) => { calls.push(['detail', mid]); return media; },
    handleQQSongUrl: async (_cookie, mid, mediaMid) => { calls.push(['url', mid, mediaMid]); return mediaMid === media ? { url: 'https://ws.stream.qqmusic.qq.com/legacy.mp3', playable: true } : { playable: false, message: 'No file URL' }; }
  });
  const response = await request('/resolve', legacy); assert.equal(response.status, 200); assert.match((await response.json()).audioPath, /^\/desktop-music\/audio\//);
  assert.deepEqual(calls, [['detail', id], ['url', id, media]]); assert.deepEqual(legacy, before);
});

test('QQ records with a valid mediaMid skip lookup; failed lookup keeps the original filename fallback', async t => {
  const id = '001n4C3p1yv0FU', media = '0025nWDH4PCVfs'; let lookups = 0; const seen = [];
  const { request } = await fixture(t, {
    getQQMediaMid: async () => { lookups++; throw new Error('offline'); },
    handleQQSongUrl: async (_cookie, mid, mediaMid) => { seen.push([mid, mediaMid]); return { url: 'https://ws.stream.qqmusic.qq.com/fallback.mp3', playable: true }; }
  });
  assert.equal((await request('/resolve', { provider: 'qq', id, mediaMid: media })).status, 200); assert.equal(lookups, 0);
  assert.equal((await request('/resolve', { provider: 'qq', id })).status, 200); assert.equal(lookups, 1);
  assert.deepEqual(seen, [[id, media], [id, '']]);
});
test('QQ media recovery never converts a permission denial into playable audio', async t => {
  let calls = 0;
  const { request } = await fixture(t, {
    getQQMediaMid: async () => '0025nWDH4PCVfs',
    handleQQSongUrl: async () => { calls++; return { playable: false, message: '需要平台权限' }; }
  });
  const denied = await request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' }); assert.equal(denied.status, 502); assert.match((await denied.json()).error, /平台权限/); assert.equal(calls, 1);
});
test('logout during legacy QQ metadata lookup prevents the later vkey request', async t => {
  let release, entered, calls = 0; const ready = new Promise(resolve => { entered = resolve; });
  const { service, request } = await fixture(t, {
    getQQMediaMid: async () => { entered(); return new Promise(resolve => { release = resolve; }); },
    handleQQSongUrl: async () => { calls++; return { playable: false }; }
  });
  const pending = request('/resolve', { provider: 'qq', id: '001n4C3p1yv0FU' }); await ready; await service.logout('qq'); release('0025nWDH4PCVfs');
  assert.equal((await pending).status, 502); assert.equal(calls, 0);
});
test('cancelling a legacy QQ resolve prevents a late metadata lookup from requesting audio', async t => {
  let release, entered, calls = 0; const ready = new Promise(resolve => { entered = resolve; });
  const { service, request } = await fixture(t, {
    getQQMediaMid: async () => { entered(); return new Promise(resolve => { release = resolve; }); },
    handleQQSongUrl: async () => { calls++; return { playable: false }; }
  });
  const controller = new AbortController();
  const pending = service.proxy(new Request('https://album-circle.vercel.app/desktop-music/resolve', { method: 'POST', body: JSON.stringify({ provider: 'qq', id: '001n4C3p1yv0FU' }), signal: controller.signal }), '/resolve', fetch);
  await ready; controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await request('/config'); // Process the closed loopback connection before releasing the held lookup.
  release('0025nWDH4PCVfs'); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 0);
});
test('search: identical requests share one upstream call and a refusal is remembered briefly', async (t) => {
  let count = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { request } = await fixture(t, { searchQQSongs: async () => { count++; await gate; throw new Error('QQ 音乐搜索暂时不可用（2001），稍后会自动重试。'); } });
  const both = Promise.all([request('/search?provider=qq&query=same'), request('/search?provider=qq&query=same')]);
  release();
  const answers = await both;
  assert.equal(count, 1); assert.deepEqual(answers.map((response) => response.status), [502, 502]);
  const again = await (await request('/search?provider=qq&query=same')).json();
  assert.equal(count, 1); assert.match(again.error, /2001/);
});
