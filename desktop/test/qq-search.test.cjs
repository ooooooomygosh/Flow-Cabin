'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const upstream = require('../music-upstream.cjs');
const song = (mid, name) => ({ mid, name, singer: [{ name: '陶喆' }], album: { name: '黑色柳丁' }, file: { media_mid: mid }, interval: 285, pay: { pay_play: 0 } });
const desktopBody = (code, list = []) => JSON.stringify({ code: 0, 'music.search.SearchCgiService': { code, data: { body: { song: { list } } } } });

test('QQ search: a 2001 refusal moves on to the next request form instead of hammering the same one', async () => {
  upstream.resetQQSearchPreference();
  const calls = [];
  const fetchText = async (url, init, body) => {
    const form = body ? Object.keys(JSON.parse(body)).includes('req') ? 'client' : 'desktop' : new URL(url).pathname.includes('client_search_cp') ? 'legacy' : 'smartbox';
    calls.push(form);
    if (form === 'desktop') return desktopBody(2001);
    if (form === 'client') return JSON.stringify({ code: 0, req: { code: 2001 } });
    return JSON.stringify({ code: 0, data: { song: { list: [song('0039MnYb0qxYhV', '月亮代表谁的心'), song('0039MnYb0qxYhV', '重复')] } } });
  };
  const songs = await upstream.searchQQSongs('陶喆 月亮代表谁的心', 8, { fetchText, wait: async () => {} });
  assert.deepEqual(calls, ['desktop', 'client', 'legacy']);
  assert.equal(songs.length, 1);
  assert.deepEqual({ ...songs[0], artists: undefined }, { mid: '0039MnYb0qxYhV', name: '月亮代表谁的心', artists: undefined, artist: '陶喆', album: '黑色柳丁', mediaMid: '0039MnYb0qxYhV', duration: 285000, fee: 0 });
  // The form that answered is tried first next time.
  calls.length = 0;
  await upstream.searchQQSongs('陶喆 爱很简单', 8, { fetchText, wait: async () => {} });
  assert.deepEqual(calls, ['legacy']);
  upstream.resetQQSearchPreference();
});

test('QQ search: suggestions are the last resort and an all-round refusal says so plainly', async () => {
  upstream.resetQQSearchPreference();
  const smartbox = JSON.stringify({ code: 0, data: { song: { itemlist: [{ mid: '002ABCdef12345', name: '月亮代表谁的心', singer: '陶喆' }] } } });
  const onlySuggestions = async (url, _init, body) => body ? desktopBody(2001) : url.includes('smartbox') ? smartbox : JSON.stringify({ code: 500 });
  const songs = await upstream.searchQQSongs('月亮代表谁的心', 8, { fetchText: onlySuggestions, wait: async () => {} });
  assert.equal(songs[0].mid, '002ABCdef12345'); assert.equal(songs[0].artist, '陶喆'); assert.equal(songs[0].mediaMid, '');
  upstream.resetQQSearchPreference();
  await assert.rejects(upstream.searchQQSongs('x', 8, { fetchText: async (url, _init, body) => body ? desktopBody(2001) : JSON.stringify({ code: 2001 }), wait: async () => {} }), /QQ 音乐搜索暂时不可用（2001）/);
  await assert.rejects(upstream.searchQQSongs('x', 8, { fetchText: async () => { throw new Error('ECONNRESET'); }, wait: async () => {} }), /QQ 音乐搜索暂时连不上/);
  upstream.resetQQSearchPreference();
});
