import test from 'node:test';
import assert from 'node:assert/strict';
import { albumKey } from '../record-library.mjs';
import { binderColour, binderShape, boxItems, byTitle, cardCode, groupByInitial, hasPinyin, indexOrder, initialFor, keepHighlight, lettersWith, moveHighlight, rankRecords, shelfBinders, shelfSlots, seedOf, INITIALS, TIERS } from './shelf-model.mjs';

const rec = (id, title, artist = '某人', extra = {}) => ({ id, type: 'album', title, artist, tracks: [], ...extra });

test('Latin titles are filed under their first letter, ignoring quotes, accents and case', () => {
  assert.equal(initialFor('Blue Hour'), 'B');
  assert.equal(initialFor('  the dark side'), 'T');
  assert.equal(initialFor('“Heroes”'), 'H');
  assert.equal(initialFor('Éclair'), 'E');
  assert.equal(initialFor('ａｂｃ'), 'A');
});
test('digits, symbols, kana and empty titles go under #', () => {
  assert.equal(initialFor('2046'), '#');
  assert.equal(initialFor('★★★'), '#');
  assert.equal(initialFor('ひかり'), '#');
  assert.equal(initialFor(''), '#');
  assert.equal(initialFor(undefined), '#');
});
test('hanzi titles are filed under their pinyin initial', { skip: !hasPinyin() && 'no pinyin collation on this platform' }, () => {
  const expected = { 晴天: 'Q', 周杰伦: 'Z', 雨夜来信: 'Y', 夜航星: 'Y', 后来: 'H', 海阔天空: 'H', 七里香: 'Q', 小幸运: 'X', 爱: 'A', 北京: 'B', '《晴天》': 'Q', 我喜欢: 'W', 陈绮贞: 'C', 刘若英: 'L', 田馥甄: 'T', 不才: 'B', 阿: 'A', 蓝: 'L', 歌: 'G', 马: 'M', 南: 'N', 哦: 'O', 平: 'P', 日: 'R', 山: 'S', 迪: 'D', 飞: 'F', 开: 'K', 恩: 'E', 今: 'J', 夏: 'X', 月: 'Y', 在: 'Z' };
  for (const [title, letter] of Object.entries(expected)) assert.equal(initialFor(title), letter, title);
});
test('every title lands on a known thumb tab', () => {
  for (const title of ['晴天', 'Blue', '2046', '', 'ñandú', '😀', '한국']) assert.ok(INITIALS.includes(initialFor(title)), title);
});

test('groups run A–Z with # last, only for letters that have a record, titles in order inside', () => {
  const items = [rec(1, 'Zed'), rec(2, '2046'), rec(3, 'Abbey'), rec(4, 'Aqua'), rec(5, 'Blue'), rec(6, 'abba')];
  const groups = groupByInitial(items);
  assert.deepEqual(groups.map((g) => g.letter), ['A', 'B', 'Z', '#']);
  assert.deepEqual(groups[0].items.map((i) => i.title), ['abba', 'Abbey', 'Aqua']);
  assert.deepEqual(indexOrder(items).map((i) => i.id), [6, 3, 4, 5, 1, 2]);
  assert.deepEqual([...lettersWith(items)].sort(), ['#', 'A', 'B', 'Z']);
  assert.deepEqual(groupByInitial([]), []);
  assert.deepEqual(groupByInitial(null), []);
});
test('titles tie-break on artist', () => {
  assert.ok(byTitle(rec(1, 'Live', 'A band'), rec(2, 'Live', 'B band')) < 0);
});

test('ranking: name starts with → a word starts with → name contains → artist / tag / track', () => {
  const items = [
    rec('contains', 'The Moonlight Sonata'),         // contains "light"? "moonlight" contains "light"
    rec('word', 'Blue Light Special'),               // a word starts with "light"
    rec('starts', 'Lighthouse'),                     // name starts with "light"
    rec('artist', 'Something Else', 'Light Orchestra'),
    rec('tag', 'Another Thing', 'Nobody', { genre: 'light jazz' }),
    rec('track', 'Quiet Record', 'Nobody', { tracks: ['First Light'] }),
    rec('none', 'Nothing Here', 'Nobody')
  ];
  const ranked = rankRecords(items, 'light');
  assert.deepEqual(ranked.map((r) => r.item.id), ['starts', 'word', 'contains', 'artist', 'tag', 'track']);
  assert.deepEqual(ranked.map((r) => r.tier), [TIERS.nameStarts, TIERS.wordStarts, TIERS.nameContains, TIERS.related, TIERS.related, TIERS.related]);
  assert.deepEqual(ranked.filter((r) => r.tier === TIERS.related).map((r) => r.via), ['artist', 'tag', 'track']);
});
test('ranking is case-insensitive, width-insensitive and works on hanzi', () => {
  const items = [rec(1, '雨夜来信', '陈绮贞'), rec(2, '夜航星', '不才'), rec(3, 'Night Ride')];
  assert.deepEqual(rankRecords(items, '夜').map((r) => r.item.id), [2, 1]);       // starts with first, then contains
  assert.deepEqual(rankRecords(items, 'NIGHT').map((r) => r.item.id), [3]);
  assert.deepEqual(rankRecords(items, 'ＮＩＧＨＴ').map((r) => r.item.id), [3]);
  assert.deepEqual(rankRecords(items, '陈绮贞').map((r) => [r.item.id, r.via]), [[1, 'artist']]);
});
test('a multi-word query needs every word somewhere; empty and blank queries rank nothing', () => {
  const items = [rec(1, 'Kind of Blue', 'Miles Davis', { genre: 'Jazz' }), rec(2, 'Blue Hour', 'Mazzy Star')];
  assert.deepEqual(rankRecords(items, 'miles jazz').map((r) => r.item.id), [1]);
  assert.deepEqual(rankRecords(items, 'miles star').map((r) => r.item.id), []);
  assert.deepEqual(rankRecords(items, '   '), []);
  assert.deepEqual(rankRecords(items, ''), []);
  assert.deepEqual(rankRecords(null, 'x'), []);
});
test('ranking uses the tags the shelf supplies (the record library merges saved genres)', () => {
  const items = [rec(1, 'Plain', 'Nobody'), rec(2, 'Other', 'Nobody')];
  const tagsOf = (item) => item.id === 1 ? ['摇滚'] : [];
  assert.deepEqual(rankRecords(items, '摇滚', { tagsOf }).map((r) => r.item.id), [1]);
  assert.deepEqual(rankRecords(items, '摇滚').map((r) => r.item.id), []);
});
test('ties inside a tier keep book order', () => {
  const items = [rec(1, 'Lunar B'), rec(2, 'Lunar A'), rec(3, 'Lunar C')];
  assert.deepEqual(rankRecords(items, 'lunar').map((r) => r.item.title), ['Lunar A', 'Lunar B', 'Lunar C']);
});

