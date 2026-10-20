import test from 'node:test';
import assert from 'node:assert/strict';
import { BIG, SMALL, TINY, FONTS, glyph, layoutText, measure, glyphCells, textRuns } from './pixel-digits.mjs';
import { colour, mix, createRaster, fill, blit, toHex, get } from './raster.mjs';
import { flipFrame, leafRows, changedCards, FLIP_FRAMES } from './flip-math.mjs';
import { DISPLAY_KEY, FACE_IDS, SCENE_FACES, normalizeDisplay, faceFor, cycleFace, readDisplay, writeDisplay, createDisplayStore } from './focus-display.mjs';
import { faceModel, nextWake, modelKey } from './face-model.mjs';
import { FACES, previewModel } from './faces/index.mjs';
import { FACE_PALETTES } from './face-palette.mjs';
import { stylus } from './faces/record.mjs';
import { beadPoints, BEADS } from './faces/ring.mjs';
import { ROOM_SCENE_IDS } from '../scene-catalog.mjs';

const memory = () => { const map = new Map(); return { getItem: (k) => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), map }; };

test('every digit glyph is a full bitmap of its font and the ten digits are distinct', () => {
  for (const [name, f] of Object.entries(FONTS)) {
    const seen = new Set();
    for (const ch of '0123456789:-') {
      const rows = glyph(ch, f), w = ch === ':' ? f.colonW : f.w;
      assert.equal(rows.length, f.h, `${name} ${ch} rows`);
      for (const row of rows) { assert.equal(row.length, w, `${name} ${ch} width`); assert.match(row, /^[#.]+$/); }
      assert.ok(glyphCells(ch, f).length > 0, `${name} ${ch} has ink`);
      if (/\d/.test(ch)) { assert.ok(!seen.has(rows.join()), `${name} ${ch} duplicates another digit`); seen.add(rows.join()); }
    }
  }
  assert.equal(glyph('x'), null);
});

test('layout measures digits, colons and gaps in art pixels; runs merge ink horizontally', () => {
  assert.equal(measure('12:34', BIG), 7 * 4 + 2 + 4);
  assert.equal(measure('12:34', BIG, { cell: 2, gap: 2 }), 14 * 4 + 4 + 8);
  assert.equal(layoutText('1a2', SMALL).glyphs.length, 2, 'unknown characters are skipped');
  assert.equal(layoutText('', TINY).width, 0);
  const runs = textRuns('8', TINY);
  assert.deepEqual(runs[0], { x: 0, y: 0, w: 3 });
  assert.equal(runs.reduce((n, r) => n + r.w, 0), glyphCells('8', TINY).length);
  assert.equal(textRuns('1', BIG, { cell: 2 }).reduce((n, r) => n + r.w, 0), glyphCells('1', BIG).length * 4);
});

test('the raster packs colours in ImageData byte order and mixes ramps without alpha', () => {
  const c = colour('#102030'); assert.equal(c & 255, 0x10); assert.equal((c >>> 8) & 255, 0x20); assert.equal((c >>> 16) & 255, 0x30); assert.equal(c >>> 24, 255);
  assert.equal(toHex(colour('#abc')), '#aabbcc');
  assert.equal(toHex(mix('#000000', '#ffffff', .5)), '#808080'); assert.equal(mix('#123456', '#ffffff', 0), colour('#123456'));
  const r = createRaster(4, 4), leaf = createRaster(2, 4);
  fill(leaf, 0, 0, 2, 2, '#ff0000'); fill(leaf, 0, 2, 2, 2, '#0000ff');
  blit(r, leaf, 1, 0, { rows: 2 });
  assert.equal(get(r, 1, 0), colour('#ff0000')); assert.equal(get(r, 1, 1), colour('#0000ff')); assert.equal(get(r, 1, 2), 0, 'squashed leaf drops rows');
  fill(r, -3, 0, 100, 1, '#fff'); assert.equal(get(r, 3, 0), colour('#fff'), 'fill clips to the raster');
});

test('the flip follows gluqlo: the top leaf folds and darkens, the bottom leaf opens and brightens', () => {
  const frames = Array.from({ length: FLIP_FRAMES }, (_, f) => flipFrame(f));
  assert.deepEqual(frames.map((f) => f.leaf), ['top', 'top', 'top', 'bottom', 'bottom', 'bottom']);
  assert.deepEqual(frames.map((f) => Math.round(f.scale * 100)), [100, 50, 0, 33, 67, 100]);
  assert.deepEqual(frames.map((f) => f.light), frames.map((f) => f.scale));
  assert.equal(leafRows(15, 0), 1, 'the card edge stays visible'); assert.equal(leafRows(15, 1), 15);
  assert.deepEqual(changedCards('1825', '1824'), [3]); assert.deepEqual(changedCards('0959', '1000'), [0, 1, 2, 3]); assert.deepEqual(changedCards('59', '100'), [0, 1, 2]);
});

test('display preferences live in their own key, follow the scene until picked, and sync', () => {
  assert.equal(DISPLAY_KEY, 'album-circle-focus-display-v1');
  assert.deepEqual(normalizeDisplay({ mode: 'nope', show: 'x', seconds: 1 }), { mode: '', show: 'auto', seconds: false, autoEnter: false });
  assert.deepEqual(normalizeDisplay({ mode: 'ring', show: 'timer', seconds: true }), { mode: 'ring', show: 'timer', seconds: true, autoEnter: false });
  assert.equal(normalizeDisplay({ autoEnter: false }).autoEnter, false, 'auto-enter on pomodoro start can be turned off');
  for (const id of ROOM_SCENE_IDS) assert.ok(FACE_IDS.includes(SCENE_FACES[id]), `${id} has a default face`);
  assert.equal(faceFor({}, 'warm'), 'flip'); assert.equal(faceFor({}, 'forest'), 'growth'); assert.equal(faceFor({ mode: 'record' }, 'forest'), 'record');
  assert.equal(cycleFace('growth', 1), 'flip'); assert.equal(cycleFace('flip', -1), 'growth'); assert.equal(cycleFace('bogus', 1), FACE_IDS[1]);
  const storage = memory();
  assert.deepEqual(readDisplay(storage), { mode: '', show: 'auto', seconds: false, autoEnter: false });
  storage.setItem(DISPLAY_KEY, '{broken'); assert.deepEqual(readDisplay(storage), { mode: '', show: 'auto', seconds: false, autoEnter: false });
  assert.equal(writeDisplay({ mode: 'window' }, storage), true); assert.equal(readDisplay(storage).mode, 'window');
  assert.equal(writeDisplay({}, { setItem() { throw new Error('quota'); } }), false);
  const listeners = {}, win = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: (t) => { delete listeners[t]; } };
  const store = createDisplayStore(storage, win); let calls = 0;
  const off = store.subscribe(() => calls++);
  store.set({ show: 'clock' }); assert.equal(calls, 1); assert.equal(JSON.parse(storage.getItem(DISPLAY_KEY)).show, 'clock');
  storage.setItem(DISPLAY_KEY, JSON.stringify({ mode: 'ring' })); listeners.storage({ key: DISPLAY_KEY }); assert.equal(store.get().mode, 'ring'); assert.equal(calls, 2);
  listeners.storage({ key: 'other' }); assert.equal(calls, 2);
  off(); assert.equal(listeners.storage, undefined, 'the last listener detaches the storage event');
});

test('a face shows the clock when idle and the round while one runs; show and seconds override', () => {
  const now = new Date(2026, 9, 16, 9, 5, 7).getTime();
  const idle = faceModel({ now, focus: { phase: 'idle', focusMin: 25 } });
  assert.equal(idle.mode, 'clock'); assert.deepEqual(idle.groups, ['09', '05']); assert.equal(idle.small, ''); assert.equal(idle.caption, '10 月 16 日 · 周五');
  assert.equal(faceModel({ now, focus: { phase: 'idle' }, seconds: true }).small, '07');
  const run = faceModel({ now, focus: { phase: 'focus', endsAt: now + 18 * 60000 + 24500, duration: 25 * 60000 } });
  assert.equal(run.mode, 'timer'); assert.deepEqual(run.groups, ['18', '25']); assert.equal(run.label, '18:25'); assert.ok(Math.abs(run.progress - (1 - 1104500 / 1500000)) < 1e-9);
  assert.equal(faceModel({ now, focus: { phase: 'focus', endsAt: now + 1000 }, show: 'clock' }).mode, 'clock');
  const waiting = faceModel({ now, focus: { phase: 'idle', focusMin: 50 }, show: 'timer' });
  assert.deepEqual(waiting.groups, ['50', '00']); assert.equal(waiting.progress, 0);
  const minutes = faceModel({ now, focus: { phase: 'focus', paused: true, remaining: 61000, hideSeconds: true } });
  assert.deepEqual(minutes.groups, ['02']); assert.equal(minutes.unit, '分'); assert.equal(minutes.label, '2 分钟'); assert.equal(minutes.progress, null, 'no length known (wallpaper snapshot)');
  assert.deepEqual(faceModel({ now, focus: { phase: 'focus', endsAt: now + 125 * 60000, duration: 150 * 60000 } }).groups, ['125', '00']);
});

test('faces sleep until the next visible change: minute or second boundaries, progress steps, never while paused', () => {
  const now = new Date(2026, 9, 16, 9, 5, 7, 250).getTime();
  const clock = faceModel({ now, focus: { phase: 'idle' } });
  assert.equal(nextWake(clock), 60000 - 7250 + 4);
  assert.equal(nextWake(clock, { seconds: true }), 750 + 4);
  const run = faceModel({ now, focus: { phase: 'focus', endsAt: now + 90300, duration: 25 * 60000 } });
  assert.equal(nextWake(run), 300 + 8);
  const hidden = faceModel({ now, focus: { phase: 'focus', endsAt: now + 90300, duration: 25 * 60000, hideSeconds: true } });
  assert.equal(nextWake(hidden), 30300 + 8);
  assert.equal(nextWake(hidden, { steps: 36 }), Math.ceil(34 * 1500000 / 36 - (1500000 - 90300)) + 8, 'a bead lighting before the minute turns wakes first');
  assert.equal(nextWake(hidden, { steps: 2 }), 30300 + 8, 'a progress step farther away than the minute does not wake earlier');
  const coarse = faceModel({ now, focus: { phase: 'focus', endsAt: now + 1320000, duration: 1500000, hideSeconds: true } });
  assert.equal(nextWake(coarse, { steps: 8 }), 7500 + 8, 'the next of 8 growth stages');
  assert.equal(nextWake(faceModel({ now, focus: { phase: 'focus', paused: true, remaining: 5000, duration: 9000 } })), Infinity);
  assert.equal(nextWake(faceModel({ now, focus: { phase: 'focus', paused: true, remaining: 5000 } }), { wall: true }), 60000 - 7250 + 4, 'wall-clock faces still follow the minute');
  assert.ok(nextWake(faceModel({ now, focus: { phase: 'focus', endsAt: now + 1, duration: 9000 } })) >= 40);
  assert.notEqual(modelKey(run, 36), modelKey(faceModel({ now: now + 1000, focus: { phase: 'focus', endsAt: now + 90300, duration: 25 * 60000 } }), 36));
  assert.equal(modelKey(hidden, 0), modelKey(faceModel({ now: now + 2000, focus: { phase: 'focus', endsAt: now + 90300, duration: 25 * 60000, hideSeconds: true } }), 0));
});

test('every face paints inside its own size in every scene palette, idle, running, paused and mid-flip', () => {
  const now = new Date(2026, 9, 16, 21, 47, 30).getTime();
  const models = [
    faceModel({ now, focus: { phase: 'idle' } }), faceModel({ now, focus: { phase: 'idle' }, seconds: true }),
    faceModel({ now, focus: { phase: 'focus', endsAt: now + 600000, duration: 1500000, round: 2, longEvery: 4 } }),
    faceModel({ now, focus: { phase: 'shortBreak', paused: true, remaining: 61000, hideSeconds: true } }),
    faceModel({ now: new Date(2026, 9, 16, 12, 0).getTime(), focus: { phase: 'longBreak', endsAt: now, duration: 900000 } })
  ];
  for (const [id, face] of Object.entries(FACES)) for (const [look, pal] of Object.entries(FACE_PALETTES)) for (const model of [...models, previewModel(id)]) {
    const { w, h } = face.size(model), r = face.paint(model, pal);
    assert.equal(r.w, w, `${id} ${look} width`); assert.equal(r.h, h, `${id} ${look} height`);
    const opaque = r.data.filter(Boolean).length;
    assert.ok(opaque > w * h * .1, `${id} ${look} draws something`);
    if (face.flips) for (let frame = 0; frame < FLIP_FRAMES; frame++) assert.equal(face.paint(model, pal, { frame, from: '0000', cards: [0, 3] }).w, w);
  }
  assert.deepEqual(Object.keys(FACES), FACE_IDS);
});

test('the record arm tracks inward and the ring has 36 distinct beads', () => {
  const r = (p) => { const [x, y] = stylus(p); return Math.hypot(x - 37, y - 36); };
  assert.ok(r(0) > r(.5) && r(.5) > r(1), 'lead-in to run-out'); assert.ok(Math.abs(r(0) - 28) < 1.5 && Math.abs(r(1) - 13) < 1.5);
  assert.equal(new Set(beadPoints.map(String)).size, BEADS);
});

test('automatic immersion is opt-in and an existing opt-in remains honoured', () => {
  assert.equal(normalizeDisplay({}).autoEnter, false);
  assert.equal(normalizeDisplay({ autoEnter: true }).autoEnter, true);
});
