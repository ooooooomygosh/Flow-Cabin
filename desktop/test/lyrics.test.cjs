const test = require('node:test'), assert = require('node:assert/strict');
const { createLyricsService } = require('../lyrics-service.cjs');
test('platform exact ID precedes public search; cache coalesces without exposing cookies', async () => {
  let calls = 0;
  const service = createLyricsService({ upstream: { lyrics: async () => { calls++; return { text: '[00:01]hi', format: 'lrc' }; } }, cookie: () => 'SECRET', fetch: () => { throw Error('unexpected'); } });
  const result = await Promise.all([service.get({ provider: 'qq', id: 'abc' }), service.get({ provider: 'qq', id: 'abc' })]);
  assert.equal(calls, 1); assert.equal(result[0].source, 'qq'); assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('public matching rejects different recordings and unknown duration', async () => {
  let calls = 0;
  const service = createLyricsService({ upstream: {}, cookie: () => '', fetch: async () => { calls++; return new Response(JSON.stringify({ trackName: 'Song', artistName: 'Artist', albumName: 'Studio', duration: 250, syncedLyrics: '[00:01]hi' })); } });
  assert.equal((await service.get({ title: 'Song', artist: 'Artist' })).source, 'none'); assert.equal(calls, 0);
  assert.equal((await service.get({ title: 'Song', artist: 'Artist', album: 'Studio', duration: 200 })).source, 'none');
});
test('public matching requires finite upstream duration even when title and artist match', async () => {
  for (const duration of [undefined, null, 'unknown', 0]) {
    const service = createLyricsService({ upstream: {}, cookie: () => '', fetch: async () => new Response(JSON.stringify({ trackName: 'Song', artistName: 'Artist', duration, syncedLyrics: '[00:01]wrong version' })) });
    assert.equal((await service.get({ title: 'Song', artist: 'Artist', duration: 200 })).source, 'none');
  }
});

const { titleScore, artistScore, scoreCandidate } = require('../lyrics-match.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
test('title matching ignores version notes but never merges live, instrumental or remix recordings', () => {
  assert.equal(titleScore('Yesterday (Remastered 2009)', 'Yesterday'), 1);
  assert.equal(titleScore('Blinding Lights - 2020 Remaster', 'Blinding Lights'), 1);
  assert.equal(titleScore('Stay feat. Justin Bieber', 'STAY'), 1);
  assert.equal(titleScore('晴天（Live）', '晴天'), 0);
  assert.equal(titleScore('Song (Instrumental)', 'Song'), 0);
  assert.equal(titleScore('Song (Remix)', 'Song (Remix)'), 1);
  assert.equal(titleScore('ＡＢＣ', 'abc'), 1, 'full-width folds to half-width');
  assert.equal(titleScore('Hello', 'Goodbye'), 0);
  assert.ok(artistScore('Calvin Harris, Dua Lipa', 'Dua Lipa & Calvin Harris') >= .7);
  assert.equal(artistScore('周杰伦', '林俊杰'), 0);
});
test('automatic matches need title, artist and length; near versions only become candidates', () => {
  const track = { title: 'Yesterday', artist: 'The Beatles', album: 'Help!', duration: 125 };
  assert.equal(scoreCandidate(track, { trackName: 'Yesterday - Remastered 2009', artistName: 'The Beatles', albumName: 'Help! (Remastered)', duration: 126, syncedLyrics: '[00:01]x' }).automatic, true);
  assert.equal(scoreCandidate(track, { trackName: 'Yesterday', artistName: 'The Beatles', duration: 160 }).automatic, false, 'a 35 s difference is another recording');
  assert.equal(scoreCandidate(track, { trackName: 'Yesterday', artistName: 'Someone Else', duration: 125 }).automatic, false);
});
test('search fallback finds a remastered title, lists close versions and supports choosing one', async () => {
  const urls = [];
  const records = [
    { id: 11, trackName: 'Yesterday - Remastered 2009', artistName: 'The Beatles', albumName: 'Help!', duration: 126, syncedLyrics: '[00:01.00]Yesterday' },
    { id: 12, trackName: 'Yesterday (Live)', artistName: 'The Beatles', albumName: 'Live', duration: 150, syncedLyrics: '[00:01.00]live' }
  ];
  const fetch = async url => { urls.push(String(url)); const u = new URL(url);
    if (u.pathname === '/api/get') return new Response('{}', { status: 404 });
    if (u.pathname === '/api/search') return new Response(JSON.stringify(records));
    if (u.pathname === '/api/get/12') return new Response(JSON.stringify(records[1]));
    throw Error('unexpected ' + url); };
  const service = createLyricsService({ upstream: {}, cookie: () => '', fetch });
  const found = await service.get({ title: 'Yesterday', artist: 'The Beatles', album: 'Help!', duration: 125 });
  assert.equal(found.source, 'LRCLIB'); assert.equal(found.lrclibId, 11); assert.match(found.text, /Yesterday/);
  assert.deepEqual(found.candidates.map(c => c.id), [11], 'the live recording is not offered as the same song');
  assert.ok(urls.every(u => u.startsWith('https://lrclib.net/api/')));
  const picked = await service.get({ title: 'Yesterday', artist: 'The Beatles', album: 'Help!', duration: 125, candidate: 12 });
  assert.equal(picked.lrclibId, 12); assert.equal(picked.chosen, true);
  assert.equal((await service.get({ title: 'Yesterday', artist: 'The Beatles', duration: 125, candidate: '../x' })).lrclibId, 11, 'a malformed candidate id is ignored');
});
test('found lyrics survive a restart from the disk cache; misses are not persisted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-cache-')), cacheFile = path.join(dir, 'lyrics-cache.json');
  let calls = 0;
  const upstream = { lyrics: async (_p, id) => { calls++; return id === 'hit1' ? { text: '[00:01]hi', format: 'lrc', translation: '[00:01]你好', romanization: '' } : { text: '' }; } };
  const first = createLyricsService({ upstream, cookie: () => '', fetch: async () => new Response('[]'), cacheFile });
  await first.get({ provider: 'qq', id: 'hit1' }); await first.get({ provider: 'qq', id: 'miss1', title: 'x', artist: 'y', duration: 100 });
  first.flush();
  const second = createLyricsService({ upstream, cookie: () => '', fetch: async () => { throw Error('offline'); }, cacheFile });
  const cached = await second.get({ provider: 'qq', id: 'hit1' });
  assert.equal(cached.text, '[00:01]hi'); assert.equal(cached.translation, '[00:01]你好'); assert.equal(calls, 2);
  assert.ok(!fs.readFileSync(cacheFile, 'utf8').includes('miss1'));
  fs.writeFileSync(cacheFile, '{broken'); assert.doesNotThrow(() => createLyricsService({ upstream, cookie: () => '', cacheFile }));
  fs.rmSync(dir, { recursive: true, force: true });
});

