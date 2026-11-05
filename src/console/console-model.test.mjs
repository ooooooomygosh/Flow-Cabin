import test from 'node:test';
import assert from 'node:assert/strict';
import { valueToAngle, angleToValue, pointerAngle, dragValue, detentOf, crossedDetent, keyValue, scaleMarks, polar, KNOB_SWEEP_DEG } from './knob-model.mjs';
import { needleStep, needleSettled, targetFor, peakStep, readingToAngle, meterTicks, NEEDLE_SWEEP_DEG } from './vu-model.mjs';
import { sliderToGain, gainToSlider, wheelVolume } from '../player/volume-curve.mjs';
import { sourceDial, nextSource, dialAngle } from './source-model.mjs';
import { ledTimeSize } from './led-time.mjs';

test('knob: the arc is 264 degrees and angle and value are inverses', () => {
  assert.ok(Math.abs(valueToAngle(0) + KNOB_SWEEP_DEG) < 1e-9);
  assert.ok(Math.abs(valueToAngle(1) - KNOB_SWEEP_DEG) < 1e-9);
  assert.ok(Math.abs(valueToAngle(.5)) < 1e-9, 'half is straight up');
  for (const v of [0, .1, .37, .5, .91, 1]) assert.ok(Math.abs(angleToValue(valueToAngle(v)) - v) < 1e-9);
  assert.equal(angleToValue(-179), 0, 'inside the dead zone clamps to 0');
  assert.equal(angleToValue(180), 1);
  assert.equal(valueToAngle(NaN), valueToAngle(0));
});

test('knob: the value is the perceptual slider position the player already uses', () => {
  // 6 on the scale (.6) is the slider position that gain turns into a cube; the knob stores .6, not the gain.
  assert.ok(Math.abs(sliderToGain(.6) - .216) < 1e-9);
  assert.ok(Math.abs(gainToSlider(sliderToGain(.6)) - .6) < 1e-9);
  assert.equal(wheelVolume(.5, -100), .55, 'one wheel notch up is one step');
  assert.equal(keyValue(.5, 'ArrowUp'), .55);
});

test('knob: pointer angles run clockwise from straight up', () => {
  assert.equal(pointerAngle(0, 0, 0, -10), 0);
  assert.equal(pointerAngle(0, 0, 10, 0), 90);
  assert.equal(pointerAngle(0, 0, 0, 10), 180);
  assert.equal(pointerAngle(0, 0, -10, 0), -90);
  const p = polar(50, 50, 10, 90); assert.ok(Math.abs(p.x - 60) < 1e-9 && Math.abs(p.y - 50) < 1e-9);
});

test('knob: dragging turns by the distance the pointer went round, and cannot wrap through the dead zone', () => {
  const tenth = 2 * KNOB_SWEEP_DEG / 10;
  assert.ok(Math.abs(dragValue(.5, 0, tenth) - .6) < 1e-9);
  assert.ok(Math.abs(dragValue(.5, 0, -tenth) - .4) < 1e-9);
  // the pointer crossing the bottom (+170 to -170) is a 20 degree turn, not a 340 degree one
  assert.ok(dragValue(1, 170, -170) >= 1 - 1e-9);
  assert.ok(Math.abs(dragValue(.9, 170, -170) - (.9 + 20 / (2 * KNOB_SWEEP_DEG))) < 1e-9 || dragValue(.9, 170, -170) === 1);
  assert.equal(dragValue(0, 10, -170), 0, 'clamped at zero');
});

test('knob: a click is heard when the pointer passes one of the eleven marks, not on every frame', () => {
  assert.equal(detentOf(0), 0); assert.equal(detentOf(1), 10); assert.equal(detentOf(.64), 6); assert.equal(detentOf(.65), 7);
  assert.equal(crossedDetent(.61, .63), false);
  assert.equal(crossedDetent(.64, .66), true);
  let clicks = 0, last = 0; for (let v = 0; v <= 1.0001; v += .005) { if (crossedDetent(last, v)) clicks++; last = v; }
  assert.equal(clicks, 10);
});

test('knob: keys', () => {
  assert.equal(keyValue(.5, 'ArrowRight'), .55); assert.equal(keyValue(.5, 'ArrowLeft'), .45);
  assert.equal(keyValue(.97, 'ArrowUp'), 1); assert.equal(keyValue(.02, 'ArrowDown'), 0);
  assert.equal(keyValue(.5, 'PageUp'), .6); assert.equal(keyValue(.5, 'Home'), 0); assert.equal(keyValue(.5, 'End'), 1);
  assert.equal(keyValue(.5, 'a'), null);
});

test('knob: the engraved scale has eleven marks and numbers 0 2 4 6 8 10', () => {
  const marks = scaleMarks();
  assert.equal(marks.length, 11);
  assert.deepEqual(marks.filter((m) => m.label).map((m) => m.label), ['0', '2', '4', '6', '8', '10']);
  assert.ok(marks.every((m, i) => i === 0 || m.deg > marks[i - 1].deg));
});

test('needle: moves towards the reading, overshoots a little, settles', () => {
  let state = { pos: 0, vel: 0 }, peak = 0;
  for (let t = 0; t < 2; t += 1 / 60) { state = needleStep(state, .8, 1 / 60); peak = Math.max(peak, state.pos); }
  assert.ok(peak > .8 && peak < .9, `overshoot ${peak}`);
  assert.ok(Math.abs(state.pos - .8) < .01);
  assert.ok(needleSettled(state, .8, .01));
});

