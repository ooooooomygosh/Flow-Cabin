import test from 'node:test';
import assert from 'node:assert/strict';
import { roomPetPose, watchInputPresence } from './pet-presence.mjs';
import { cachedPetFrame, drawPetFrame } from './pet-sprites.mjs';
import { activeInputPose, CLICK_HOLD_MS, TYPING_HOLD_MS } from './pet-model.mjs';

test('the latest input wins, then a still-fresh typing hold resumes after a click', () => {
  const now = 10_000;
  assert.deepEqual(activeInputPose({ now }), { pose: '', until: 0 });
  assert.deepEqual(activeInputPose({ typingAt: now - 100, now }), { pose: 'typing', until: now - 100 + TYPING_HOLD_MS });
  assert.deepEqual(activeInputPose({ typingAt: now - 100, clickAt: now - 50, now }), { pose: 'click', until: now - 50 + CLICK_HOLD_MS });
  const typing = now - 100 + TYPING_HOLD_MS;
  assert.deepEqual(activeInputPose({ typingAt: now - 100, clickAt: now - 50, now: typing - 1 }), { pose: 'typing', until: typing });
  assert.deepEqual(activeInputPose({ typingAt: now - 100, clickAt: now - 50, now: typing }), { pose: '', until: 0 });
});

test('care actions take priority and all species respond to input', () => {
  assert.equal(roomPetPose({ eating: true, input: true }), 'eat');
  assert.equal(roomPetPose({ eating: true, petId: 'chick' }), 'eat');
  assert.equal(roomPetPose({ base: 'listen', input: true }), 'typing');
  assert.equal(roomPetPose({ base: 'listen', input: true, inputType: 'click' }), 'click');
  assert.equal(roomPetPose({ base: 'sleep', input: true, petId: 'chick' }), 'typing');
  assert.equal(roomPetPose({ full: true, input: true }), 'celebrate');
});

test('keyboard and pointer activity settle and listeners/timers are disposed', () => {
  const target = new EventTarget(), seen = [], timers = new Map(); let now = 1000, id = 0;
  const stop = watchInputPresence(target, (v) => seen.push(v), {
    now: () => now, setTimer: (fn) => { timers.set(++id, fn); return id; }, clearTimer: (key) => timers.delete(key)
  });
  target.dispatchEvent(new Event('keydown'));
  now += 20; target.dispatchEvent(new Event('pointerdown'));
  assert.deepEqual(seen, [
    { active: true, at: 1000, type: 'keyboard' },
    { active: true, at: 1020, type: 'click' }
  ]);
  now += 20; target.dispatchEvent(new Event('keydown'));
  assert.equal(seen.length, 2, 'the keyboard throttle still applies to keyboard only');
  now += 20; target.dispatchEvent(new Event('pointerdown'));
  assert.equal(seen.length, 2, 'the click throttle still applies to click only');
  now += 80; target.dispatchEvent(new Event('pointerdown'));
  assert.deepEqual(seen.at(-1), { active: true, at: 1140, type: 'click' });
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.deepEqual(seen.at(-1), { active: false, at: 1140, type: 'click' });
  stop(); assert.equal(timers.size, 0);
  now += 1000; target.dispatchEvent(new Event('keydown')); assert.equal(seen.length, 4);
});

test('all room actions retain equipped accessories and both cat palettes', () => {
  for (const pose of ['idle', 'sleep', 'walk', 'focus', 'listen', 'groove', 'typing', 'click', 'eat', 'celebrate', 'hop', 'deliver']) {
    const bare = cachedPetFrame('cat', pose, 0, '');
    for (const accessory of ['scarf', 'beanie', 'headphones']) {
      const dressed = cachedPetFrame('cat', pose, 0, accessory);
      assert.notDeepEqual(dressed, bare, `${pose}/${accessory}`);
      const colors = new Set();
      drawPetFrame({ clearRect() {}, set fillStyle(v) { colors.add(v); }, fillRect() {} }, dressed, 'cat', 1, 'black');
      assert.ok(colors.has('#55545e'), `${pose} retains black coat`);
    }
  }
  assert.notDeepEqual(cachedPetFrame('cat', 'idle', 0, ''), cachedPetFrame('chick', 'idle', 0, ''));
});
