import fs from 'node:fs/promises';
import path from 'node:path';

// Files the Android app never loads, removed from dist-android after the build.
// Each entry says why; scripts/android-assets.test.mjs checks the patterns still
// match real files and never match what Android does load.
export const ANDROID_EXCLUDES = Object.freeze([
  // The promo page is a web-only entry (vite.android.config.js builds index.html only).
  { pattern: 'promo/**', reason: 'promo.html is not part of the Android bundle' },
  // Android has no 显示与字体 weight picker: the bundled HarmonyOS face is used
  // only by the album-wall poster, which draws 400 and 700. The files stay
  // unmodified (licence); unused weights are simply not shipped.
  { pattern: 'fonts/HarmonyOS_Sans_SC_Thin.ttf', reason: 'weight 250 is desktop-only' },
  { pattern: 'fonts/HarmonyOS_Sans_SC_Light.ttf', reason: 'weight 300 is desktop-only' },
  { pattern: 'fonts/HarmonyOS_Sans_SC_Medium.ttf', reason: 'weight 500 is desktop-only' },
  { pattern: 'fonts/HarmonyOS_Sans_SC_Black.ttf', reason: 'weight 900 is desktop-only' },
  // Dock and menu-bar renders are macOS/Windows shell icons (desktop/tray-icons.cjs
  // reads its own copy under desktop/assets). Android widgets use avatar-256.png.
  { pattern: 'pet-art/v21/**/dock-*.png', reason: 'desktop dock icons' },
  { pattern: 'pet-art/v21/**/menu-*.png', reason: 'desktop menu-bar icons' }
]);

// '**' crosses folders, '*' stays inside one; everything else is literal.
export function globToRegExp(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { source += '(?:.*/)?'; i += 2; } else { source += '.*'; i += 1; }
    } else if (ch === '*') source += '[^/]*';
    else source += ch.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}
const matchers = ANDROID_EXCLUDES.map((entry) => globToRegExp(entry.pattern));
export const isAndroidExcluded = (relative) => matchers.some((regex) => regex.test(relative.split(path.sep).join('/')));

async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full, base));
    else files.push(path.relative(base, full));
  }
  return files;
}

// Vite plugin for vite.android.config.js.
export function androidAssets({ log = console.log } = {}) {
  let output;
  return {
    name: 'cabin-android-assets', apply: 'build',
    configResolved(config) { output = path.resolve(config.root, config.build.outDir); },
    async closeBundle() {
      let bytes = 0, count = 0;
      for (const file of await walk(output)) {
        if (!isAndroidExcluded(file)) continue;
        const full = path.join(output, file);
        bytes += (await fs.stat(full)).size; count++;
        await fs.rm(full, { force: true });
      }
      log(`Android bundle: left out ${count} desktop/web-only files (${(bytes / 1e6).toFixed(1)} MB).`);
    }
  };
}
