import test from 'node:test';
import assert from 'node:assert/strict';
import { POST, stepSpring, settled, poseAt, flipTarget, flipBy, earActions } from './post-box.mjs';

const run = (target, seconds, state = { pos: 0, vel: 0 }, dt = 1 / 60) => {
  let s = state, peak = state.pos;
  for (let t = 0; t < seconds; t += dt) { s = stepSpring(s, target, dt); peak = Math.max(peak, s.pos); }
  return { s, peak };
};

test('the flip spring is the binder spring (W 24, zeta .72) and settles on its target', () => {
  assert.equal(POST.W, 24); assert.equal(POST.Z, 0.72);
  const { s } = run(3, 2);
  assert(settled(s, 3), `settles at 3, got ${s.pos}`);
});

test('an under-damped spring overshoots a little and a long frame cannot blow it up', () => {
  const { peak } = run(1, 1.5);
  assert(peak > 1.01 && peak < 1.25, `overshoot ${peak}`);
  const jump = stepSpring({ pos: 0, vel: 0 }, 5, 10);
  assert(Number.isFinite(jump.pos) && Math.abs(jump.pos) < 20);
  assert.deepEqual(stepSpring({ pos: 2, vel: 0 }, 2, 0.016), { pos: 2, vel: 0 });
});

test('the front letter stands almost straight; each step behind leans back 0.22 rad', () => {
  assert.equal(poseAt(0, 0).lean, POST.REST);
  const a = poseAt(1, 0).lean, b = poseAt(2, 0).lean, c = poseAt(3, 0).lean;
  assert(Math.abs((b - a) - 0.22) < 1e-9 && Math.abs((c - b) - 0.22) < 1e-9);
  assert.equal(poseAt(2, 0).depth, 2);
});

test('a flipped letter falls forward to 1.30 rad and stays there', () => {
  assert(poseAt(0, 1).lean < 0 && poseAt(0, 1).lean > -POST.FALL - 1e-9);
  assert(Math.abs(poseAt(0, 1).lean + POST.FALL) < 1e-9, 'one step on it has fallen all the way');
  assert.equal(poseAt(0, 4).lean, -POST.FALL);
  assert.equal(poseAt(0, 1).fallen, true);
  assert.equal(poseAt(1, 1).fallen, false);
});

test('only letters 1.6 in front to 4.6 behind show, and the ends fade over 0.6', () => {
  assert.equal(poseAt(0, 0).opacity, 1);
  assert.equal(poseAt(4, 0).opacity, 1);
  assert.equal(poseAt(5.2, 0).opacity, 0);
  assert.equal(poseAt(8, 0).opacity, 0);
  assert(poseAt(4.9, 0).opacity > 0 && poseAt(4.9, 0).opacity < 1);
  assert.equal(poseAt(0, 2.2).opacity, 0);
  assert.equal(poseAt(0, 1.6).opacity, 1);
});

test('letters further back are darker (7.5% a step) and lower in the stack', () => {
  assert.equal(poseAt(0, 0).dim, 0);
  assert(Math.abs(poseAt(2, 0).dim - 0.15) < 1e-9);
  assert(poseAt(0, 0).z > poseAt(1, 0).z && poseAt(1, 0).z > poseAt(2, 0).z);
});

test('the spring heads for the selected letter, inside the box; a notch turns one letter', () => {
  assert.equal(flipTarget(-1, 6), 0);
  assert.equal(flipTarget(3, 6), 3);
  assert.equal(flipTarget(9, 6), 5);
  assert.equal(flipTarget(2, 0), 0);
  assert.equal(flipBy(2, 120, 6), 3);
  assert.equal(flipBy(2, -1, 6), 1);
  assert.equal(flipBy(0, -1, 6), 0);
  assert.equal(flipBy(5, 1, 6), 5);
});

test('the turned-down corner lists Read, Mark read (only while unread) and Discard; a discarded letter can be put back', () => {
  assert.deepEqual(earActions({ unread: true, letter: {} }).map((a) => a.id), ['open', 'read', 'trash']);
  assert.deepEqual(earActions({ unread: false, letter: {} }).map((a) => a.id), ['open', 'trash']);
  assert.deepEqual(earActions({ unread: true, letter: { trashed: true } }).map((a) => a.label), ['阅读', '放回']);
  assert.deepEqual(earActions({ unread: true, letter: {} }).map((a) => a.label), ['阅读', '标为已读', '丢掉']);
});
