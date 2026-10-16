import test from 'node:test';
import assert from 'node:assert/strict';
import { GEOMETRY, LABEL_FRAMES, MOTION, REST_ANGLE, RPM, createDeckPhysics, grooveAngle, hitZone, labelFps, labelFrame, progressAngle, progressFromPoint, seekTarget, sideProgress, stylusPoint } from './turntable-physics.mjs';
import { cornerLayout, sceneProps } from './corner-scene.mjs';

const within = (inner, outer, margin = 0) => inner.x - margin >= outer.x && inner.y - margin >= outer.y && inner.x + inner.w + margin <= outer.x + outer.w && inner.y + inner.h + margin <= outer.y + outer.h;
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

test('the platter, with its sidewall, sits inside the plinth with a margin', () => {
  const { center: [cx, cy], platterRadius: R, platterSide, plinth, plate } = GEOMETRY;
  const platter = { x: cx - R - 3, y: cy - R - 3, w: (R + 3) * 2, h: (R + 3) * 2 + platterSide }; // well ring included
  assert(within(platter, plinth, 10), 'platter + well ≥ 10 px from every plinth edge');
  assert(within(platter, plate, 2), 'platter + well inside the deck plate');
  assert(GEOMETRY.recordRadius < R - 3 && GEOMETRY.outerGroove < GEOMETRY.recordRadius && GEOMETRY.innerGroove > GEOMETRY.labelRadius);
  assert(plinth.x + plinth.w <= GEOMETRY.width && GEOMETRY.front.y === plinth.y + plinth.h && GEOMETRY.front.y + GEOMETRY.front.h <= GEOMETRY.height);
});

test('controls live on the deck, apart from each other and from the platter, and hit-test from GEOMETRY', () => {
  const { controls, front, plinth, center: [cx, cy], platterRadius } = GEOMETRY;
  for (const name of ['start', 'speed33', 'speed45']) assert(within(controls[name], front), `${name} on the front face`);
  assert(within(controls.cue, plinth) && Math.hypot(centre(controls.cue)[0] - cx, centre(controls.cue)[1] - cy) > platterRadius + 10, 'cue lever on the arm board');
  const rects = Object.values(controls);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert(!(rects[i].x < rects[j].x + rects[j].w && rects[j].x < rects[i].x + rects[i].w && rects[i].y < rects[j].y + rects[j].h && rects[j].y < rects[i].y + rects[i].h), 'controls do not overlap');
  assert.equal(hitZone(centre(controls.speed33)), 'speed33');
  assert.equal(hitZone(centre(controls.speed45)), 'speed45');
  assert.equal(hitZone(centre(controls.start)), 'start');
  assert.equal(hitZone(centre(controls.cue)), 'start', 'the cue lever plays / pauses');
  assert.equal(hitZone([cx + 30, cy + 30], { arm: REST_ANGLE }), 'record');
  assert.equal(hitZone([cx + 30, cy + 30], { record: false }), '', 'no record, nothing to click on the platter');
  const [sx, sy] = stylusPoint(progressAngle(.5)), [px, py] = GEOMETRY.pivot;
  assert.equal(hitZone([(sx * 3 + px) / 4, (sy * 3 + py) / 4], { arm: progressAngle(.5) }), 'arm');
});

test('the arm reaches every groove and rests clear of the platter, inside the plinth', () => {
  const { center: [cx, cy] } = GEOMETRY;
  for (const progress of [0, .25, .5, .75, 1]) {
    const [x, y] = stylusPoint(progressAngle(progress)), r = Math.hypot(x - cx, y - cy);
    assert(Math.abs(r - (GEOMETRY.outerGroove - progress * (GEOMETRY.outerGroove - GEOMETRY.innerGroove))) < 1e-6);
    assert(Math.abs(progressFromPoint([x, y]) - progress) < 1e-6);
  }
  const [rx, ry] = stylusPoint(REST_ANGLE);
  assert(Math.hypot(rx - cx, ry - cy) > GEOMETRY.platterRadius + 8, 'rest is off the platter');
  assert(within({ x: rx - 4, y: ry - 4, w: 8, h: 8 }, GEOMETRY.plate), 'headshell rests on the plate');
  assert(Number.isFinite(grooveAngle(GEOMETRY.innerGroove)));
});

test('the label turns one pre-rendered frame per step; frame rate follows rpm', () => {
  assert.equal(labelFrame(0), 0);
  assert.equal(labelFrame(Math.PI * 2 - 1e-9), LABEL_FRAMES - 1);
  assert.equal(labelFrame(-1e-9), LABEL_FRAMES - 1);
  assert.equal(labelFrame(Math.PI), LABEL_FRAMES / 2);
  assert(Math.abs(labelFps(33) - 100 / 3 / 60 * LABEL_FRAMES) < 1e-9 && labelFps(33) < 20);
  assert.equal(labelFps(45), 24);
});

