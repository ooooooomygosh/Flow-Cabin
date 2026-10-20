// Pixel covers in the cabin palette. Two paths:
//  1. existing artwork → centre crop → 32×32 → ordered-dither quantize to the
//     cabin ramp → nearest-neighbour upscale;
//  2. no artwork (or pixels we may not read) → a small scene generated from a
//     seed of title + artist, so the same album always gets the same cover.
// Grid maths is pure; only renderers touch a canvas.
import { loadWallCover } from '../album-wall-canvas.mjs';

// Mirror of src/styles/tokens.css. Live CSS values win when present.
export const PALETTE_TOKENS = [
  ['--px-shadow', '#0d0805'], ['--px-bg', '#1c120b'], ['--px-surface', '#2e1d12'], ['--px-surface-2', '#3a2416'],
  ['--px-surface-3', '#4d311c'], ['--px-border', '#8a5a32'], ['--px-border-hi', '#b07a46'], ['--px-accent-lo', '#a8743c'],
  ['--px-accent', '#e0ad69'], ['--px-accent-hi', '#ffd99c'], ['--px-ink', '#ffe9cb'], ['--px-ink-dim', '#c9a47a'],
  ['--px-night', '#22304a'], ['--px-accent-2', '#7fb8a8'], ['--px-good', '#9ccf8c'], ['--px-warn', '#e06a4e']
];
export const GRID = 32;
export const ARTWORK_GRID = 64;

