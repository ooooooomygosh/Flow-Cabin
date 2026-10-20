import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RECORD_STYLE, MAX_LIBRARY_BYTES, albumKey, genreList, genresFor, matchesLibraryFilters, normalizeLibrary, normalizeStyle, readLibrary, resolveRecordStyle } from './record-library.mjs';

const storage = (entries = {}) => ({ getItem: (key) => entries[key] ?? null });

// 回归：opacity 为 null 曾经变成 0，整张黑胶会变成全透明（看不见唱片）。
test('a missing opacity keeps the record visible', () => {
  for (const value of [null, undefined, '', '   ', false, true, NaN, 'abc', {}]) {
    const style = normalizeStyle({ base: '#123456', opacity: value });
    assert.equal(style.opacity, 100, JSON.stringify(value));
    assert.notEqual(style.opacity, 0, 'an invisible record is never the fallback');
  }
  assert.equal(normalizeStyle({ opacity: 0 }).opacity, 0, 'a real zero is still zero');
  assert.equal(normalizeStyle({ opacity: 55.6 }).opacity, 56);
  assert.equal(normalizeStyle({ opacity: 1000 }).opacity, 100);
  assert.equal(normalizeStyle({ opacity: -5 }).opacity, 0);
  assert.equal(normalizeStyle({ base: '#AABBCC' }).base, '#aabbcc');
  assert.equal(normalizeStyle({ base: 'red' }).base, DEFAULT_RECORD_STYLE.base);
  assert.deepEqual(normalizeStyle({ splashes: ['#aabbcc', 'nope', '#112233'] }).splashes, ['#aabbcc', DEFAULT_RECORD_STYLE.splashes[1], '#112233']);
  assert.deepEqual(normalizeStyle({ splash: '#aabbcc' }).splashes, ['#aabbcc']);
  assert.deepEqual(normalizeStyle({}).splashes, [...DEFAULT_RECORD_STYLE.splashes]);
});

test('an automatic style follows the cover colour, a manual one does not', () => {
  const automatic = resolveRecordStyle({ autoBase: true }, '#0a0b0c');
  assert.equal(automatic.base, '#0a0b0c');
  assert.equal(Object.hasOwn(automatic, 'autoBase'), false, 'resolved styles are plain display values');
  const manual = resolveRecordStyle({ autoBase: false, base: '#112233' }, '#0a0b0c');
  assert.equal(manual.base, '#112233');
  assert.equal(resolveRecordStyle(null, '#0a0b0c').base, '#0a0b0c', 'a missing style is automatic');
});

test('album identities are stable and genre lists are cleaned', () => {
  assert.equal(albumKey({ externalIds: { qqAlbumMid: 'mid' }, collectionId: 'c', id: 'i' }), 'qq:mid');
  assert.equal(albumKey({ collectionId: 'c', id: 'i' }), 'itunes:c');
  assert.equal(albumKey({ id: 'i' }), 'item:i');
  assert.equal(albumKey({ artist: 'A', title: 'T' }), 'name:A:T');
  assert.deepEqual(genreList('爵士, 摇滚；blues、jazz'), ['爵士', '摇滚', 'blues', 'jazz']);
  assert.deepEqual(genreList(['a', 'a', '  ']), ['a']);
  assert.deepEqual(genreList(null), []);
  assert.deepEqual(genresFor({ genres: ['爵士', 'Album', '专辑'] }, { genres: {} }), ['爵士'], 'catalogue noise is not a genre');
  assert.deepEqual(genresFor({ id: 'x' }, { genres: { 'item:x': ['手记'] } }), ['手记'], 'a saved genre wins');
});