test('needle: reads 99% in about a third of a second, like a VU meter', () => {
  let state = { pos: 0, vel: 0 }, at = 0;
  for (let t = 0; t < 2; t += 1 / 120) { state = needleStep(state, 1, 1 / 120); if (!at && state.pos >= .99) at = t; }
  assert.ok(at > .15 && at < .55, `reached at ${at}`);
});

test('needle: reduced motion jumps, a stalled frame is safe, the pin holds', () => {
  assert.deepEqual(needleStep({ pos: 0, vel: 3 }, .6, .016, { reduced: true }), { pos: .6, vel: 0 });
  const slow = needleStep({ pos: 0, vel: 0 }, 1, 5); assert.ok(Number.isFinite(slow.pos) && slow.pos <= 1.04);
  let state = { pos: 1, vel: 40 }; state = needleStep(state, 1, .1); assert.ok(state.pos <= 1.04);
  assert.deepEqual(needleStep(undefined, NaN, .01).pos, 0);
});

test('needle: falls home when the music stops', () => {
  let state = { pos: .9, vel: 0 };
  for (let t = 0; t < 3; t += 1 / 60) state = needleStep(state, 0, 1 / 60);
  assert.ok(state.pos < .02 && state.pos >= -.03);
});

test('needle: energy curve and angles', () => {
  assert.equal(targetFor(0), 0); assert.ok(targetFor(1) < 1 && targetFor(1) > .9); assert.ok(targetFor(.5) > targetFor(.25));
  assert.ok(Math.abs(readingToAngle(0) + NEEDLE_SWEEP_DEG) < 1e-9); assert.ok(Math.abs(readingToAngle(.5)) < 1e-9);
  assert.ok(Math.abs(NEEDLE_SWEEP_DEG - 35.52) < .01);
});

test('peak meter holds a loud moment and lets it go slowly', () => {
  let peak = peakStep(0, .9, .016); assert.equal(peak, .9);
  peak = peakStep(peak, .2, .5); assert.ok(peak < .9 && peak > .5);
  for (let i = 0; i < 100; i++) peak = peakStep(peak, 0, .1); assert.equal(peak, 0);
});

test('meter face: twenty divisions, every fifth long, the last fifth in red', () => {
  const ticks = meterTicks(); assert.equal(ticks.length, 21);
  assert.equal(ticks.filter((t) => t.long).length, 5); assert.ok(ticks.slice(16).every((t) => t.red) && !ticks[15].red);
});

test('source dial: only the sources that exist now, with their reasons, in the settings order', () => {
  const rows = sourceDial({ desktop: false, mobile: false, mac: false }, 'visual');
  assert.deepEqual(rows.map((r) => r.id), ['visual', 'auto', 'local', 'qq', 'netease', 'system', 'ma']);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.visual.available, true); assert.equal(byId.local.available, true, 'local files work in the browser'); assert.equal(byId.qq.available, false); assert.equal(byId.qq.reason, '需要心流小屋桌面版'); assert.equal(byId.ma.available, false);
  const desktop = sourceDial({ desktop: true, mac: false }, 'local');
  assert.equal(desktop.find((r) => r.id === 'local').available, true); assert.equal(desktop.find((r) => r.id === 'local').on, true);
  assert.ok(!desktop.some((r) => r.id === 'appleMusic'), 'Apple Music only on a Mac');
  assert.ok(sourceDial({ desktop: true, mac: true }, 'visual').some((r) => r.id === 'appleMusic'));
  assert.deepEqual(sourceDial({ mobile: true }, 'visual').map((r) => r.id), ['visual', 'auto', 'local', 'qq', 'netease']);
});

test('source dial: arrows turn to the next source that can be used, wrapping', () => {
  const rows = sourceDial({ desktop: false }, 'visual');
  assert.equal(nextSource(rows, 'visual', 1), 'local', 'off the desktop only visual and local files can be used');
  assert.equal(nextSource(rows, 'local', 1), 'visual');
  const d = sourceDial({ desktop: true }, 'visual');
  assert.equal(nextSource(d, 'visual', 1), 'auto'); assert.equal(nextSource(d, 'visual', -1), 'ma');
  assert.equal(nextSource(d, 'ma', 1), 'visual');
  assert.equal(nextSource(d, 'bogus', 1), 'auto');
});

test('source dial: the selector points at the chosen position', () => {
  assert.equal(dialAngle(0, 5), -120); assert.equal(dialAngle(4, 5), 120); assert.equal(dialAngle(0, 1), 0); assert.equal(dialAngle(2, 5), 0);
});

test('led time: the glass is as wide as the numerals', () => {
  const four = ledTimeSize('0:06'), five = ledTimeSize('10:00');
  assert.ok(five.width > four.width, 'five numerals are wider than four');
  assert.equal(four.width, 12 + 4 + 11 + (12 + 4 + 12) + 6, '0 : 06 plus padding');
  assert.equal(four.height, 26);
  assert.equal(ledTimeSize('123').width, 3 * 12 + 2 * 4 + 6, 'no colon, no colon gap');
});