export function hexToRgb(hex) {
  const value = String(hex || '').trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[\da-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
export function readPalette(style) {
  return PALETTE_TOKENS.map(([name, fallback]) => hexToRgb(style?.getPropertyValue?.(name)) || hexToRgb(fallback));
}

// Redmean distance: cheap and closer to perception than plain RGB.
export function nearestIndex(rgb, palette) {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i], mean = (rgb[0] + r) / 2, dr = rgb[0] - r, dg = rgb[1] - g, db = rgb[2] - b;
    const distance = (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
// RGBA pixels (size×size) → palette indices; light 4×4 Bayer dithering and a
// warm lift so cool photos still sit inside the cabin's lamplight.
export function quantize(pixels, size, palette, { dither = 18, warmth = 10 } = {}) {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, offset = (BAYER[y % 4][x % 4] / 16 - 0.5) * dither;
    out[y * size + x] = nearestIndex([pixels[i] + offset + warmth, pixels[i + 1] + offset + warmth * 0.4, pixels[i + 2] + offset - warmth * 0.6], palette);
  }
  return out;
}

// Small deterministic PRNG (mulberry32) seeded from a string hash (FNV-1a).
export function hashString(text) { let h = 0x811c9dc5; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export function seededRandom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const P = Object.fromEntries(PALETTE_TOKENS.map(([name], index) => [name.replace('--px-', ''), index]));
// Eight motifs, one per record (seeded): the cabin's own still lifes.
export const SCENES = ['window', 'hills', 'vinyl', 'cabin', 'rain', 'lamp', 'cassette', 'lake'];

// Procedural 32×32 cover: returns palette indices. Scenes share the same
// sky/ground language so a shelf of generated covers looks like one set.
export function proceduralGrid({ title = '', artist = '' } = {}) {
  const seed = hashString(`${title}\u0000${artist}`), rand = seededRandom(seed), n = GRID;
  const grid = new Uint8Array(n * n), set = (x, y, c) => { if (x >= 0 && y >= 0 && x < n && y < n) grid[y * n + x] = c; };
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };
  const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) set(cx + x, cy + y, c); };
  const scene = SCENES[seed % SCENES.length], dusk = rand() < 0.5;
  // Sky: banded dusk (ember→amber) or night (night→surface) with stars.
  const bands = dusk ? [P.night, P['surface-3'], P['accent-lo'], P.accent, P['accent-hi']] : [P.shadow, P.bg, P.night, P.night, P['surface-2']];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const t = y / n + ((x + y) % 2) * 0.02; grid[y * n + x] = bands[Math.min(bands.length - 1, Math.floor(t * bands.length))]; }
  if (!dusk) for (let i = 0; i < 14; i++) set(Math.floor(rand() * n), Math.floor(rand() * n * 0.55), rand() < 0.3 ? P['accent-hi'] : P.ink);
  const sunX = 6 + Math.floor(rand() * 20), sunY = 6 + Math.floor(rand() * 6);
  disc(sunX, sunY, dusk ? 4 : 3, dusk ? P['accent-hi'] : P.ink);
  if (!dusk) disc(sunX + 2, sunY - 1, 3, bands[Math.min(4, Math.floor((sunY / n) * 5))]); // crescent moon
  const hill = (base, amp, colour, phase) => { for (let x = 0; x < n; x++) { const h = Math.round(base + Math.sin(x / (3 + amp) + phase) * amp); for (let y = h; y < n; y++) set(x, y, colour); } };
  if (scene === 'hills' || scene === 'cabin') { hill(19, 2, P['accent-2'], rand() * 6); hill(23, 2, P.good, rand() * 6); hill(27, 1, P.surface, rand() * 6); }
  if (scene === 'cabin') {
    const cx = 9 + Math.floor(rand() * 12);
    rect(cx, 18, 10, 7, P.border); rect(cx, 18, 10, 1, P['border-hi']);
    for (let i = 0; i < 6; i++) rect(cx - 1 + i, 17 - i, 12 - i * 2, 1, P.warn); // roof
    rect(cx + 2, 20, 3, 3, P['accent-hi']); rect(cx + 6, 21, 2, 4, P.shadow); // lit window + door
    rect(cx + 7, 11, 2, 4, P['surface-3']);
  }
  if (scene === 'window') {
    rect(0, 0, n, 3, P.surface); rect(0, n - 7, n, 7, P.surface); rect(0, 0, 3, n, P.surface); rect(n - 3, 0, 3, n, P.surface);
    rect(15, 3, 2, n - 10, P['surface-3']); rect(3, 13, n - 6, 2, P['surface-3']);
    rect(0, n - 7, n, 1, P['border-hi']); rect(5, n - 10, 4, 3, P.good); rect(6, n - 12, 2, 2, P.good); rect(5, n - 7, 4, 2, P.warn); // plant pot
    rect(22, n - 9, 5, 2, P['accent-hi']); rect(23, n - 11, 3, 2, P.ink); // candle glow
  }
  if (scene === 'vinyl') {
    rect(0, 22, n, n - 22, P['surface-3']); rect(0, 22, n, 1, P['border-hi']);
    for (let y = 24; y < n; y += 3) rect(0, y, n, 1, P.surface);
    disc(16, 19, 9, P.shadow); disc(16, 19, 7, P.bg); disc(16, 19, 5, P.shadow);
    disc(16, 19, 3, [P.warn, P['accent-2'], P.accent, P.good][Math.floor(rand() * 4)]); set(16, 19, P.ink);
    set(12, 14, P['ink-dim']); set(11, 15, P['ink-dim']);
  }
  if (scene === 'rain') {
    // Night window streaked with rain; the room's lamp reflected in the glass, a mug on the sill.
    rect(0, 0, n, n, P.surface); rect(4, 3, 24, 20, P.bg); rect(4, 3, 24, 9, P.night);
    for (let i = 0; i < 9; i++) { const x = 5 + Math.floor(rand() * 22), y = 4 + Math.floor(rand() * 14), len = 2 + Math.floor(rand() * 3); for (let k = 0; k < len; k++) set(x - Math.floor(k / 2), y + k, k ? P['accent-2'] : P.ink); }
    rect(15, 3, 2, 20, P['surface-3']); rect(4, 12, 24, 2, P['surface-3']); rect(4, 3, 24, 1, P['border-hi']); rect(3, 3, 1, 20, P['border-hi']);
    rect(20, 15, 3, 3, P['accent-lo']); rect(21, 16, 1, 1, P['accent-hi']);
    rect(2, 23, 28, 2, P.border); rect(2, 23, 28, 1, P['border-hi']); rect(2, 25, 28, 1, P.shadow);
    rect(7, 19, 4, 4, P.ink); rect(7, 19, 4, 1, P['ink-dim']); rect(11, 20, 1, 2, P.ink); set(8, 17, P['ink-dim']); set(9, 16, P['ink-dim']);
    for (let x = 4; x < 28; x += 3) set(x + Math.floor(rand() * 2), 22, P['accent-2']);
    rect(0, 26, n, n - 26, P['surface-2']);
  }
  if (scene === 'lamp') {
    // Desk lamp at night: an angled brass arm, the shade's light falling in hard bands
    // (no blur) onto the desk, where a book stack and a cup sit in the pool.
    rect(0, 0, n, n, P.bg);
    const sx = 13 + Math.floor(rand() * 3), sy = 7, pool = sx + 3;
    for (const [grow, colour] of [[10, P.surface], [7, P['surface-2']], [4, P['surface-3']]]) for (let y = sy + 3; y < 22; y++) { const half = 1 + Math.floor((y - sy - 3) * grow / 12); rect(pool - half, y, half * 2 + 1, 1, colour); }
    rect(0, 22, n, 10, P.border); rect(0, 22, n, 1, P['border-hi']); rect(pool - 7, 22, 15, 1, P['accent-hi']); rect(pool - 5, 23, 11, 1, P['accent-lo']);
    for (let x = 2; x < n; x += 10) rect(x, 27, 6, 1, P.surface);
    rect(3, 20, 6, 2, P['accent-lo']); rect(3, 20, 6, 1, P.accent);
    for (let i = 0; i <= 10; i++) { const x = 5 + Math.round(i * (sx - 6) / 10), y = 19 - i; set(x, y, P.accent); set(x + 1, y, P['accent-lo']); }
    set(sx - 1, 9, P['accent-hi']);
    rect(sx, sy, 7, 3, P['accent-lo']); rect(sx + 1, sy - 1, 5, 1, P.accent); rect(sx, sy, 7, 1, P.accent); rect(sx + 1, sy + 3, 5, 1, P['accent-hi']);
    const bx = pool - 1 + Math.floor(rand() * 3);
    rect(bx, 19, 10, 3, P.warn); rect(bx + 1, 17, 8, 2, P['accent-2']); rect(bx, 15, 7, 2, P.good); rect(bx, 19, 10, 1, P['accent-hi']); rect(bx + 1, 17, 8, 1, P.ink); rect(bx, 15, 7, 1, P['ink-dim']);
    rect(bx - 5, 18, 3, 4, P.ink); rect(bx - 5, 18, 3, 1, P['ink-dim']); set(bx - 2, 19, P.ink); set(bx - 4, 16, P['ink-dim']);
  }
  if (scene === 'cassette') {
    // A cassette on a printed colour field: shell, label strip, two reels and the tape window.
    const field = [P['accent-2'], P.warn, P.good, P.accent][Math.floor(rand() * 4)];
    rect(0, 0, n, n, field); for (let y = 2; y < n; y += 4) rect(0, y, n, 1, field === P.accent ? P['accent-lo'] : P.surface);
    rect(4, 8, 24, 16, P.shadow); rect(5, 9, 22, 14, P['surface-2']); rect(5, 9, 22, 1, P['surface-3']);
    rect(7, 11, 18, 7, P.ink); rect(7, 11, 18, 2, field); rect(8, 14, 10, 1, P['ink-dim']);
    rect(11, 15, 10, 3, P.bg); for (const cx of [13, 19]) { rect(cx - 1, 15, 3, 3, P['ink-dim']); set(cx, 16, P.shadow); }
    rect(9, 20, 14, 3, P.surface); rect(10, 21, 1, 1, P['border-hi']); rect(21, 21, 1, 1, P['border-hi']);
    for (const [x, y] of [[6, 10], [25, 10], [6, 21], [25, 21]]) set(x, y, P['border-hi']);
  }
  if (scene === 'lake') {
    // Still lake: far shore of pines, the moon or sun laid on the water in broken stripes.
    const shore = 17;
    for (let x = 0; x < n; x++) { const h = 2 + ((x * 7 + Math.floor(rand() * 3)) % 5); for (let y = shore - h; y < shore; y++) set(x, y, P.shadow); }
    rect(0, shore, n, n - shore, dusk ? P['accent-2'] : P.night);
    for (let y = shore + 2; y < n; y += 2) for (let x = Math.floor(rand() * 4); x < n; x += 5 + Math.floor(rand() * 4)) rect(x, y, 2, 1, dusk ? P.night : P.bg);
    for (let y = shore + 1, w = 5; y < n - 2; y += 2, w = Math.max(1, w - 1)) rect(sunX - Math.floor(w / 2), y, w, 1, dusk ? P['accent-hi'] : P['ink-dim']);
  }
  // 1px frame like a printed sleeve edge.
  for (let i = 0; i < n; i++) { set(i, 0, P.shadow); set(i, n - 1, P.shadow); set(0, i, P.shadow); set(n - 1, i, P.shadow); }
  return { grid, scene, dusk };
}

