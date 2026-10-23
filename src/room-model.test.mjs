import assert from 'node:assert/strict';
import test from 'node:test';
import { roomGeometry, roomGeometryAroundPanel, mobileRoomGeometry, shelfPage } from './room-model.mjs';
import { ROOM_SCENES } from './scene-catalog.mjs';

const safe = { top: 130, bottom: 130, left: 300 };
const panel = { left: 1064, right: 1424, top: 140, bottom: 298 };
test('closed focus tools keep the base scene geometry', () => {
  for (const scene of ROOM_SCENES) {
    const geometry = { ...scene.geometry, band: scene.band };
    assert.deepEqual(roomGeometryAroundPanel(1440, 900, safe, geometry, null), roomGeometry(1440, 900, safe, geometry));
  }
});
test('short focus tabs can use space below their real rectangle', () => {
  const scene = ROOM_SCENES[0], geometry = { ...scene.geometry, band: scene.band };
  const insetPanel = { ...panel, left: 900, right: 1260 };
  const short = roomGeometryAroundPanel(1440, 1080, safe, geometry, insetPanel);
  const tall = roomGeometryAroundPanel(1440, 1080, safe, geometry, { ...insetPanel, bottom: 887 });
  assert(short.width > tall.width, 'a short tab must not reserve the tall timer rail');
});
test('floating panels avoid the interaction band in every scene', () => {
  for (const scene of ROOM_SCENES) for (const bottom of [298, 687]) {
    const art = roomGeometryAroundPanel(1440, 900, safe, { ...scene.geometry, band: scene.band }, { ...panel, bottom });
    const k = art.width / 1448, band = scene.band;
    const b = { left: art.left + band.left*k, right: art.left + band.right*k, top: art.top + band.top*k, bottom: art.top + band.bottom*k };
    assert(b.right <= panel.left-12 || b.left >= panel.right+12 || b.bottom <= panel.top-12 || b.top >= bottom+12, scene.id);
  }
});

test('Android uses one full-bleed camera and keeps every active sleeve clear of the controls', () => {
  for (const scene of ROOM_SCENES) for (const [width, height, insets] of [
    [360, 640, { top: 130, bottom: 245, left: 0, right: 42 }],
    [393, 852, { top: 132, bottom: 250, left: 0, right: 42 }],
    [412, 915, { top: 140, bottom: 290, left: 0, right: 42 }],
    [852, 393, { top: 100, bottom: 80, left: 200, right: 42 }],
    [852, 393, { top: 100, bottom: 80, left: 244, right: 42 }],
    [852, 393, { top: 100, bottom: 80, left: 200, right: 86 }],
    [800, 1280, { top: 130, bottom: 310, left: 0, right: 42 }],
    [393, 852, undefined]
  ]) {
    const { geometry: art, slots, compact } = mobileRoomGeometry(width, height, insets, scene.geometry);
    const label = `${scene.id} ${width}x${height}`;
    assert.equal(compact, false, label);
    assert.ok(art.left <= .01 && art.top <= .01 && art.left + art.width >= width - .01 && art.top + art.height >= height - .01, `${label}: illustration leaves unpainted space`);
    assert.ok(Math.abs(art.width / art.height - 4 / 3) < 1e-6, label);
    assert.ok(slots.length > 0, `${label}: no usable shelf`);
    const scale = art.width / 1448;
    for (const slot of slots) {
      const [x, w] = scene.geometry.columns[slot % scene.geometry.columns.length], [y, h] = scene.geometry.rows[Math.floor(slot / scene.geometry.columns.length)];
      assert.ok(art.left + x * scale >= (insets?.left || 0) - .5 && art.left + (x + w) * scale <= width - (insets?.right || 0) + .5, `${label}: sleeve outside horizontal safe area`);
      assert.ok(art.top + y * scale >= (insets?.top || 0) - .5 && art.top + (y + h) * scale <= height - (insets?.bottom || 0) + .5, `${label}: sleeve covered by header/player`);
    }
  }
});

test('short Android windows fold bottom chrome while keeping a full-bleed usable shelf', () => {
  for (const scene of ROOM_SCENES) {
    const { geometry: art, slots, compact } = mobileRoomGeometry(640, 300, { top: 100, bottom: 220, left: 200, right: 42 }, scene.geometry, { top: 100, bottom: 24, left: 0, right: 42 });
    assert.equal(compact, true, scene.id);
    assert.ok(slots.length > 0, scene.id);
    assert.ok(art.left <= 0 && art.top <= 0 && art.left + art.width >= 640 && art.top + art.height >= 300, scene.id);
  }
});

test('every collection item remains reachable once on each Android shelf page at any capacity', () => {
  const items = Array.from({ length: 41 }, (_, id) => ({ id }));
  for (const capacity of [1, 2, 3, 4, 6, 8, 9, 12]) {
    const first = shelfPage(items, 0, capacity), visited = [];
    for (let page = 0; page <= first.maxRow; page++) visited.push(...shelfPage(items, page, capacity).items);
    assert.deepEqual(visited, items);
    assert.equal(shelfPage(items, -1, capacity).startRow, 0);
    assert.equal(shelfPage(items, 999, capacity).startRow, first.maxRow);
  }
  assert.deepEqual(shelfPage([], 10, 0).items, []);
});
