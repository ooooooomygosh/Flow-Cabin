'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const upstream = require('../music-upstream.cjs');
const song = (mid, name) => ({ mid, name, singer: [{ name: '陶喆' }], album: { name: '黑色柳丁', mid: '001mvhPh0qevad' }, file: { media_mid: mid }, interval: 204, pay: { pay_play: 0 } });
const form = (url, body) => body ? (Object.keys(JSON.parse(body)).includes('req') ? 'client' : Object.keys(JSON.parse(body)).includes('songinfo') ? 'detail' : 'desktop') : 'smartbox';
const detail = (mid) => JSON.stringify({ code: 0, songinfo: { code: 0, data: { track_info: song(mid, '月亮代表谁的心') } } });
const answer = (which, code, list = []) => which === 'client' ? JSON.stringify({ code: 0, req: { code, data: { body: { song: { list } } } } }) : JSON.stringify({ code: 0, 'music.search.SearchCgiService': { code, data: { body: { song: { list } } } } });
let clock = 0; const later = () => (clock += 10000);
const smartbox = JSON.stringify({ code: 0, data: { song: { itemlist: [{ mid: '002ABCdef12345', name: '月亮代表谁的心', singer: '陶喆' }] } } });

test('QQ search: a 2001 refusal moves to the other full form, and that form is tried first next time', async () => {
  upstream.resetQQSearchPreference();
  const calls = [], waits = [];
  const fetchText = async (url, _init, body) => { const which = form(url, body); calls.push(which); return which === 'desktop' ? answer('desktop', 2001) : answer('client', 0, [song('002ZcDrY3quHI3', '月亮代表谁的心'), song('002ZcDrY3quHI3', '重复')]); };
  const songs = await upstream.searchQQSongs('陶喆 月亮代表谁的心', 20, { fetchText, wait: async (ms) => { waits.push(ms); }, now: later });
  assert.deepEqual(calls, ['desktop', 'client']); assert.deepEqual(waits, [250]);
  assert.equal(songs.length, 1);
  assert.deepEqual({ ...songs[0], artists: undefined }, { mid: '002ZcDrY3quHI3', name: '月亮代表谁的心', artists: undefined, artist: '陶喆', album: '黑色柳丁', mediaMid: '002ZcDrY3quHI3', cover: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000001mvhPh0qevad.jpg', duration: 204000, fee: 0 });
  calls.length = 0;
  await upstream.searchQQSongs('陶喆 爱很简单', 20, { fetchText, wait: async () => {}, now: later });
  assert.deepEqual(calls, ['client'], 'the form that answered goes first');
  upstream.resetQQSearchPreference();
});

test('QQ search: both full forms get a second try after a pause; suggestions come last and are never preferred', async () => {
  upstream.resetQQSearchPreference();
  const calls = [], waits = [];
  const refusing = async (url, _init, body) => { const which = form(url, body); calls.push(which); return which === 'smartbox' ? smartbox : which === 'detail' ? detail(JSON.parse(body).songinfo.param.song_mid) : answer(which, 2001); };
  const songs = await upstream.searchQQSongs('月亮代表谁的心', 20, { fetchText: refusing, wait: async (ms) => { waits.push(ms); }, now: later });
  assert.deepEqual(calls, ['desktop', 'client', 'desktop', 'client', 'smartbox', 'detail']); assert.deepEqual(waits, [250, 700, 250, 250]);
  assert.equal(songs[0].mid, '002ABCdef12345'); assert.equal(songs[0].artist, '陶喆');
  assert.deepEqual([songs[0].album, songs[0].duration, songs[0].mediaMid], ['黑色柳丁', 204000, '002ABCdef12345'], 'a suggestion is filled in from the song detail');
  // Detail unavailable: the suggestion is still used, with what it carries.
  upstream.resetQQSearchPreference();
  const bare = await upstream.searchQQSongs('月亮代表谁的心', 20, { fetchText: async (url, _init, body) => form(url, body) === 'smartbox' ? smartbox : form(url, body) === 'detail' ? JSON.stringify({ code: 500 }) : answer(form(url, body), 2001), wait: async () => {}, now: later });
  assert.deepEqual([bare[0].mid, bare[0].album, bare[0].mediaMid], ['002ABCdef12345', '', '']);
  calls.length = 0;
  await upstream.searchQQSongs('x', 20, { fetchText: async (url, init, body) => { calls.push(form(url, body)); return answer(form(url, body), 0, [song('002ZcDrY3quHI3', 'x')]); }, wait: async () => {}, now: later });
  assert.deepEqual(calls, ['desktop'], 'after a suggestions answer the full forms still lead');
  // A second 2001 attempt that succeeds is used.
  calls.length = 0; let refusals = 1;
  const flaky = async (url, _init, body) => { const which = form(url, body); calls.push(which); return which === 'desktop' && refusals-- > 0 ? answer('desktop', 2001) : which === 'client' ? answer('client', 2001) : answer(which, 0, [song('002ZcDrY3quHI3', 'x')]); };
  assert.equal((await upstream.searchQQSongs('x', 20, { fetchText: flaky, wait: async () => {}, now: later })).length, 1);
  assert.deepEqual(calls, ['desktop', 'client', 'desktop']);
  upstream.resetQQSearchPreference();
  await assert.rejects(upstream.searchQQSongs('x', 8, { fetchText: async (url, _init, body) => body ? answer(form(url, body), 2001) : JSON.stringify({ code: 2001 }), wait: async () => {}, now: later }), /QQ 音乐搜索暂时不可用（2001）/);
  await assert.rejects(upstream.searchQQSongs('x', 8, { fetchText: async () => { throw new Error('ECONNRESET'); }, wait: async () => {}, now: later }), /QQ 音乐搜索暂时连不上/);
  upstream.resetQQSearchPreference();
});

test('QQ search: back-to-back searches are paced, and a refusal makes the next one wait longer', async () => {
  upstream.resetQQSearchPreference();
  let time = 1000; const waits = [];
  const options = (fetchText) => ({ fetchText, now: () => time, wait: async (ms) => { waits.push(ms); time += ms; } });
  const ok = async (url, _init, body) => answer(form(url, body), 0, [song('002ZcDrY3quHI3', 'x')]);
  await upstream.searchQQSongs('a', 20, options(ok)); await upstream.searchQQSongs('b', 20, options(ok));
  assert.deepEqual(waits, [300], 'the second search waits out the 0.3 s gap');
  waits.length = 0; time += 5000;
  let first = true;
  await upstream.searchQQSongs('c', 20, options(async (url, _init, body) => { if (first) { first = false; return answer('desktop', 2001); } return ok(url, _init, body); }));
  assert.deepEqual(waits, [250, 950], 'after a 2001 the next request waits 1.2 s in all');
  upstream.resetQQSearchPreference();
});
