import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_ORDER, ZONE_KEY, neighbour, rubberBand, dragOffset, velocity, snapIndex, commitDistance, settleDuration, wheelDistance, dotLevels, keyTarget, readZone, saveZone, zoneAfterResize, worldCamera, cameraTransform, ZONE_SPOTS, zoneSpots } from './corner-nav.mjs';
import { defaultLayout, bounds } from './spatial-layout.mjs';

test('each corner is aimed at its own furniture, wherever the layout put it', () => {
  const boxes = layout => layout.items.map(item => ({ type: item.type, ...bounds(item) }));
  const spots = zoneSpots(boxes(defaultLayout('pixel')));
  for (const zone of ZONE_ORDER) assert.ok(Math.abs(spots[zone].x - ZONE_SPOTS[zone].x) <= 2 && Math.abs(spots[zone].floor.y - ZONE_SPOTS[zone].floor.y) <= 2, `${zone} fallback matches the default room`);
  assert.ok(spots.work.x < spots.life.x && spots.life.x < spots.music.x, 'desk on the left, bed in front, turntable on the right');
  assert.ok(spots.music.floor.y > spots.music.y, 'the click area is on the floor under the camera target');
  const moved = zoneSpots([{ type: 'desk', x: 900, y: 300, w: 100, h: 80 }, { type: 'chair', x: 1000, y: 340, w: 40, h: 60 }]);
  assert.deepEqual(moved.work, { x: 985, y: 355, floor: { x: 985, y: 390 } });
  assert.equal(moved.music, ZONE_SPOTS.music, 'a corner without its furniture keeps the default spot');
});

const memory = (seed = {}) => { const data = new Map(Object.entries(seed)); return { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), data }; };

test('corners run music → work → life and only step to real neighbours', () => {
  assert.deepEqual(ZONE_ORDER, ['music', 'work', 'life']);
  assert.equal(neighbour('music', 1), 'work'); assert.equal(neighbour('work', 1), 'life'); assert.equal(neighbour('work', -1), 'music');
  assert.equal(neighbour('music', -1), null); assert.equal(neighbour('life', 1), null); assert.equal(neighbour('all', 1), null);
});

test('the strip follows the finger inside and resists past either end', () => {
  assert.equal(dragOffset(-120, 1, 400), -120); assert.equal(dragOffset(300, 1, 400), 300);
  const pulled = dragOffset(200, 0, 400);
  assert.ok(pulled > 0 && pulled < 200 * .55, `first page gives way slowly (${pulled})`);
  assert.ok(dragOffset(400, 0, 400) > pulled && dragOffset(4000, 0, 400) < 400, 'more pull, more give, never a full page');
  const end = dragOffset(-200, 2, 400); assert.ok(end < 0 && end > -110);
  assert.equal(dragOffset(-900, 0, 400), -800 + rubberBand(-100, 400), 'two pages at most, elastic beyond the last');
  assert.equal(rubberBand(0, 400), 0); assert.equal(rubberBand(50, 0), 0);
  assert.equal(Math.sign(rubberBand(-30, 400)), -1);
});

test('release velocity uses the last 100 ms and reads zero after the finger rests', () => {
  assert.equal(velocity([]), 0); assert.equal(velocity([{ x: 0, t: 0 }]), 0);
  assert.equal(velocity([{ x: 0, t: 0 }, { x: -20, t: 50 }, { x: -60, t: 100 }, { x: -100, t: 150 }]), -.8);
  assert.equal(velocity([{ x: 0, t: 0 }, { x: -100, t: 20 }, { x: -100, t: 400 }]), 0);
});

test('a flick turns one page, a slow drag must pass the threshold, a flick back cancels', () => {
  const width = 390;
  assert.equal(snapIndex({ index: 0, dx: -220, width }), 1, 'a long slow swipe');
  assert.equal(snapIndex({ index: 1, dx: -40, velocity: -.8, width }), 2, 'a short fast flick');
  assert.equal(snapIndex({ index: 1, dx: -40, velocity: -.1, width }), 1, 'a short slow drag springs back');
  assert.equal(snapIndex({ index: 1, dx: -200, velocity: .6, width }), 1, 'flung back against the drag');
  assert.equal(snapIndex({ index: 1, dx: 5, velocity: 2, width }), 1, 'a tap never turns the page');
  assert.equal(snapIndex({ index: 0, dx: 300, velocity: 1, width }), 0, 'nothing before the first corner');
  assert.equal(snapIndex({ index: 2, dx: -2000, velocity: -9, width }), 2, 'nothing after the last');
  assert.equal(snapIndex({ index: 0, dx: -1000, velocity: -3, width }), 1, 'one gesture, one page');
  assert.equal(commitDistance(390), 117); assert.equal(commitDistance(100), 56); assert.equal(commitDistance(2000), 240);
});