test('a stored library is cleaned without inventing rooms or boxes', () => {
  const library = normalizeLibrary({
    styles: { 'item:a': { base: '#101010' }, evil: { base: '#101010' }, '__proto__': { base: '#101010' } },
    genres: { 'item:a': ['爵士'], 'nope': ['x'] },
    rooms: {
      home: { look: 'warm', petId: 'fox', boxes: [{ id: 'b1', name: '夜晚', keys: ['item:a', 'evil', 'item:a'] }, { id: 'b1', name: '重复编号' }, { id: 'b2', name: '夜晚' }, { id: 'b3' }], turntable: { x: 0.4, y: 1.4 } },
      '__proto__': { look: 'warm' }, 'constructor': { look: 'warm' }, 'bad id': { look: 'warm' }
    }
  });
  assert.deepEqual(Object.keys(library.rooms), ['home']);
  assert.deepEqual(library.rooms.home.boxes, [{ id: 'b1', name: '夜晚', keys: ['item:a'] }]);
  assert.equal(library.rooms.home.look, 'warm');
  assert.equal(library.rooms.home.petId, 'fox');
  assert.deepEqual(library.rooms.home.turntable, { x: 0.4, y: 1 });
  assert.deepEqual(Object.keys(library.styles), ['item:a']);
  assert.deepEqual(Object.keys(library.genres), ['item:a']);
  assert.equal(Object.getPrototypeOf(library.rooms), Object.prototype, 'no prototype keys were created');
  assert.equal(Object.hasOwn(library.rooms, '__proto__'), false, 'a room named __proto__ never becomes the prototype');
  // 非法场景与伙伴回退到默认值。
  const fallback = normalizeLibrary({ rooms: { home: { look: 'nope', petId: 'nope' } } });
  assert.equal(fallback.rooms.home.look, 'pixel');
  assert.equal(fallback.rooms.home.petId, 'cat');
});

test('an unreadable or oversized library falls back to an empty one', () => {
  assert.deepEqual(readLibrary(storage({ 'album-circle-library-v1-local-owner': '{bad' }), 'local-owner'), normalizeLibrary());
  assert.deepEqual(readLibrary(storage({ 'album-circle-library-v1-local-owner': 'x'.repeat(MAX_LIBRARY_BYTES + 1) }), 'local-owner'), normalizeLibrary());
  const restored = readLibrary(storage({ 'album-circle-library-v1-local-owner': JSON.stringify({ rooms: { home: { look: 'starlight' } } }) }), 'local-owner');
  assert.equal(restored.rooms.home.look, 'starlight');
  assert.deepEqual(normalizeLibrary(null), { version: 1, styles: {}, genres: {}, rooms: {} });
});

test('shelf filters answer even when the library or the filter is missing', () => {
  const item = { id: 'a', title: 'T', artist: 'A', collectionId: 'c' };
  const data = normalizeLibrary({ genres: { 'itunes:c': ['爵士'] }, rooms: { home: { boxes: [{ id: 'b1', name: '夜晚', keys: ['itunes:c'] }] } } });
  assert.equal(matchesLibraryFilters(item, data, 'home', { box: 'b1' }), true);
  assert.equal(matchesLibraryFilters(item, data, 'home', { box: 'unfiled' }), false);
  assert.equal(matchesLibraryFilters(item, data, 'home', { genre: '爵士' }), true);
  assert.equal(matchesLibraryFilters(item, data, 'home', { genre: 'unmarked' }), false);
  assert.equal(matchesLibraryFilters(item, data, 'home', { provider: 'itunes' }), true);
  assert.equal(matchesLibraryFilters(item, data, 'home', { provider: 'qq' }), false);
  // 缺数据或缺筛选条件时不崩，答案只是“没有被筛掉”。
  assert.equal(matchesLibraryFilters(item, undefined, 'home'), true);
  assert.equal(matchesLibraryFilters(item, data, 'home'), true);
  assert.equal(matchesLibraryFilters(item, {}, 'home', { box: 'b1' }), false, '本机没有这个唱片盒时不算命中');
  assert.deepEqual(genresFor(item, undefined), []);
});
