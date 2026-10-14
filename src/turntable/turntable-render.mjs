// Pixel renderer for the close-up turntable: a 240×150 canvas scaled up with
// nearest-neighbour sampling, so every element lands on the room's pixel grid.
// Static layers (plinth, sheen) are painted once; the record texture is
// painted when the record changes and rotated per frame without smoothing,
// which gives the slightly shimmering look of real low-resolution pixel art.
import { GEOMETRY, stylusPoint } from './turntable-physics.mjs';

export const PALETTE = Object.freeze({
  shadow: '#0d0805', walnut: '#4a2a16', walnutLight: '#6b3f22', walnutDark: '#2f1a0d', walnutGrain: '#3c2213',
  deck: '#231711', deckLight: '#33231a', alloy: '#b0aea0', alloyDark: '#77746a', alloyLight: '#e4dfcc',
  mat: '#1f1612', brass: '#d4a46b', brassLight: '#ffd99c', led: '#ffbb55', ledOff: '#57352a', paper: '#f1e3c2'
});
const hex = (value) => { const n = parseInt(String(value || '').replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return Number.isFinite(n) ? [n >> 16, (n >> 8) & 255, n & 255] : [22, 17, 14]; };
const mix = ([r, g, b], k) => [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const lift = ([r, g, b], amount) => [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount))));
const css = ([r, g, b], a = 1) => a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (text) => { let h = 0x811c9dc5; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const canvasOf = (width, height, create) => { const canvas = create ? create(width, height) : Object.assign(document.createElement('canvas'), { width, height }); canvas.width = width; canvas.height = height; return canvas; };
const px = (ctx, x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
function disc(ctx, cx, cy, r, fill) { ctx.fillStyle = fill; for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) { const half = Math.sqrt(Math.max(0, r * r - (y + .5 - cy) ** 2)); if (half > 0) ctx.fillRect(Math.round(cx - half), y, Math.round(cx + half) - Math.round(cx - half), 1); } }
function ring(ctx, cx, cy, r, fill, step = 1) { ctx.fillStyle = fill; const n = Math.ceil(r * 7); for (let i = 0; i < n; i += step) { const t = i / n * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(t) * r - .5), Math.round(cy + Math.sin(t) * r - .5), 1, 1); } }

