import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPetFrame, petOpaqueAt } from './pet-sprites.mjs';
import { catFrame, TYPING_POSE, TYPING_FRAMES, EAT_POSE, EAT_FRAMES, HOP_POSE, HOP_FRAMES, LISTEN_POSE, LISTEN_FRAMES, DELIVER_POSE, DELIVER_FRAMES } from './cat-sprites.mjs';

// bini: the desk pet's eat looked like sitting / blinking — the frame cache normalised the cat-only
// poses to idle. The rendered (cached) frame must be beauty's catFrame(pose, i, acc).
test("desk pet renders beauty's cat-only poses through catFrame, not an idle fallback", () => {
  for (const [pose, count] of [[EAT_POSE, EAT_FRAMES], [HOP_POSE, HOP_FRAMES], [TYPING_POSE, TYPING_FRAMES], [LISTEN_POSE, LISTEN_FRAMES], [DELIVER_POSE, DELIVER_FRAMES]]) {
    assert.deepEqual(cachedPetFrame('cat', pose, count + 1, ''), catFrame(pose, 1, ''), `${pose} wraps per pose`);
    for (let i = 0; i < count; i++) for (const acc of ['', 'headphones']) assert.deepEqual(cachedPetFrame('cat', pose, i, acc), catFrame(pose, i, acc), `${pose} ${i} ${acc}`);
    for (let i = 0; i < count; i++) for (let j = 0; j < 4; j++) assert.notDeepEqual(cachedPetFrame('cat', pose, i, ''), cachedPetFrame('cat', 'idle', j, ''), `${pose} ${i} differs from idle ${j}`);
  }
  // Hit-testing uses the same frames, so a double-click lands on the drawn eat / hop silhouette.
  const frame = catFrame(EAT_POSE, 2, ''), y = frame.findIndex((row) => row.some(Boolean)), x = frame[y].findIndex(Boolean);
  assert.equal(petOpaqueAt('cat', EAT_POSE, 2, '', (x + .5) / frame.length, (y + .5) / frame.length), true);
  // Other pets keep their fallbacks.
  assert.deepEqual(cachedPetFrame('fox', LISTEN_POSE, 0, ''), cachedPetFrame('fox', 'idle', 0, ''));
});

test('other pets keep their fallbacks for the cat-only poses', () => {
  for (const pose of [EAT_POSE, HOP_POSE, TYPING_POSE, DELIVER_POSE, LISTEN_POSE]) assert.ok(cachedPetFrame('fox', pose, 0, '').length > 0);
  assert.deepEqual(cachedPetFrame('bunny', DELIVER_POSE, 0, ''), cachedPetFrame('bunny', 'walk', 0, ''));
});
