import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, rankForAutoplay, createMatchMemory, matchKey, AUTO_MATCH_THRESHOLD, AUTO_MATCH_ATTEMPTS } from './auto-match.mjs';
import { findPlayableSource } from '../room-playback.mjs';
import { localAppTarget, listSources, getSourceStatus, requestPermission, testPlayback, connectSource } from './sources.mjs';

const want = { title: '晴天', artist: 'Jay Chou', album: '叶惠美', duration: 269000 };
const c = (id, extra = {}) => ({ id, provider: 'qq', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269000, ...extra });

test('auto-match: cross-script artist plays when album and duration agree (the 重新匹配 case)', () => {
  assert.ok(scoreCandidate(c('a'), want) >= AUTO_MATCH_THRESHOLD);
  assert.equal(scoreCandidate(c('b', { album: '', duration: 0 }), want) < AUTO_MATCH_THRESHOLD, true, 'title alone is not enough when the artist cannot be compared');
  assert.equal(scoreCandidate(c('c', { artist: '另一位歌手' }), { ...want, artist: '周杰伦' }), 0, 'a different artist in the same script is rejected');
  assert.equal(scoreCandidate(c('d', { title: '晴天 (Live)' }), want), 0, 'live is never substituted');
  assert.ok(scoreCandidate(c('e', { title: '晴天 (2015 Remaster)', artist: 'Jay Chou' }), want) >= AUTO_MATCH_THRESHOLD, 'remaster decoration is the same recording');
  assert.ok(scoreCandidate(c('f', { duration: 200000 }), want) < scoreCandidate(c('g'), want), 'a far-off duration ranks lower');
});

test('auto-match: ranking prefers album + duration, keeps order on ties', () => {
  const ranked = rankForAutoplay([c('other-album', { album: '精选', artist: 'Jay Chou' }), c('exact', { artist: 'Jay Chou' }), c('wrong', { artist: 'Someone Else' })], want);
  assert.deepEqual(ranked.map((x) => x.id), ['exact', 'other-album']);
});

const memoryStore = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };
const record = { id: 'r1', type: 'album', title: '叶惠美', artist: 'Jay Chou', tracks: ['晴天', '以父之名'], trackDetails: [{ title: '晴天', lengthMillis: 269000, source: 'apple' }, { title: '以父之名', lengthMillis: 342000, source: 'apple' }] };

test('fallback: the stored source fails → rematch → best candidate plays, then next candidate', async () => {
  const memory = createMatchMemory(memoryStore()), resolved = [];
  memory.put(matchKey(record, 0), { id: 'stale', provider: 'qq', title: '晴天' });
  const result = await findPlayableSource({ record, index: 0, provider: 'qq', memory,
    request: async (path, body) => { if (path === '/resolve') { resolved.push(body.id); if (body.id === 'stale' || body.id === 'vip') throw new Error('会员'); return { audioPath: '/a' }; } return { candidates: path.includes('provider=qq') ? [c('vip', { artist: 'Jay Chou' }), c('ok'), c('karaoke', { title: '晴天 (伴奏)' })] : [] }; },
    play: async () => {} });
  assert.deepEqual(resolved, ['stale', 'vip', 'ok']);
  assert.equal(result.candidate.id, 'ok');
  assert.equal(memory.get(matchKey(record, 0)).id, 'ok', 'the working match is cached for next time');
  resolved.length = 0;
  const again = await findPlayableSource({ record, index: 0, provider: 'qq', memory, request: async (path, body) => { resolved.push(path === '/resolve' ? body.id : 'search'); return { audioPath: '/a' }; }, play: async () => {} });
  assert.equal(again.remembered, true); assert.deepEqual(resolved, ['ok'], 'second play skips the search');
});

