import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Offline test copies can share dependencies, but must not share Vite's mutable cache.
  cacheDir: process.env.FLOW_CABIN_VITE_CACHE_DIR || undefined,
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), wallpaper: fileURLToPath(new URL('./wallpaper.html', import.meta.url)), pet: fileURLToPath(new URL('./pet.html', import.meta.url)), mini: fileURLToPath(new URL('./mini.html', import.meta.url)) } } }
});
