'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const album = { wrapperType: 'collection', collectionId: 123, collectionName: 'Example Album', artistName: 'Example Artist', trackCount: 30, artworkUrl100: 'https://example.test/100x100bb.jpg' };
const params = () => new URLSearchParams({ term: 'Example Artist Example Album', type: 'album' });
const response = (results) => Response.json({ results });

test('catalog preserves complete multidisc order, provider IDs and durations beyond 24 tracks', async (t) => {
  const { searchCatalog } = await import('../catalog-search.mjs');
  const tracks = Array.from({ length: 30 }, (_, i) => ({ wrapperType: 'track', collectionId: 123, trackId: 1000 + i, trackName: `Track ${i + 1}`, discNumber: i < 15 ? 1 : 2, trackNumber: i % 15 + 1, trackTimeMillis: 120000 + i }));
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'itunes.apple.com');
    if (url.pathname === '/search') { assert.equal(url.searchParams.get('entity'), 'album'); return response([album]); }
    return response([album, ...tracks.toReversed()]);
  });
  const result = await (await searchCatalog(params())).json();
  const candidate = result.candidates[0];
  assert.equal(candidate.tracks.length, 30);
  assert.equal(candidate.trackDetails.length, 30);
  assert.deepEqual(candidate.tracks, tracks.map(x => x.trackName));
  assert.deepEqual(candidate.trackDetails[15], { title: 'Track 16', position: '16', discNumber: 2, trackNumber: 1, lengthMillis: 120015, providerId: '1015', source: 'iTunes Search' });
  assert.equal(candidate.metadataCompleteness.trackCountMatches, true);
});

test('catalog deadline remains active during stalled enrichment and returns honest partial metadata', async (t) => {
  const { searchCatalog } = await import('../catalog-search.mjs');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reachedLookup;
  const lookupStarted = new Promise(resolve => { reachedLookup = resolve; });
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (options.signal.aborted) throw options.signal.reason;
    if (url.pathname === '/search') return response(url.searchParams.get('entity') === 'album' ? [album] : []);
    reachedLookup();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  const pending = searchCatalog(params());
  await lookupStarted;
  t.mock.timers.tick(15001);
  const result = await (await pending).json();
  assert.equal(result.candidates.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.candidates[0].metadataCompleteness.hasTracks, false);
  assert.equal(result.candidates[0].metadataCompleteness.trackCountMatches, false);
});

test('MusicBrainz fallback cannot mark a mismatched release track count complete', async (t) => {
  const { searchCatalog } = await import('../catalog-search.mjs');
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'itunes.apple.com') {
      if (url.pathname === '/search') return response(url.searchParams.get('entity') === 'album' ? [album] : []);
      return response([album]);
    }
    const { version: appVersion } = require('../package.json');
    assert.equal(options.headers['User-Agent'], `FlowCabin/${appVersion} (https://github.com/ooooooomygosh/Flow-Cabin)`);
    if (url.pathname === '/ws/2/release/') return Response.json({ releases: [{ id: 'release-example', title: album.collectionName, 'artist-credit': [{ name: album.artistName }], score: 100 }] });
    return Response.json({ id: 'release-example', media: [{ position: 1, tracks: [{ title: 'One track', position: 1, number: '1' }] }] });
  });
  const result = await (await searchCatalog(params())).json();
  assert.equal(result.candidates[0].tracks.length, 1);
  assert.equal(result.candidates[0].metadataCompleteness.hasTracks, true);
  assert.equal(result.candidates[0].metadataCompleteness.trackCountMatches, false);
});