test('fallback: nothing playable returns an honest error with the candidates (deck then auto-skips)', async () => {
  const result = await findPlayableSource({ record, index: 1, provider: 'qq', request: async (path) => { if (path === '/resolve') throw new Error('版权'); return { candidates: [c('x', { title: '以父之名', album: '叶惠美', duration: 342000 })] }; }, play: async () => { throw new Error('must not play'); } });
  assert.equal(result.candidate, undefined);
  assert.match(result.error, /暂时不可播放/);
  assert.equal(result.candidates.length, 2);
});

test('match memory is bounded and ignores session files', () => {
  const memory = createMatchMemory(memoryStore(), 2);
  memory.put('a', { id: '1', provider: 'qq' }); memory.put('b', { id: '2', provider: 'qq' }); memory.put('c', { id: '3', provider: 'qq' }); memory.put('d', { sessionUrl: 'blob:x', id: '4', provider: 'local' });
  assert.equal(memory.size, 2); assert.equal(memory.get('a'), null);
});

test('local app hand-off only after a failure, with the platform id when known', () => {
  assert.equal(localAppTarget({ record, index: 0, provider: 'qq', status: 'playing' }), null);
  const qq = localAppTarget({ record, index: 0, provider: 'qq', status: 'error', candidates: [c('0039MnYb0qxYhV')] });
  assert.deepEqual(qq, { provider: 'qq', id: '0039MnYb0qxYhV', query: 'Jay Chou 晴天', label: '在 QQ 音乐中打开' });
  const ne = localAppTarget({ record: { ...record, trackDetails: [{ source: 'netease', providerId: '186016' }] }, index: 0, provider: 'auto', status: 'error' });
  assert.equal(ne.provider, 'netease'); assert.equal(ne.id, '186016');
  assert.equal(localAppTarget({ record, index: 0, provider: 'local', status: 'error' }), null);
});

test('onboarding API: list, status, permission, connect and test playback', async () => {
  assert.equal(listSources({ mac: false }).find((s) => s.id === 'appleMusic').supported, false);
  assert.equal(listSources({ mac: true }).find((s) => s.id === 'appleMusic').supported, true);
  const request = async (path) => ({ '/config': { qqLoggedIn: true, neteaseLoggedIn: false }, '/apple/permission': { available: true, granted: false, needsPermission: true, error: '请允许' } })[path];
  assert.equal((await getSourceStatus('qq', { request })).connected, true);
  assert.equal((await getSourceStatus('netease', { request })).connected, false);
  assert.deepEqual(await requestPermission('appleMusic', { request }), { granted: false, needsPermission: true, available: true, error: '请允许' });
  const target = new EventTarget(); let sent;
  const pending = connectSource('qq', { target, command: (cmd, params) => { sent = [cmd, params]; } });
  target.dispatchEvent(Object.assign(new Event('album-music-account'), { detail: { ok: true } }));
  assert.deepEqual(await pending, { ok: true, cancelled: false, error: '' }); assert.deepEqual(sent, ['music-login', { provider: 'qq' }]);
  const audio = { play: async () => {}, pause() {}, removeAttribute() {}, load() {} };
  const ok = await testPlayback({ provider: 'qq', seconds: 0, createAudio: () => audio, request: async (path) => path === '/resolve' ? { audioPath: '/a', quality: '320k MP3' } : { candidates: [c('t', { artist: '周杰伦' })] } });
  assert.deepEqual(ok, { ok: true, provider: 'qq', quality: '320k MP3', title: '晴天' });
  const bad = await testPlayback({ provider: 'qq', seconds: 0, createAudio: () => ({ ...audio, play: async () => { throw new Error('blocked'); } }), request: async (path) => path === '/resolve' ? { audioPath: '/a' } : { candidates: [c('t', { artist: '周杰伦' })] } });
  assert.equal(bad.ok, false, 'never reports success unless audio played');
});

