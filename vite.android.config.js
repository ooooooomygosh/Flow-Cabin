import { defineConfig } from 'vite';
import base from './vite.config.js';
import { fileURLToPath } from 'node:url';

// Bundle the app and all of its offline assets; no remote website is required to open it.
export default defineConfig({ ...base,
  build: { ...base.build, outDir: 'dist-android', rollupOptions: { ...base.build.rollupOptions, input: { main: fileURLToPath(new URL('./index.html', import.meta.url)) } } }
});
