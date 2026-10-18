const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPetPhysics, floorOf, ceilingOf } = require('../pet-physics.cjs');
const area = { x: 0, y: 0, width: 1440, height: 860 };
const size = { width: 288, height: 256 };

function run(physics, bounds, seconds, options) {
  let current = { ...bounds }, frames = [];
  for (let t = 0; t < seconds; t += 1 / 60) { const next = physics.step(current, area, 1 / 60, options); current = { ...current, x: next.x, y: next.y }; frames.push(next); if (!physics.moving && next.mode === 'idle' && t > .05) break; }
  return { current, frames };
}

const fly = (physics, bounds, tick) => { let current = { ...bounds }, frames = []; for (let i = 0; i < 600 && physics.mode !== 'idle'; i++) { tick(); const next = physics.step(current, area, 1 / 60); frames.push(next); current = { ...current, x: next.x, y: next.y }; } return { current, frames }; };

test('pet physics: let go anywhere (mid-air, by an edge, under the menu bar) and it stays right there', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time, random: () => .5 });
  for (const spot of [{ x: 600, y: 100 }, { x: -96, y: 300 }, { x: area.width - 192, y: ceilingOf(area) }, { x: 700, y: floorOf(size, area) }]) {
    const bounds = { ...size, ...spot };
    physics.drag(2, 1); time += 500; // a slow, careful placement
    assert.equal(physics.release(bounds, area), 'idle', `placed at ${JSON.stringify(spot)}`);
    for (let i = 0; i < 120; i++) { time += 16; assert.deepEqual(physics.step(bounds, area, 1 / 60), { x: bounds.x, y: bounds.y, mode: 'idle', facing: physics.facing }); }
  }
});

test('pet physics: a throw glides with its momentum, bounces off the work-area edges and settles where it stops', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time });
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(40, -10); }
  assert.equal(physics.release({ ...size, x: 1100, y: 300 }, area), 'fall');
  const { current, frames } = fly(physics, { ...size, x: 1100, y: 300 }, () => { time += 16; });
  const xs = frames.map((f) => f.x);
  assert(Math.max(...xs) > 1100, 'travels in the throw direction');
  assert(Math.max(...xs) <= area.width - Math.round(size.width * 2 / 3), 'bounces off the screen edge');
  assert.equal(physics.mode, 'idle');
  assert(current.y < floorOf(size, area) - 50, `no gravity: it stays up where it stopped (y=${current.y})`);
});

test('pet physics: an upward throw stops under the menu bar; a downward one stays above the Dock line', () => {
  let time = 0; const physics = createPetPhysics({ now: () => time });
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(0, -60); }
  physics.release({ ...size, x: 600, y: 200 }, area);
  let { current, frames } = fly(physics, { ...size, x: 600, y: 200 }, () => { time += 16; });
  assert(Math.min(...frames.map((f) => f.y)) >= ceilingOf(area), 'never above the work area');
  for (let i = 0; i < 6; i++) { time += 16; physics.drag(0, 60); }
  physics.release({ ...size, x: 600, y: 400 }, area);
  ({ current, frames } = fly(physics, { ...size, x: 600, y: 400 }, () => { time += 16; }));
  assert(Math.max(...frames.map((f) => f.y)) <= floorOf(size, area), 'never below the Dock / taskbar line');
});

test('pet physics: a pet resting on the bottom edge strolls only when allowed; one placed elsewhere stays put', () => {
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
  time += 10 * 60 * 1000; physics.step(current, area, 0, { allowWalk: true }); assert.equal(physics.mode, 'walk');
  physics.step(current, area, 1 / 60, { allowWalk: false }); assert.equal(physics.mode, 'idle');
  const up = { ...size, x: 300, y: 200 }; physics.reset(up); time += 10 * 60 * 1000;
  physics.step(up, area, 0, { allowWalk: true }); assert.equal(physics.mode, 'idle', 'a pet on a mid-screen spot does not walk off it');
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
