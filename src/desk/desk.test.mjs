import test from 'node:test';
import assert from 'node:assert/strict';
import { deskLayout, viewLayout, filmStep, clockCells, clockFace, PLATES, W, H } from './layout.mjs';
import { EDGE, DRAWER, VIEWS, drawerItems, drawerPlaces, deskKey, autoMode, CLOCK_KEYS } from './desk-model.mjs';

test('on a 1440x900 window everything is exactly where DEsk put it', () => {
  const lay = deskLayout(1440, 900);
  assert.equal(lay.s, 1);
  assert.deepEqual([lay.clockFace.x, lay.clockFace.y, lay.clockFace.w], PLATES.clock.faceAt.slice(0, 3));
  assert.deepEqual([lay.postBox.x, lay.postBox.w], [PLATES.post1[0], PLATES.post1[2]]);
  assert.deepEqual([lay.consolePlate.x, lay.consolePlate.w], [PLATES.console[0], PLATES.console[2]]);
  assert.equal(lay.shelfPlate.x, PLATES.shelfPlate[0]);
});

test('a narrower or wider window keeps the pieces at the edges and the clock in the middle, never overlapping', () => {
  for (const [w, h] of [[1024, 768], [1280, 800], [1920, 1080], [2560, 1440], [3440, 1440], [800, 600]]) {
    const lay = deskLayout(w, h);
    assert(lay.console.x >= 0 && lay.post.x + lay.post.w <= w + 0.5, `${w}: inside`);
    assert(Math.abs(lay.clock.x + lay.clock.w / 2 - (w / 2 + (PLATES.edge.clock[0] + PLATES.edge.clock[2] / 2 - W / 2) * lay.s)) < 0.5, `${w}: clock centred`);
    assert(lay.console.x + lay.console.w <= lay.clock.x + 8 * lay.s, `${w}: console clear of clock`); // the pieces' feathered margins may touch
    assert(lay.clock.x + lay.clock.w <= lay.post.x + 1, `${w}: clock clear of post`);
    assert(lay.drawer.w === w && lay.drawer.h > 0);
  }
});

test('a phone stacks the back of the desk and keeps every target at least 44 px', () => {
  for (const [w, h] of [[390, 844], [360, 740], [430, 932]]) {
    const lay = deskLayout(w, h);
    assert(lay.phone);
    assert(lay.clock.x >= 0 && lay.clock.x + lay.clock.w <= w + 0.5, `${w}: clock fits`);
    for (const plate of [lay.consolePlate, lay.postPlate, lay.shelfPlate]) {
      assert(plate.y >= lay.clock.h && plate.h >= 44 && plate.x >= 0 && plate.x + plate.w <= w + 0.5, `${w}: plate under the clock, 44 px tall, inside`);
    }
    assert(lay.consolePlate.x + lay.consolePlate.w <= lay.postPlate.x && lay.postPlate.x + lay.postPlate.w <= lay.shelfPlate.x, 'three plates in a row');
    const shown = drawerPlaces(9, lay.drawer.span).map((p) => lay.drawer.x + p.x * lay.drawer.s);
    assert(shown[0] >= 20 && shown.at(-1) <= w - 20, `${w}: every drawer thing on screen`);
    assert(lay.clockFace.h >= 28, 'clock readable');
    assert(lay.pull >= 44);
    assert(lay.shelfPlate.x + lay.shelfPlate.w <= w);
  }
});

test('a view covers the window, centred, and places its things', () => {
  const v = viewLayout(1440, 900);
  assert.equal(v.s, 1); assert.equal(v.ox, 0);
  const tall = viewLayout(390, 844, 0.5);
  assert(tall.s * H >= 844 - 0.01 && tall.s * W >= 390);
  const r = tall.place([0, 0, 1440, 900]);
  assert(Math.abs(r.x + r.w / 2 - 195) < 0.5, 'centred when pan is .5');
});

test('the film plays from its first step to its last', () => {
  const f = PLATES.films.shelf;
  assert.equal(filmStep(f, 0), f.steps[0]);
  assert.equal(filmStep(f, 1), f.steps.at(-1));
  assert.equal(filmStep(f, 2), f.steps.at(-1));
  for (const which of ['shelf', 'console', 'post']) assert(PLATES.films[which].steps.length > 10);
});

