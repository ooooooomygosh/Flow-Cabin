import test from 'node:test';
import assert from 'node:assert/strict';
import { LIKES_KEY, normalizeLikes, toggleLike, isLiked, readLikes, writeLikes, resolveLike, likedSongs, likePlayOrder, likeQueueEntries, likesByRecord } from './likes.mjs';
import { QUEUE_LIMIT } from './player-queue.mjs';

const memory = (seed = {}) => { const data = { ...seed }; return { getItem: (key) => key in data ? data[key] : null, setItem: (key, value) => { data[key] = String(value); }, data }; };
const album = { id: 'a1', type: 'album', title: '雨天练习', artist: '回归测试', tracks: ['第一首', '第二首', '第三首'] };
const playlist = { id: 7, type: 'playlist', title: '夜里的歌', tracks: [{ title: '晚风' }, { title: '月光' }] };
const single = { id: 's1', type: 'song', title: '一首单曲', artist: '某人', tracks: [] };

test('the storage format is unchanged: key, fields and newest-first order', () => {
  const storage = memory();
  let list = toggleLike([], { id: 'a1', index: 1, title: '第二首', artist: '回归测试' }, 100);
  list = toggleLike(list, { id: 7, index: 0, title: '晚风', artist: '' }, 200);
  assert.equal(writeLikes(list, storage), true);
  assert.equal(LIKES_KEY, 'flow-cabin-liked-songs-v1');
  assert.deepEqual(JSON.parse(storage.data[LIKES_KEY]), [{ id: '7', index: 0, title: '晚风', artist: '', at: 200 }, { id: 'a1', index: 1, title: '第二首', artist: '回归测试', at: 100 }]);
  assert.deepEqual(readLikes(storage), normalizeLikes(list));
  assert.equal(isLiked(list, '7', '晚风'), true);
  assert.equal(isLiked(toggleLike(list, { id: '7', title: '晚风' }), '7', '晚风'), false);
});

test('a heart finds its song again after the playlist was reordered', () => {
  const moved = { ...playlist, tracks: [{ title: '月光' }, { title: '晚风' }] };
  const song = resolveLike({ id: '7', index: 0, title: '晚风', at: 5 }, [moved]);
  assert.equal(song.available, true); assert.equal(song.track, 1); assert.equal(song.record, '夜里的歌'); assert.equal(song.item, moved);
  // The saved spot wins when it still holds that title (duplicate titles keep their place).
  const twice = { ...album, tracks: ['同名', '别的', '同名'] };
  assert.equal(resolveLike({ id: 'a1', index: 2, title: '同名' }, [twice]).track, 2);
  assert.equal(resolveLike({ id: 'a1', index: 9, title: ' 同名 ' }, [twice]).track, 0);
});

test('hearts whose record or song left the shelf stay listed with a reason', () => {
  const gone = resolveLike({ id: 'missing', title: '某首歌' }, [album]);
  assert.equal(gone.available, false); assert.match(gone.reason, /不在唱片架/);
  const removed = resolveLike({ id: 'a1', index: 0, title: '不存在' }, [album]);
  assert.equal(removed.available, false); assert.equal(removed.track, -1); assert.match(removed.reason, /不在这张唱片/);
  // A single without a track list is the song itself.
  assert.equal(resolveLike({ id: 's1', title: '一首单曲' }, [single]).track, 0);
});

test('likedSongs is newest first and keeps every heart', () => {
  const list = [{ id: 'a1', index: 0, title: '第一首', at: 10 }, { id: 'x', title: '走失的歌', at: 30 }, { id: '7', index: 1, title: '月光', at: 20 }];
  const songs = likedSongs(list, [album, playlist]);
  assert.deepEqual(songs.map((song) => song.title), ['走失的歌', '月光', '第一首']);
  assert.deepEqual(songs.map((song) => song.available), [false, true, true]);
});

test('play order skips unavailable hearts, shuffles once and fits the 待播 limit', () => {
  const songs = likedSongs([{ id: 'a1', index: 0, title: '第一首', at: 3 }, { id: 'x', title: '走失', at: 2 }, { id: 'a1', index: 2, title: '第三首', at: 1 }, { id: '7', index: 0, title: '晚风', at: 0 }], [album, playlist]);
  assert.deepEqual(likePlayOrder(songs).map((song) => song.title), ['第一首', '第三首', '晚风']);
  // random() = 0 always swaps with the first slot: a deterministic Fisher–Yates.
  assert.deepEqual(likePlayOrder(songs, { shuffle: true, random: () => 0 }).map((song) => song.title), ['第三首', '晚风', '第一首']);
  assert.deepEqual(likeQueueEntries(likePlayOrder(songs)), ['track:2:a1', 'track:0:7']);
  const many = Array.from({ length: 80 }, (_, index) => ({ id: 'a1', index: 0, title: `歌 ${index}`, at: index }));
  const big = { ...album, tracks: many.map((like) => like.title) };
  const order = likePlayOrder(likedSongs(many, [big]));
  assert.equal(order.length, QUEUE_LIMIT + 1); assert.equal(likeQueueEntries(order).length, QUEUE_LIMIT);
  assert.deepEqual(likePlayOrder(null), []);
});

test('likesByRecord counts hearts per record id', () => {
  const counts = likesByRecord([{ id: 'a1', title: '一' }, { id: 'a1', title: '二' }, { id: 7, title: '晚风' }]);
  assert.equal(counts.get('a1'), 2); assert.equal(counts.get('7'), 1);
});
