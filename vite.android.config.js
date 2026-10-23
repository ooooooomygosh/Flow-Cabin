import { defineConfig } from 'vite';
import base from './vite.config.js';
import { fileURLToPath } from 'node:url';
import { androidAssets } from './scripts/android-assets.mjs';

// Bundle the app and all of its offline assets; no remote website is required to open it.
// Files only the desktop or the web page use (promo, extra font weights, dock icons)
// are left out: see scripts/android-assets.mjs.
export default defineConfig({ ...base,
  plugins: [...base.plugins, androidAssets()],
  build: { ...base.build, outDir: 'dist-android', rollupOptions: { ...base.build.rollupOptions, input: { main: fileURLToPath(new URL('./index.html', import.meta.url)) } } }
});