test('the clock prints every digit from a cell that has it', () => {
  const cells = clockCells('957359');
  const h1 = cells.find((c) => c.name === 'h1');
  assert.equal(h1.from, 'h2', 'a 9 in the first cell comes from the second');
  for (const c of cells) assert(PLATES.clock.places[c.from].digits.includes(c.v), `${c.name}=${c.v}`);
  assert.equal(clockCells('ab0000')[0].v, -1);
});

test('the clock face: time, a running round, the music, the date', () => {
  const at = new Date(2026, 10, 6, 9, 5, 7);
  assert.deepEqual(clockFace('clock', { now: at }).digits, '090507');
  const f = clockFace('focus', { now: at, focus: { phase: 'focus', remaining: 24 * 60000 + 59500, rounds: 3, progress: .1 } });
  assert.equal(f.digits, '250003'); assert.equal(f.word, 'FOCUS');
  assert.equal(clockFace('focus', { now: at, focus: { phase: 'idle', remaining: 0 } }).word, 'READY');
  assert.equal(clockFace('music', { now: at, music: { playing: true, position: 75, track: 2 } }).digits, '011502');
  const d = clockFace('date', { now: at });
  assert.equal(d.digits.slice(0, 4), '1106'); assert.equal(d.colon, false); assert.equal(d.word, 'FRI');
  assert.equal(autoMode({ focusPhase: 'focus', playing: true }), 'focus');
  assert.equal(autoMode({ playing: true }), 'music');
  assert.equal(autoMode({}), 'clock');
});

test('the drawer: lab things only when their lab is on, laid across the felt without overlapping', () => {
  const plain = drawerItems({}), all = drawerItems({ study: true, postcard: true, scenes: true });
  assert(!plain.some((t) => t.lab));
  assert.equal(all.length, DRAWER.length);
  for (const n of [1, 6, 9]) {
    const p = drawerPlaces(n);
    assert.equal(p.length, n);
    for (const q of p) assert(q.x >= 200 && q.x <= 1240);
    for (let i = 1; i < n; i++) assert(p[i].x - p[i - 1].x >= 100);
  }
  for (const t of DRAWER) assert(t.action && t.name && t.art);
});

test('keys: A C N look up, D the drawer, Esc goes back one step, nothing while looking', () => {
  assert.deepEqual(deskKey('a'), { type: 'look', which: 'shelf' });
  assert.deepEqual(deskKey('C'), { type: 'look', which: 'console' });
  assert.deepEqual(deskKey('n'), { type: 'look', which: 'post' });
  assert.deepEqual(deskKey('d', { drawer: false }), { type: 'drawer', open: true });
  assert.deepEqual(deskKey('Escape', { drawer: true }), { type: 'drawer', open: false });
  assert.deepEqual(deskKey('Escape', { look: true, drawer: true }), { type: 'back' });
  assert.equal(deskKey('a', { look: true }), null);
  assert.equal(deskKey('x'), null);
  assert.equal(EDGE.filter((e) => e.key).length, 3);
  assert.equal(CLOCK_KEYS.length, 4);
});

test('every view thing lies inside its picture and leads somewhere', () => {
  for (const [name, view] of Object.entries(VIEWS)) for (const spot of view.spots) {
    const [x, y, w, h] = spot.rect;
    assert(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${name}/${spot.id}`);
    assert(spot.action && spot.name);
  }
});

test('the bookcase: eight binders on the top board, each label card in its own binder, the book at the end', () => {
  const { binders, cards, book, bookLabel, bookCount } = PLATES.shelf;
  assert.equal(binders.length, 8);
  assert.equal(cards.length, 8);
  const inside = ([x, y], quad) => x >= Math.min(...quad.map((p) => p[0])) && x <= Math.max(...quad.map((p) => p[0])) && y >= Math.min(...quad.map((p) => p[1])) && y <= Math.max(...quad.map((p) => p[1]));
  cards.forEach(([x, y, w, h], i) => assert(inside([x + w / 2, y + h / 2], binders[i]), `card ${i} sits on binder ${i}`));
  for (const r of [bookLabel, bookCount]) assert(inside([r[0] + r[2] / 2, r[1] + r[3] / 2], book));
  assert(Math.min(...book.map((p) => p[0])) > Math.max(...binders[6].map((p) => p[0])), 'the book stands past the binders');
  assert(!VIEWS.shelf.spots.some((spot) => spot.action === 'library'), 'the binders themselves are the library');
});
