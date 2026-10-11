'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleQQUserPlaylists } = require('../music-upstream.cjs');
// Synthetic credentials and HTTP replies only; never use a real profile.
const cookie = 'uin=123456; qqmusic_key=fixture-only';
const empty = { code: 0, data: { disslist: [] } };
const likedOK = { code: 0, playlist: { code: 0, data: { dirinfo: { title: '我喜欢的音乐', songnum: 0 }, songlist: [] } } };
function requests(t, { profile = { code: 0, data: { creator: { nick: 'fixture' } } }, created = empty, collected = { code: 0, data: { cdlist: [] } }, liked = likedOK, offline = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('fcg_get_profile_homepage')) return Response.json(profile);
    if (String(url).includes('fcg_user_created_diss')) {
      if (offline) throw new Error('fixture transport failure');
      return Response.json(created);
    }
    if (String(url).includes('fcg_get_profile_order_asset')) return Response.json(collected);
    if (String(url).includes('musicu.fcg')) {
      const body = JSON.parse(options.body);
      assert.equal(body.playlist.param.dirid, 201); assert.equal(body.playlist.param.disstid, 0);
      if (liked === null) throw new Error('fixture liked unavailable');
      return Response.json(liked);
    }
    throw new Error('Unexpected fixture request');
  });
  return calls;
}
test('QQ: absent liked entry uses validated same-account fallback, including genuinely empty likes', async t => {
  requests(t); const r = await handleQQUserPlaylists(cookie);
  assert.equal(r.loggedIn, true); assert.equal(r.warning, '');
  assert.equal(r.playlists.length, 1); assert.equal(r.playlists[0].id, 'qq-liked:201'); assert.equal(r.playlists[0].trackCount, 0);
});
test('QQ: transport failure preserves confirmed liked list with explicit partial warning', async t => {
  requests(t, { offline: true }); const r = await handleQQUserPlaylists(cookie);
  assert.match(r.warning, /自建歌单未能读取/); assert.equal(r.playlists[0].id, 'qq-liked:201');
});
test('QQ: HTTP 200 API denial is not a confirmed empty category', async t => {
  requests(t, { created: { code: 1000, data: { disslist: [] } } }); const r = await handleQQUserPlaylists(cookie);
  assert.match(r.warning, /自建歌单未能读取/);
});
test('QQ: malformed collected response remains a visible partial failure', async t => {
  requests(t, { collected: { code: 0, data: {} } }); const r = await handleQQUserPlaylists(cookie);
  assert.match(r.warning, /收藏歌单未能读取/);
});
test('QQ: all unavailable categories fail instead of returning successful empty library', async t => {
  requests(t, { offline: true, collected: {}, liked: null }); await assert.rejects(handleQQUserPlaylists(cookie), /读取失败/);
});
test('QQ: malformed liked payload never fabricates an empty favourite', async t => {
  requests(t, { liked: { code: 0, playlist: { code: 0, data: {} } } }); const r = await handleQQUserPlaylists(cookie);
  assert.deepEqual(r.playlists, []); assert.match(r.warning, /我喜欢的音乐未能读取/);
});
test('QQ: explicit expired profile overrides a locally stored cookie', async t => {
  const calls = requests(t, { profile: { code: 1000 } }); const r = await handleQQUserPlaylists(cookie);
  assert.equal(r.loggedIn, false); assert.equal(calls.length, 1);
});
test('QQ: liked endpoint authentication rejection requests sign-in', async t => {
  requests(t, { liked: { code: 0, playlist: { code: 1000 } } }); const r = await handleQQUserPlaylists(cookie);
  assert.equal(r.loggedIn, false);
});
test('QQ: valid created liked entry avoids duplicate fallback request', async t => {
  const calls = requests(t, { created: { code: 0, data: { disslist: [{ dirid: 201, diss_name: '我喜欢', tid: '991' }] } } });
  const r = await handleQQUserPlaylists(cookie); assert.equal(r.playlists.filter(p => p.id === 'qq-liked:201').length, 1);
  assert.equal(calls.some(u => u.includes('musicu.fcg')), false);
});

test('QQ: absent or mismatched favourite metadata cannot fabricate the liked list', async t => {
  for (const dirinfo of [{}, { dirid: 99, title: 'Wrong list' }]) {
    requests(t, { liked: { code: 0, playlist: { code: 0, data: { dirinfo, songlist: [] } } } });
    const r = await handleQQUserPlaylists(cookie); assert.deepEqual(r.playlists, []); assert.match(r.warning, /我喜欢的音乐未能读取/);
    t.mock.restoreAll();
  }
});
