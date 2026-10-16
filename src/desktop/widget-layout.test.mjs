import test from 'node:test';
import assert from 'node:assert/strict';
import { clampWidget, normalizeWidgetLayout, readWidgetLayout, writeWidgetLayout, defaultWidgetLayout } from './widget-layout.mjs';

test('widget layout: positions stay on screen and bad storage falls back', () => {
  assert.deepEqual(clampWidget({ x: 1.5, y: -2 }, .2, .1), { x: .8, y: 0 });
  assert.deepEqual(normalizeWidgetLayout({ clock: { x: 'x', y: .5 }, extra: { x: 1 } }).clock, { x: defaultWidgetLayout().clock.x, y: .5 });
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(readWidgetLayout(storage), defaultWidgetLayout());
  writeWidgetLayout({ ...defaultWidgetLayout(), todo: { x: .4, y: .4 } }, storage);
  assert.deepEqual(readWidgetLayout(storage).todo, { x: .4, y: .4 });
  storage.setItem('album-circle-desktop-widgets-v1', '{broken'); assert.deepEqual(readWidgetLayout(storage), defaultWidgetLayout());
});

test('widget layout: follows the scene until arranged, and 整理小组件 hands it back', async () => {
  const { SCENE_WIDGETS, readSavedWidgetLayout, clearWidgetLayout } = await import('./widget-layout.mjs');
  const { ROOM_SCENE_IDS } = await import('../scene-catalog.mjs');
  for (const id of Object.keys(SCENE_WIDGETS)) assert.ok(ROOM_SCENE_IDS.includes(id), `${id} is a scene`);
  // Every scene's cards fit a 960×600 window: 220-px cards; clock ≤ 205, focus ≤ 245, todo ≤ 130, music ≤ 115 px tall.
  for (const look of [undefined, ...ROOM_SCENE_IDS]) {
    const l = defaultWidgetLayout(look);
    for (const id of ['clock', 'music', 'focus', 'todo']) assert.ok(l[id].x + 220 / 960 <= 1.001 && l[id].y >= 0, `${look} ${id} on screen`);
    const box = (id, h) => ({ x0: l[id].x * 960, x1: l[id].x * 960 + 220, y0: l[id].y * 600, y1: l[id].y * 600 + h });
    const boxes = [box('clock', 205), box('music', 115), box('focus', 245), box('todo', 130)];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]; assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${look}: cards ${i} and ${j} overlap`);
    }
  }
  assert.notDeepEqual(defaultWidgetLayout('forest'), defaultWidgetLayout('warm'));
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(readSavedWidgetLayout(storage), null);
  assert.deepEqual(readWidgetLayout(storage, 'starlight'), defaultWidgetLayout('starlight'));
  writeWidgetLayout({ ...defaultWidgetLayout('warm'), todo: { x: .5, y: .5 } }, storage);
  assert.deepEqual(readSavedWidgetLayout(storage).todo, { x: .5, y: .5 });
  clearWidgetLayout(storage); assert.equal(readSavedWidgetLayout(storage), null);
  storage.setItem('album-circle-desktop-widgets-v1', '{broken'); assert.equal(readSavedWidgetLayout(storage), null);
});
