import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistFile, parsePlist } from './playlist-files.mjs';
import { playlistItem, playlistKey, filterTracks, formatDuration, totalDuration } from './playlist-model.mjs';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Major Version</key><integer>1</integer><key>Tracks</key><dict>
<key>101</key><dict><key>Track ID</key><integer>101</integer><key>Name</key><string>晴天</string><key>Artist</key><string>周杰伦</string><key>Album</key><string>叶惠美</string><key>Total Time</key><integer>269000</integer><key>Explicit</key><true/></dict>
<key>102</key><dict><key>Track ID</key><integer>102</integer><key>Name</key><string>Rock &amp; Roll</string><key>Artist</key><string>A</string><key>Comments</key><string/></dict>
<key>103</key><dict><key>Track ID</key><integer>103</integer><key>Name</key><string>Episode</string><key>Podcast</key><true/></dict>
</dict><key>Playlists</key><array>
<dict><key>Name</key><string>资料库</string><key>Master</key><true/><key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
<dict><key>Name</key><string>深夜</string><key>Playlist Persistent ID</key><string>ABCDEF0123456789</string><key>Playlist Items</key><array><dict><key>Track ID</key><integer>102</integer></dict><dict><key>Track ID</key><integer>101</integer></dict><dict><key>Track ID</key><integer>103</integer></dict></array></dict>
</array></dict></plist>`;

test('playlist files: Apple Music XML export keeps order, skips master library and podcasts', () => {
  const [list, ...rest] = parsePlaylistFile(XML, 'night.xml');
  assert.equal(rest.length, 0);
  assert.equal(list.name, '深夜');
  assert.equal(list.id, 'ABCDEF0123456789');
  assert.deepEqual(list.tracks.map((track) => [track.title, track.artist, track.duration]), [['Rock & Roll', 'A', 0], ['晴天', '周杰伦', 269000]]);
  assert.equal(list.tracks[1].album, '叶惠美');
});

test('playlist files: plist reader handles empty and boolean values', () => {
  assert.deepEqual(parsePlist('<plist><dict><key>a</key><string/><key>b</key><false/><key>c</key><array/><key>d</key><real>1.5</real></dict></plist>'), { a: '', b: false, c: [], d: 1.5 });
});

test('playlist files: M3U uses EXTINF, then "Artist - Title" file names', () => {
  const [list] = parsePlaylistFile('#EXTM3U\n#EXTINF:200,Laufey - From The Start\n/Music/x.mp3\n/Music/03 - Nujabes - Aruarian Dance.flac\nC:\\Music\\Solo.mp3\n', 'night.m3u8');
  assert.equal(list.name, 'night');
  assert.deepEqual(list.tracks.map((track) => [track.title, track.artist, track.duration]), [['From The Start', 'Laufey', 200000], ['Aruarian Dance', 'Nujabes', 0], ['Solo', '', 0]]);
});

test('playlist files: plain text lists strip numbering and split title / artist', () => {
  const [list] = parsePlaylistFile('1. 晴天 - 周杰伦\n2) 寓言 — 王菲\n# comment\nSomething', 'list.txt');
  assert.deepEqual(list.tracks.map((track) => [track.title, track.artist]), [['晴天', '周杰伦'], ['寓言', '王菲'], ['Something', '']]);
  assert.throws(() => parsePlaylistFile('\n\n', 'empty.txt'), /没有读到歌曲/);
  assert.throws(() => parsePlaylistFile('<plist><dict></dict></plist>', 'x.xml'), /不是 Apple Music/);
});

test('playlist model: a playlist becomes a shelf record with per-track artist and platform ids', () => {
  const item = playlistItem({ playlist: { id: '123', name: '我喜欢的音乐', creator: 'me', cover: 'https://p1.music.126.net/a.jpg' }, tracks: [
    { title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269000, source: 'netease', providerId: '186016' },
    { title: '', artist: 'x' },
    { title: 'Song', artist: 'B', source: 'qq', providerId: '0039MnYb0qxYhV', mediaMid: '0039MnYb0qxYhV' }
  ] }, 'netease');
  assert.equal(item.type, 'playlist');
  assert.equal(item.artist, 'me');
  assert.deepEqual(item.tracks, ['晴天', 'Song']);
  assert.equal(item.trackDetails[0].artist, '周杰伦');
  assert.equal(item.trackDetails[0].source, 'netease');
  assert.equal(item.trackDetails[1].mediaMid, '0039MnYb0qxYhV');
  assert.equal(item.externalIds.playlist, 'netease:123');
  assert.equal(playlistKey('apple', 'apple:pl.u-123'), 'apple:pl.u-123');
  assert.equal(playlistItem({ playlist: { id: 'x', name: 'Mix' }, tracks: [] }, 'apple').artist, 'Apple Music');
});

test('playlist model: search and durations', () => {
  const tracks = [{ title: 'Ｆｉｒｓｔ Love', artist: 'Utada' }, { title: '晴天', artist: '周杰伦', album: '叶惠美' }];
  assert.deepEqual(filterTracks(tracks, 'first').map(({ index }) => index), [0]);
  assert.deepEqual(filterTracks(tracks, '叶惠').map(({ index }) => index), [1]);
  assert.equal(filterTracks(tracks, '').length, 2);
  assert.equal(formatDuration(269000), '4:29');
  assert.equal(formatDuration(3723000), '1:02:03');
  assert.equal(totalDuration([{ duration: 3600000 }, { duration: 1500000 }]), '1 小时 25 分钟');
});

test('same-title playlist refresh updates source identity but preserves personal notes', async () => {
  const { playlistRefreshPatch } = await import('./playlist-model.mjs');
  const before = { title: 'Mix', artist: 'Me', tracks: ['Song'], trackDetails: [{ title: 'Song', artist: 'A', providerId: '1' }], notes: 'My listening notes' };
  const after = { ...before, trackDetails: [{ title: 'Song', artist: 'B', providerId: '2' }], notes: 'Remote description' };
  assert.deepEqual(playlistRefreshPatch(before, after), { trackDetails: after.trackDetails });
  assert.deepEqual(playlistRefreshPatch(before, before), {});
});
test('M3U paths with a literal percent sign do not abort an import', () => {
  const [list] = parsePlaylistFile('#EXTM3U\n#EXTINF:200,Artist - 100% Love\n/Music/100% Love.mp3', 'test.m3u');
  assert.equal(list.tracks[0].title, '100% Love');
});

test('M3U preserves plus signs in file names', () => {
  assert.equal(parsePlaylistFile('/Music/Love+Peace.mp3', 'test.m3u')[0].tracks[0].title, 'Love+Peace');
});

test('large M3U, text and XML lists preserve 620 tracks and report the 5000 cap', () => {
  for (const count of [620, 5001]) {
    const names = Array.from({ length: count }, (_, i) => `Song ${i + 1}`);
    const sources = [
      ['large.txt', names.map((n, i) => `${i + 1}. ${n} - Artist`).join('\n')],
      ['large.m3u', names.map(n => `#EXTINF:180,Artist - ${n}\n/x.mp3`).join('\n')],
      ['large.xml', `<plist><dict><key>Tracks</key><dict>${names.map((n, i) => `<key>${i}</key><dict><key>Name</key><string>${n}</string></dict>`).join('')}</dict></dict></plist>`]
    ];
    for (const [name, source] of sources) {
      const [list] = parsePlaylistFile(source, name);
      assert.equal(list.tracks.length, Math.min(count, 5000)); assert.equal(list.trackCount, count); assert.equal(list.truncated, count > 5000);
      assert.deepEqual(list.tracks.map(t => t.title), names.slice(0, 5000));
      const item = playlistItem({ playlist: list, tracks: list.tracks }, 'file'); assert.equal(item.trackDetails.length, list.tracks.length);
    }
  }
});

