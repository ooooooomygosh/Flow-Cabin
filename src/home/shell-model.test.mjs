import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ENTRIES, HOTSPOTS, hotspotItems, gearMenu, gatedAction } from './shell-model.mjs';
import { defaultLayout } from './spatial-layout.mjs';

test('the top bar has exactly three entries: 唱片架 · 专注 · 日记', () => {
  assert.deepEqual(NAV_ENTRIES.map((entry) => entry.label), ['唱片架', '专注', '日记']);
  assert.deepEqual(NAV_ENTRIES.map((entry) => entry.action), ['library', 'timer', 'diary']);
});

test('the default room labels three hotspots: 唱机, 书桌, 窝', () => {
  const spots = hotspotItems(defaultLayout('pixel').items);
  assert.equal(spots.size, 3);
  assert.deepEqual([...spots.entries()].map(([id, spot]) => [id, spot.label, spot.action]), [['deck', '唱机', 'music'], ['desk', '书桌', 'timer'], ['bed', '窝 · 日记本', 'diary']]);
  assert.ok(spots.size <= 3, 'at most three permanent labels (§9)');
});

test('hotspots fall back to other furniture, and a missing kind is simply not labelled', () => {
  const spots = hotspotItems([{ id: 'c', type: 'clock' }, { id: 'j', type: 'journal' }, { id: 'b', type: 'bed' }, { id: 'p', type: 'plant' }]);
  assert.deepEqual([...spots.keys()], ['c', 'j']);
  assert.equal(spots.get('c').label, '专注钟');
  assert.equal(spots.get('j').label, '日记本', 'the 手账本 wins over the bed');
  assert.equal(hotspotItems([]).size, 0);
  assert.equal(HOTSPOTS.length, 3);
});

test('the gear menu keeps four items; lab items only appear when their lab is on', () => {
  assert.deepEqual(gearMenu({}).core.map(([, name]) => name), ['选择小屋', '布置小屋', '备份与恢复', '全部设置']);
  assert.deepEqual(gearMenu({}).lab, []);
  assert.deepEqual(gearMenu({ scenes: true }).lab.map(([id]) => id), ['recipes', 'sleep']);
  assert.deepEqual(gearMenu({ postcard: true }).lab.map(([id]) => id), ['postcard']);
  for (const [id] of gearMenu({ scenes: true, postcard: true }).core) assert.ok(!['weather', 'diagnostics', 'interface'].includes(id));
});

test('furniture never opens a feature whose lab is off', () => {
  assert.equal(gatedAction('mail', {}), 'diary');
  assert.equal(gatedAction('mail', { letters: true }), 'mail');
  assert.equal(gatedAction('postcard', {}), 'diary');
  assert.equal(gatedAction('postcard', { postcard: true }), 'postcard');
  assert.equal(gatedAction('study', {}), 'library');
  assert.equal(gatedAction('study', { study: true }), 'study');
  assert.equal(gatedAction('recipes', {}), '');
  assert.equal(gatedAction('music', {}), 'music', 'core actions pass through');
  assert.equal(gatedAction('timer', {}), 'timer');
});
