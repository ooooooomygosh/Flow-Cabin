import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseBubbleOffset } from './bubble-placement.mjs';

const view = { left: 0, right: 1000, top: 0, bottom: 700 };
const cat = { left: 400, right: 500, top: 500, bottom: 600 };
const base = { left: 375, right: 525, top: 440, bottom: 496 };
const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const place = (o) => ({ left: base.left + o.dx, right: base.right + o.dx, top: base.top + o.dy, bottom: base.bottom + o.dy });

test('no obstacles: bubble stays top-centre', () => {
  assert.deepEqual(chooseBubbleOffset(base, cat, [], view), { side: 'top', dx: 0, dy: 0, cost: 0, bias: 0 });
});
test('a console covering top-centre/top-left is avoided', () => {
  const panel = { left: 200, right: 480, top: 400, bottom: 520 };
  const pick = chooseBubbleOffset(base, cat, [panel], view);
  assert.equal(hit(place(pick), panel), false);
  assert.equal(pick.cost, 0);
});
test('console to the left: bubble leans right when both sides are equally free', () => {
  const blockers = [{ left: 430, right: 470, top: 370, bottom: 496 }, { left: 300, right: 700, top: 522, bottom: 578 }]; // centre column + side slots
  const consoleRect = { left: 20, right: 460, top: 600, bottom: 690 }; // cat's centre (450) is left of its right edge
  const plain = chooseBubbleOffset(base, cat, blockers, view);
  const leaning = chooseBubbleOffset(base, cat, blockers, view, 6, consoleRect);
  assert.ok(plain.dx < 0, 'without a console the first (left) candidate wins the tie');
  assert.ok(leaning.dx > 0, 'with the console on the left the right candidate wins');
});
