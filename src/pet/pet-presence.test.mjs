import test from 'node:test';
import assert from 'node:assert/strict';
import { roomPetPose, watchInputPresence } from './pet-presence.mjs';
import { cachedPetFrame, drawPetFrame } from './pet-sprites.mjs';

test('care actions take priority; cat-only actions never replace another species', () => {
  assert.equal(roomPetPose({ eating: true, input: true }), 'eat');
  assert.equal(roomPetPose({ eating: true, petId: 'chick' }), 'celebrate');
  assert.equal(roomPetPose({ base: 'listen', input: true }), 'typing');
  assert.equal(roomPetPose({ base: 'sleep', input: true, petId: 'chick' }), 'sleep');
  assert.equal(roomPetPose({ full: true, input: true }), 'celebrate');
});

test('keyboard and pointer activity settle and listeners/timers are disposed', () => {
  const target = new EventTarget(), seen = [], timers = new Map(); let now = 1000, id = 0;
  const stop = watchInputPresence(target, (v) => seen.push(v), {
    now: () => now, setTimer: (fn) => { timers.set(++id, fn); return id; }, clearTimer: (key) => timers.delete(key)
  });
  target.dispatchEvent(new Event('keydown'));
  now += 20; target.dispatchEvent(new Event('pointerdown'));
  assert.equal(seen.length, 1);
  now += 200; target.dispatchEvent(new Event('pointerdown'));
  assert.deepEqual(seen.at(-1), { active: true, at: 1220 });
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.deepEqual(seen.at(-1), { active: false, at: 1220 });
  stop(); assert.equal(timers.size, 0);
  now += 1000; target.dispatchEvent(new Event('keydown')); assert.equal(seen.length, 3);
});

test('all room actions retain equipped accessories and both cat palettes', () => {
  for (const pose of ['idle', 'sleep', 'walk', 'focus', 'listen', 'groove', 'typing', 'eat', 'celebrate', 'hop', 'deliver']) {
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
