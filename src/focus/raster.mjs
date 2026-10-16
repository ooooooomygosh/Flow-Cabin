// A tiny software raster for the focus faces: whole art pixels in a Uint32
// buffer (0 = transparent), painted once per visible change and handed to a
// <canvas> as ImageData, which the page scales by an integer with
// image-rendering: pixelated. Pure, so faces render (and test) without a DOM.
import { glyph, layoutText } from './pixel-digits.mjs';

const colours = new Map();
// '#rgb' | '#rrggbb' → packed RGBA in ImageData byte order (little-endian).
export function colour(value) {
  if (typeof value === 'number') return value >>> 0;
  let c = colours.get(value);
  if (c !== undefined) return c;
  let hex = String(value || '').replace('#', '');
  if (hex.length === 3) hex = [...hex].map((d) => d + d).join('');
  const n = parseInt(hex.slice(0, 6), 16);
  c = Number.isFinite(n) && hex.length >= 6 ? ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0 : 0;
  colours.set(value, c);
  return c;
}
const channel = (c, shift) => (c >>> shift) & 255;
export const toHex = (c) => '#' + [0, 8, 16].map((s) => channel(c, s).toString(16).padStart(2, '0')).join('');
const mixes = new Map();
// A solid colour t of the way from a to b (cached): ramps, not alpha.
export function mix(a, b, t) {
  const ca = colour(a), cb = colour(b);
  if (t <= 0) return ca; if (t >= 1) return cb;
  const key = `${ca}:${cb}:${Math.round(t * 64)}`;
  let c = mixes.get(key);
  if (c === undefined) {
    const q = Math.round(t * 64) / 64, m = (s) => Math.round(channel(ca, s) + (channel(cb, s) - channel(ca, s)) * q);
    c = ((255 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)) >>> 0; mixes.set(key, c);
  }
  return c;
}

export function createRaster(w, h) { w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); return { w, h, data: new Uint32Array(w * h) }; }
export function px(r, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < r.w && y < r.h) r.data[y * r.w + x] = colour(c); }
export const get = (r, x, y) => x >= 0 && y >= 0 && x < r.w && y < r.h ? r.data[y * r.w + x] : 0;
export function fill(r, x, y, w, h, c) {
  const v = colour(c), x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(r.w, Math.round(x + w)), y1 = Math.min(r.h, Math.round(y + h));
  for (let j = y0; j < y1; j++) r.data.fill(v, j * r.w + x0, j * r.w + Math.max(x0, x1));
}
// 50% checker (Bayer 2×2): the only "transparency" a pixel face uses.
export function dither(r, x, y, w, h, c, phase = 0) {
  const v = colour(c);
  for (let j = Math.max(0, y); j < Math.min(r.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(r.w, x + w); i++) if (((i + j + phase) & 1) === 0) r.data[j * r.w + i] = v;
}
// Recolour every opaque pixel in a box through fn(colour) → colour.
export function recolour(r, x, y, w, h, fn) {
  for (let j = Math.max(0, y); j < Math.min(r.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(r.w, x + w); i++) { const k = j * r.w + i; if (r.data[k]) r.data[k] = fn(r.data[k]); }
}
// Filled ellipse/disc with the same rounding as the deck sprite.
export function disc(r, cx, cy, rx, ry, c, test = null) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x - cx) / (rx + .35)) ** 2 + ((y - cy) / (ry + .35)) ** 2;
    if (d <= 1 && (!test || test(x, y, d))) px(r, x, y, c);
  }
}
// A thick integer line (Bresenham, square brush).
export function line(r, x0, y0, x1, y1, c, width = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = Math.floor((width - 1) / 2);
  let err = dx + dy;
  for (;;) {
    fill(r, x0 - o, y0 - o, width, width, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// Copy src onto dst (opaque pixels only). `rows` squashes the [sy, sy+sh) band
// into that many rows by dropping rows (nearest neighbour): the flip leaf.
export function blit(dst, src, dx, dy, { sx = 0, sy = 0, sw = src.w, sh = src.h, rows = sh, map = null } = {}) {
  if (rows <= 0) return;
  for (let j = 0; j < rows; j++) {
    const y = Math.round(dy) + j, srcY = sy + Math.min(sh - 1, Math.floor(j * sh / rows));
    if (y < 0 || y >= dst.h) continue;
    for (let i = 0; i < sw; i++) {
      const x = Math.round(dx) + i, v = src.data[srcY * src.w + sx + i];
      if (v && x >= 0 && x < dst.w) dst.data[y * dst.w + x] = map ? map(v) : v;
    }
  }
}
// Draw a string with a pixel-digits font; returns its width.
export function text(r, value, f, x, y, c, { cell = 1, gap = cell, shadow = null, shadowOffset = [cell, cell] } = {}) {
  const layout = layoutText(value, f, { cell, gap });
  const draw = (ox, oy, col) => { for (const g of layout.glyphs) glyph(g.ch, f).forEach((row, gy) => { for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') fill(r, x + ox + g.x + gx * cell, y + oy + gy * cell, cell, cell, col); }); };
  if (shadow) draw(shadowOffset[0], shadowOffset[1], shadow);
  draw(0, 0, c);
  return layout.width;
}
export function toImageData(r, ImageDataClass = globalThis.ImageData) { return new ImageDataClass(new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.byteLength), r.w, r.h); }
