const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPetPhysics, floorOf } = require('../pet-physics.cjs');
const area = { x: 0, y: 0, width: 1440, height: 860 };
const size = { width: 288, height: 256 };

function run(physics, bounds, seconds, options) {
  let current = { ...bounds }, frames = [];
  for (let t = 0; t < seconds; t += 1 / 60) { const next = physics.step(current, area, 1 / 60, options); current = { ...current, x: next.x, y: next.y }; frames.push(next); if (!physics.moving && next.mode === 'idle' && t > .05) break; }
  return { current, frames };
}

test('pet physics: dropped in mid-air it falls to the floor, bounces once, lands', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time, random: () => .5 });
  const bounds = { ...size, x: 600, y: 100 };
  assert.equal(physics.release(bounds, area), 'fall');
  const frames = [];
  let current = bounds;
  for (let i = 0; i < 240 && physics.mode !== 'idle'; i++) { time += 1000 / 60; const next = physics.step(current, area, 1 / 60); frames.push(next); current = { ...current, x: next.x, y: next.y }; }
  const floor = floorOf(bounds, area);
  assert.equal(current.y, floor);
  assert(frames.some((f) => f.mode === 'land'), 'lands with a squash');
  const ys = frames.map((f) => f.y), firstTouch = ys.indexOf(floor);
  assert(Math.min(...ys.slice(firstTouch + 1, firstTouch + 20)) < floor, 'bounces after the first touch');
  assert.equal(physics.mode, 'idle');
});

test('pet physics: a throw keeps its momentum and stays on screen', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time });
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(40, -10); }
  assert.equal(physics.release({ ...size, x: 1100, y: 300 }, area), 'fall');
  let current = { ...size, x: 1100, y: 300 }, maxX = 0;
  for (let i = 0; i < 300 && physics.mode !== 'idle'; i++) { time += 16; const next = physics.step(current, area, 1 / 60); current = { ...current, x: next.x, y: next.y }; maxX = Math.max(maxX, next.x); }
  assert(maxX > 1100, 'travels in the throw direction');
  assert(maxX <= area.width - Math.round(size.width * 2 / 3), 'bounces off the screen edge');
});

test('pet physics: a gentle release on the floor does not fall; idle pets stroll only when allowed', () => {
  let time = 0, draws = 0; const physics = createPetPhysics({ now: () => time, random: () => [.5, .5, .9, .1][draws++ % 4] });
  const floor = floorOf(size, area), bounds = { ...size, x: 200, y: floor };
  assert.equal(physics.release(bounds, area), 'idle');
  time += 10 * 60 * 1000;
  physics.step(bounds, area, 0, { allowWalk: false });
  assert.equal(physics.mode, 'idle', 'no stroll during focus or music');
  physics.step(bounds, area, 0, { allowWalk: true });
  assert.equal(physics.mode, 'walk'); assert.equal(physics.facing, 1);
  let current = bounds;
  for (let i = 0; i < 60 * 30 && physics.mode === 'walk'; i++) { time += 16; const next = physics.step(current, area, 1 / 60, { allowWalk: true }); current = { ...current, x: next.x, y: next.y }; }
  assert.equal(physics.mode, 'idle'); assert(current.x > 900); assert.equal(current.y, floor);
  // A focus round starting mid-walk stops the stroll at once.
  time += 10 * 60 * 1000; physics.step(current, area, 0, { allowWalk: true }); assert.equal(physics.mode, 'walk');
  physics.step(current, area, 1 / 60, { allowWalk: false }); assert.equal(physics.mode, 'idle');
});

test('pet physics: a sideways flick along the floor slides; an upward throw stops at the top', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time });
  const floor = floorOf(size, area);
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(25, 0); }
  assert.equal(physics.release({ ...size, x: 300, y: floor }, area), 'fall');
  let current = { ...size, x: 300, y: floor };
  for (let i = 0; i < 400 && physics.mode !== 'idle'; i++) { time += 16; const next = physics.step(current, area, 1 / 60); current = { ...current, x: next.x, y: next.y }; }
  assert(current.x > 450, `slides along the floor (x=${current.x})`); assert.equal(current.y, floor);
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(0, -60); }
  physics.release({ ...size, x: 600, y: 200 }, area); current = { ...size, x: 600, y: 200 }; let top = 200;
  for (let i = 0; i < 400 && physics.mode !== 'idle'; i++) { time += 16; const next = physics.step(current, area, 1 / 60); current = { ...current, x: next.x, y: next.y }; top = Math.min(top, next.y); }
  assert(top >= area.y - 40, 'never leaves the top of the screen'); assert.equal(current.y, floor);
});


test('reduced motion keeps a released pet where the user placed it', () => {
  const physics = createPetPhysics();
  physics.drag(80, -20); physics.drag(80, -20);
  const placed = { ...size, x: 500, y: 150 };
  assert.equal(physics.release(placed, area, { reduceMotion: true }), 'idle');
  assert.equal(physics.moving, false);
  assert.deepEqual(physics.step(placed, area, .05), { x: 500, y: 150, mode: 'idle', facing: 1 });
});
test('display or size changes discard old flight momentum and coordinates', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time });
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(40, -10); }
  const old = { ...size, x: 2000, y: 100 };
  physics.release(old, { ...area, x: 1920 });
  assert.equal(physics.moving, true);
  const restored = { ...size, x: 600, y: 350 };
  physics.reset(restored);
  for (let i = 0; i < 120; i++) {
    time += 16; const next = physics.step(restored, area, .016);
    assert.equal(next.x, restored.x); assert.equal(next.y, restored.y); assert.equal(next.mode, 'idle');
  }
});
