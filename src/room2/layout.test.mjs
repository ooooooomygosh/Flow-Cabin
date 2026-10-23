import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, defaultLayout, validateLayout, placement, createLayoutHistory } from './layout.mjs';
test('every theme has three valid nonoverlapping presets with fourteen functional objects', () => {
  for (const theme of THEMES) for (const preset of ['work', 'listen', 'rest']) assert.equal(validateLayout(defaultLayout(theme.id, preset)).items.length, 14);
});
test('mount constraints, overlap and rotations are validated before history changes', () => {
  const initial = defaultLayout(), history = createLayoutHistory(initial);
  assert.throws(() => placement(initial, 'clock', 40, 500), /墙面/);
  assert.throws(() => placement(initial, 'clock', 736, 112), /已有/);
  assert.throws(() => placement(initial, 'clock', 128, 120), /窗户/);
  const next = placement(initial, 'clock', 392, 136); history.apply(next); assert.equal(history.get().items.find(i => i.id === 'clock').y, 136);
  assert.deepEqual(history.undo(), initial); assert.deepEqual(history.redo(), next);
  assert.throws(() => validateLayout({ ...initial, version: 99 }));
});

test('inventory adds all eight actual extras to legal free desk space without changing the default scene', async () => {
  const { addFurniture, removeFurniture, FURNITURE, bounds } = await import('./layout.mjs');
  const history = createLayoutHistory(defaultLayout());
  const extras = Object.keys(FURNITURE).filter(type => FURNITURE[type].atlas === 'extras');
  assert.equal(extras.length, 8);
  let value = history.get();
  for (const type of extras) { value = addFurniture(value, type); assert.equal(bounds(value.items.at(-1)).y + bounds(value.items.at(-1)).h, 336); }
  history.apply(value); assert.equal(validateLayout(value).items.length, 22);
  assert.throws(() => addFurniture(value, 'sun'), /不支持/);
  assert.throws(() => addFurniture(value, 'vinyl'), /已经/);
  history.apply(removeFurniture(value, 'vinyl')); assert.equal(history.get().items.length, 21);
  assert.equal(history.undo().items.length, 22); assert.equal(history.redo().items.length, 21);
  assert.equal(defaultLayout().items.length, 14);
});