test('settling is quick after a flick and bounded either way', () => {
  assert.equal(settleDuration(0), 0);
  const slow = settleDuration(300), flung = settleDuration(300, 2);
  assert.ok(flung < slow && flung >= 200 && slow <= 460, `${flung} < ${slow}`);
  assert.equal(settleDuration(5000), 460); assert.equal(settleDuration(10, 9), 200);
  assert.equal(wheelDistance(390), 60); assert.equal(wheelDistance(1440), 140);
});

test('page dots light up in proportion to where the strip sits', () => {
  assert.deepEqual(dotLevels(1), [0, 1, 0]);
  assert.deepEqual(dotLevels(.5), [.5, .5, 0]);
  assert.deepEqual(dotLevels(-.2).map(n => +n.toFixed(2)), [.8, 0, 0]);
});

test('keys: arrows walk and bump, digits jump, 0 and Esc leave the corner', () => {
  assert.deepEqual(keyTarget('ArrowRight', 'music'), { to: 'work' });
  assert.deepEqual(keyTarget('ArrowLeft', 'life'), { to: 'work' });
  assert.deepEqual(keyTarget('ArrowLeft', 'music'), { edge: -1 });
  assert.deepEqual(keyTarget('ArrowRight', 'life'), { edge: 1 });
  assert.equal(keyTarget('ArrowRight', 'all'), null, 'arrows stay the player seek keys in the whole room');
  assert.deepEqual(keyTarget('2', 'all'), { to: 'work' }); assert.deepEqual(keyTarget('3', 'music'), { to: 'life' });
  assert.equal(keyTarget('1', 'music'), null); assert.equal(keyTarget('4', 'music'), null);
  assert.deepEqual(keyTarget('0', 'work'), { to: 'all' }); assert.deepEqual(keyTarget('Escape', 'life'), { to: 'all' });
  assert.equal(keyTarget('0', 'all'), null); assert.equal(keyTarget('x', 'work'), null);
});

test('the last place is remembered per device and the breakpoint only resets the whole room', () => {
  assert.equal(readZone(memory(), 1440), 'all'); assert.equal(readZone(memory(), 390), 'music');
  assert.equal(readZone(memory({ [ZONE_KEY]: 'life' }), 1440), 'life');
  assert.equal(readZone(memory({ [ZONE_KEY]: 'attic' }), 1440), 'all', 'unknown values fall back');
  assert.equal(readZone({ getItem() { throw Error('blocked'); } }, 390), 'music');
  const store = memory(); assert.equal(saveZone(store, 'work'), true); assert.equal(store.data.get(ZONE_KEY), 'work');
  assert.equal(saveZone(store, 'attic'), false); assert.equal(saveZone({ setItem() { throw Error('full'); } }, 'work'), false);
  assert.equal(zoneAfterResize('all', true), 'music'); assert.equal(zoneAfterResize('all', false), 'all');
  assert.equal(zoneAfterResize('work', false), 'work'); assert.equal(zoneAfterResize('life', true), 'life');
});

test('the overview camera fits the room and dollies a corner to the centre of the frame', () => {
  const fit = worldCamera(1440, 748);
  assert.equal(fit.scale, .935); assert.equal(fit.x, 720 - 600 * .935); assert.equal(fit.y, 0);
  const zoomed = worldCamera(1440, 748, ZONE_SPOTS.work, 2);
  assert.equal(zoomed.scale, 1.87);
  assert.ok(Math.abs(zoomed.x + ZONE_SPOTS.work.x * zoomed.scale - 720) < 1e-9 && Math.abs(zoomed.y + ZONE_SPOTS.work.y * zoomed.scale - 374) < 1e-9);
  assert.deepEqual(worldCamera(800, 600, ZONE_SPOTS.music, 1), worldCamera(800, 600));
  assert.equal(cameraTransform({ x: 1, y: 2, scale: 3 }), 'translate(1px, 2px) scale(3)');
});
