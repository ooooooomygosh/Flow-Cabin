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
