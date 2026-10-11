'use strict';
// Desktop pet movement, in the spirit of Shimeji: let go of the pet in mid-air
// and it falls to the bottom of the screen (the taskbar / Dock line) with a
// small bounce; toss it and it keeps the throw; when nothing is going on it
// sometimes strolls along the bottom of the screen. Pure and time-stepped.
const GRAVITY = 2600, MAX_SPEED = 2600, WALK_SPEED = 56, LAND_MS = 260;
const floorOf = (bounds, area) => area.y + area.height - bounds.height + 10;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function createPetPhysics({ random = Math.random, now = () => Date.now() } = {}) {
  let mode = 'idle', vx = 0, vy = 0, x = null, y = null, facing = 1, targetX = 0, landedAt = 0, samples = [];
  let nextWalk = now() + 45000 + random() * 60000;
  const schedule = () => { nextWalk = now() + 60000 + random() * 120000; };
  return {
    get mode() { return mode; },
    get facing() { return facing; },
    get moving() { return mode === 'fall' || mode === 'walk' || mode === 'land'; },
    // The pointer moves the window; remember the last ~120 ms for the throw.
    drag(dx, dy) { mode = 'drag'; x = y = null; const time = now(); samples.push({ dx, dy, time }); samples = samples.filter((sample) => time - sample.time <= 120); },
    reset(bounds) { mode = 'idle'; vx = vy = 0; x = bounds.x; y = bounds.y; samples = []; schedule(); },
    release(bounds, area, { reduceMotion = false } = {}) {
      if (reduceMotion) { this.reset(bounds); return mode; }
      const time = now(), recent = samples.filter((sample) => time - sample.time <= 120); samples = [];
      const span = recent.length > 1 ? Math.max(16, time - recent[0].time) : 0;
      vx = span ? clamp(recent.reduce((sum, sample) => sum + sample.dx, 0) / span * 1000, -MAX_SPEED, MAX_SPEED) : 0;
      vy = span ? clamp(recent.reduce((sum, sample) => sum + sample.dy, 0) / span * 1000, -MAX_SPEED, MAX_SPEED) : 0;
      x = bounds.x; y = bounds.y;
      mode = bounds.y < floorOf(bounds, area) - 2 || Math.abs(vx) > 240 ? 'fall' : 'idle';
      if (mode === 'idle') schedule();
      return mode;
    },
    // allowWalk: nothing else is happening (no focus round, no music, motion allowed).
    step(bounds, area, dt, { allowWalk = false } = {}) {
      const time = now(), floor = floorOf(bounds, area);
      const minX = area.x - Math.round(bounds.width / 3), maxX = area.x + area.width - Math.round(bounds.width * 2 / 3);
      x ??= bounds.x; y ??= bounds.y;
      if (mode === 'idle' && allowWalk && time >= nextWalk && Math.abs(bounds.y - floor) <= 12) {
        targetX = clamp(Math.round(area.x + random() * (area.width - bounds.width)), minX, maxX);
        if (Math.abs(targetX - bounds.x) > 80) { mode = 'walk'; x = bounds.x; y = bounds.y; facing = Math.sign(targetX - bounds.x) || 1; } else schedule();
      }
      if (mode === 'walk' && !allowWalk) { mode = 'idle'; schedule(); }
      if (mode === 'fall') {
        const step = Math.min(dt, .05);
        vy += GRAVITY * step; vx *= Math.exp(-1.2 * step);
        x += vx * step; y += vy * step;
        if (x < minX) { x = minX; vx = -vx * .45; } else if (x > maxX) { x = maxX; vx = -vx * .45; }
        if (y < area.y - 40) { y = area.y - 40; vy = Math.max(0, vy); } // the top of the screen is a ceiling
        if (Math.abs(vx) > 30) facing = Math.sign(vx);
        if (y >= floor) {
          y = floor;
          if (vy > 700) { vy = -vy * .28; vx *= .6; } // one small bounce
          else if (Math.abs(vx) > 60) { vy = 0; vx *= Math.exp(-5 * step); } // a sideways toss slides along the floor
          else { vy = 0; vx = 0; mode = 'land'; landedAt = time; }
        }
      } else if (mode === 'walk') {
        const distance = targetX - x, move = Math.sign(distance) * Math.min(Math.abs(distance), WALK_SPEED * Math.min(dt, .1));
        x += move; y = floor;
        if (Math.abs(targetX - x) < 1) { x = targetX; mode = 'idle'; schedule(); }
      } else if (mode === 'land' && time - landedAt >= LAND_MS) { mode = 'idle'; schedule(); }
      else if (mode === 'idle' || mode === 'drag') { x = bounds.x; y = bounds.y; }
      return { x: Math.round(x), y: Math.round(y), mode, facing };
    }
  };
}
module.exports = { createPetPhysics, floorOf };
