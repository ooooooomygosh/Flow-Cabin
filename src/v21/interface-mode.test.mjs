import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERFACE_KEY, interfaceMode, switchInterface } from '../interface-mode.mjs';

function storage(value) {
  const data = new Map(value == null ? [] : [[INTERFACE_KEY, value]]);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test('Existing and new installations stay classic without explicit local opt-in', () => {
  for (const value of [null, '', 'classic', 'true', '2.1', 'unknown']) assert.equal(interfaceMode(storage(value)), 'classic');
  assert.equal(interfaceMode(storage('beta')), 'beta');
  assert.equal(interfaceMode({ getItem() { throw Error('unavailable'); } }), 'classic');
});
test('Switching persists and flushes the chosen mode before requesting restart, in both directions', async () => {
  const saved = storage();
  for (const mode of ['beta', 'classic']) {
    const calls = [];
    await switchInterface(mode, { storage: saved, flush: async () => calls.push(['saved', interfaceMode(saved)]), restart: async () => calls.push(['restart', interfaceMode(saved)]) });
    assert.deepEqual(calls, [['saved', mode], ['restart', mode]]);
  }
});
test('Failed native save never restarts and restores the previous choice', async () => {
  const saved = storage(); let restarted = false;
  await assert.rejects(switchInterface('beta', { storage: saved, flush: async () => { throw Error('disk full'); }, restart: () => { restarted = true; } }), /disk full/);
  assert.equal(restarted, false); assert.equal(saved.getItem(INTERFACE_KEY), null);
});
test('Failed restart rolls back the previous Beta choice and flushes that rollback', async () => {
  const saved = storage('beta'), flushed = [];
  await assert.rejects(switchInterface('classic', { storage: saved, flush: async () => flushed.push(interfaceMode(saved)), restart: () => { throw Error('restart failed'); } }), /restart failed/);
  assert.equal(interfaceMode(saved), 'beta'); assert.deepEqual(flushed, ['classic', 'beta']);
  await assert.rejects(switchInterface('other', { storage: saved }), /未知/);
});

test('Classic fallback preserves the eight-theme catalog and only uses supported shelf geometry', async () => {
  const { ROOM_SCENES, CLASSIC_ROOM_SCENES, classicSceneId } = await import('../scene-catalog.mjs');
  assert.equal(ROOM_SCENES.length, 8); assert.equal(CLASSIC_ROOM_SCENES.length, 6);
  for (const scene of ROOM_SCENES) assert.ok(CLASSIC_ROOM_SCENES.some(s => s.id === classicSceneId(scene.id)));
  assert.equal(classicSceneId('rain-train'), 'warm'); assert.equal(classicSceneId('greenhouse'), 'forest');
});
