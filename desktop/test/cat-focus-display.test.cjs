'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { cleanFocus } = require('../wallpaper-model.cjs');
test('minute display rounds upward without changing timing, pause or rewards', async () => {
  const m = await import('../../src/focus/focus-model.mjs');
  for (const [ms, text] of [[120001, '3 分钟'], [120000, '2 分钟'], [60001, '2 分钟'], [60000, '1 分钟'], [1, '1 分钟'], [0, '0 分钟']]) assert.equal(m.formatClock(ms, true), text);
  assert.equal(m.formatClock(61000), '01:01');
  let state = m.normalizeFocus({ settings: { focusMin: 2, hideSeconds: true, catSkin: 'black' } });
  state = m.startPhase(state, 'focus', 1000);
  assert.equal(m.tick(state, 120999).event, null);
  const paused = m.pause(state, 60999), resumed = m.resume(paused, 80000);
  assert.equal(paused.timer.remaining, 60001);
  assert.equal(resumed.timer.endsAt, 140001);
  assert.equal(m.tick(resumed, 140000).event, null);
  const result = m.tick(resumed, 140001);
  assert.equal(result.event.completed, true); assert.equal(result.state.rewards.fish, 1);
  assert.equal(m.tick(result.state, 140002).event, null);
  const saved = JSON.stringify(state), loaded = m.readFocus({ getItem: () => saved }, 'test');
  assert.deepEqual(loaded.settings, state.settings);
  const snapshot = cleanFocus(m.focusSnapshot(loaded, 1000));
  assert.equal(snapshot.catSkin, 'black'); assert.equal(snapshot.hideSeconds, true);
  assert.equal(cleanFocus({ catSkin: '<script>', hideSeconds: 'true' }).catSkin, 'orange');
  assert.equal(cleanFocus({ hideSeconds: 'true' }).hideSeconds, false);
});
test('stroll cadence, bounded path, rest and disabled states', async () => {
  const { catStroll, petPose } = await import('../../src/pet/pet-model.mjs');
  for (let t = 0; t < 120000; t += 500) assert.equal(catStroll(t).walking, false);
  assert.equal(catStroll(124000).x, 16);
  assert.deepEqual(catStroll(128000), { walking: false, x: 0 });
  for (let t = 0; t < 300000; t += 500) { const v = catStroll(t); assert.ok(v.x >= 0 && v.x <= 16); assert.deepEqual(catStroll(t, 120000, false), { walking: false, x: 0 }); }
  assert.equal(petPose({ phase: 'focus' }), 'focus'); assert.equal(petPose({ playing: true, synced: true }), 'groove'); assert.notEqual(petPose({ playing: true }), 'groove', 'no real beat: no dance');
});
test('both night palettes preserve every sprite silhouette and lower highlights', async () => {
  const { CAT_PALETTES, PALETTE, POSES, catFrame, drawFrame } = await import('../../src/pet/cat-sprites.mjs');
  for (const skin of ['orange', 'black']) for (const pose of Object.keys(POSES)) {
    let painted = 0;
    drawFrame({ clearRect() {}, fillRect() { painted++; } }, catFrame(pose, 0), 1, skin);
    assert.ok(painted > 80);
    const brightness = (c) => c.match(/[\da-f]{2}/gi).reduce((a, x) => a + parseInt(x, 16), 0);
    assert.ok(brightness(CAT_PALETTES[skin][7]) < brightness(PALETTE[7]));
    assert.notEqual(CAT_PALETTES[skin][1], CAT_PALETTES[skin][2]);
  }
});
