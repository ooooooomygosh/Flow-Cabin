import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INCLUDE, POSTCARD_ITEMS, cleanCaption, postcardItems, postcardLines } from './postcard-model.mjs';

const input = { theme: '林间书屋', pet: '枫糖', date: new Date(2026, 9, 23), tasks: [{ text: '交周报', done: true }, { text: '给妈妈打电话', done: false }], notes: '  明天\n早点起  ', weather: { on: true, city: '杭州', temperature: 18.6 } };

test('private items start unchecked; only the signature and the count are shared by default', () => {
  assert.deepEqual(Object.entries(DEFAULT_INCLUDE).filter(([, on]) => on).map(([id]) => id), ['signature', 'achievement']);
  assert.deepEqual(POSTCARD_ITEMS.filter((item) => item.private).map((item) => item.id), ['tasks', 'note', 'place']);
  assert.deepEqual(postcardLines(postcardItems(input)), ['林间书屋 · 枫糖 · 2026/10/23', '已完成 1 项小事']);
});

test('each item shows exactly the text that would be printed', () => {
  const items = Object.fromEntries(postcardItems(input).map((item) => [item.id, item]));
  assert.equal(items.tasks.text, '今日任务：✓ 交周报 · 给妈妈打电话');
  assert.equal(items.note.text, '明天 早点起');
  assert.equal(items.place.text, '杭州 · 19°');
  const all = Object.fromEntries(POSTCARD_ITEMS.map((item) => [item.id, true]));
  assert.deepEqual(postcardLines(Object.values(items), all), Object.values(items).map((item) => item.text));
});

test('items with nothing to say are unavailable and never printed, even when checked', () => {
  const items = postcardItems({ theme: '像素小屋', pet: '奶糖', tasks: [], notes: '', weather: { on: false } });
  const by = Object.fromEntries(items.map((item) => [item.id, item]));
  for (const id of ['achievement', 'tasks', 'note', 'place']) assert.equal(by[id].available, false, id);
  const all = Object.fromEntries(POSTCARD_ITEMS.map((item) => [item.id, true]));
  assert.equal(postcardLines(items, all).length, 1);
  assert.deepEqual(postcardLines(items, { ...all, signature: false }), []);
});

test('the caption is one short line', () => {
  assert.equal(cleanCaption('  留一盏灯，\n给今天。 '), '留一盏灯， 给今天。');
  assert.equal(cleanCaption('字'.repeat(60)).length, 40);
  assert.equal(cleanCaption(null), '');
});
