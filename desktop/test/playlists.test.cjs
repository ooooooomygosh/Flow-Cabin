const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlaylistLibrary, parsePlaylistLink, parseApplePlaylistPage, normalizeDetail, isoMillis } = require('../playlists.cjs');

test('playlists: share links from NetEase, QQ and Apple Music', () => {
  assert.deepEqual(parsePlaylistLink('https://music.163.com/#/playlist?id=2829883282'), { provider: 'netease', id: '2829883282' });
  assert.deepEqual(parsePlaylistLink('分享歌单 https://y.music.163.com/m/playlist?id=19723756&userid=1 (@网易云音乐)'), { provider: 'netease', id: '19723756' });
  assert.deepEqual(parsePlaylistLink('https://y.qq.com/n/ryqq/playlist/7039221443'), { provider: 'qq', id: '7039221443' });
  assert.deepEqual(parsePlaylistLink('https://i.y.qq.com/n2/m/share/details/taoge.html?platform=11&id=8052190267'), { provider: 'qq', id: '8052190267' });
  const apple = parsePlaylistLink('https://music.apple.com/cn/playlist/chill/pl.u-ABCdef123?l=en');
  assert.equal(apple.provider, 'apple'); assert.equal(apple.kind, 'playlist'); assert.equal(apple.id, 'pl.u-ABCdef123'); assert.equal(apple.country, 'cn');
  assert.equal(apple.url, 'https://music.apple.com/cn/playlist/chill/pl.u-ABCdef123');
  assert.deepEqual(parsePlaylistLink('https://music.apple.com/us/album/bewitched/1690607869'), { provider: 'apple', kind: 'album', id: '1690607869', country: 'us', url: 'https://music.apple.com/us/album/bewitched/1690607869' });
  assert.throws(() => parsePlaylistLink('https://example.com/playlist?id=1'), /支持网易云/);
  assert.throws(() => parsePlaylistLink('not a link'), /完整的歌单链接/);
  assert.throws(() => parsePlaylistLink('https://music.163.com/#/song?id=abc'), /网易云歌单 ID/);
});

test('playlists: Apple Music page JSON-LD + serialized data', () => {
  const html = `<html><head><meta property="og:title" content="Late Night on Apple Music">
  <script type="application/ld+json" id="schema:music-playlist">{"@context":"http://schema.org","@type":"MusicPlaylist","name":"Late Night","description":"quiet","image":"https://is1-ssl.mzstatic.com/a.jpg","author":{"@type":"Person","name":"Janet"},
   "track":[{"@type":"MusicRecording","name":"From The Start","url":"https://music.apple.com/us/song/from-the-start/1690607870","duration":"PT2M50S"},{"@type":"MusicRecording","name":"Dreamer","url":"https://music.apple.com/us/album/x/1690607869?i=1690607871","duration":"PT3M1S"}]}</script>
  <script type="application/json" id="serialized-server-data">[{"data":{"sections":[{"items":[{"title":"From The Start","artistName":"Laufey","duration":170000,"contentDescriptor":{"identifiers":{"storeAdamID":"1690607870"}},"tertiaryLinks":[{"title":"Bewitched"}]}]}]}}]</script></head></html>`;
  const page = parseApplePlaylistPage(html);
  assert.equal(page.name, 'Late Night'); assert.equal(page.creator, 'Janet'); assert.equal(page.cover, 'https://is1-ssl.mzstatic.com/a.jpg');
  assert.deepEqual(page.tracks.map((track) => [track.title, track.artist, track.album, track.duration, track.providerId]), [['From The Start', 'Laufey', 'Bewitched', 170000, '1690607870'], ['Dreamer', '', '', 181000, '1690607871']]);
  assert.equal(isoMillis('PT1H2M3S'), 3723000);
});