test('page merge preserves source ids and order beyond 500, deduplicating overlap', async () => {
  const { mergePlaylistPage } = await import('./playlist-model.mjs');
  const tracks = Array.from({ length: 620 }, (_, i) => ({ title: `Song ${i}`, providerId: String(i + 1), source: 'netease', artist: 'Artist' }));
  const current = { provider: 'netease', revision: 7, playlist: { id: '1', trackCount: 620 }, page: { offset: 0, nextOffset: 500, snapshot: 'a' }, tracks: tracks.slice(0, 500) };
  const incoming = { ...current, page: { offset: 500, nextOffset: null, snapshot: 'a' }, tracks: tracks.slice(499) };
  const merged = mergePlaylistPage(current, incoming);
  assert.deepEqual(merged.tracks, tracks); assert.equal(merged.truncated, false); assert.equal(current.tracks.length, 500);
  assert.equal(playlistItem(merged, 'netease').trackDetails[619].providerId, '620');
  for (const invalid of [{ ...incoming, revision: 8 }, { ...incoming, provider: 'qq' }, { ...incoming, playlist: { id: '2' } }, { ...incoming, page: { ...incoming.page, snapshot: 'b' } }, { ...incoming, page: current.page }, { ...incoming, tracks: current.tracks }]) assert.throws(() => mergePlaylistPage(current, invalid));
  assert.equal(current.page.nextOffset, 500, 'a failed page remains retryable');
  assert.deepEqual(mergePlaylistPage(current, incoming).tracks, tracks);
});

test('partial refresh cannot truncate a previously saved longer playlist', async () => {
  const { playlistRefreshPatch } = await import('./playlist-model.mjs');
  const before = { tracks: Array(620).fill('song'), notes: 'my notes' }, after = { tracks: Array(500).fill('song') };
  assert.throws(() => playlistRefreshPatch(before, after, { incomplete: true }), /不能覆盖/);
  assert.equal(before.tracks.length, 620); assert.equal(playlistRefreshPatch(before, after).tracks.length, 500, 'a complete shorter upstream playlist can still sync deliberate removals');
});
