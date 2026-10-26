import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_MIN_RECORDS, filtersShown, activeFilterCount, shelfRecords, recentSongs, recentRecords, shortDay, nowLine, isShelfView } from './listen-model.mjs';

const items = Array.from({ length: 5 }, (_, index) => ({ id: `r${index}`, title: `唱片 ${index}`, artist: index % 2 ? '甲' : '乙', addedAt: `2026-10-0${index + 1}` }));

test('筛选 appears from 12 records on', () => {
  assert.equal(FILTER_MIN_RECORDS, 12);
  assert.equal(filtersShown(11), false); assert.equal(filtersShown(12), true);
  assert.equal(activeFilterCount({ sort: 'title', type: 'all', box: 'all', genre: '爵士', decade: 'all', provider: 'qq' }), 2);
  assert.equal(activeFilterCount({}), 0);
  assert.equal(isShelfView('liked'), true); assert.equal(isShelfView('wall'), false);
});

test('a short shelf ignores saved filters, newest first; search still narrows it', () => {
  assert.deepEqual(shelfRecords(items, [items[0]]).map((item) => item.id), ['r4', 'r3', 'r2', 'r1', 'r0']);
  assert.deepEqual(shelfRecords(items, [], '甲').map((item) => item.id), ['r3', 'r1']);
  const many = Array.from({ length: 12 }, (_, index) => ({ id: `m${index}`, title: `m${index}` }));
  assert.deepEqual(shelfRecords(many, [many[3]]).map((item) => item.id), ['m3']);
});

test('recent records: distinct, still on the shelf, at most three', () => {
  const listens = [{ id: 'r1', index: 1, title: 'a', at: 9 }, { id: 'r1', index: 0, title: 'b', at: 8 }, { id: 'gone', index: 0, title: 'c', at: 7 }, { id: 'r2', index: 0, title: 'd', at: 6 }, { id: 'r3', index: 0, title: 'e', at: 5 }, { id: 'r4', index: 0, title: 'f', at: 4 }];
  assert.deepEqual(recentRecords(listens, items).map((entry) => [entry.id, entry.index]), [['r1', 1], ['r2', 0], ['r3', 0]]);
  const songs = recentSongs(listens, items);
  assert.equal(songs.length, 6); assert.equal(songs[2].available, false); assert.equal(songs[0].record, '唱片 1');
  assert.deepEqual(recentRecords(null, items), []);
});

test('shortDay reads like a person would say it', () => {
  const now = new Date(2026, 9, 26, 15, 0).getTime();
  assert.equal(shortDay(new Date(2026, 9, 26, 9, 5).getTime(), now), '今天 09:05');
  assert.equal(shortDay(new Date(2026, 9, 25, 23, 59).getTime(), now), '昨天 23:59');
  assert.equal(shortDay(new Date(2026, 2, 3).getTime(), now), '3月3日');
  assert.equal(shortDay(new Date(2025, 2, 3).getTime(), now), '2025年3月3日');
  assert.equal(shortDay(0, now), '');
});

test('the second line is the lyric, else the album, else the record', () => {
  assert.equal(nowLine({ lyric: ' 风吹过 ', album: '专辑' }), '风吹过');
  assert.equal(nowLine({ lyric: '', album: '专辑', record: '歌单' }), '专辑');
  assert.equal(nowLine({ record: '歌单' }), '歌单');
  assert.equal(nowLine(), '');
});