// Plinth, platter, controls: everything that never moves.
export function paintDeck(create, { led = false } = {}) {
  const { width, height, center: [cx, cy], platterRadius } = GEOMETRY;
  const canvas = canvasOf(width, height, create), ctx = canvas.getContext('2d'), random = seeded(7);
  // Soft drop shadow on the desk, then the walnut plinth with chamfered corners.
  px(ctx, 10, 12, width - 16, height - 16, 'rgba(13,8,5,.45)');
  px(ctx, 6, 5, width - 12, height - 12, PALETTE.shadow);
  px(ctx, 8, 6, width - 16, height - 15, PALETTE.walnut);
  for (let y = 8; y < height - 10; y += 1) if (random() < .55) px(ctx, 8 + Math.floor(random() * 40), y, 20 + Math.floor(random() * 160), 1, random() < .5 ? PALETTE.walnutGrain : PALETTE.walnutLight);
  px(ctx, 8, 6, width - 16, 2, PALETTE.walnutLight); px(ctx, 8, 6, 2, height - 15, PALETTE.walnutLight);
  px(ctx, 8, height - 11, width - 16, 2, PALETTE.walnutDark); px(ctx, width - 10, 6, 2, height - 15, PALETTE.walnutDark);
  for (const [x, y] of [[6, 5], [width - 7, 5], [6, height - 8], [width - 7, height - 8]]) px(ctx, x, y, 1, 1, 'rgba(0,0,0,0)');
  // Inset top deck plate.
  px(ctx, 14, 12, width - 28, height - 27, PALETTE.shadow); px(ctx, 15, 13, width - 30, height - 29, PALETTE.deck);
  px(ctx, 15, 13, width - 30, 1, PALETTE.deckLight); px(ctx, 15, 13, 1, height - 29, PALETTE.deckLight);
  // Recessed corner screws and a brushed-metal top edge, cached with the deck.
  for (const [x, y] of [[18, 16], [width - 19, 16], [18, height - 18], [width - 19, height - 18]]) {
    disc(ctx, x, y, 1.6, PALETTE.shadow); px(ctx, x - 1, y - 1, 2, 1, PALETTE.alloyDark); px(ctx, x, y - 1, 1, 1, PALETTE.alloyLight);
  }
  // Platter: alloy rim with strobe dots, rubber mat, a darker bearing ring.
  disc(ctx, cx + 1, cy + 2, platterRadius + 2, 'rgba(0,0,0,.55)');
  disc(ctx, cx, cy, platterRadius + 1, PALETTE.shadow);
  disc(ctx, cx, cy, platterRadius, PALETTE.alloyDark);
  disc(ctx, cx - .5, cy - .5, platterRadius - 1, PALETTE.alloy);
  disc(ctx, cx, cy, platterRadius - 3, PALETTE.alloyDark);
  disc(ctx, cx, cy, platterRadius - 4, PALETTE.mat);
  for (let r = 10; r < platterRadius - 6; r += 6) ring(ctx, cx, cy, r, '#2a1e18', 3);
  // Spindle.
  disc(ctx, cx, cy, 2.2, PALETTE.alloyDark); px(ctx, cx - 1, cy - 1, 1, 1, PALETTE.alloyLight);
  // Tonearm base, arm rest, cue lever.
  const [pxv, pyv] = GEOMETRY.pivot;
  disc(ctx, pxv + 1, pyv + 2, 13, 'rgba(0,0,0,.5)'); disc(ctx, pxv, pyv, 12, PALETTE.shadow); disc(ctx, pxv, pyv, 11, PALETTE.alloyDark); disc(ctx, pxv - .5, pyv - .5, 9, PALETTE.alloy); disc(ctx, pxv, pyv, 5, PALETTE.alloyDark);
  px(ctx, 182, 128, 9, 4, PALETTE.shadow); px(ctx, 183, 128, 7, 2, PALETTE.alloyDark); px(ctx, 183, 128, 7, 1, PALETTE.alloy); // arm rest
  px(ctx, 214, 52, 6, 14, PALETTE.shadow); px(ctx, 215, 53, 4, 12, PALETTE.alloyDark); px(ctx, 215, 53, 1, 12, PALETTE.alloy); // cue lever slot
  // Speed buttons 33 / 45 and start/stop, brass nameplate, power LED.
  px(ctx, 22, 127, 46, 10, PALETTE.shadow);
  px(ctx, 152, 112, 26, 10, PALETTE.shadow); px(ctx, 153, 113, 24, 8, PALETTE.brass); px(ctx, 153, 113, 24, 1, PALETTE.brassLight); text(ctx, 'FLOW', 158, 114, '#4a2a16');
  px(ctx, 200, 112, 16, 16, PALETTE.shadow); disc(ctx, 207.5, 119.5, 7, PALETTE.alloyDark); disc(ctx, 207, 119, 6, PALETTE.alloy); disc(ctx, 207.5, 119.5, 3, PALETTE.alloyDark); // pitch knob
  px(ctx, 26, 20, 3, 2, led ? PALETTE.led : PALETTE.ledOff);
  return canvas;
}
// Speed button states are tiny and change with interaction; drawn per frame.
const GLYPHS = { 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], F: ['111', '100', '110', '100', '100'], L: ['100', '100', '100', '100', '111'], O: ['111', '101', '101', '101', '111'], W: ['101', '101', '101', '111', '101'] };
function text(ctx, value, x, y, fill) { ctx.fillStyle = fill; [...String(value)].forEach((char, index) => (GLYPHS[char] || []).forEach((row, gy) => [...row].forEach((bit, gx) => { if (bit === '1') ctx.fillRect(x + index * 4 + gx, y + gy, 1, 1); }))); }
// Speed button states are tiny and change with interaction; drawn per frame.
export function drawControls(ctx, { speed = 33, motor = false }) {
  for (const [value, x] of [[33, 24], [45, 46]]) {
    const on = speed === value;
    px(ctx, x, 129, 20, 7, on ? PALETTE.brass : '#4a3a30'); px(ctx, x, 129, 20, 1, on ? PALETTE.brassLight : '#5a4a40'); px(ctx, x, 135, 20, 1, on ? '#a8743c' : '#2e2420');
    text(ctx, value, x + 7, 130, on ? '#2e1d12' : '#a88a68');
  }
  px(ctx, 26, 20, 3, 2, motor ? PALETTE.led : PALETTE.ledOff);
  if (motor) px(ctx, 25, 19, 5, 1, 'rgba(255,187,85,.35)');
}

