// 极简大字: only the number, in the scene's lamp colour, with one segmented
// progress line under it during a round. Session / Flow style.
import { BIG, SMALL, layoutText } from '../pixel-digits.mjs';
import { createRaster, fill, px, text, colour } from '../raster.mjs';
import { phaseGlow } from '../face-palette.mjs';

const CELL = 2, GAP = 3;
function measureModel(model) {
  const main = layoutText(model.groups.join(':'), BIG, { cell: CELL, gap: GAP }), small = model.small ? layoutText(model.small, SMALL, { cell: CELL }) : null;
  return { main, small, w: main.width + (small ? small.width + 4 : 0) + 2, h: main.height + 8 };
}
export const size = (model) => { const m = measureModel(model); return { w: m.w, h: m.h }; };
export function paint(model, pal) {
  const m = measureModel(model), r = createRaster(m.w, m.h), glow = phaseGlow(pal, model.phase), ink = model.paused ? glow[0] : glow[1];
  // lamp-lit numerals: lit top rows, a hard shadow one art pixel down-right
  text(r, model.groups.join(':'), BIG, 0, 0, ink, { cell: CELL, gap: GAP, shadow: pal.outline, shadowOffset: [1, 1] });
  const inkC = colour(ink);
  for (let x = 0; x < m.main.width; x++) for (let y = 0; y < 2; y++) if (r.data[y * r.w + x] === inkC) px(r, x, y, model.paused ? glow[1] : glow[2]);
  if (m.small) text(r, model.small, SMALL, m.main.width + 4, m.main.height - SMALL.h * CELL, glow[0], { cell: CELL, shadow: pal.outline, shadowOffset: [1, 1] });
  if (model.mode === 'timer' && model.progress !== null) {
    const y = m.main.height + 5, w = m.main.width, lit = Math.round((model.progress ?? 0) * w);
    for (let x = 0; x < w; x++) { if (x % 4 === 3) continue; fill(r, x, y, 1, 2, x < lit ? glow[1] : pal.night[3]); if (x < lit) px(r, x, y, glow[2]); }
  }
  return r;
}
export const face = { id: 'minimal', size, paint, steps: 80 };
