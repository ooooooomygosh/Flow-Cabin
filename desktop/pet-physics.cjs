'use strict';
// Desktop pet movement: let go of the pet and it stays exactly where it was put — anywhere on any
// display, by a screen edge, just above the Dock / taskbar, just under the menu bar (the work area
// already excludes those). Toss it and it glides with the throw, bounces off the work-area edges
// and settles where it stops (without gravity it does not drop to the bottom). When nothing else is
// going on, a pet resting on the bottom edge sometimes strolls along it. Pure and time-stepped.
// (mode 'fall' = flying after a throw; the name is kept for the renderer.)
// With gravity (2.2, 设置 › 房间与桌宠 › 落地, on by default in pet.cjs) a released or thrown pet
// falls to the bottom of the work area — onto the Dock / taskbar line — bounces once or twice and lands.
const MAX_SPEED = 2600, WALK_SPEED = 56, LAND_MS = 260, FRICTION = 2.4, STOP_SPEED = 45, THROW_SPEED = 240, GRAVITY = 2600, BOUNCE_SPEED = 380;
const floorOf = (bounds, area) => area.y + area.height - bounds.height + 10;
// The highest the window may go: its top 48 px are bubble space, so the cat itself sits below the menu bar.
const ceilingOf = (area) => area.y - 48;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function createPetPhysics({ random = Math.random, now = () => Date.now() } = {}) {
  let mode = 'idle', vx = 0, vy = 0, x = null, y = null, facing = 1, targetX = 0, landedAt = 0, samples = [], falling = false;
  let nextWalk = now() + 45000 + random() * 60000;
  const schedule = () => { nextWalk = now() + 60000 + random() * 120000; };
  return {
    get mode() { return mode; },
    get facing() { return facing; },
    get moving() { return mode === 'fall' || mode === 'walk' || mode === 'land'; },
    // The pointer moves the window; remember the last ~120 ms for the throw.
    drag(dx, dy) { mode = 'drag'; x = y = null; const time = now(); samples.push({ dx, dy, time }); samples = samples.filter((sample) => time - sample.time <= 120); },
    get falling() { return mode === 'fall' && falling; },
    reset(bounds) { mode = 'idle'; vx = vy = 0; x = bounds.x; y = bounds.y; samples = []; falling = false; schedule(); },
    release(bounds, area, { reduceMotion = false, gravity = false } = {}) {
      if (reduceMotion) { this.reset(bounds); return mode; }
      const time = now(), recent = samples.filter((sample) => time - sample.time <= 120); samples = [];
      const span = recent.length > 1 ? Math.max(16, time - recent[0].time) : 0;
      vx = span ? clamp(recent.reduce((sum, sample) => sum + sample.dx, 0) / span * 1000, -MAX_SPEED, MAX_SPEED) : 0;
      vy = span ? clamp(recent.reduce((sum, sample) => sum + sample.dy, 0) / span * 1000, -MAX_SPEED, MAX_SPEED) : 0;
      x = bounds.x; y = bounds.y;
      const thrown = Math.hypot(vx, vy) > THROW_SPEED;
      // A careful placement keeps no momentum; with gravity it still drops from where it was let go.
      if (!thrown) vx = vy = 0;
      falling = gravity && (thrown || bounds.y < floorOf(bounds, area) - 1);
      mode = thrown || falling ? 'fall' : 'idle';
      if (mode === 'idle') schedule();
      return mode;
    },
    // Gravity switched on, or the pet appeared mid-air: drop it from where it is.
    drop(bounds, area) { if (mode === 'drag' || bounds.y >= floorOf(bounds, area) - 1) return mode; x = bounds.x; y = bounds.y; vx = vy = 0; falling = true; mode = 'fall'; return mode; },
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
      if (mode === 'fall' && falling) {
        const step = Math.min(dt, .05), ceiling = ceilingOf(area);
        vy = Math.min(MAX_SPEED, vy + GRAVITY * step); vx *= Math.exp(-.8 * step); x += vx * step; y += vy * step;
        if (x < minX) { x = minX; vx = -vx * .45; } else if (x > maxX) { x = maxX; vx = -vx * .45; }
        if (y < ceiling) { y = ceiling; vy = Math.abs(vy) * .3; }
        if (Math.abs(vx) > 30) facing = Math.sign(vx);
        // Touch down: a fast fall bounces a little, a slow one lands.
        if (y >= floor) { y = floor; if (vy > BOUNCE_SPEED) vy = -vy * .28; else { vx = vy = 0; falling = false; mode = 'land'; landedAt = time; } }
      } else if (mode === 'fall') {
        const step = Math.min(dt, .05), ceiling = ceilingOf(area), drag = Math.exp(-FRICTION * step);
        vx *= drag; vy *= drag; x += vx * step; y += vy * step;
        // Every work-area edge is a soft wall: the menu bar, the Dock / taskbar and the sides.
        if (x < minX) { x = minX; vx = -vx * .45; } else if (x > maxX) { x = maxX; vx = -vx * .45; }
        if (y < ceiling) { y = ceiling; vy = -vy * .45; } else if (y > floor) { y = floor; vy = -vy * .35; }
        if (Math.abs(vx) > 30) facing = Math.sign(vx);
        if (Math.hypot(vx, vy) < STOP_SPEED) { vx = vy = 0; mode = 'land'; landedAt = time; } // settles right there
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
// Strolls may cross onto a display that sits right next to this one with the same bottom edge
// (two monitors side by side on one desk): their work areas join into one long floor.
function walkArea(area, areas = []) {
  let joined = { ...area }, grew = true;
  const bottom = (a) => a.y + a.height;
  while (grew) {
    grew = false;
    for (const other of areas) {
      if (Math.abs(bottom(other) - bottom(joined)) > 2) continue;
      const left = Math.abs(other.x + other.width - joined.x) <= 2, right = Math.abs(joined.x + joined.width - other.x) <= 2;
      if (!left && !right) continue;
      const x = Math.min(joined.x, other.x), end = Math.max(joined.x + joined.width, other.x + other.width), y = Math.max(joined.y, other.y);
      if (x === joined.x && end === joined.x + joined.width) continue;
      joined = { x, y, width: end - x, height: bottom(joined) - y }; grew = true;
    }
  }
  return joined;
}
// The sprite is 32 art pixels wide: size it to a whole number of device pixels per art pixel on
// this display (125 % / 150 % scaling would otherwise smear the pixel art).
function crispSize(size, scaleFactor = 1) {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return Math.max(32, Math.round(size * scale / 32) * 32) / scale;
}
module.exports = { createPetPhysics, floorOf, ceilingOf, walkArea, crispSize };