// The record in its own coordinates: grooves, gaps between songs, lead-in,
// lead-out, the cover-printed label and a few specks of dust.
export function paintRecord(create, { base = '#16110e', opacity = 100, splashes = [], splatter = false, label = null, labelColour = '#c9a47a', gaps = [], seed = '' } = {}) {
  const { recordRadius: R, labelRadius: L, outerGroove: outer, innerGroove: inner } = GEOMETRY;
  const size = R * 2 + 2, c = size / 2, canvas = canvasOf(size, size, create), ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size), data = image.data, random = seeded(hash(seed) || 1);
  const colour = hex(base), translucent = Math.max(.55, Math.min(1, opacity / 100));
  const dark = (colour[0] + colour[1] + colour[2]) / 3 < 70;
  const ringNoise = Array.from({ length: R + 2 }, () => random());
  const gapRadii = gaps.map((gap) => outer - gap * (outer - inner));
  const blobs = splatter ? Array.from({ length: 9 }, () => ({ x: (random() - .5) * R * 1.4, y: (random() - .5) * R * 1.4, r: 4 + random() * 9, c: hex(splashes[Math.floor(random() * splashes.length)] || '#e8bc74') })) : [];
  const paper = hex(labelColour);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + .5 - c, dy = y + .5 - c, r = Math.hypot(dx, dy), i = (y * size + x) * 4;
    if (r > R) continue;
    let rgb, alpha = 255;
    if (r <= 1.6) { rgb = hex('#0d0805'); alpha = 0; }
    else if (r <= L) {
      if (r > L - 1) rgb = mix(paper, .55);
      else rgb = r < L * .35 ? lift(paper, .2) : paper;
      if (r < 3.2) rgb = mix(rgb, .75);
    } else {
      let k;
      if (r > R - 1.1) k = 1.45;                                   // rolled edge catches the light
      else if (r > outer + 1) k = 1.08 + ringNoise[Math.floor(r)] * .05; // lead-in: smooth
      else if (r < inner - 1) k = 1.12;                            // lead-out: glossy, no grooves
      else k = (Math.floor(r * 2) % 2 ? .9 : 1.02) + (ringNoise[Math.floor(r)] - .5) * .1;
      if (gapRadii.some((g) => Math.abs(r - g) < .55)) k = 1.2;    // the quiet band between songs
      let paint = colour;
      for (const blob of blobs) if ((dx - blob.x) ** 2 + (dy - blob.y) ** 2 < blob.r * blob.r) paint = blob.c;
      rgb = dark ? lift(mix(paint, k), (k - 1) * .25) : mix(paint, k);
      if (random() < .0025 && r > inner && r < outer) rgb = lift(rgb, .35); // dust
      alpha = Math.round(255 * translucent);
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  // The cover is printed on the label. Drawn (not read back), so artwork from
  // other origins works; the low-res canvas turns it into pixels on its own.
  if (label) {
    try {
      ctx.save(); ctx.beginPath(); ctx.arc(c, c, L - 1, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.drawImage(label, c - L + 1, c - L + 1, L * 2 - 2, L * 2 - 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(13,8,5,.28)'; ctx.beginPath(); ctx.arc(c, c, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.clearRect(c - 1, c - 1, 2, 2);
    } catch { ctx.restore?.(); }
  }
  return canvas;
}
// Lamp reflections stay put while the record turns under them.
export function paintSheen(create) {
  const { recordRadius: R, labelRadius: L } = GEOMETRY, size = R * 2 + 2, c = size / 2;
  const canvas = canvasOf(size, size, create), ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size), data = image.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + .5 - c, dy = y + .5 - c, r = Math.hypot(dx, dy); if (r > R - 1 || r < L + 1) continue;
    const a = Math.atan2(dy, dx), main = Math.cos(a + 2.35), back = Math.cos(a - .79);
    const strength = Math.max(0, main - .82) * 3.6 + Math.max(0, back - .9) * 2.2;
    if (strength <= 0) continue;
    const band = Math.floor(r) % 3 === 0 ? 1 : .55, i = (y * size + x) * 4;
    data[i] = 255; data[i + 1] = 236; data[i + 2] = 200; data[i + 3] = Math.round(Math.min(.55, strength * band) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Integer Bresenham: endpoints snap to whole pixels and every covered pixel is painted exactly once
// (a thick line stamps a thick x thick square per step; the Set drops overlaps, which matters for translucent fills).
function line(ctx, x0, y0, x1, y1, fill, thick = 1) {
  ctx.fillStyle = fill;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, off = Math.floor(thick / 2), seen = new Set();
  let err = dx + dy;
  for (;;) {
    for (let j = 0; j < thick; j++) for (let i = 0; i < thick; i++) {
      const px = x0 - off + i, py = y0 - off + j, key = px * 100003 + py;
      if (!seen.has(key)) { seen.add(key); ctx.fillRect(px, py, 1, 1); }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// Tonearm: counterweight behind the pivot, straight tube, headshell with finger lift.
export function drawArm(ctx, angle, liftAmount = 0) {
  const [px0, py0] = GEOMETRY.pivot, [sx, sy] = stylusPoint(angle);
  const back = [px0 - Math.cos(angle) * 18, py0 - Math.sin(angle) * 18], h = liftAmount * 3;
  // Shadow falls further from the arm the higher it is lifted.
  line(ctx, px0 + 2 + h, py0 + 3 + h, sx + 2 + h, sy + 3 + h, 'rgba(0,0,0,.45)', 2);
  line(ctx, back[0], back[1], px0, py0, PALETTE.shadow, 3);
  disc(ctx, back[0], back[1], 4.5, PALETTE.shadow); disc(ctx, back[0], back[1], 3.5, PALETTE.alloyDark); disc(ctx, back[0] - .5, back[1] - .5, 2, PALETTE.alloy);
  line(ctx, px0, py0, sx, sy, PALETTE.shadow, 3);
  line(ctx, px0, py0, sx, sy, PALETTE.alloyLight, 1);
  // Headshell: a short block across the arm end, plus the finger lift.
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  for (let i = -2; i <= 2; i++) { ctx.fillStyle = PALETTE.shadow; ctx.fillRect(Math.round(sx + nx * i - 1), Math.round(sy + ny * i - 1), 3, 3); }
  for (let i = -1; i <= 1; i++) { ctx.fillStyle = '#3a3631'; ctx.fillRect(Math.round(sx + nx * i), Math.round(sy + ny * i), 1, 1); }
  ctx.fillStyle = PALETTE.alloy; ctx.fillRect(Math.round(sx + nx * 4), Math.round(sy + ny * 4), 1, 1); ctx.fillRect(Math.round(sx + nx * 3), Math.round(sy + ny * 3), 1, 1);
  disc(ctx, px0, py0, 3, PALETTE.alloyLight); ctx.fillStyle = PALETTE.alloyDark; ctx.fillRect(px0, py0, 1, 1);
}

export function drawFrame(ctx, { deck, record, sheen, physics, speed = 33, motor = false, glow = 0 }) {
  const { width, height, center: [cx, cy] } = GEOMETRY;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(deck, 0, 0);
  drawControls(ctx, { speed, motor });
  if (record) {
    const size = record.width;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(physics.angle); ctx.drawImage(record, -size / 2, -size / 2); ctx.restore();
    ctx.globalAlpha = .9; ctx.drawImage(sheen, cx - size / 2, cy - size / 2); ctx.globalAlpha = 1;
    if (glow > 0) { ctx.globalAlpha = Math.min(.35, glow * .35); ctx.drawImage(sheen, cx - size / 2, cy - size / 2); ctx.globalAlpha = 1; }
  }
  drawArm(ctx, physics.arm, physics.lift);
}
