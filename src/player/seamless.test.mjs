import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolutionCache, createFader, resolutionKey, shouldAutoSkip, playbackErrorMessage, AUTO_SKIP_LIMIT } from './playback-cache.mjs';
import { nextStep, nextPlayableStep } from './player-queue.mjs';
import { crossfadeSeconds, setCrossfadeSeconds, crossfadeStartsAt } from './crossfade.mjs';
import { findPlayableSource, rankCandidates, exactTrack, trackArtist } from '../room-playback.mjs';

test('seamless: prefetched resolutions are used once and expire', () => {
  let time = 0; const cache = createResolutionCache({ now: () => time, ttl: 1000, limit: 2 });
  const item = { id: 'a', tracks: ['x', 'y'] };
  const key = resolutionKey('auto', item, 1);
  assert.ok(key); assert.notEqual(key, resolutionKey('qq', item, 1));
  cache.put(key, { id: 'c' }, { audioPath: '/desktop-music/audio/1' });
  cache.put('remote', { id: 'r' }, { remote: true });
  assert.equal(cache.has('remote'), false, 'a remote (Music Assistant) start is never cached');
  assert.equal(cache.take(key).candidate.id, 'c');
  assert.equal(cache.take(key), null, 'a stream id is single use');
  cache.put(key, { id: 'c' }, { audioPath: '/a' }); time = 1500; assert.equal(cache.take(key), null, 'stale entries expire');
  cache.put('1', {}, { audioPath: '/1' }); cache.put('2', {}, { audioPath: '/2' }); cache.put('3', {}, { audioPath: '/3' });
  assert.equal(cache.size, 2); assert.equal(cache.has('1'), false);
});

test('seamless: fader ramps smoothly and can be interrupted', async () => {
  let clock = 0; const frames = []; const applied = [];
  const fader = createFader({ apply: (gain) => applied.push(Math.round(gain * 100) / 100), frame: (fn) => { frames.push(fn); return frames.length; }, cancel: () => {}, clock: () => clock });
  fader.set(0); assert.equal(fader.gain, 0);
  const done = fader.to(1, 100);
  for (const t of [25, 50, 75, 100]) { clock = t; frames.shift()(); }
  await done;
  assert.equal(fader.gain, 1);
  assert.deepEqual(applied, [0, 0.16, 0.5, 0.84, 1]);
  const pending = fader.to(0, 100); fader.stop(); await pending; // stop settles the promise
  await fader.to(0.5, 0); assert.equal(fader.gain, 0.5);
});

test('seamless: unplayable tracks are skipped a limited number of times', () => {
  assert.equal(shouldAutoSkip({ status: 'error', error: '匹配的音源暂时不可播放。', canNext: true }), true);
  assert.equal(shouldAutoSkip({ status: 'error', error: '请点击播放按钮开始播放。', canNext: true }), false);
  assert.equal(shouldAutoSkip({ status: 'error', error: 'x', canNext: false }), false);
  assert.equal(shouldAutoSkip({ status: 'error', error: 'x', canNext: true, consecutive: AUTO_SKIP_LIMIT }), false);
  assert.equal(shouldAutoSkip({ status: 'playing', error: '', canNext: true }), false);
  assert.equal(playbackErrorMessage({ name: 'NotSupportedError', message: 'Failed to load because no supported source was found.' }), '音源地址已失效或格式不受支持，可以重试或换一个音源。');
  assert.equal(playbackErrorMessage({ name: 'AbortError' }), '');
});

test('seamless: the upcoming shuffle pick is decided once', () => {
  let calls = 0; const random = () => { calls++; return 0.5; };
  const step = nextStep({ trackIndex: 0, trackCount: 5, queue: { ids: [], repeat: 'off', shuffle: true }, random });
  assert.deepEqual(step, { type: 'track', index: 3 }); assert.equal(calls, 1);
});

test('playlists: each track keeps its own artist, album and platform id', async () => {
  const playlist = { id: 'p', type: 'playlist', title: '深夜', artist: '我', tracks: ['晴天', 'From The Start', 'Aruarian Dance'], trackDetails: [
    { title: '晴天', source: 'netease', providerId: '186016', artist: '周杰伦', album: '叶惠美' },
    { title: 'From The Start', source: 'qq', providerId: '0039MnYb0qxYhV', mediaMid: '0039MnYb0qxYhV', artist: 'Laufey', album: 'Bewitched' },
    { title: 'Aruarian Dance', source: 'apple', providerId: '1440942199', artist: 'Nujabes', album: 'Modal Soul' }
  ] };
  assert.equal(trackArtist(playlist, 0), '周杰伦');
  assert.deepEqual(exactTrack(playlist, 0, 'netease'), { id: '186016', provider: 'netease', title: '晴天', artist: '周杰伦', album: '叶惠美' });
  assert.equal(exactTrack(playlist, 0, 'qq'), null, 'a NetEase id is never sent to QQ');
  assert.equal(exactTrack(playlist, 1, 'qq').artist, 'Laufey');
  assert.equal(exactTrack(playlist, 2, 'qq'), null, 'an Apple catalog id is not a QQ mid');
  const ranked = rankCandidates([{ id: 'a', title: 'Aruarian Dance', artist: 'Nujabes', album: 'Modal Soul' }, { id: 'b', title: 'Aruarian Dance', artist: '我' }], playlist, 2);
  assert.deepEqual(ranked.map((c) => c.id), ['a']);
  const queries = [];
  const result = await findPlayableSource({ record: playlist, index: 0, provider: 'auto', request: async (path, body) => { queries.push(path === '/resolve' ? `resolve:${body.provider}:${body.id}` : decodeURIComponent(path)); if (path === '/resolve') return { audioPath: '/x' }; return { candidates: [] }; }, play: async () => {} });
  assert.equal(result.candidate.provider, 'netease');
  assert.deepEqual(queries, ['resolve:netease:186016'], 'a NetEase playlist track tries 网易云 first, by id');
  queries.length = 0;
  await findPlayableSource({ record: playlist, index: 2, provider: 'auto', request: async (path) => { queries.push(decodeURIComponent(path)); return { candidates: [] }; }, play: async () => {} });
  assert.deepEqual(queries, ['/search?provider=qq&query=Nujabes Aruarian Dance', '/search?provider=netease&query=Nujabes Aruarian Dance']);
});


