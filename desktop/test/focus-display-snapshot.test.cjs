'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { cleanSnapshot, cleanFocus, cleanFocusDisplay, CATALOG_IDS } = require('../wallpaper-model.cjs');

// The wallpaper lives in its own partition: the 专注画面 choice and the round's
// length reach it only through the companion snapshot.
test('face and show ids match the renderer catalog', async () => {
  const { FACE_IDS, SHOW_MODES } = await import('../../src/focus/focus-display.mjs');
  assert.deepEqual(CATALOG_IDS.faces, [...FACE_IDS]);
  assert.deepEqual(CATALOG_IDS.shows, SHOW_MODES.map(([id]) => id));
});

test('the focus snapshot carries the round length, and the wallpaper keeps it', async () => {
  const m = await import('../../src/focus/focus-model.mjs');
  let state = m.normalizeFocus({ settings: { focusMin: 30, shortMin: 6, longEvery: 3 } });
  assert.equal(cleanFocus(m.focusSnapshot(state, 1000)).duration, 0, 'idle has no round');
  state = m.startPhase(state, 'focus', 1000);
  const snap = m.focusSnapshot(state, 61000), clean = cleanFocus(snap);
  assert.equal(snap.duration, 30 * 60000); assert.equal(clean.duration, 30 * 60000); assert.equal(clean.longEvery, 3);
  assert.equal(clean.endsAt - 61000, 29 * 60000);
  const { faceModel } = await import('../../src/focus/face-model.mjs');
  const model = faceModel({ now: 61000, focus: clean });
  assert.ok(Math.abs(model.progress - 1 / 30) < 1e-9, 'the wallpaper face draws progress');
  assert.equal(cleanFocus({ duration: -5 }).duration, 0);
  // 2.2: +5 分钟 can stretch a round up to the 4-hour session limit.
  assert.equal(cleanFocus({ duration: 1e12 }).duration, 4 * 3600000);
  assert.equal(cleanFocus({ longEvery: 'x' }).longEvery, 4);
  assert.equal(cleanFocus({ longEvery: 99 }).longEvery, 8);
});

test('the display choice is relayed, normalised and defaults to the scene face', async () => {
  const { faceFor } = await import('../../src/focus/focus-display.mjs');
  assert.deepEqual(cleanFocusDisplay({ mode: 'record', show: 'clock', seconds: true }), { mode: 'record', show: 'clock', seconds: true });
  assert.deepEqual(cleanFocusDisplay({ mode: '__proto__', show: '<b>', seconds: 'true' }), { mode: '', show: 'auto', seconds: false });
  assert.deepEqual(cleanFocusDisplay(null), { mode: '', show: 'auto', seconds: false });
  const wall = cleanSnapshot({ look: 'forest', focusDisplay: { mode: 'ring', show: 'timer' } });
  assert.deepEqual(wall.focusDisplay, { mode: 'ring', show: 'timer', seconds: false });
  assert.equal(faceFor(wall.focusDisplay, wall.look), 'ring');
  const old = cleanSnapshot({ look: 'forest' }); // a main window from before this field
  assert.equal(faceFor(old.focusDisplay, old.look), 'growth');
});

test('the main window exposes the display choice to the wallpaper read', () => {
  const vm = require('node:vm'), source = require('node:fs').readFileSync(require.resolve('../companion-sync.cjs'), 'utf8');
  const script = source.match(/const READ_SCRIPT = `([\s\S]*?)`;/)[1];
  const window = { albumRoomSnapshot: () => ({ look: 'warm' }), albumCompanionSnapshot: () => ({ focus: { phase: 'focus' }, focusDisplay: { mode: 'window', show: 'auto', seconds: false } }) };
  const out = vm.runInNewContext(script, { window, document: { documentElement: { dataset: {} } } });
  assert.deepEqual(out.room.focusDisplay, { mode: 'window', show: 'auto', seconds: false });
  assert.equal(cleanSnapshot(out.room).focusDisplay.mode, 'window');
});
