const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const catalog = import('../../src/scene-catalog.mjs');

test('eight stable scene IDs preserve legacy looks and normalize invalid settings', async () => {
  const { ROOM_SCENES, ROOM_SCENE_IDS, getRoomScene, normalizeRoomSceneId } = await catalog;
  assert.deepEqual(ROOM_SCENE_IDS, ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']);
  assert.equal(new Set(ROOM_SCENES.map((scene) => scene.art)).size, 8);
  for (const scene of ROOM_SCENES) {
    assert.equal(getRoomScene(scene.id), scene);
    assert.equal(normalizeRoomSceneId(scene.id), scene.id);
    assert.ok(scene.label && scene.description && scene.alt);
    assert.match(scene.style.accent, /^#[a-f\d]{6}$/i);
    assert.match(scene.style.background, /^#[a-f\d]{6}$/i);
  }
  assert.deepEqual(ROOM_SCENES.map((scene) => [scene.label, scene.labelEn]), [['像素小屋', 'Pixel Cabin'], ['琥珀小屋', 'Amber Cabin'], ['月夜书桌', 'Moonlit Study'], ['林间书屋', 'Forest Glade'], ['海边慢屋', 'Seaside'], ['星夜阁楼', 'Starry Night'], ['雨夜列车书房', 'Rainy Night Train'], ['屋顶温室', 'Rooftop Greenhouse']]);
  for (const invalid of [undefined, null, '', 'constructor', '__proto__', 'invalid', 1, {}, []]) {
    assert.equal(normalizeRoomSceneId(invalid), 'pixel');
    assert.equal(getRoomScene(invalid).id, 'pixel');
  }
});

test('all assets exist and original SVG scenes are self-contained accessible illustrations', async () => {
  const { ROOM_SCENES } = await catalog;
  for (const scene of ROOM_SCENES) {
    const file = path.join(__dirname, '../../public', scene.art);
    assert.ok((await stat(file)).size > 1000);
    if (!scene.art.endsWith('.svg')) continue;
    const source = await readFile(file, 'utf8');
    assert.match(source, /viewBox="0 0 1448 1086"/);
    assert.match(source, /<title id="title">.+<\/title>/);
    assert.match(source, /<desc id="desc">.+<\/desc>/);
    assert.doesNotMatch(source, /<(?:script|foreignObject|image)\b|(?:href|src)=["'](?:https?:|data:|\/\/)/i);
    // Every interactive position corresponds to a real, unobstructed illustrated cubby.
    for (const [x, width] of scene.geometry.columns) for (const [y, height] of scene.geometry.rows) {
      assert.ok(source.includes(`<rect x="${x}" y="${y}" width="${width}" height="${height}"`));
    }
  }
});

test('scene geometries fit nine or twelve covers and preserve existing calibrated shelf bounds', async () => {
  const { ROOM_SCENES, getRoomScene } = await catalog;
  // Calibrated against the painted cabinets; the catalog is now the only copy.
  assert.deepEqual(getRoomScene('warm').geometry, { columns: [[437, 156], [604, 162], [776, 164], [949, 163]], rows: [[200, 155], [371, 154], [536, 158]] });
  assert.deepEqual(getRoomScene('pixel').geometry, { columns: [[445, 150], [606, 160], [776, 161], [946, 160]], rows: [[208, 150], [374, 152], [542, 159]] });
  for (const scene of ROOM_SCENES) {
    const { columns, rows } = scene.geometry;
    assert.equal(columns.length * rows.length, scene.id === 'night-study' ? 9 : 12);
    for (const [pairs, boundary] of [[columns, 1448], [rows, 1086]]) {
      pairs.forEach(([start, extent], index) => {
        assert.ok(start >= 0 && extent > 0 && start + extent <= boundary);
        if (index) assert.ok(pairs[index - 1][0] + pairs[index - 1][1] <= start);
      });
    }
    assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.geometry.columns[0]));
  }
});