// Palette indices → RGBA pixels at `scale`× (nearest neighbour).
export function gridToRgba(grid, size, palette, scale = 1) {
  const out = new Uint8ClampedArray(size * scale * size * scale * 4), width = size * scale;
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = palette[grid[Math.floor(y / scale) * size + Math.floor(x / scale)]], i = (y * width + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
}

// ---------- browser renderers ----------
const OUT = 256;
function paletteFromDocument() { try { return readPalette(getComputedStyle(document.documentElement)); } catch { return readPalette(null); } }
function gridToDataUrl(grid, palette, size = GRID) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = OUT;
  const context = canvas.getContext('2d');
  context.putImageData(new ImageData(gridToRgba(grid, size, palette, OUT / size), OUT, OUT), 0, 0);
  return canvas.toDataURL('image/png');
}
// The sleeve's own colour for a record's label (deck, mini player): the most used
// bright ink of the generated scene, so a coverless record still has a matching label.
const TONE_INKS = new Set([P.accent, P['accent-hi'], P['accent-2'], P.good, P.warn, P['ink-dim'], P['border-hi']]);
export function sleeveTone(item) {
  const counts = new Map();
  for (const index of proceduralGrid(item).grid) if (TONE_INKS.has(index)) counts.set(index, (counts.get(index) || 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? P.accent;
  return PALETTE_TOKENS[best][1];
}
export function generatedCover(item) { return gridToDataUrl(proceduralGrid(item).grid, paletteFromDocument()); }

// createImageBitmap rejects SVG; inline / same-origin art can still be drawn
// through an <img> without tainting the canvas.
function loadElement(src) {
  let local = false; try { const url = new URL(src, location.href); local = ['data:', 'blob:'].includes(url.protocol) || url.origin === location.origin; } catch {}
  if (!local) return null;
  return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth ? Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight }) : null); image.onerror = () => resolve(null); image.src = src; });
}
// Returns { cover, method: 'pixelated' | 'generated', reason? }. Cross-origin
// artwork without CORS cannot be read back; we say so instead of faking it.
export async function pixelCover(item, { source = item?.cover } = {}) {
  const palette = paletteFromDocument();
  if (!source) return { cover: gridToDataUrl(proceduralGrid(item).grid, palette), method: 'generated', reason: '没有原封面，按专辑名生成。' };
  try {
    // Same path as the album wall: local/inline art directly, catalog art via
    // the desktop image proxy, so its pixels may be read back.
    const image = await loadWallCover(source) || await loadElement(source), side = Math.min(image?.width || 0, image?.height || 0);
    if (!side) throw new Error('原封面暂时无法读取。');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = ARTWORK_GRID;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, ARTWORK_GRID, ARTWORK_GRID);
    const grid = quantize(context.getImageData(0, 0, ARTWORK_GRID, ARTWORK_GRID).data, ARTWORK_GRID, palette);
    return { cover: gridToDataUrl(grid, palette, ARTWORK_GRID), method: 'pixelated' };
  } catch (error) {
    const reason = error?.name === 'SecurityError' ? '原封面来自不允许读取像素的网站，改为按专辑名生成。' : `${error?.message || '原封面读取失败。'} 已按专辑名生成。`;
    return { cover: gridToDataUrl(proceduralGrid(item).grid, palette), method: 'generated', reason };
  }
}
