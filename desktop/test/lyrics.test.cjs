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