test('playlists: detail normalization drops untitled and duplicate tracks, validates ids', () => {
  const detail = normalizeDetail({ playlist: { id: '1', name: 'Mix', trackCount: 3 }, tracks: [{ name: 'A', artist: 'x', id: '123' }, { name: 'A again', id: '123' }, { name: '' }, { name: 'B', id: 'not-a-number', cover: 'http://p1.music.126.net/b.jpg' }] }, 'netease');
  assert.deepEqual(detail.tracks.map((track) => [track.title, track.providerId, track.source]), [['A', '123', 'netease'], ['B', '', 'netease']]);
  assert.equal(detail.playlist.cover, 'https://p1.music.126.net/b.jpg');
  assert.throws(() => normalizeDetail({ playlist: {} }, 'qq'), /没有读到歌单信息/);
});

test('playlists: account lists need a stored login and map QQ / NetEase shapes', async () => {
  const calls = [];
  const upstream = {
    handleQQUserPlaylists: async (cookie) => { calls.push(['qq', cookie]); return { loggedIn: true, playlists: [{ id: 'qq-liked:201', name: '我喜欢', trackCount: 9 }, { id: '77', name: 'Road', subscribed: true }, { id: '', name: 'bad' }] }; },
    handleQQPlaylistTracks: async (cookie, id) => ({ playlist: { id, name: 'Road', cover: '' }, tracks: [{ mid: '0039MnYb0qxYhV', name: '晴天', artist: '周杰伦', mediaMid: '0039MnYb0qxYhV', album: '叶惠美', cover: 'https://y.gtimg.cn/a.jpg', duration: 269000 }] }),
    neteaseUserPlaylists: async () => ({ loggedIn: true, user: 'me', playlists: [{ id: '5', name: '我喜欢的音乐', kind: 'liked', trackCount: 2 }] }),
    neteasePlaylistTracks: async (_cookie, id) => ({ playlist: { id, name: 'Liked' }, tracks: [{ id: '186016', name: '晴天', artist: '周杰伦', duration: 1 }] })
  };
  const cookies = { qq: 'uin=1; qm_keyst=x', netease: '' };
  const library = createPlaylistLibrary({ upstream, cookies: (provider) => cookies[provider], platform: 'linux' });
  const qq = await library.list('qq');
  assert.deepEqual(qq.playlists.map((entry) => [entry.id, entry.kind]), [['qq-liked:201', 'liked'], ['77', 'collect']]);
  assert.deepEqual(calls, [['qq', 'uin=1; qm_keyst=x']]);
  assert.deepEqual(await library.list('netease'), { loggedIn: false, provider: 'netease', playlists: [] });
  cookies.netease = 'MUSIC_U=1';
  assert.equal((await library.list('netease')).playlists[0].kind, 'liked');
  const tracks = await library.tracks('qq', '77');
  assert.equal(tracks.tracks[0].providerId, '0039MnYb0qxYhV'); assert.equal(tracks.playlist.cover, 'https://y.gtimg.cn/a.jpg');
  await assert.rejects(() => library.tracks('qq', '../x'), /歌单 ID 无效/);
  await assert.rejects(() => library.list('apple-local'), /需要 macOS/);
  const linked = await library.link('https://music.163.com/playlist?id=42');
  assert.equal(linked.provider, 'netease'); assert.equal(linked.tracks[0].providerId, '186016');
});

