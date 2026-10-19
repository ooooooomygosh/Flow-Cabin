// Regenerate the promo click sprite from the same 32x32 pixel source as the app.
// Run: node scripts/export-cat-click-sprite.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catFrame, CLICK_FRAMES, CAT_PALETTES, SIZE } from '../src/pet/cat-sprites.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('../desktop/node_modules/pngjs');
const scale = 2;
const sheet = new PNG({ width: SIZE * CLICK_FRAMES * scale, height: SIZE * scale });
const palette = CAT_PALETTES.orange;

for (let frame = 0; frame < CLICK_FRAMES; frame++) {
  const pixels = catFrame('click', frame);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const hex = palette[pixels[y][x]];
      const rgb = hex ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255] : [0, 0, 0, 0];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (frame * SIZE + x) * scale + dx;
          const py = y * scale + dy;
          const offset = (py * sheet.width + px) * 4;
          sheet.data[offset] = rgb[0];
          sheet.data[offset + 1] = rgb[1];
          sheet.data[offset + 2] = rgb[2];
          sheet.data[offset + 3] = rgb[3];
        }
      }
    }
  }
}

const output = fileURLToPath(new URL('../public/cat/cat-click.png', import.meta.url));
mkdirSync(fileURLToPath(new URL('../public/cat', import.meta.url)), { recursive: true });
writeFileSync(output, PNG.sync.write(sheet));
console.log(`wrote ${output}`);
