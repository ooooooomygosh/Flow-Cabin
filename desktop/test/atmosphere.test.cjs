'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const model = import('../../src/cabin-atmosphere.mjs');
test('scene-specific particles are deterministic, bounded and weather-aware', async () => {
  const { ATMOSPHERE, atmosphereFrame } = await model;
  for (const look of ['warm', 'pixel']) {
    const g = ATMOSPHERE[look];
    assert.equal(g.panes.length, 4); assert.ok(g.fire.x + g.fire.width <= 1448);
    for (const [x, y, w, h] of g.panes) { assert.ok(x >= 0 && y >= 0 && x + w <= g.window.width && y + h <= g.window.height); }
    for (const time of [0, .5, 5, 3600]) {
      const frame = atmosphereFrame(time, look); assert.deepEqual(frame, atmosphereFrame(time, look));
      assert.equal(frame.snow.length, 64);
      for (const flake of frame.snow) { assert.ok(flake.x >= 0 && flake.x < g.window.width && flake.y >= 0 && flake.y < g.window.height); }
      assert.ok(frame.light >= .065 && frame.light <= .11);
    }
    assert.equal(atmosphereFrame(10, look, 'clear').snow.length, 0);
    assert.notDeepEqual(atmosphereFrame(0, look), atmosphereFrame(1, look));
  }
});
test('warm light changes smoothly without flash-sized frame steps', async () => {
  const { atmosphereFrame } = await model;
  let previous = atmosphereFrame(0);
  for (let i = 1; i <= 2400; i++) {
    const next = atmosphereFrame(i / 24);
    assert.ok(Math.abs(next.light - previous.light) < .002);
    previous = next;
  }
});
test('one throttled animation loop pauses, resumes, freezes reduced motion and disposes completely', async () => {
  const { createAtmosphereLoop } = await model;
  const pending = new Map(), frames = []; let id = 0, now = 0;
  const loop = createAtmosphereLoop({ draw: (time) => frames.push(time), request: (cb) => { pending.set(++id, cb); return id; }, cancel: (key) => pending.delete(key), now: () => now });
  const step = (time) => { now = time; const [key, cb] = pending.entries().next().value; pending.delete(key); cb(time); };
  loop.setMode('running'); loop.setMode('running'); assert.equal(pending.size, 1);
  for (let i = 1; i <= 60; i++) step(i * 1000 / 60);
  assert.ok(frames.length >= 18 && frames.length <= 25); assert.equal(pending.size, 1);
  loop.setMode('hidden'); assert.equal(pending.size, 0); const last = frames.at(-1); now = 500000;
  loop.setMode('running'); step(now + 50); assert.ok(frames.at(-1) - last < .15);
  loop.setMode('reduced'); assert.equal(pending.size, 0); assert.equal(frames.at(-1), 0);
  const count = frames.length; loop.setMode('reduced'); assert.equal(frames.length, count);
  loop.setMode('running'); const stale = pending.values().next().value; loop.dispose(); assert.equal(pending.size, 0); stale(now + 50); assert.equal(pending.size, 0);
  loop.setMode('running'); assert.equal(pending.size, 0);
});
test('material incidence, distance and roughness produce bounded separate surface responses', async () => {
  const { MATERIAL_SURFACES, materialResponse, surfaceLighting } = await model;
  const sample = { ...MATERIAL_SURFACES.stone, position: [0, 0, 0], normal: [1, 0, 0] };
  assert.ok(materialResponse(sample, [100, 0, 0], .15) > materialResponse(sample, [900, 0, 0], .15));
  assert.equal(materialResponse(sample, [-100, 0, 0], .15), 0);
  assert.equal(materialResponse({ ...sample, normal: [0, 1, 0] }, [100, 0, 0], .15), 0);
  const polished = { ...sample, normal: [0, 0, 1], albedo: .02, specular: .8, roughness: .1 };
  const broad = { ...polished, roughness: .9 };
  assert.ok(materialResponse(broad, [120, 0, 160], .15) > materialResponse(polished, [120, 0, 160], .15));
  let previous = surfaceLighting(0);
  for (let i = 1; i < 1000; i++) {
    const next = surfaceLighting(i / 24);
    assert.equal(Object.keys(next).length, 7);
    for (const name of Object.keys(next)) { assert.ok(next[name] >= 0 && next[name] <= .18); assert.ok(Math.abs(next[name] - previous[name]) < .003); }
    assert.ok(next.stone > next.wood); assert.ok(next.floor > next.rug); previous = next;
  }
  assert.equal(previous.wood, 0); assert.equal(previous.glass, 0);
  assert.equal('window' in previous, false); assert.equal('ui' in previous, false);
});
test('fire origin stays inside each firebox and blocked furniture/front faces receive no added light', async () => {
  const { ATMOSPHERE, FIRE_LIGHT_SOURCE, surfaceLighting } = await model;
  for (const look of ['warm', 'pixel']) {
    const box = ATMOSPHERE[look].fire, [x, y, depth] = FIRE_LIGHT_SOURCE[look];
    assert.ok(x > box.x && x < box.x + box.width); assert.ok(y > box.y && y < box.y + box.height); assert.ok(depth < 0);
    for (const time of [0, .3, 2, 8, 120]) { const light = surfaceLighting(time, look); assert.equal(light.wood, 0); assert.equal(light.glass, 0); assert.ok(light.floor > light.rug); assert.ok(light.hearth > 0); }
  }
});

test('shared 8 fps atmosphere keeps time, pauses safely and disposes its subscription', async () => {
  const { createAtmosphereLoop } = await model;
  const { createFrameClock } = await import('../../src/frame-clock.mjs');
  let pending = null, id = 0; const frames = [];
  const clock = createFrameClock({ request: (cb) => { pending = cb; return ++id; }, cancel: () => { pending = null; } });
  const step = (t) => { const cb = pending; pending = null; cb?.(t); };
  const loop = createAtmosphereLoop({ clock, fps: 8, draw: (t) => frames.push(t) });
  loop.setMode('running');
  for (let i = 0; i <= 600; i++) step(i * 1000 / 60);
  assert.ok(Math.abs(frames.at(-1) - frames[0] - 10) < .05, frames.at(-1));
  loop.setMode('hidden'); assert.equal(clock.size, 0); assert.equal(pending, null);
  const last = frames.at(-1); loop.setMode('running'); step(60000);
  assert.ok(Math.abs(frames.at(-1) - last - .125) < 1e-9);
  loop.setMode('reduced'); assert.equal(frames.at(-1), 0); assert.equal(clock.size, 0);
  loop.setMode('running'); const stale = pending; const count = frames.length;
  loop.dispose(); stale(120000); assert.equal(frames.length, count); assert.equal(clock.size, 0); assert.equal(pending, null);
});
