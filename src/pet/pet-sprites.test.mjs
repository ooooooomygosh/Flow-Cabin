import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPetFrame, petOpaqueAt, normalizeFrame } from './pet-sprites.mjs';
import { catFrame, TYPING_POSE, TYPING_FRAMES, EAT_POSE, EAT_FRAMES, HOP_POSE, HOP_FRAMES, LISTEN_POSE, LISTEN_FRAMES } from './cat-sprites.mjs';

// bini: the desk pet's eat looked like sitting / blinking — the frame cache normalised the cat-only
// poses to idle. The rendered (cached) frame must be beauty's catFrame(pose, i, acc).
test("desk pet renders beauty's cat-only poses through catFrame, not an idle fallback", () => {
  for (const [pose, count] of [[EAT_POSE, EAT_FRAMES], [HOP_POSE, HOP_FRAMES], [TYPING_POSE, TYPING_FRAMES], [LISTEN_POSE, LISTEN_FRAMES]]) {
    assert.equal(normalizeFrame(pose, count + 1).pose, pose); assert.equal(normalizeFrame(pose, count + 1).index, 1);
    for (let i = 0; i < count; i++) for (const acc of ['', 'headphones']) assert.deepEqual(cachedPetFrame('cat', pose, i, acc), catFrame(pose, i, acc), `${pose} ${i} ${acc}`);
    assert.notDeepEqual(cachedPetFrame('cat', pose, 0, ''), cachedPetFrame('cat', 'idle', 0, ''), `${pose} is not idle`);
  }
  // Hit-testing uses the same frames, so a double-click lands on the drawn eat / hop silhouette.
  const frame = catFrame(EAT_POSE, 2, ''), y = frame.findIndex((row) => row.some(Boolean)), x = frame[y].findIndex(Boolean);
  assert.equal(petOpaqueAt('cat', EAT_POSE, 2, '', (x + .5) / frame.length, (y + .5) / frame.length), true);
  // Other pets keep their fallbacks.
  assert.deepEqual(cachedPetFrame('fox', LISTEN_POSE, 0, ''), cachedPetFrame('fox', 'idle', 0, ''));
});