test('seamless: metadata changes cannot consume another recording’s prefetched stream', () => {
  const item = { id: 'p', type: 'playlist', tracks: ['Hello'], trackDetails: [{ artist: 'First singer', source: 'netease', providerId: '1' }] };
  const cache = createResolutionCache(), key = resolutionKey('auto', item, 0);
  cache.put(key, { id: '1' }, { audioPath: '/first-recording' });
  const edited = { ...item, trackDetails: [{ artist: 'Second singer', source: 'netease', providerId: '2' }] };
  assert.equal(cache.take(resolutionKey('auto', edited, 0)), null);
  assert.equal(cache.take(key).result.audioPath, '/first-recording');
  assert.equal(resolutionKey('auto', item, 99), '');
});

test('matching: a platform refusing searches is named, not hidden behind another platform\'s clean miss', async () => {
  const record = { id: 'r', type: 'album', title: '黑色柳丁', artist: '陶喆', tracks: ['月亮代表誰的心'] };
  const paths = [];
  const request = async (path) => { paths.push(decodeURIComponent(path)); if (path.includes('provider=qq')) throw new Error('QQ 音乐搜索暂时不可用（2001），稍后会自动重试。'); return { candidates: [] }; };
  const result = await findPlayableSource({ record, index: 0, provider: 'auto', request, play: async () => {} });
  assert.equal(result.error, 'QQ 音乐搜索暂时不可用（2001），稍后会自动重试。 网易云没有找到这首歌。');
  // After QQ refuses once, its other spellings are not searched again; 网易云 tries both.
  assert.deepEqual(paths.filter((path) => path.includes('provider=qq')), ['/search?provider=qq&query=陶喆 月亮代表谁的心']);
  assert.equal(paths.filter((path) => path.includes('provider=netease')).length, 2);
});

test('queue: tracks whose early match failed are stepped over, in order and in shuffle', () => {
  const queue = { ids: [], repeat: 'off', shuffle: false };
  assert.deepEqual(nextPlayableStep({ trackIndex: 0, trackCount: 4, queue, blocked: (index) => index === 1 }), { type: 'track', index: 2 });
  assert.deepEqual(nextPlayableStep({ trackIndex: 0, trackCount: 4, queue, blocked: (index) => index > 0 }), { type: 'track', index: 1 }, 'nothing left: the plain step');
  assert.deepEqual(nextPlayableStep({ trackIndex: 2, trackCount: 4, queue: { ...queue, repeat: 'all' }, blocked: (index) => index === 3 }), { type: 'track', index: 0 });
  assert.deepEqual(nextPlayableStep({ trackIndex: 2, trackCount: 4, queue: { ...queue, ids: ['next-album'] }, blocked: (index) => index === 3 }), { type: 'album', id: 'next-album' });
  assert.deepEqual(nextPlayableStep({ trackIndex: 0, trackCount: 4, queue: { ...queue, repeat: 'one' }, blocked: () => true }), { type: 'restart' });
  const shuffled = nextPlayableStep({ trackIndex: 0, trackCount: 4, queue: { ...queue, shuffle: true }, random: () => 0, blocked: (index) => index === 1 });
  assert.deepEqual(shuffled, { type: 'track', index: 2 });
});

test('crossfade: setting is stored, and short songs never overlap', () => {
  const store = new Map(), storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(crossfadeSeconds(storage), 0);
  assert.equal(setCrossfadeSeconds(6, storage), 6); assert.equal(crossfadeSeconds(storage), 6);
  assert.equal(setCrossfadeSeconds(99, storage), 0, 'unknown values fall back to no overlap');
  assert.equal(crossfadeStartsAt(200, 6), 194); assert.equal(crossfadeStartsAt(15, 6), Infinity); assert.equal(crossfadeStartsAt(NaN, 3), Infinity); assert.equal(crossfadeStartsAt(200, 0), Infinity);
});