test('本地音乐 试听 plays the first song of the local library, or a chime when it is empty', async () => {
  const audio = { play: async () => {}, pause() {}, removeAttribute() {}, load() {} };
  const library = { albums: [{ id: 'empty', title: '空', artist: 'x', tracks: [] }, { id: 'a1', title: '旧唱片', artist: '我', tracks: [{ id: '0123456789abcdef', title: '第一首', duration: 120 }] }] };
  let tried;
  const find = async ({ record, play }) => { tried = record; await play({ provider: 'local', title: record.tracks[0] }, { audioPath: '/local/a' }); return {}; };
  const ok = await testPlayback({ provider: 'local', seconds: 0, createAudio: () => audio, find, request: async (path) => path === '/local/albums' ? library : {} });
  assert.equal(ok.ok, true); assert.equal(ok.title, '第一首'); assert.equal(tried.trackDetails[0].providerId, '0123456789abcdef');
  let chimed = 0;
  const empty = await testPlayback({ provider: 'local', seconds: 0, createAudio: () => audio, find, chime: () => { chimed++; return { ok: true, kind: 'chime' }; }, request: async () => ({ albums: [] }) });
  assert.equal(chimed, 1); assert.equal(empty.ok, true); assert.equal(empty.kind, 'chime');
  const offline = await testPlayback({ provider: 'local', seconds: 0, find, request: async () => { throw new Error('读不到'); } });
  assert.deepEqual([offline.ok, offline.error], [false, '读不到']);
});

test('one provider table names every deck source', async () => {
  const { PROVIDERS, DECK_PROVIDERS, providerLabel, isDeckProvider, SOURCES } = await import('./sources.mjs');
  assert.deepEqual(DECK_PROVIDERS, ['visual', 'auto', 'qq', 'netease', 'local', 'appleMusic', 'ma', 'system']);
  assert.ok(PROVIDERS.every((provider) => provider.label && provider.short));
  assert.equal(providerLabel('appleMusic'), 'Apple Music（音乐 App）'); assert.equal(providerLabel('ma', 'short'), '家庭播放器'); assert.equal(providerLabel('spotify'), '自动匹配');
  assert.equal(isDeckProvider('visual'), true); assert.equal(isDeckProvider('spotify'), false);
  assert.deepEqual(SOURCES.map((source) => source.id), ['qq', 'netease', 'local', 'appleMusic', 'ma', 'system']);
});


