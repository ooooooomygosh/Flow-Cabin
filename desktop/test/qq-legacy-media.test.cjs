'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { getQQMediaMid } = require('../music-upstream.cjs');
const id = '001n4C3p1yv0FU', media = '0025nWDH4PCVfs';
test('QQ metadata recovery uses the exact song id and requires matching returned identity', async t => {
  let track = { mid: id, file: { media_mid: media } }, code = 0, calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.equal(url, 'https://u.y.qq.com/cgi-bin/musicu.fcg');
    const request = JSON.parse(options.body); assert.deepEqual(request.songinfo, { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { song_mid: id } });
    return Response.json({ code: 0, songinfo: { code, data: { track_info: track } } });
  });
  assert.equal(await getQQMediaMid('', id), media);
  track = { mid: '00312345678901', file: { media_mid: media } }; assert.equal(await getQQMediaMid('', id), '');
  track = { file: { media_mid: media } }; assert.equal(await getQQMediaMid('', id), '');
  track = { mid: id, file: { media_mid: '../invalid' } }; assert.equal(await getQQMediaMid('', id), '');
  track = { mid: id, file: { media_mid: media } }; code = 403; assert.equal(await getQQMediaMid('', id), '');
  assert.equal(await getQQMediaMid('', 'not a valid id'), ''); assert.equal(calls, 5);
});
test('QQ metadata outage remains a failed lookup, never a fabricated media id', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await assert.rejects(getQQMediaMid('', id), /offline/);
});
