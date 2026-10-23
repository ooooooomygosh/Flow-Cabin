import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANDROID_EXCLUDES, globToRegExp, isAndroidExcluded } from './android-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.relative(publicDir, path.join(dir, entry.name)).split(path.sep).join('/')]);
const files = walk(publicDir);

test('globs: ** crosses folders, * stays in one', () => {
  assert.ok(globToRegExp('pet-art/v21/**/dock-*.png').test('pet-art/v21/cat/dock-512.png'));
  assert.ok(globToRegExp('pet-art/v21/**/dock-*.png').test('pet-art/v21/cat/equipped/bow/dock-1024.png'));
  assert.ok(!globToRegExp('pet-art/v21/**/dock-*.png').test('pet-art/v21/cat/avatar-256.png'));
  assert.ok(globToRegExp('promo/**').test('promo/a/b.png'));
  assert.ok(!globToRegExp('promo/**').test('promotion.png'));
  assert.ok(!globToRegExp('fonts/HarmonyOS_Sans_SC_Thin.ttf').test('fonts/HarmonyOS_Sans_SC_Thin.ttfx'));
});

test('every exclusion still matches files that exist, so the list cannot rot', () => {
  for (const entry of ANDROID_EXCLUDES) {
    const regex = globToRegExp(entry.pattern);
    assert.ok(files.some((file) => regex.test(file)), `${entry.pattern} matches nothing in public/`);
    assert.ok(entry.reason, entry.pattern);
  }
});

test('nothing Android loads is left out', () => {
  // The album-wall poster draws the bundled face at 400 and 700; widgets read avatar-256.png
  // (CabinWidgets.java); the cabin home draws the v21 rooms, furniture, corners and pet atlases.
  const kept = ['fonts/HarmonyOS_Sans_SC_Regular.ttf', 'fonts/HarmonyOS_Sans_SC_Bold.ttf', 'fonts/LICENSE.txt', 'pet-art/v21/cat/avatar-256.png', 'pet-art/v21/cat/equipped/bow/avatar-256.png', 'pet-art/v21/cat/atlas.png', 'pet-art/v21/cat/manifest.json', 'pet-art/v2/cat/atlas.png', 'room-scenes/v21/pixel/corners/music.webp', 'room-scenes/v21/furniture/pixel/atlas.webp', 'icons/icon-192.png'];
  for (const file of kept) {
    if (!files.includes(file)) continue;
    assert.equal(isAndroidExcluded(file), false, file);
  }
  const used = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
  for (const file of files.filter(isAndroidExcluded).filter((name) => name.startsWith('fonts/'))) assert.ok(used.includes(`/${file}`), `${file} is declared in tokens.css, so a missing file only falls back`);
  const android = fs.readFileSync(path.join(root, 'android/app/src/main/java/cn/flowcabin/app/CabinWidgets.java'), 'utf8');
  assert.ok(!/dock-|menu-/.test(android), 'Android widgets do not read the desktop icon renders');
});
