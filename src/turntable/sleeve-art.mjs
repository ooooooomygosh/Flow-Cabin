// Generated sleeves for records without artwork, in the cabin's pixel set
// (player/pixel-cover.mjs scenes), with a printed edge band so a coverless
// record still looks like a pressed sleeve. One small canvas per record,
// cached; DOM images get a data URL of the same pixels.
import { GRID, gridToRgba, proceduralGrid, readPalette } from '../player/pixel-cover.mjs';

const canvases = new Map(), urls = new Map();
const keyOf = (item) => `${item?.id || ''}\u0000${item?.title || ''}\u0000${item?.artist || ''}`;
function palette() { try { return readPalette(getComputedStyle(document.documentElement)); } catch { return readPalette(null); } }
// 32 × 32 art pixels; the 2 px band along the spine edge is the printed sleeve edge.
export function sleeveCanvas(item) {
  const key = keyOf(item); if (canvases.has(key)) return canvases.get(key);
  if (typeof document === 'undefined') return null;
  const colours = palette(), { grid } = proceduralGrid(item || {}), canvas = Object.assign(document.createElement('canvas'), { width: GRID, height: GRID });
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(gridToRgba(grid, GRID, colours), GRID, GRID), 0, 0);
  const lo = colours[7], hi = colours[9]; // accent-lo / accent-hi
  ctx.fillStyle = `rgb(${lo})`; ctx.fillRect(1, 1, 2, GRID - 2);
  ctx.fillStyle = `rgb(${hi})`; ctx.fillRect(1, 1, 1, GRID - 2);
  if (canvases.size > 200) canvases.delete(canvases.keys().next().value);
  canvases.set(key, canvas); return canvas;
}
export function sleeveUrl(item) {
  const key = keyOf(item); if (urls.has(key)) return urls.get(key);
  const canvas = sleeveCanvas(item); if (!canvas) return '';
  const url = canvas.toDataURL('image/png');
  if (urls.size > 200) urls.delete(urls.keys().next().value);
  urls.set(key, url); return url;
}