test('the highlight moves with the arrows, wraps, and never points past the list', () => {
  assert.equal(moveHighlight(-1, 'ArrowDown', 3), 0);
  assert.equal(moveHighlight(0, 'ArrowDown', 3), 1);
  assert.equal(moveHighlight(2, 'ArrowDown', 3), 0);
  assert.equal(moveHighlight(-1, 'ArrowUp', 3), 2);
  assert.equal(moveHighlight(0, 'ArrowUp', 3), 2);
  assert.equal(moveHighlight(1, 'ArrowUp', 3), 0);
  assert.equal(moveHighlight(1, 'Home', 3), 0);
  assert.equal(moveHighlight(1, 'End', 3), 2);
  assert.equal(moveHighlight(1, 'x', 3), 1);
  assert.equal(moveHighlight(9, 'ArrowDown', 3), 0);
  assert.equal(moveHighlight(0, 'ArrowDown', 0), -1);
  assert.equal(moveHighlight(5, 'ArrowUp', 0), -1);
});
test('a new result list keeps the highlight on the same record when it is still there', () => {
  const results = [{ item: { id: 'a' } }, { item: { id: 'b' } }, { item: { id: 'c' } }];
  assert.equal(keepHighlight('b', results), 1);
  assert.equal(keepHighlight('z', results), 0);
  assert.equal(keepHighlight('a', []), -1);
  assert.equal(keepHighlight(undefined, results), 0);
});

test('binders: three system views first, then one per 唱片盒, each with its count', () => {
  const a = rec(1, 'A'), b = rec(2, 'B'), c = rec(3, 'C');
  const boxes = [{ id: 'x1', name: '摇滚', keys: [albumKey(a), albumKey(b)] }, { id: 'x2', name: '雨天', keys: [albumKey(c), 'gone'] }, { id: 'x3', name: '空盒', keys: [] }];
  assert.deepEqual(boxItems([a, b, c], boxes[0]).map((i) => i.id), [1, 2]);
  const binders = shelfBinders({ boxes, items: [a, b, c], counts: { records: 3, liked: 5, recent: 0 } });
  assert.deepEqual(binders.map((x) => [x.id, x.label, x.count, x.unit]), [['records', '唱片', 3, '张'], ['liked', '我喜欢', 5, '首'], ['recent', '最近播放', 0, '首'], ['box:x1', '摇滚', 2, '张'], ['box:x2', '雨天', 1, '张'], ['box:x3', '空盒', 0, '张']]);
  assert.ok(binders.every((x) => x.colour.spine.startsWith('#')));
  assert.deepEqual(binders.filter((x) => x.kind === 'box').map((x) => x.box), ['x1', 'x2', 'x3']);
  assert.equal(shelfBinders().length, 3);
});
test('binder looks are stable and bounded', () => {
  assert.equal(binderColour(0).id, binderColour(4).id);
  assert.equal(binderColour(-1).id, binderColour(3).id);
  assert.equal(seedOf('a'), seedOf('a'));
  assert.notEqual(seedOf('a'), seedOf('b'));
  for (const id of ['records', 'liked', 'recent', 'box:1', 'box:2', 'box:3', 'box:4', 'box:5']) {
    const s = binderShape(id);
    assert.ok(s.width >= 76 && s.width <= 94 && s.height >= 88 && s.height <= 100, id);
    assert.deepEqual(s, binderShape(id));
  }
});
test('card numbers are zero-padded', () => {
  assert.equal(cardCode(13, 57), '014 / 057');
  assert.equal(cardCode(0, 1), '001 / 001');
});
test('eight binders stand on the board; past eight, the last one is 更多 and holds the rest', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, label: `盒${i}` }));
  assert.deepEqual(shelfSlots(make(3)), { standing: make(3), rest: [] });
  assert.equal(shelfSlots(make(8)).standing.length, 8);
  assert.equal(shelfSlots(make(8)).rest.length, 0);
  const many = shelfSlots(make(11));
  assert.equal(many.standing.length, 8);
  assert.deepEqual(many.standing.slice(0, 7).map((b) => b.id), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  assert.deepEqual([many.standing[7].id, many.standing[7].label, many.standing[7].count, many.standing[7].unit], ['more', '更多', 4, '盒']);
  assert.deepEqual(many.rest.map((b) => b.id), ['b7', 'b8', 'b9', 'b10']);
  assert.deepEqual(shelfSlots(undefined), { standing: [], rest: [] });
});
