// Paper and the desk's other surfaces, made at runtime from maths (DEsk draws its paper
// the same way): a 128-px fibre tile and a film-grain tile become CSS variables. They are
// made when the browser is idle; until then CSS shows a flat cream gradient.
import { paperTile, grainTile } from './paper-noise.mjs';

const idle = (fn) => (globalThis.requestIdleCallback ? globalThis.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 60));

function toUrl(bytes, size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return Promise.resolve(null);
  ctx.putImageData(new ImageData(bytes, size, size), 0, 0);
  return new Promise((resolve) => { try { canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null)); } catch { resolve(null); } });
}

export function installPaper(root = globalThis.document?.documentElement) {
  if (!root || typeof document === 'undefined') return;
  idle(async () => {
    try {
      const fibre = await toUrl(paperTile(128), 128);
      if (fibre) root.style.setProperty('--paper-tile', `url(${fibre})`);
      idle(async () => {
        const grain = await toUrl(grainTile(96), 96);
        if (grain) root.style.setProperty('--paper-grain', `url(${grain})`);
      });
    } catch { /* flat paper is fine */ }
  });
}
