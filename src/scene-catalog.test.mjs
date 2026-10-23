import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_ANCHOR, DECK_BAND, ROOM_SCENE_IDS, ROOM_SCENES, getRoomScene, normalizeRoomSceneId } from './scene-catalog.mjs';

// 六间房、唱片格几何与安全区是同一份事实：这里把不变式钉住，
// 免得某个房间改了行数或 band，布局和避让测试却还以为没变。
test('the cabin keeps exactly eight stable scenes', () => {
  assert.deepEqual([...ROOM_SCENE_IDS], ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']);
  assert.equal(new Set(ROOM_SCENE_IDS).size, 8, 'no duplicated id');
  for (const id of ROOM_SCENE_IDS) {
    const scene = getRoomScene(id);
    assert.equal(scene.id, id);
    assert.ok(scene.label && scene.labelEn && scene.alt, `${id} needs a name and an accessible description`);
    assert.ok(scene.art, `${id} needs artwork`);
    assert.equal(scene.view, scene.pixelArt || scene.art);
  }
  for (const id of ['', 'nope', null, undefined, 42, 'Pixel', '__proto__']) assert.equal(normalizeRoomSceneId(id), 'pixel');
  assert.equal(getRoomScene('nope').id, 'pixel');
  assert.equal(getRoomScene('night-study').id, 'night-study');
});

test('the shelf holds twelve records, and the moonlit study holds nine', () => {
  const slots = Object.fromEntries(ROOM_SCENES.map((scene) => [scene.id, scene.geometry.columns.length * scene.geometry.rows.length]));
  assert.equal(slots['night-study'], 9);
  for (const id of ['pixel', 'warm', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']) assert.equal(slots[id], 12, id);
});

test('every scene band covers its own shelf', () => {
  for (const scene of ROOM_SCENES) {
    const { columns, rows } = scene.geometry, band = scene.band;
    const firstColumn = columns[0], lastColumn = columns[columns.length - 1];
    const firstRow = rows[0], lastRow = rows[rows.length - 1];
    assert.ok(band.left <= firstColumn[0], `${scene.id}: the band starts left of the first column`);
    assert.ok(band.right >= lastColumn[0] + lastColumn[1], `${scene.id}: the band ends right of the last column`);
    assert.ok(band.top <= firstRow[0], `${scene.id}: the band starts above the first row`);
    assert.ok(band.bottom >= lastRow[0] + lastRow[1], `${scene.id}: the band ends below the last row`);
    assert.ok(band.top < band.bottom && band.left < band.right, `${scene.id}: the band has an area`);
    for (const [index, row] of rows.entries()) {
      const [y, height] = row;
      assert.ok(y + height <= band.bottom, `${scene.id}: row ${index} stays inside the band`);
    }
    for (const [index, column] of columns.entries()) {
      const [x, width] = column;
      assert.ok(x + width <= band.right, `${scene.id}: column ${index} stays inside the band`);
    }
    assert.ok(scene.floor > 0 && scene.floor < 1086, `${scene.id}: the floor is on the artwork`);
    assert.ok(scene.shelfFrame.left < scene.shelfFrame.right);
    assert.ok(CAMERA_ANCHOR.x > 0 && CAMERA_ANCHOR.x < 1448 && CAMERA_ANCHOR.y > 0 && CAMERA_ANCHOR.y < 1086);
  }
  // 除月夜书桌外，五个房间共用同一块唱片区。
  const shared = ROOM_SCENES.filter((scene) => scene.id !== 'night-study');
  for (const scene of shared) {
    assert.deepEqual(scene.band, DECK_BAND, scene.id);
    assert.equal(scene.shelfFrame.left, DECK_BAND.left);
    assert.equal(scene.shelfFrame.right, DECK_BAND.right);
  }
});

test('the shipped scene list cannot be edited by accident', () => {
  assert.ok(Object.isFrozen(ROOM_SCENES));
  for (const scene of ROOM_SCENES) {
    assert.ok(Object.isFrozen(scene), scene.id);
    assert.ok(Object.isFrozen(scene.geometry));
    assert.ok(Object.isFrozen(scene.geometry.columns[0]), scene.id);
    assert.ok(Object.isFrozen(scene.band), scene.id);
  }
});
