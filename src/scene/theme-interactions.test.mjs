import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_SCENE_IDS, ROOM_SCENES } from '../scene-catalog.mjs';
import { STAR_PATTERNS, THEME_OBJECTS, TEA_BREW_MS, connectStar, freshTea, starAtPoint, teaAction, tendPlant } from './theme-interactions.mjs';
import { drawPlant, drawSeaWindow, drawStarChart, drawTea } from './theme-pixels.mjs';

function fakeCanvas(width, height) {
  const pixels = new Map(), calls = [];
  const context = {
    fillStyle: '', imageSmoothingEnabled: true,
    clearRect(x, y, w, h) { calls.push(['clear', x, y, w, h]); },
    fillRect(x, y, w, h) { calls.push(['rect', x, y, w, h, this.fillStyle]); }
  };
  return { context, calls, width, height, pixels };
}
const drawn = (draw, value, width = 96, height = 96) => {
  const canvas = fakeCanvas(width, height); draw(canvas.context, value); return canvas.calls;
};

test('all eight scenes keep stable IDs and four non-study themes have distinct objects', () => {
  assert.deepEqual(ROOM_SCENE_IDS, ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']);
  assert.equal(ROOM_SCENES.length, 8);
  assert.deepEqual(Object.keys(THEME_OBJECTS).sort(), ['forest', 'seaside', 'starlight', 'warm']);
  const labels = Object.values(THEME_OBJECTS).map(item => item.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('forest water and turn produce different rendered plants', () => {
  const dry = drawn(drawPlant, { water: 0, facing: 1 });
  const wet = drawn(drawPlant, { water: 2, facing: -1 });
  assert.notDeepEqual(dry, wet);
  assert.equal(tendPlant({ water: 2, facing: 1 }, 'water').water, 2, 'watering is capped');
  assert.deepEqual(tendPlant({ water: 1, facing: 1 }, 'turn'), { water: 1, facing: -1 });
  assert.equal(tendPlant({ water: 1, facing: 1 }, 'unknown').water, 1);
});

test('tea waits, has three sips, then refills without touching focus', () => {
  let tea = freshTea();
  tea = teaAction(tea, 'brew', 1000);
  assert.equal(tea.phase, 'brewing');
  assert.equal(tea.readyAt, 1000 + TEA_BREW_MS);
  assert.equal(teaAction(tea, 'ready', 1000 + TEA_BREW_MS - 1), tea, 'not ready early');
  tea = teaAction(tea, 'ready', tea.readyAt);
  assert.equal(tea.phase, 'ready');
  for (const sips of [2, 1, 0]) { tea = teaAction(tea, 'sip'); assert.equal(tea.sips, sips); }
  assert.equal(tea.phase, 'finished');
  tea = teaAction(tea, 'refill');
  assert.deepEqual(tea, freshTea());
});

test('sea window drawing is open/closed specific; sound is not persisted here', () => {
  assert.notDeepEqual(drawn(drawSeaWindow, false), drawn(drawSeaWindow, true));
  assert.equal(THEME_OBJECTS.seaside.label, '开合海风窗');
});

test('star points are hit-testable and must connect in order', () => {
  const pattern = STAR_PATTERNS[0];
  assert.equal(starAtPoint(pattern, 0, 58, 95), 0);
  assert.equal(starAtPoint(pattern, 0, 104, 95), 1);
  assert.equal(connectStar(pattern, 0, 0), 1);
  assert.equal(connectStar(pattern, 1, 0), 1, 'clicking the first point first is safe');
  assert.equal(connectStar(pattern, 1, 1), 2);
  assert.equal(connectStar(pattern, pattern.points.length, 0), pattern.points.length);
});

test('every original canvas renderer draws only inside integer bounds', () => {
  const checks = [
    [drawPlant, { water: 2, facing: -1 }, 96, 96],
    [drawTea, { phase: 'brewing', sips: 3 }, 96, 96],
    [drawSeaWindow, true, 96, 96],
    [drawStarChart, { pattern: STAR_PATTERNS[2], progress: 7 }, 240, 144]
  ];
  for (const [draw, value, width, height] of checks) {
    const calls = drawn(draw, value, width, height);
    assert.ok(calls.length > 25);
    for (const call of calls) {
      const [, x, y, w, h] = call;
      assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h));
      assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${draw.name} ${JSON.stringify(call)}`);
    }
  }
});
