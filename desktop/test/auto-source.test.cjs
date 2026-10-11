const { test } = require('node:test');
const assert = require('node:assert/strict');
const playback = import('../../src/room-playback.mjs');
const record = { title: '叶惠美', artist: '周杰伦', tracks: ['晴天', '懦夫'], trackDetails: [{ providerId: '00312345678901' }, { providerId: '00312345678902' }] };
const match = (id, extra = {}) => ({ id, provider: 'netease', title: '晴天', artist: '周杰伦', album: '叶惠美', ...extra });

test('automatic matching excludes other artists, covers and live versions', async () => {
  const { rankCandidates } = await playback;
  assert.deepEqual(rankCandidates([match('live', { title: '晴天（现场版）' }), match('other', { artist: '另一位歌手' }), match('album', { album: '精选' }), match('original')], record, 0).map(x => x.id), ['original', 'album']);
  assert.equal(rankCandidates([match('studio')], { ...record, tracks: ['晴天（现场版）'] }, 0).length, 0);
  assert.equal(rankCandidates([match('impersonator', { artist: '周杰伦翻唱歌手' })], record, 0).length, 0);
  assert.equal(rankCandidates([match('collaboration', { artist: '周杰伦 & 另一位歌手' })], record, 0).length, 1);
});
test('an unavailable original ID falls back across providers and skips unplayable candidates', async () => {
  const { findPlayableSource } = await playback, attempted = [], played = [];
  const result = await findPlayableSource({ record, index: 0, provider: 'auto', request: async (path, body) => {
    if (path === '/resolve') { attempted.push(body.id); if (body.id !== 'playable') throw new Error('会员权限'); return { audioPath: '/test.wav' }; }
    return { candidates: path.includes('provider=qq') ? [] : [match('unavailable'), match('playable'), match('live', { title: '晴天（Live）' })] };
  }, play: async (candidate) => played.push(candidate.id) });
  assert.deepEqual(attempted, ['00312345678901', 'unavailable', 'playable']);
  assert.deepEqual(played, ['playable']); assert.equal(result.candidate.id, 'playable');
});
test('a failed media stream tries the next verified recording', async () => {
  const { findPlayableSource } = await playback, played = [];
  const result = await findPlayableSource({ record, index: 0, provider: 'netease', request: async (path) => path === '/resolve' ? { audioPath: '/stream' } : { candidates: [match('bad-stream'), match('good-stream')] }, play: async (candidate) => { played.push(candidate.id); if (candidate.id === 'bad-stream') throw new Error('invalid audio'); } });
  assert.deepEqual(played, ['bad-stream', 'good-stream']); assert.equal(result.candidate.id, 'good-stream');
});
test('switching track invalidates a delayed old source before it can play', async () => {
  const { findPlayableSource } = await playback;
  let current = true, release, plays = 0;
  const pending = findPlayableSource({ record, index: 0, provider: 'qq', isCurrent: () => current, request: () => new Promise(resolve => { release = resolve; }), play: async () => plays++ });
  current = false; release({ audioPath: '/stale.wav' }); await pending; assert.equal(plays, 0);
});
test('a dropdown-selected album track resolves its own ID rather than the previous track', async () => {
  const { findPlayableSource } = await playback; let resolved;
  const result = await findPlayableSource({ record, index: 1, provider: 'auto', request: async (_path, candidate) => { resolved = candidate.id; return {}; }, play: async () => {} });
  assert.equal(resolved, record.trackDetails[1].providerId); assert.equal(result.candidate.title, '懦夫');
});

test('a browser gesture restriction stops matching instead of trying more recordings', async () => {
  const { findPlayableSource } = await playback; let attempts = 0;
  await assert.rejects(findPlayableSource({ record, index: 0, provider: 'netease', request: async path => path === '/resolve' ? {} : { candidates: [match('first'), match('second')] }, play: async () => { attempts++; const error = new Error('gesture required'); error.name = 'NotAllowedError'; throw error; } }), { name: 'NotAllowedError' });
  assert.equal(attempts, 1);
});

test('a recovered legacy QQ exact id plays without searching or changing the saved record', async () => {
  const { findPlayableSource } = await playback, calls = [], before = structuredClone(record);
  const result = await findPlayableSource({ record, index: 0, provider: 'qq', request: async (path, candidate) => { calls.push([path, candidate.provider, candidate.id, candidate.mediaMid]); return { audioPath: '/recovered.wav' }; }, play: async candidate => assert.equal(candidate.id, record.trackDetails[0].providerId) });
  assert.equal(result.candidate.provider, 'qq'); assert.deepEqual(calls, [['/resolve', 'qq', record.trackDetails[0].providerId, '']]); assert.deepEqual(record, before);
});