test('physics: spin-up in ~0.6 s, coast in ~2.5 s, strobe still at speed', () => {
  const deck = createDeckPhysics(), dt = 1 / 60, nominal = RPM[33] / 60 * Math.PI * 2;
  let t = 0;
  while (deck.state.omega < nominal && t < 2) { deck.step(dt, { motor: true }); t += dt; }
  assert(Math.abs(t - MOTION.spinUp) < .05, `spin-up took ${t}`);
  const strobe = deck.state.strobe;
  for (let i = 0; i < 60; i++) deck.step(dt, { motor: true });
  assert(Math.abs(deck.state.strobe - strobe) < 1e-9, 'strobe dots stand still at the locked speed');
  t = 0;
  while (deck.state.omega > 0 && t < 5) { deck.step(dt, { motor: false }); t += dt; }
  assert(Math.abs(t - MOTION.coast) < .05, `coast took ${t}`);
});

test('physics: cueing lifts before swinging, eases over ~0.6 s, then lowers with a touch-down', () => {
  const deck = createDeckPhysics(), dt = 1 / 60, target = progressAngle(.2), state = deck.state;
  const trace = [];
  for (let i = 0; i < 90; i++) { deck.step(dt, { motor: true, armTarget: target, lowered: true }); trace.push({ arm: state.arm, lift: state.lift, touch: state.touch }); }
  const firstMove = trace.findIndex((s) => Math.abs(s.arm - REST_ANGLE) > 1e-9);
  assert(trace.slice(0, firstMove).every((s) => s.lift >= 1 - 1e-9) || firstMove === 0, 'arm swings only once lifted');
  const arrived = trace.findIndex((s) => Math.abs(s.arm - target) < 1e-9);
  assert(arrived > 30 && arrived < 48, `swing took ${arrived} frames`);
  assert(trace.slice(arrived).some((s) => s.lift === 0 && s.touch > 0), 'headshell dips on touch-down');
  assert.equal(state.cue, 'playing');
  // A small step along the groove does not cue: the groove carries the arm.
  deck.step(dt, { motor: true, armTarget: target + .005, lowered: true });
  assert.equal(state.lift, 0);
  // Pausing lifts the needle where it is.
  for (let i = 0; i < 30; i++) deck.step(dt, { motor: false, armTarget: target, lowered: false });
  assert(state.lift > .99 && Math.abs(state.arm - target) < .01 && state.cue === 'lifted');
  // Dragging follows the pointer at once.
  deck.step(dt, { armTarget: progressAngle(.9), dragging: true });
  assert.equal(state.arm, progressAngle(.9));
});

test('side progress and seeking agree', () => {
  const { progress, gaps } = sideProgress([60000, 120000, 60000], 1, 60);
  assert.equal(progress, .5); assert.deepEqual(gaps, [.25, .75]);
  assert.deepEqual(seekTarget([60000, 120000, 60000], .5), { trackIndex: 1, seconds: 60 });
});

test('corner layout: deck, liner notes and crate fit every supported window at a whole-number scale', () => {
  for (const [width, height] of [[1440, 900], [1280, 720], [960, 600], [640, 800], [1920, 1080]]) {
    const layout = cornerLayout({ width, height }), screen = { x: 0, y: 0, w: width, h: height }, { deck, card } = layout;
    assert(Number.isInteger(layout.k) && layout.k >= 2, `${width}×${height}: scale ${layout.k}`);
    assert(within(deck, screen) && within(card, screen), `${width}×${height}: inside the window`);
    assert(deck.y >= 48 && card.y >= 48, 'below the top bar');
    assert(deck.y + deck.h <= layout.crateTop && card.y + card.h <= layout.crateTop, 'above the crate');
    assert(card.h >= 200 && card.w >= 300, `${width}×${height}: liner notes ${card.w}×${card.h}`);
    const overlap = !(deck.x + deck.w <= card.x || card.x + card.w <= deck.x || deck.y + deck.h - 8 * layout.s <= card.y || card.y + card.h <= deck.y);
    assert(!overlap, `${width}×${height}: deck and notes do not overlap`);
    assert.equal(deck.x % layout.s, 0); assert.equal(deck.y % layout.s, 0);
    const props = sceneProps(layout);
    assert(props.window.x >= 0 && props.window.x + props.window.w <= layout.art.w, 'window on the wall');
  }
  // Device pixels: a 2× screen gets the in-between sizes.
  const retina = cornerLayout({ width: 1440, height: 900, dpr: 2 });
  assert(retina.k >= 4 && Number.isInteger(retina.k) && retina.s === retina.k / 2);
});
