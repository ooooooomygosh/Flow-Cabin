import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERFACE_KEY, HOME_NOTICE_KEY, retireClassicHome } from '../interface-mode.mjs';

const storage = (initial = {}) => { const data = new Map(Object.entries(initial)); return { data, getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }; };

test('3.1 has one home: a stored classic (or beta) choice and the old home notice are forgotten', () => {
  for (const value of ['classic', 'beta', 'unknown']) {
    const saved = storage({ [INTERFACE_KEY]: value, [HOME_NOTICE_KEY]: 'done', other: 'kept' });
    retireClassicHome(saved);
    assert.equal(saved.getItem(INTERFACE_KEY), null); assert.equal(saved.getItem(HOME_NOTICE_KEY), null);
    assert.equal(saved.getItem('other'), 'kept', 'other settings are untouched');
  }
  retireClassicHome(storage());
});

test('unavailable storage never stops the app from opening', () => {
  const blocked = { removeItem() { throw Error('SecurityError'); } };
  assert.doesNotThrow(() => retireClassicHome(blocked));
});

test('the scene catalog no longer has a classic subset: every room is a cabin room', async () => {
  const catalog = await import('../scene-catalog.mjs');
  assert.equal(catalog.ROOM_SCENES.length, 8);
  assert.equal(catalog.CLASSIC_ROOM_SCENES, undefined); assert.equal(catalog.classicSceneId, undefined);
});
