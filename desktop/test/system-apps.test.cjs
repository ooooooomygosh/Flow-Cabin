'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createAppleMusic } = require('../apple-music.cjs');
const { createLocalApps } = require('../local-app.cjs');
const { candidate } = require('../music-policy.cjs');

const fakeExec = (reply) => (file, args, options, done) => { const value = reply(args[4], JSON.parse(args[5])); if (value instanceof Error) done(value); else done(null, JSON.stringify(value)); };
test('Apple Music is macOS-only and reports permission honestly', async () => {
  const off = createAppleMusic({ platform: 'linux' });
  assert.equal(off.available, false); assert.equal((await off.permission()).granted, false);
  await assert.rejects(off.play('ABCDEF0123456789'), /macOS/);
  const denied = createAppleMusic({ platform: 'darwin', execFileProcess: fakeExec(() => new Error('Not authorized to send Apple events to Music. (-1743)')) });
  assert.deepEqual(await denied.permission(), { available: true, granted: false, error: '请在“系统设置 › 隐私与安全性 › 自动化”中允许心流小屋控制“音乐”。', needsPermission: true });
});
test('Apple Music search, play, control and state', async () => {
  const calls = [];
  const music = createAppleMusic({ platform: 'darwin', execFileProcess: fakeExec((action, input) => { calls.push([action, input]); return { probe: { ok: true, version: '1.5' }, search: { tracks: [{ id: 'ABCDEF0123456789', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269000 }, { id: 'bad', title: 'x' }] }, play: { ok: true }, control: { ok: true }, state: { running: true, state: 'playing', title: '晴天', artist: '周杰伦', album: '叶惠美', id: 'ABCDEF0123456789', position: 12, duration: 269 } }[action]; }) });
  assert.equal((await music.permission()).granted, true);
  const found = await music.search('周杰伦 晴天');
  assert.equal(found.length, 1); assert.equal(candidate(found[0], 'appleMusic').id, 'ABCDEF0123456789');
  assert.deepEqual(await music.play('ABCDEF0123456789'), { remote: true, provider: 'appleMusic', player: 'Apple Music' });
  await assert.rejects(music.play('"; do shell script'), /ID 无效/);
  await assert.rejects(music.control('quit'), /不支持/);
  assert.equal((await music.state()).state, 'playing');
});
test('local app hand-off uses orpheus:// only when 网易云 is installed, otherwise the official page', async () => {
  const opened = [];
  const apps = createLocalApps({ openExternal: async (url) => opened.push(url), appForProtocol: (url) => url === 'orpheus://' ? 'NeteaseMusic' : '' });
  assert.deepEqual(apps.status(), { netease: { name: '网易云音乐', installed: true }, qq: { name: 'QQ 音乐', installed: false } });
  assert.equal((await apps.open({ provider: 'netease', id: '186016' })).via, 'app');
  const qq = await apps.open({ provider: 'qq', id: '0039MnYb0qxYhV' });
  assert.equal(qq.via, 'web'); assert.equal(qq.playingInCabin, false);
  await apps.open({ provider: 'qq', query: '周杰伦 晴天' });
  assert.deepEqual(opened, ['orpheus://song/186016', 'https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV', 'https://y.qq.com/n/ryqq/search?w=%E5%91%A8%E6%9D%B0%E4%BC%A6%20%E6%99%B4%E5%A4%A9']);
  await assert.rejects(apps.open({ provider: 'spotify' }), /不支持/);
});
test('search candidates keep the album name (QQ returns it as a string)', () => {
  assert.equal(candidate({ mid: 'x', name: '晴天', album: '叶惠美' }, 'qq').album, '叶惠美');
  assert.equal(candidate({ id: 1, name: 'a', album: { name: 'B' } }, 'netease').album, 'B');
});
test('Apple Music: a song outside the library comes from the catalogue and opens in Music.app', async () => {
  const opened = [], asked = [];
  const fetch = async (url) => { asked.push(String(url)); return new Response(JSON.stringify({ results: [
    { kind: 'song', trackId: 1440911001, trackName: '討厭紅樓夢', artistName: '陶喆', collectionName: '黑色柳丁', trackTimeMillis: 262000 },
    { kind: 'music-video', trackId: 1, trackName: 'mv' }, { kind: 'song', trackId: 'x;rm', trackName: 'bad' }] }), { status: 200 }); };
  const music = createAppleMusic({ platform: 'darwin', country: 'tw', fetch, openURL: async (url) => opened.push(url), execFileProcess: fakeExec(() => assert.fail('the catalogue never runs osascript')) });
  const found = await music.catalog('陶喆 討厭紅樓夢');
  assert.deepEqual(found, [{ id: '1440911001', provider: 'appleMusic', title: '討厭紅樓夢', artist: '陶喆', album: '黑色柳丁', duration: 262000 }]);
  assert.equal(new URL(asked[0]).searchParams.get('country'), 'TW'); assert.equal(new URL(asked[0]).searchParams.get('entity'), 'song');
  assert.equal(candidate(found[0], 'appleMusic').id, '1440911001');
  const played = await music.play('1440911001');
  assert.equal(played.remote, true); assert.equal(played.catalog, true); assert.match(played.notice, /不在你的「音乐」资料库/);
  assert.deepEqual(opened, ['music://music.apple.com/tw/song/1440911001']);
  await assert.rejects(music.play('1440911001; open /'), /ID 无效/);
  const offline = createAppleMusic({ platform: 'darwin', fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(offline.catalog('x'), /无法连接 Apple Music 曲库/);
  asked.length = 0; await createAppleMusic({ platform: 'darwin', country: '../x', fetch }).catalog('x');
  assert.equal(new URL(asked[0]).searchParams.get('country'), 'US', 'an unusable region falls back to the US storefront');
});
test('Apple Music executes guarded control against the current native recording', async () => {
  const vm = require('node:vm'), commands = [];
  const selected = { id: 'ABCDEF0123456789', title: 'Selected', artist: 'Artist', album: 'Album' };
  let current = { ...selected, title: 'Other' }, state = 'paused';
  const Music = { running: () => true, playerState: () => state,
    currentTrack: () => ({ persistentID: () => current.id, name: () => current.title, artist: () => current.artist, album: () => current.album }),
    play: () => commands.push('play'), pause: () => commands.push('pause') };
  const music = createAppleMusic({ platform: 'darwin', execFileProcess: (file, args, options, done) => {
    assert.equal(file, '/usr/bin/osascript');
    try { done(null, vm.runInNewContext(args[3] + '; run(argv)', { Application: name => { assert.equal(name, 'Music'); return Music; }, argv: args.slice(4) })); }
    catch (error) { done(error); }
  } });
  for (state of ['paused', 'playing']) {
    for (const action of ['play', 'pause']) await assert.rejects(music.control(action, selected), /切换到其他歌曲/);
  }
  assert.deepEqual(commands, []);
  current = { ...selected }; await music.control('play', selected); await music.control('pause', selected);
  assert.deepEqual(commands, ['play', 'pause']);
  // The same metadata with a different native id is a different recording.
  current = { ...selected, id: '0123456789ABCDEF' };
  await assert.rejects(music.control('play', selected), /切换到其他歌曲/);
  assert.deepEqual(commands, ['play', 'pause']);
  await assert.rejects(music.control('play', {}), /目标歌曲无效/);
});
test('Apple Music catalogue handoff never opens another platform', async () => {
  let opened = 0;
  const music = createAppleMusic({ platform: 'linux', openURL: async () => opened++ });
  await assert.rejects(music.play('1234567890'), /macOS/); assert.equal(opened, 0);
});
