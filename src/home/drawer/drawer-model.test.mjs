import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTS, objectKind, layOn, normalizeItems, pickAction, tabOrder, nextPhase } from './drawer-model.mjs';
import { gearMenu } from '../shell-model.mjs';

test('every item of the gear menu is an object in the drawer', () => {
  const all = gearMenu({ scenes: true, postcard: true });
  for (const [id] of [...all.core, ...all.lab]) assert.ok(OBJECTS[id], `${id} has an object`);
  assert.deepEqual(['themes', 'decorate', 'backup', 'settings'].map(objectKind), ['album', 'toolbox', 'tin', 'screwdriver']);
  assert.deepEqual(['recipes', 'sleep', 'postcard'].map(objectKind), ['recipe', 'lamp', 'camera']);
  assert.equal(objectKind('something-new'), 'card');
});

test('objects lie at their own small angle, always the same', () => {
  assert.deepEqual(layOn('themes'), layOn('themes'));
  const tilts = Object.keys(OBJECTS).map((id) => layOn(id).tilt);
  assert.equal(new Set(tilts).size, tilts.length);
  for (const tilt of tilts) assert.ok(Math.abs(tilt) <= 4, 'a tidy desk, no more than 4 degrees');
});

test('items come from gearMenu() or from a plain list, and keep their names', () => {
  const list = normalizeItems(gearMenu({ scenes: true }));
  assert.deepEqual(list.core.map((item) => item.name), ['选择小屋', '布置小屋', '备份与恢复', '全部设置']);
  assert.deepEqual(list.lab.map((item) => item.id), ['recipes', 'sleep']);
  assert.deepEqual(tabOrder(list), ['themes', 'decorate', 'backup', 'settings', 'recipes', 'sleep']);
  assert.deepEqual(normalizeItems([['themes', '选择小屋']]).core.map((item) => item.kind), ['album']);
  assert.deepEqual(normalizeItems(undefined), { core: [], lab: [] });
  assert.deepEqual(normalizeItems({ core: [['', 'x'], ['a', 'A']] }).core.map((item) => item.id), ['a']);
  assert.equal(normalizeItems([{ id: 'x', name: 'Y' }]).core[0].name, 'Y');
});

test('picking an object does what the old 小屋日常 menu did', () => {
  assert.deepEqual(pickAction('themes'), { type: 'themes' });
  assert.deepEqual(pickAction('decorate'), { type: 'decorate' });
  assert.deepEqual(pickAction('backup'), { type: 'open', id: 'backup' });
  assert.deepEqual(pickAction('settings'), { type: 'open', id: 'settings' });
});

test('the drawer slides out, rests, slides back; reduced motion only cuts', () => {
  assert.equal(nextPhase('out', 'open'), 'opening');
  assert.equal(nextPhase('opening', 'settled'), 'open');
  assert.equal(nextPhase('open', 'close'), 'closing');
  assert.equal(nextPhase('closing', 'settled'), 'out');
  assert.equal(nextPhase('closing', 'open'), 'opening');
  assert.equal(nextPhase('out', 'close'), 'out');
  assert.equal(nextPhase('out', 'open', { reduced: true }), 'open');
  assert.equal(nextPhase('open', 'close', { reduced: true }), 'out');
});
