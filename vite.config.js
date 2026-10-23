import { artProduction } from './scripts/art-production.mjs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (file) => fileURLToPath(new URL(file, import.meta.url));
// Name shared chunks after what they hold. Without groups Rolldown names a shared chunk after its first
// module (React used to ship as "tokens-*.js"). Tone stays lazy: only lofi-engine imports it.
const chunkGroups = [
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
  { name: 'vendor-tone', test: /node_modules[\\/](tone|standardized-audio-context|automation-events|tslib|@babel[\\/]runtime)[\\/]/ }
];

export default defineConfig({
  plugins: [react(), artProduction()],
  optimizeDeps: { include: ['qrcode', 'jsqr', 'pixi.js', 'pixi.js/unsafe-eval', 'motion/react', '@applemusic-like-lyrics/react', '@applemusic-like-lyrics/lyric'] },
  server: { watch: { ignored: ['**/android/**/build/**', '**/android/.gradle/**', '**/android/app/src/main/assets/**', '**/dist-android/**', '**/.claude/**'] } },
  // Offline test copies can share dependencies, but must not share Vite's mutable cache.
  cacheDir: process.env.FLOW_CABIN_VITE_CACHE_DIR || undefined,
  build: { rollupOptions: {
    input: { main: entry('./index.html'), promo: entry('./promo.html'), wallpaper: entry('./wallpaper.html'), pet: entry('./pet.html'), mini: entry('./mini.html') },
    output: { advancedChunks: { groups: chunkGroups } }
  } }
});
