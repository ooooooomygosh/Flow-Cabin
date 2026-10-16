const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanSnapshot, CATALOG_IDS } = require('../wallpaper-model.cjs');
const { PET_IDS } = require('../tray-icons.cjs');

// Main keeps literal copies of renderer ids (desktop/package.json ships no ../src). Drift used to be
// silent — the wallpaper dropped the appleMusic provider — so every copy is compared here.
test('main-process id lists match the renderer catalogs', async () => {
  const { ROOM_SCENE_IDS } = await import('../../src/scene-catalog.mjs');
  const { PETS } = await import('../../src/pet/pet-catalog.mjs');
  const { WEATHERS } = await import('../../src/room-ambience.mjs');
  const { ACCESSORIES } = await import('../../src/pet/cat-sprites.mjs');
  const { PHASES } = await import('../../src/focus/focus-model.mjs');
  const { DECK_PROVIDERS } = await import('../../src/player/providers.mjs');
  assert.deepEqual([...CATALOG_IDS.looks].sort(), [...ROOM_SCENE_IDS].sort());
  assert.deepEqual(CATALOG_IDS.pets, PETS.map((pet) => pet.id)); assert.deepEqual(PET_IDS, PETS.map((pet) => pet.id));
  assert.deepEqual(CATALOG_IDS.weathers, [...WEATHERS]);
  assert.deepEqual(CATALOG_IDS.accessories, [...ACCESSORIES]);
  assert.deepEqual(CATALOG_IDS.phases, [...PHASES]);
  assert.deepEqual(CATALOG_IDS.providers, [...DECK_PROVIDERS]);
});

test('the wallpaper keeps every deck provider, including Apple Music', () => {
  for (const provider of CATALOG_IDS.providers) assert.equal(cleanSnapshot({ look: 'pixel', provider }).provider, provider);
  assert.equal(cleanSnapshot({ look: 'pixel', provider: 'spotify' }).provider, 'visual');
});
