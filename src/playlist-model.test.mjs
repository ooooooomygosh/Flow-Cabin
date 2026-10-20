import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYLIST_SOURCES, PLAYLIST_TRACK_LIMIT, filterTracks, mergePlaylistPage, playlistItem, playlistKey, playlistRefreshPatch, totalDuration } from './playlist-model.mjs';

const detail = (patch = {}) => ({ playlist: { id: '123', name: '夜航', creator: '小屋', cover: 'https://img/cover.jpg' }, tracks: [
  { title: '第一首', artist: '甲', album: '夜航', duration: 210000, source: 'qq', providerId: 'mid-1' },
  { title: '第二首', artist: '乙', album: '夜航', duration: 180000, source: 'netease', providerId: '22222' }
], ...patch });

// 回归：没有平台编号的歌单曾经用时间戳当 key，同一毫秒导入两份就互相覆盖。
test('a playlist keeps one identity across imports, however fast they arrive', () => {
  const clock = Date.now;
  Date.now = () => 1_700_000_000_000; // 同一毫秒：老写法会让两份歌单撞成同一个
  try {
    const first = playlistItem(detail({ playlist: { name: '文件歌单', creator: '我' } }), 'file');
    const second = playlistItem(detail({ playlist: { name: '文件歌单', creator: '我' } }), 'file');
    const other = playlistItem(detail({ playlist: { name: '另一份', creator: '我' } }), 'file');
    assert.equal(first.externalIds.playlist, second.externalIds.playlist, 'the same playlist is still the same playlist');
    assert.notEqual(first.externalIds.playlist, other.externalIds.playlist, 'two playlists in the same millisecond stay different records');
    assert.ok(first.externalIds.playlist.startsWith('file:'), 'the key says where it came from');
  } finally { Date.now = clock; }
  const platform = playlistItem(detail(), 'netease');
  assert.equal(platform.externalIds.playlist, 'netease:123');
  assert.equal(playlistKey('netease', '123'), 'netease:123');
  assert.equal(playlistKey('qq', '123'), 'qq:123');
  assert.equal(playlistKey('apple', 'pl.x'), 'apple:pl.x');
  assert.equal(playlistKey('apple-local', 'pl.x'), 'apple-local:pl.x');
  assert.equal(playlistKey('netease', 'apple:liked'), 'apple:liked', 'platform ids that already carry a prefix are kept');
  assert.equal(playlistKey('netease', 'qq-liked:9'), 'qq-liked:9');
  assert.equal(playlistKey('netease', undefined), 'netease:', 'a missing id never becomes another playlist');
});

test('an imported playlist becomes an ordinary shelf record', () => {
  const item = playlistItem(detail(), 'netease');
  assert.equal(item.type, 'playlist');
  assert.equal(item.title, '夜航');
  assert.equal(item.artist, '小屋');
  assert.equal(item.source, 'playlist');
  assert.deepEqual(item.tracks, ['第一首', '第二首']);
  assert.equal(item.trackDetails.length, 2);
  assert.equal(item.trackDetails[0].trackNumber, 1);
  assert.equal(item.trackDetails[0].lengthMillis, 210000);
  assert.equal(item.trackDetails[1].source, 'netease');
  assert.equal(item.externalIds.playlist, 'netease:123');
  assert.deepEqual(item.platforms, [PLAYLIST_SOURCES.netease.label]);
  // 未知来源回落到文件歌单，未知曲目来源回落到 apple。
  const fallback = playlistItem(detail({ tracks: [{ title: 'x', source: 'unknown' }] }), 'unknown-provider');
  assert.deepEqual(fallback.platforms, [PLAYLIST_SOURCES.file.label]);
  assert.equal(fallback.trackDetails[0].source, 'apple');
  // 空的歌单也有名字，不会变成空白卡片。
  assert.equal(playlistItem({ playlist: {}, tracks: [] }, 'file').title, '未命名歌单');
  // 只保留前 5000 首。
  const many = playlistItem({ playlist: { id: 'x', name: '长歌单' }, tracks: Array.from({ length: PLAYLIST_TRACK_LIMIT + 10 }, (_, index) => ({ title: `t${index}` })) }, 'file');
  assert.equal(many.tracks.length, PLAYLIST_TRACK_LIMIT);
});

test('a refresh keeps the listener notes and refuses to shrink a playlist', () => {
  const current = { title: '旧名', artist: '我', tracks: ['a', 'b'], trackDetails: [{ title: 'a' }, { title: 'b' }] };
  const incoming = { title: '新名', artist: '我', tracks: ['a', 'b'], trackDetails: [{ title: 'a' }, { title: 'b' }] };
  assert.deepEqual(playlistRefreshPatch(current, incoming), { title: '新名' });
  assert.throws(() => playlistRefreshPatch(current, { ...incoming, tracks: ['a'], trackDetails: [{ title: 'a' }] }, { incomplete: true }), /完整歌单/);
  assert.deepEqual(playlistRefreshPatch(current, { ...incoming, tracks: ['a'], trackDetails: [{ title: 'a' }] }), { title: '新名', tracks: ['a'], trackDetails: [{ title: 'a' }] });
});

test('search inside a playlist ignores case and width', () => {
  const tracks = [{ title: 'Window', artist: 'A', album: 'B' }, { title: '夜晚', artist: 'C', album: 'D' }];
  assert.deepEqual(filterTracks(tracks, '').map((row) => row.index), [0, 1]);
  assert.deepEqual(filterTracks(tracks, 'window').map((row) => row.index), [0]);
  assert.deepEqual(filterTracks(tracks, 'ＷＩＮＤＯＷ').map((row) => row.index), [0]);
  assert.deepEqual(filterTracks(tracks, '夜晚').map((row) => row.index), [1]);
  assert.deepEqual(filterTracks(tracks, '找不到').map((row) => row.index), []);
});

test('playlist pages merge in order and never duplicate a track', () => {
  const page = (offset, nextOffset, tracks, missingPages = []) => ({ offset, nextOffset, snapshot: 's1', missingPages });
  const current = { provider: 'netease', revision: 1, playlist: { id: '123', trackCount: 3 },
    page: page(0, 100, null), tracks: [{ title: 'a', source: 'netease', providerId: '1', playlistIndex: 0 }] };
  const incoming = { provider: 'netease', revision: 1, playlist: { id: '123', trackCount: 3 },
    page: page(100, 200, null), tracks: [{ title: 'a', source: 'netease', providerId: '1' }, { title: 'b', source: 'netease', providerId: '2', playlistIndex: 1 }] };
  const merged = mergePlaylistPage(current, incoming);
  assert.deepEqual(merged.tracks.map((track) => track.title), ['a', 'b']);
  assert.throws(() => mergePlaylistPage(current, { ...incoming, page: page(0, 100, null) }), /重复或乱序/);
  assert.throws(() => mergePlaylistPage(current, { ...incoming, provider: 'qq' }), /来源已改变/);
  assert.throws(() => mergePlaylistPage(current, { ...incoming, revision: 2 }), /内容已改变/);
  assert.throws(() => mergePlaylistPage(current, { ...incoming, page: page(100, 200, null), tracks: [{ title: 'a', source: 'netease', providerId: '1' }] }), /重复页或空页/);
});

test('a playlist duration reads like a sentence', () => {
  assert.equal(totalDuration([]), '');
  assert.equal(totalDuration([{ duration: 60000 }, { duration: 60000 }]), '2 分钟');
  assert.equal(totalDuration([{ duration: 3600000 }, { duration: 600000 }]), '1 小时 10 分钟');
  assert.equal(totalDuration(null), '');
});