test('playlists: Apple links stay on Apple hosts and complete metadata through iTunes Lookup', async () => {
  const requests = [];
  const page = `<script type="application/ld+json">{"@type":"MusicPlaylist","name":"Mix","track":[{"name":"Song A","url":"https://music.apple.com/us/song/a/11"},{"name":"Song B","url":"https://music.apple.com/us/song/b/22"}]}</script>`;
  const fetch = async (url) => {
    requests.push(String(url));
    if (String(url).startsWith('https://itunes.apple.com/lookup')) return { ok: true, status: 200, url, text: async () => JSON.stringify({ results: [{ wrapperType: 'track', kind: 'song', trackId: 11, trackName: 'Song A', artistName: 'Artist A', collectionName: 'Album A', trackTimeMillis: 1000, artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg' }] }) };
    return { ok: true, status: 200, url, text: async () => page };
  };
  const library = createPlaylistLibrary({ upstream: {}, cookies: () => '', fetch, platform: 'linux' });
  const result = await library.link('https://music.apple.com/us/playlist/mix/pl.abcdef12');
  assert.equal(result.provider, 'apple');
  assert.equal(result.playlist.id, 'apple:pl.abcdef12');
  assert.deepEqual(result.tracks.map((track) => [track.title, track.artist, track.album, track.providerId, track.source]), [['Song A', 'Artist A', 'Album A', '11', 'apple'], ['Song B', '', '', '22', 'apple']]);
  assert.equal(result.tracks[0].cover, 'https://is1.mzstatic.com/300x300bb.jpg');
  assert.match(requests[1], /lookup\?id=11,22&entity=song&country=us/);
  const redirected = createPlaylistLibrary({ upstream: {}, cookies: () => '', fetch: async (url) => ({ ok: true, status: 200, url: 'https://evil.example/x', text: async () => page }), platform: 'linux' });
  await assert.rejects(() => redirected.link('https://music.apple.com/us/playlist/mix/pl.abcdef12'), /未知地址/);
});

test('playlists: macOS Music.app playlists are read through JXA with validated ids', async () => {
  const runs = [];
  const execFileProcess = (file, args, options, done) => {
    runs.push(args.slice(4));
    if (args[4] === 'list') done(null, JSON.stringify([{ id: 'ABCDEF0123456789', name: '深夜', kind: 'none', trackCount: 3 }, { id: 'bad', name: 'x' }, { id: '0123456789ABCDEF', name: 'Music', kind: 'Music' }]));
    else done(null, JSON.stringify({ name: '深夜', tracks: [{ title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269000 }] }));
  };
  const library = createPlaylistLibrary({ upstream: {}, cookies: () => '', platform: 'darwin', execFileProcess });
  const lists = await library.list('apple-local');
  assert.deepEqual(lists.playlists.map((entry) => [entry.id, entry.kind]), [['ABCDEF0123456789', 'created'], ['0123456789ABCDEF', 'liked']]);
  const detail = await library.tracks('apple-local', 'ABCDEF0123456789');
  assert.equal(detail.tracks[0].source, 'apple'); assert.equal(detail.tracks[0].artist, '周杰伦');
  await assert.rejects(() => library.tracks('apple-local', 'x; rm'), /ID 无效/);
  assert.deepEqual(runs, [['list'], ['tracks', 'ABCDEF0123456789']]);
  const denied = createPlaylistLibrary({ upstream: {}, cookies: () => '', platform: 'darwin', execFileProcess: (f, a, o, done) => done(new Error('Not authorized to send Apple events to Music. (-1743)')) });
  await assert.rejects(() => denied.list('apple-local'), /自动化/);
});

test('Apple redirect is validated before any request to an untrusted destination', async () => {
  for (const location of ['https://evil.example/x', 'http://music.apple.com/x', 'https://music.apple.com:444/x', 'https://user:secret@music.apple.com/x', 'http://127.0.0.1/private']) {
    const requests = [];
    const library = createPlaylistLibrary({ upstream: {}, cookies: () => '', fetch: async (url, options) => {
      requests.push(url); assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location } });
    } });
    await assert.rejects(() => library.link('https://music.apple.com/us/playlist/mix/pl.abcdef12'), /未知地址/);
    assert.equal(requests.length, 1);
  }
});
test('Apple response stream stops at the byte budget before allocating the full body', async () => {
  let cancelled = false;
  const library = createPlaylistLibrary({ upstream: {}, cookies: () => '', fetch: async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; }
  })) });
  await assert.rejects(() => library.link('https://music.apple.com/us/playlist/mix/pl.abcdef12'), /页面过大/);
  assert.equal(cancelled, true);
});
test('Apple redirect loops stop after a bounded number of requests', async () => {
  let requests = 0;
  const library = createPlaylistLibrary({ upstream: {}, cookies: () => '', fetch: async () => { requests++; return new Response(null, { status: 302, headers: { location: '/us/playlist/mix/pl.abcdef12' } }); } });
  await assert.rejects(() => library.link('https://music.apple.com/us/playlist/mix/pl.abcdef12'), /跳转过多/);
  assert.equal(requests, 5);
});