const { defaultBounds, restoreBounds, cleanFeed, cleanPrefsPatch } = require('../lyric-window.cjs');
test('the lyric bar opens low and centred, and a saved spot is pulled back onto its display', () => {
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  const fresh = defaultBounds(area);
  assert.ok(Math.abs(fresh.x + fresh.width / 2 - 720) <= 1); assert.ok(fresh.y + fresh.height <= 900 - 40);
  assert.deepEqual(restoreBounds({ x: 2000, y: -500, width: 5000, height: 50 }, area), { x: 0, y: 25, width: 1440, height: 96 });
  assert.deepEqual(restoreBounds({ x: 100, y: 600, width: 800, height: 160 }, area), { x: 100, y: 600, width: 800, height: 160 });
  assert.deepEqual(restoreBounds({ x: 'a' }, area), fresh);
});
test('only bounded, plain feed data and whitelisted preferences cross into the bar', () => {
  const feed = cleanFeed({ docRev: 3, title: 'x'.repeat(500), skin: 'forest', prefs: { deskSize: 40, evil: 1, scale: 1.2 }, pet: { id: 'fox' }, anchor: { position: 1200, at: 5, playing: true, rate: 'x' }, energy: 7, doc: { lines: [] }, extra: 'drop' });
  assert.equal(feed.title.length, 300); assert.deepEqual(feed.prefs, { deskSize: 40, scale: 1.2 }); assert.equal(feed.energy, 1);
  assert.equal(feed.anchor.rate, 1); assert.equal(feed.pet.id, 'fox'); assert.equal('extra' in feed, false); assert.deepEqual(feed.doc, { lines: [] });
  assert.equal('doc' in cleanFeed({ docRev: 3 }), false, 'no doc key means the bar keeps its copy');
  assert.equal(cleanFeed({ doc: { lines: ['x'.repeat(3 * 1024 * 1024)] } }), null, 'oversized feeds are dropped');
  assert.equal(cleanFeed(null), null);
  assert.deepEqual(cleanPrefsPatch({ deskSize: 30, deskSkin: 'neon'.repeat(10), prototype: 1, deskPet: { x: 1 } }), { deskSize: 30, deskSkin: 'neonneonneonneonneon' });
  assert.equal(cleanPrefsPatch({ evil: 1 }), null);
});