test('match memory: same-title metadata edits invalidate the remembered recording', () => {
  const playlist = { id: 'mix', type: 'playlist', title: 'Mix', artist: 'Curator', tracks: ['Hello'], trackDetails: [{ artist: 'Artist A', album: 'First', source: 'netease', providerId: '11', lengthMillis: 180000 }] };
  const key = matchKey(playlist, 0), memory = createMatchMemory(memoryStore());
  memory.put(key, { id: '11', provider: 'netease' });
  for (const patch of [{ artist: 'Artist B' }, { album: 'Second' }, { providerId: '22' }, { source: 'apple' }, { lengthMillis: 200000 }, { mediaMid: '0039MnYb0qxYhV' }]) {
    const edited = { ...playlist, trackDetails: [{ ...playlist.trackDetails[0], ...patch }] };
    assert.notEqual(matchKey(edited, 0), key); assert.equal(memory.get(matchKey(edited, 0)), null);
  }
  assert.equal(matchKey({ ...playlist, artist: 'New curator', title: 'Renamed list' }, 0), key);
  assert.equal(matchKey({ ...playlist, tracks: [{ title: 'Hello' }] }, 0), key);
  assert.equal(matchKey(playlist, 1), ''); assert.equal(matchKey(null, 0), '');
});
test('playlists: a curator is never used as the missing song artist', async () => {
  const { trackArtist, wantedTrack, exactTrack } = await import('../room-playback.mjs');
  const playlist = { id: 'mix', type: 'playlist', title: 'Night', artist: 'Playlist owner', tracks: ['Hello'], trackDetails: [{ title: 'Hello', source: 'apple', artist: '', album: 'First' }] };
  assert.equal(trackArtist(playlist, 0), '');
  assert.deepEqual(wantedTrack(playlist, 0), { title: 'Hello', artist: '', album: 'First', duration: 0 });
  const queries = [];
  await findPlayableSource({ record: playlist, index: 0, provider: 'auto', request: async path => { queries.push(decodeURIComponent(path)); return { candidates: [] }; }, play: async () => {} });
  assert.ok(queries.every(query => !query.includes('Playlist owner')));
  assert.equal(trackArtist({ ...playlist, type: 'album' }, 0), 'Playlist owner');
  assert.equal(exactTrack({ ...playlist, trackDetails: [{ title: 'Hello', artist: 'Actual artist', source: 'local', providerId: 'abcdef0123456789' }] }, 0, 'local').artist, 'Actual artist');
});
test('fallback: an aborted exact or remembered resolution never starts another request', async () => {
  for (const remembered of [false, true]) {
    const track = { ...record, trackDetails: [{ title: '晴天', source: 'netease', providerId: '186016' }] };
    const memory = createMatchMemory(memoryStore());
    if (remembered) memory.put(matchKey(track, 0), { id: 'saved', provider: 'netease', title: '晴天' });
    const requests = [];
    const result = await findPlayableSource({ record: track, index: 0, provider: 'auto', memory,
      request: async (path, body) => { requests.push([path, body?.id]); throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); },
      play: async () => assert.fail('cancelled resolution must not play') });
    assert.equal(result, null);
    assert.deepEqual(requests, [['/resolve', remembered ? 'saved' : '186016']]);
    if (remembered) assert.equal(memory.get(matchKey(track, 0)).id, 'saved');
  }
});
test('fallback: superseded resolutions neither play nor update match memory', async () => {
  let current = true;
  const memory = createMatchMemory(memoryStore());
  const track = { ...record, trackDetails: [{ title: '晴天', source: 'netease', providerId: '186016' }] };
  const result = await findPlayableSource({ record: track, index: 0, provider: 'auto', memory, isCurrent: () => current,
    request: async () => { current = false; return { audioPath: '/stale' }; },
    play: async () => assert.fail('superseded resolution must not play') });
  assert.equal(result, null); assert.equal(memory.size, 0);
});
test('Traditional and Simplified titles are the same recording', async () => {
  const { toSimplified, toTraditional, scriptVariants } = await import('./hanzi.mjs');
  assert.equal(toSimplified('討厭紅樓夢 黑色柳丁 為什麼'), '讨厌红楼梦 黑色柳丁 为什么');
  assert.equal(toTraditional('讨厌红楼梦 为什么'), '討厭紅樓夢 為什麼');
  assert.deepEqual(scriptVariants('Jay Chou'), ['Jay Chou']);
  const wanted = { title: '討厭紅樓夢', artist: '陶喆', album: '黑色柳丁', duration: 262000 };
  const qq = { id: 'q', provider: 'qq', title: '讨厌红楼梦', artist: '陶喆', album: '黑色柳丁', duration: 262000 };
  assert.ok(scoreCandidate(qq, wanted) >= AUTO_MATCH_THRESHOLD, 'the screenshot case: 討厭紅樓夢 → 讨厌红楼梦');
  assert.equal(scoreCandidate({ ...qq, title: '讨厌红楼梦 (现场)' }, { ...wanted, title: '討厭紅樓夢 (現場)' }) >= AUTO_MATCH_THRESHOLD, true, 'a live take matches a live take across scripts');
  assert.equal(scoreCandidate({ ...qq, title: '讨厌红楼梦 (现场)' }, wanted), 0, 'and is still never substituted for the studio one');
});
test('search tries Simplified first, then the written form, and stops once one plays', async () => {
  const album = { id: 'tw', type: 'album', title: '黑色柳丁', artist: '陶喆', tracks: ['討厭紅樓夢'], trackDetails: [{ title: '討厭紅樓夢', lengthMillis: 262000, source: 'apple' }] };
  const queries = [];
  const found = await findPlayableSource({ record: album, index: 0, provider: 'qq', play: async () => {},
    request: async (path, body) => {
      if (path === '/resolve') return { audioPath: '/a' };
      const query = new URL(path, 'http://x').searchParams.get('query'); queries.push(query);
      return { candidates: query.includes('讨厌') ? [{ id: 'hit', provider: 'qq', title: '讨厌红楼梦', artist: '陶喆', album: '黑色柳丁', duration: 262000 }] : [] };
    } });
  assert.equal(found.candidate.id, 'hit'); assert.deepEqual(queries, ['陶喆 讨厌红楼梦']);
  const misses = [];
  const none = await findPlayableSource({ record: { ...album, trackDetails: [{ title: '討厭紅樓夢' }] }, index: 0, provider: 'ma', play: async () => {},
    request: async (path) => { misses.push(new URL(path, 'http://x').searchParams.get('query')); return { candidates: [] }; } });
  assert.deepEqual(misses, ['陶喆 讨厌红楼梦', '陶喆 討厭紅樓夢', '讨厌红楼梦'], 'each written form once (Traditional = as written here), then the title alone');
  assert.match(none.error, /未找到/);
});
test('Apple Music: library first in each script, then the record\'s own catalogue song', async () => {
  const album = { id: 'tw', type: 'album', title: '黑色柳丁', artist: '陶喆', tracks: ['討厭紅樓夢'], trackDetails: [{ title: '討厭紅樓夢', lengthMillis: 262000, source: 'iTunes Search', providerId: '1440911001' }] };
  const calls = [];
  const result = await findPlayableSource({ record: album, index: 0, provider: 'appleMusic', play: async () => {},
    request: async (path, body) => { calls.push(path === '/resolve' ? `resolve:${body.id}` : new URL(path, 'http://x').searchParams.get('query')); return path === '/resolve' ? { remote: true, notice: 'opened' } : { candidates: [] }; } });
  assert.equal(result.candidate.id, '1440911001');
  assert.deepEqual(calls, ['陶喆 讨厌红楼梦', '陶喆 討厭紅樓夢', '讨厌红楼梦', 'resolve:1440911001'], 'both library forms and the title alone, then the catalogue song');
  const library = await findPlayableSource({ record: album, index: 0, provider: 'appleMusic', play: async () => {},
    request: async (path, body) => path === '/resolve' ? { remote: true, id: body.id } : { candidates: [{ id: 'ABCDEF0123456789', provider: 'appleMusic', title: '討厭紅樓夢', artist: '陶喆', album: '黑色柳丁', duration: 262000 }] } });
  assert.equal(library.candidate.id, 'ABCDEF0123456789', 'a library copy is preferred: it plays without a click');
  const manual = { ...album, trackDetails: [{ title: '討厭紅樓夢', lengthMillis: 262000 }] }, scopes = [];
  const searched = await findPlayableSource({ record: manual, index: 0, provider: 'appleMusic', play: async () => {},
    request: async (path) => { if (path === '/resolve') return { remote: true }; const url = new URL(path, 'http://x'); scopes.push(url.searchParams.get('scope')); return { candidates: url.searchParams.get('scope') === 'catalog' ? [{ id: '1440911001', provider: 'appleMusic', title: '讨厌红楼梦', artist: '陶喆', album: '黑色柳丁', duration: 262000 }] : [] }; } });
  assert.equal(searched.candidate.id, '1440911001'); assert.deepEqual(scopes, [null, null, null, 'catalog']);
});
test('Traditional theme and opening-credit suffixes normalize before decoration removal', () => {
  for (const suffix of ['主題曲', '片頭曲']) {
    assert.ok(scoreCandidate({ title: '无题', artist: '歌手', album: '专辑', duration: 200000 },
      { title: `無題（電影《某某》${suffix}）`, artist: '歌手', album: '專輯', duration: 200000 }) >= AUTO_MATCH_THRESHOLD);
  }
});
test('native imported single preserves its exact iTunes track ID', async () => {
  const { normalizeItem } = await import('../../desktop/collection-store.cjs');
  const song = normalizeItem({ id: 'single', type: 'song', title: '所选歌曲', artist: '原歌手', albumTitle: '专辑', trackTimeMillis: 200000, tracks: ['所选歌曲'], trackDetails: [], externalIds: { itunesTrackId: '1234567890' } });
  const calls = [], resolved = [];
  const request = async (path, body) => {
    calls.push(path);
    if (path === '/resolve') { resolved.push(body.id); if (body.id === '1234567890') { assert.equal(body.album, '专辑'); assert.equal(body.duration, 200000); } return { remote: true, catalog: true }; }
    return { candidates: path.includes('scope=catalog') ? [{ id: '9876543210', title: '所选歌曲', artist: '原歌手', provider: 'appleMusic' }] : [] };
  };
  await findPlayableSource({ record: song, index: 0, provider: 'appleMusic', request, play: async () => {} });
  assert.deepEqual(resolved, ['1234567890']); assert.equal(calls.some(p => p.includes('scope=catalog')), false);
  calls.length = 0; resolved.length = 0;
  await findPlayableSource({ record: { ...song, type: 'album' }, index: 0, provider: 'appleMusic', request, play: async () => {} });
  assert.equal(calls.some(p => p.includes('scope=catalog')), true, 'an album cannot use a single-level song ID');
});
test('script variants share one resolve budget per provider', async () => {
  const resolutions = [], searches = [], record = { id: 'variants', title: '示例', artist: '演示歌手', tracks: ['裏面的歌'] };
  await findPlayableSource({ record, index: 0, provider: 'qq', play: async () => {}, request: async (path, body) => {
    if (path === '/resolve') { resolutions.push(body.provider); throw new Error('fixture unavailable'); }
    const provider = new URL(path, 'http://fixture').searchParams.get('provider'); searches.push(provider);
    return { candidates: [0,1].map(i => ({ id: `${searches.length}-${i}`, provider, title: '里面的歌', artist: '演示歌手', album: '示例' })) };
  } });
  assert.deepEqual(resolutions, [...Array(AUTO_MATCH_ATTEMPTS).fill('qq'), ...Array(AUTO_MATCH_ATTEMPTS).fill('netease')]);
  assert.deepEqual(searches, ['qq', 'qq', 'netease', 'netease']);
});
test('catalog handoff never binds paused or playing unrelated recordings', async () => {
  const { bindAppleHandoff } = await import('./apple-handoff.mjs');
  const target = { title: '所選歌曲', artist: '歌手', album: '專輯', duration: 200000 };
  const own = { id: 'ABCDEF0123456789', title: '所选歌曲', artist: '歌手', album: '专辑', duration: 200, elapsed: 8 };
  for (const state of ['paused', 'playing']) {
    assert.equal(bindAppleHandoff(target, { ...own, state, title: '另一首歌' }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, title: '所选歌曲 (Live)' }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, album: '另一版' }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, artist: '' }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, duration: 240 }), null);
    for (const incomplete of [{ album: '' }, { duration: 0 }, { duration: Infinity }]) assert.equal(bindAppleHandoff({ ...target, ...incomplete }, { ...own, state }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, album: 'Live Tour', duration: 200 }), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, album: '专辑', duration: 280 }), null);
    assert.deepEqual(bindAppleHandoff(target, { ...own, state }), { id: own.id, title: own.title, artist: own.artist, album: own.album });
    assert.equal(bindAppleHandoff(target, { ...own, state, id: '0123456789ABCDEF' }, own), null);
    assert.equal(bindAppleHandoff(target, { ...own, state, id: '' }), null);
  }
  assert.equal(bindAppleHandoff(target, { ...own, state: 'stopped' }), null);
});
