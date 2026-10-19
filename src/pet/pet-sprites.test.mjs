import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPetFrame, petOpaqueAt } from './pet-sprites.mjs';
import { catFrame, POSES, TYPING_POSE, TYPING_FRAMES, CLICK_POSE, CLICK_FRAMES, EAT_POSE, EAT_FRAMES, HOP_POSE, HOP_FRAMES, LISTEN_POSE, LISTEN_FRAMES, DELIVER_POSE, DELIVER_FRAMES } from './cat-sprites.mjs';

// bini: the desk pet's eat looked like sitting / blinking — the frame cache normalised the cat-only
// poses to idle. The rendered (cached) frame must be beauty's catFrame(pose, i, acc).
test("desk pet renders beauty's cat-only poses through catFrame, not an idle fallback", () => {
  for (const [pose, count] of [[EAT_POSE, EAT_FRAMES], [HOP_POSE, HOP_FRAMES], [TYPING_POSE, TYPING_FRAMES], [CLICK_POSE, CLICK_FRAMES], [LISTEN_POSE, LISTEN_FRAMES], [DELIVER_POSE, DELIVER_FRAMES]]) {
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
  for (const pose of [EAT_POSE, HOP_POSE, TYPING_POSE, CLICK_POSE, DELIVER_POSE, LISTEN_POSE]) assert.ok(cachedPetFrame('fox', pose, 0, '').length > 0);
  assert.deepEqual(cachedPetFrame('bunny', DELIVER_POSE, 0, ''), cachedPetFrame('bunny', 'walk', 0, ''));
});

function noseOf(pixels) {
  for (let y = 0; y < pixels.length - 1; y++) for (let x = 1; x < pixels[y].length - 2; x++) {
    if (pixels[y][x] === 5 && pixels[y][x + 1] === 5
      && pixels[y + 1][x - 1] === 6 && pixels[y + 1][x + 2] === 6) return { x, y };
  }
  assert.fail('The nose and both mouth corners must remain visible, including behind typing paws');
}

function headwearPixels(pixels, accessory) {
  const points = pixels.flatMap((row, y) => row.flatMap((color, x) => ({ color, x, y })));
  if (accessory === 'sprout') return points.filter(point => [18, 19].includes(point.color));
  const crown = points.filter(point => point.color === 10);
  const top = Math.min(...crown.map(point => point.y));
  // Include the white pompom, but not eye highlights or book/keyboard pixels.
  return [...crown, ...points.filter(point => point.color === 7 && point.y < top)];
}

for (const accessory of ['beanie', 'sprout']) {
  test(`${accessory} stays complete and attached to the head throughout raised actions`, () => {
    // The lying pose has enough headroom to serve as an unclipped art reference.
    const reference = catFrame('sleep', 0, accessory), referenceNose = noseOf(reference);
    const relative = (points, nose) => points.map(({ x, y, color }) => [x - nose.x, y - nose.y, color])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const expected = relative(headwearPixels(reference, accessory), referenceNose);
    assert(expected.length > 10);
    for (const [pose, count] of [['celebrate', POSES.celebrate], [TYPING_POSE, TYPING_FRAMES], [CLICK_POSE, CLICK_FRAMES], [HOP_POSE, HOP_FRAMES]]) {
      const unique = new Set();
      for (let index = 0; index < count; index++) {
        const label = `${pose} frame ${index} ${accessory}`, pixels = cachedPetFrame('cat', pose, index, accessory);
        assert.deepEqual(pixels, catFrame(pose, index, accessory), `${label}: cached renderer`);
        assert.equal(pixels.length, 32);
        assert(pixels.every(row => row.length === 32 && row.every(Number.isInteger)), label);
        const nose = noseOf(pixels), headwear = headwearPixels(pixels, accessory);
        assert.deepEqual(relative(headwear, nose), expected, `${label}: original-size art and head attachment`);
        for (const { x, y } of headwear) {
          assert(x > 0 && x < 31 && y > 0 && y < 31, `${label}: room for the full outline at ${x},${y}`);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
            assert(pixels[y + dy][x + dx] > 0, `${label}: intact outline at ${x},${y}`);
        }
        unique.add(JSON.stringify(pixels));
      }
      assert.equal(unique.size, pose === TYPING_POSE ? 3 : count, `${pose}: retain distinct action frames`);
    }
  });
}
