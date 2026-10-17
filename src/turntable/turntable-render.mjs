// Pixel renderer for the close-up turntable: a 288 × 196 canvas in 3/4 view,
// scaled up by whole numbers with nearest-neighbour sampling. One key light,
// top-left: every part has a lit top/left edge, a dark bottom/right edge, a
// solid contact shadow and a 50 % checker cast shadow towards bottom-right.
//
// Nothing is rotated per frame. Painted once (per light mode / record):
//   base    — plinth, platter, the record's grooves and lamp sheen, controls;
//   strobe  — the platter's strobe dots at 8 phases;
//   label   — LABEL_FRAMES pre-rotated label sprites;
//   arm     — the tonearm sprite, cached per quantised pose.
// A frame is 3–5 drawImage calls.
import { GEOMETRY, LABEL_FRAMES, REST_ANGLE, labelFrame, stylusPoint } from './turntable-physics.mjs';

// Three palette swaps, one per corner light (台灯 / 黄昏 / 深夜). Ramps go dark → light.
export const PALETTES = Object.freeze({
  lamp: {
    shadow: '#0d0805', wood: ['#2f1a0d', '#4a2a16', '#5d351c', '#6b3f22', '#8a5530', '#a8693b'], knot: '#3c2213',
    well: '#140c08', alloy: ['#3a3631', '#77746a', '#b0aea0', '#e4dfcc'], brass: ['#5e3f22', '#a8743c', '#d4a46b', '#ffd99c'],
    mat: ['#120d0a', '#1f1612', '#2a1e18'], led: '#ffbb55', ledOff: '#57352a', strobe: '#ff8a4a', strobeHi: '#ffd2a0', cartridge: ['#7a2f20', '#c4553b'],
    sheen: '#ffe2b0', sheenAt: -2.36, back: true
  },
  dusk: {
    shadow: '#120807', wood: ['#2c160f', '#4a2819', '#5c3320', '#6c3d27', '#8c5334', '#ab6a43'], knot: '#3a1f15',
    well: '#150b0a', alloy: ['#3f3434', '#7d6c6a', '#b8a29a', '#f2d8c6'], brass: ['#5e3a24', '#a86c42', '#d69a6c', '#ffcf9e'],
    mat: ['#140c0b', '#211413', '#2e1c1a'], led: '#ffaa66', ledOff: '#5a2f2a', strobe: '#ff7f5a', strobeHi: '#ffc6a8', cartridge: ['#7a2a26', '#cf5a45'],
    sheen: '#ffc2a0', sheenAt: -.79, back: false
  },
  night: {
    shadow: '#07060b', wood: ['#1c110c', '#2e1c12', '#3a2316', '#46291a', '#5c3721', '#704429'], knot: '#26170f',
    well: '#0a080c', alloy: ['#2a2a31', '#56565f', '#8d8c94', '#cfc8b8'], brass: ['#4a3420', '#87613a', '#b98d5c', '#e7c48a'],
    mat: ['#0c0a0c', '#151215', '#1f1a1d'], led: '#ffbb55', ledOff: '#3e2a26', strobe: '#ff8a4a', strobeHi: '#ffd2a0', cartridge: ['#5e2620', '#a84a36'],
    sheen: '#e7c48a', sheenAt: -2.36, back: false, dim: true
  }
});
export const paletteFor = (light) => PALETTES[light] || PALETTES.lamp;

const hex = (value) => { const s = String(value || '').replace('#', ''); const n = parseInt((s.length === 3 ? s.replace(/./g, '$&$&') : s).slice(0, 6).padEnd(6, '0'), 16); return Number.isFinite(n) ? [n >> 16, (n >> 8) & 255, n & 255] : [22, 17, 14]; };
const scale = ([r, g, b], k) => [r * k, g * k, b * k].map((v) => Math.max(0, Math.min(255, Math.round(v))));
const toward = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (text) => { let h = 0x811c9dc5; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; };
// 4×4 Bayer thresholds (0…15): dithering instead of alpha.
export const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const TAU = Math.PI * 2;

// A canvas (DOM, OffscreenCanvas or an injected factory for tests).
export function canvasOf(width, height, create) {
  const canvas = create ? create(width, height) : typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(width, height);
  canvas.width = width; canvas.height = height; return canvas;
}
const px = (ctx, x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
// Pixel image buffer: paint per pixel, flush once.
function buffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width, height, data,
    set(x, y, rgb, a = 255) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= width || y >= height) return; const i = (y * width + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a; },
    get(x, y) { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; },
    flush(ctx, dx = 0, dy = 0) { ctx.putImageData(new ImageData(data, width, height), dx, dy); }
  };
}

// 3×5 engraving font for the deck's printed labels.
const GLYPHS = { 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', A: '010101111101101', B: '110101110101110', C: '011100100100011', F: '111100110100100', I: '111010010010111', L: '100100100100111', N: '101111111111101', O: '010101101101010', R: '110101110101101', S: '011100010001110', T: '111010010010010', W: '101101101111101' };
export function engrave(ctx, text, x, y, fill) {
  ctx.fillStyle = fill; let at = x;
  for (const ch of String(text)) { const bits = GLYPHS[ch]; if (bits) for (let i = 0; i < 15; i++) if (bits[i] === '1') ctx.fillRect(at + i % 3, y + Math.floor(i / 3), 1, 1); at += ch === ' ' ? 2 : 4; }
}
const textWidth = (text) => [...String(text)].reduce((w, ch) => w + (ch === ' ' ? 2 : 4), 0) - 1;

// Disc of whole pixels (pixel centres inside r).
function eachInDisc(cx, cy, r, fn) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const d = Math.hypot(x + .5 - cx, y + .5 - cy); if (d <= r) fn(x, y, d, Math.atan2(y + .5 - cy, x + .5 - cx));
  }
}
// Lit from the top-left: +1 facing the lamp, −1 facing away.
const facing = (angle) => Math.cos(angle - (-2.36));

// ── Static deck ──────────────────────────────────────────────────────────
// Plinth, front face, feet, shadows, platter and arm board: everything that never moves.
export function paintDeck(create, light = 'lamp') {
  const P = paletteFor(light), { width, height, plinth, front, feet, center: [cx, cy], platterRadius: R, platterSide } = GEOMETRY;
  const canvas = canvasOf(width, height, create), ctx = canvas.getContext('2d'), img = buffer(width, height), random = seeded(hash(`walnut-${light}`));
  const wood = P.wood.map(hex), shadow = hex(P.shadow), alloy = P.alloy.map(hex), mat = P.mat.map(hex), well = hex(P.well);
  // Cast shadow on the desk: 50 % checker towards bottom-right, then the solid contact line.
  const right = plinth.x + plinth.w, bottom = front.y + front.h;
  for (let y = plinth.y + 6; y < bottom + 8; y++) for (let x = plinth.x + 6; x < right + 6; x++) if ((x >= right || y >= bottom + 4) && (x + y) % 2 === 0) img.set(x, y, shadow);
  for (let x = plinth.x + 2; x < right; x++) for (let y = bottom; y < bottom + 4; y++) img.set(x, y, shadow);
  // Walnut top: three planks, wavy grain, a knot or two, one seam per plank.
  const plank = Math.round(plinth.h / 3), knots = Array.from({ length: 3 }, () => ({ x: plinth.x + 30 + random() * (plinth.w - 60), y: plinth.y + 8 + random() * (plinth.h - 16), r: 2 + random() * 2 }));
  const phase = [random() * 9, random() * 9, random() * 9];
  for (let y = plinth.y; y < plinth.y + plinth.h; y++) for (let x = plinth.x; x < right; x++) {
    const p = Math.min(2, Math.floor((y - plinth.y) / plank)), local = (y - plinth.y) % plank;
    let grain = Math.sin((y + Math.sin(x * .045 + phase[p]) * 2.4 + Math.sin(x * .013 + p) * 4) * 1.15 + phase[p]);
    for (const k of knots) { const d = Math.hypot((x - k.x) / 2.2, y - k.y); if (d < k.r + 3) grain = Math.sin(d * 2.1); }
    let tone = grain > .72 ? 1 : grain < -.8 ? 3 : 2;
    if (p === 1) tone = Math.min(3, tone + (grain > 0 ? 0 : 1)) - 0; // middle plank slightly lighter
    if (local === 0 && y > plinth.y) tone = 0; else if (local === 1 && y > plinth.y + 1) tone = 4;
    img.set(x, y, wood[tone]);
  }
  for (const k of knots) eachInDisc(k.x, k.y, 1.2, (x, y) => img.set(x, y, hex(P.knot)));
  // Bevels: lit top and left, dark right; the edge to the front face catches the lamp.
  for (let x = plinth.x; x < right; x++) { img.set(x, plinth.y, wood[5]); img.set(x, plinth.y + 1, wood[4]); img.set(x, plinth.y + plinth.h - 1, wood[4]); }
  for (let y = plinth.y; y < plinth.y + plinth.h; y++) { img.set(plinth.x, y, wood[4]); img.set(right - 1, y, wood[0]); img.set(right - 2, y, wood[1]); }
  // Front face: darker end grain, lit top line, dark foot line, a fine horizontal grain.
  for (let y = front.y; y < bottom; y++) for (let x = front.x; x < right; x++) {
    const t = y - front.y, grain = Math.sin(x * .21 + Math.sin(x * .05) * 3 + t * .4) > .8;
    img.set(x, y, t === 0 ? wood[0] : t === 1 ? wood[3] : t === front.h - 1 ? shadow : t === front.h - 2 ? wood[0] : grain ? wood[1] : wood[2]);
  }
  for (let y = front.y; y < bottom; y++) { img.set(front.x, y, wood[3]); img.set(right - 1, y, shadow); }
  // Feet: rubber with an alloy ring, standing in their own contact shadow.
  for (const f of feet) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) img.set(x, y, y === f.y ? alloy[2] : x === f.x ? alloy[1] : y === f.y + f.h - 1 || x === f.x + f.w - 1 ? shadow : alloy[0]);
  // Dust-cover hinges at the back edge.
  for (const hx of [40, 220]) for (let y = plinth.y - 2; y < plinth.y + 4; y++) for (let x = hx; x < hx + 18; x++) img.set(x, y, y === plinth.y - 2 ? alloy[3] : y === plinth.y + 3 || x === hx + 17 ? shadow : x === hx ? alloy[2] : alloy[1]);
  // Platter well (recess), then the platter: sidewall on the near half, alloy rim, rubber mat.
  eachInDisc(cx + 1, cy + 2, R + 3, (x, y) => img.set(x, y, well));
  for (let x = Math.ceil(cx - R); x < cx + R; x++) {
    const half = Math.sqrt(Math.max(0, R * R - (x + .5 - cx) ** 2)), top = Math.round(cy + half);
    for (let k = 0; k < platterSide; k++) img.set(x, top + k, k === platterSide - 1 ? shadow : x < cx - R * .6 ? alloy[2] : alloy[1]);
  }
  eachInDisc(cx, cy, R, (x, y, d, a) => {
    if (d > R - 4) { const lit = facing(a); img.set(x, y, d > R - 1 ? (lit > .3 ? alloy[3] : lit < -.5 ? alloy[0] : alloy[1]) : d > R - 2 ? (lit > -.2 ? alloy[3] : alloy[2]) : alloy[2]); }
    else if (d > R - 5) img.set(x, y, alloy[0]);
    else { const ring = [18, 30, 42, 53].some((r) => Math.abs(d - r) < .6); img.set(x, y, ring ? mat[0] : (Math.floor(d) % 6 === 0 && facing(a) > .5) ? mat[2] : mat[1]); }
  });
  eachInDisc(cx, cy, 2.4, (x, y, d) => img.set(x, y, d < 1.2 ? alloy[3] : alloy[1]));
  // Arm board: a dark recessed plate under the tonearm, pitch fader and cue lever.
  const board = { x: 186, y: 14, w: 76, h: 136 };
  for (let y = board.y; y < board.y + board.h; y++) for (let x = board.x; x < board.x + board.w; x++) {
    const edgeTop = y === board.y || x === board.x, edgeBottom = y === board.y + board.h - 1 || x === board.x + board.w - 1;
    const inlay = (x === board.x + 3 || x === board.x + board.w - 4) && y > board.y + 2 && y < board.y + board.h - 3 || (y === board.y + 3 || y === board.y + board.h - 4) && x > board.x + 2 && x < board.x + board.w - 3;
    const brushed = Math.sin(y * 2.7 + Math.sin(x * .09 + y) * .8) > .55;
    img.set(x, y, edgeTop ? shadow : edgeBottom ? wood[4] : inlay ? hex(P.brass[y === board.y + 3 || x === board.x + 3 ? 2 : 1]) : brushed ? mat[2] : mat[1]);
  }
  for (const [sx, sy] of [[board.x + 6, board.y + 6], [board.x + board.w - 8, board.y + 6], [board.x + 6, board.y + board.h - 8], [board.x + board.w - 8, board.y + board.h - 8]]) { img.set(sx, sy, alloy[3]); img.set(sx + 1, sy, alloy[1]); img.set(sx, sy + 1, alloy[1]); img.set(sx + 1, sy + 1, alloy[0]); }
  img.flush(ctx);
  // Tonearm base: solid contact shadow, a two-ring alloy collar and the anti-skate dial.
  const [ax, ay] = GEOMETRY.pivot;
  disc(ctx, ax + 2, ay + 3, 13, P.shadow); disc(ctx, ax, ay, 12, P.alloy[0]); disc(ctx, ax - .5, ay - .5, 11, P.alloy[2]); disc(ctx, ax, ay, 10, P.alloy[1]); disc(ctx, ax - .5, ay - .5, 8, P.alloy[2]);
  arc(ctx, ax, ay, 10.5, P.alloy[3], -2.9, -1.2); disc(ctx, ax, ay, 5, P.alloy[0]);
  disc(ctx, ax + 23, ay + 14, 4, P.shadow); disc(ctx, ax + 22, ay + 13, 4, P.brass[1]); disc(ctx, ax + 21.5, ay + 12.5, 3, P.brass[2]); px(ctx, ax + 21, ay + 10, 1, 2, P.brass[3]); px(ctx, ax + 22, ay + 13, 1, 1, P.brass[0]);
  // Arm rest post with its clip, under where the tube lies at rest.
  const [rx, ry] = GEOMETRY.armRest;
  px(ctx, rx - 1, ry + 2, 6, 6, P.shadow); px(ctx, rx - 2, ry, 5, 6, P.alloy[1]); px(ctx, rx - 2, ry, 5, 1, P.alloy[3]); px(ctx, rx - 2, ry, 1, 6, P.alloy[2]);
  px(ctx, rx - 3, ry - 1, 1, 3, P.alloy[2]); px(ctx, rx + 3, ry - 1, 1, 3, P.alloy[1]);
  // Pitch fader (decoration): slot, scale ticks, the cap at 0 %.
  px(ctx, 248, 100, 4, 44, P.shadow); px(ctx, 249, 101, 2, 42, P.mat[0]);
  for (let y = 102; y < 144; y += 5) px(ctx, 244, y, 3, 1, y === 122 ? P.brass[2] : P.alloy[1]);
  px(ctx, 245, 120, 10, 6, P.shadow); px(ctx, 245, 119, 10, 6, P.alloy[2]); px(ctx, 245, 119, 10, 1, P.alloy[3]); px(ctx, 245, 122, 10, 1, P.alloy[0]);
  // Cue lever slot (the lever itself is a control state).
  const cue = GEOMETRY.controls.cue;
  px(ctx, cue.x + 4, cue.y + 2, 8, 26, P.shadow); px(ctx, cue.x + 5, cue.y + 3, 6, 24, P.alloy[0]); px(ctx, cue.x + 5, cue.y + 3, 6, 1, P.mat[0]);
  // Front face: start/stop well, strobe lamp window, 33/45 wells, nameplate, LED bezel.
  const { start, speed33, speed45 } = GEOMETRY.controls;
  for (const c of [start, speed33, speed45]) { px(ctx, c.x, c.y, c.w, c.h, P.shadow); px(ctx, c.x + 1, c.y + c.h - 1, c.w - 1, 1, P.wood[3]); }
  px(ctx, 54, 166, 13, 9, P.shadow); px(ctx, 55, 175, 12, 1, P.wood[3]);
  const plate = { x: 124, y: 166, w: 48, h: 9 };
  px(ctx, plate.x + 1, plate.y + 1, plate.w, plate.h, P.shadow); px(ctx, plate.x, plate.y, plate.w, plate.h, P.brass[1]); px(ctx, plate.x, plate.y, plate.w, 1, P.brass[3]); px(ctx, plate.x, plate.y + 1, plate.w - 1, plate.h - 2, P.brass[2]);
  engrave(ctx, 'FLOW CABIN', plate.x + Math.round((plate.w - textWidth('FLOW CABIN')) / 2), plate.y + 2, P.brass[0]);
  disc(ctx, 247.5, 170.5, 3.5, P.shadow); disc(ctx, 247, 170, 2.6, P.alloy[1]);
  for (const sx of [12, 266]) { px(ctx, sx, 169, 2, 2, P.alloy[1]); px(ctx, sx, 169, 1, 1, P.alloy[3]); }
  return canvas;
}
function disc(ctx, cx, cy, r, fill) { ctx.fillStyle = fill; for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) { const half = Math.sqrt(Math.max(0, r * r - (y + .5 - cy) ** 2)); if (half > 0) ctx.fillRect(Math.round(cx - half), y, Math.round(cx + half) - Math.round(cx - half), 1); } }
function arc(ctx, cx, cy, r, fill, from, to) { ctx.fillStyle = fill; const n = Math.ceil(r * (to - from) * 1.4); for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; ctx.fillRect(Math.round(cx + Math.cos(t) * r - .5), Math.round(cy + Math.sin(t) * r - .5), 1, 1); } }

// Buttons, LED, strobe lamp and cue lever: the four (speed, motor) × cue states.
export function drawControls(ctx, { speed = 33, motor = false, cueUp = true, light = 'lamp' } = {}) {
  const P = paletteFor(light), { start, speed33, speed45, cue } = GEOMETRY.controls;
  const key = (c, on, label, lit) => {
    const y = c.y + 1 + (on ? 1 : 0), h = c.h - 2 - (on ? 1 : 0), x = c.x + 1, w = c.w - 2;
    const face = lit ? P.brass : [P.wood[0], P.alloy[0], P.alloy[1], P.alloy[2]];
    px(ctx, x, c.y + 1, w, c.h - 2, P.shadow); px(ctx, x, y, w, h, face[2]); px(ctx, x, y, w, 1, face[3]); px(ctx, x, y + h - 1, w, 1, face[1]); px(ctx, x + w - 1, y, 1, h, face[1]);
    engrave(ctx, label, x + Math.round((w - textWidth(label)) / 2), y + Math.round((h - 5) / 2), lit ? P.brass[0] : P.alloy[3]);
  };
  key(start, motor, 'START', false);
  key(speed33, speed === 33, '33', speed === 33);
  key(speed45, speed === 45, '45', speed === 45);
  // Strobe lamp: a lens that glows while the motor runs.
  px(ctx, 55, 167, 11, 7, motor ? P.strobe : P.mat[1]); if (motor) { px(ctx, 56, 168, 4, 1, P.strobeHi); px(ctx, 55, 173, 11, 1, P.cartridge[0]); } else px(ctx, 56, 168, 3, 1, P.alloy[0]);
  // Power LED.
  px(ctx, 246, 169, 3, 3, motor ? P.led : P.ledOff); if (motor) px(ctx, 246, 169, 1, 1, P.strobeHi);
  // Cue lever: up (arm lifted) or down, brass knob.
  const ky = cueUp ? cue.y + 4 : cue.y + 18;
  px(ctx, cue.x + 7, ky + 2, 2, cue.y + 26 - ky - 2, P.alloy[2]);
  px(ctx, cue.x + 3, ky + 1, 10, 6, P.shadow); px(ctx, cue.x + 2, ky, 10, 5, P.brass[1]); px(ctx, cue.x + 2, ky, 10, 1, P.brass[3]); px(ctx, cue.x + 2, ky + 1, 1, 3, P.brass[2]); px(ctx, cue.x + 11, ky, 1, 5, P.brass[0]);
}

// ── Record ───────────────────────────────────────────────────────────────
// Grooves are rotationally symmetric, so they are painted once and never
// rotated (no propeller shimmer): bands ≥ 2 px, a lighter quiet ring between
// songs, glossy lead-in / lead-out and a rolled edge, with the lamp's sheen as
// fixed 50 % / 25 % checker wedges. Only a splatter vinyl needs turning
// colour; it gets its own frames and a static shading overlay.
const recordSize = () => GEOMETRY.recordRadius * 2 + 2;
function grooveShade(r, { gapRadii, R, outer, inner }) {
  if (r > R - 1) return 1.55;
  if (r > R - 2) return .82;
  if (r > outer + 1) return 1.1;
  if (r < inner - 1) return 1.14;
  if (gapRadii.some((g) => Math.abs(r - g) < .75)) return 1.32;
  const band = Math.floor((r - inner) / 2.5);
  return band % 2 ? .9 : 1.02 + (band % 5 === 0 ? .04 : 0);
}
function sheenLevel(angle, r, P) {
  const d = Math.abs(((angle - P.sheenAt) % TAU + TAU + Math.PI) % TAU - Math.PI), width = P.dim ? .7 : 1;
  let level = d < .2 * width ? 2 : d < .42 * width ? 1 : 0;
  if (P.back && level === 0) { const b = Math.abs(((angle - P.sheenAt - Math.PI) % TAU + TAU + Math.PI) % TAU - Math.PI); if (b < .14) level = 1; }
  if (level && Math.floor(r) % 3 === 0) level--; // the sheen breaks up across the grooves
  return level;
}
const sheenOn = (level, x, y) => level === 2 ? (x + y) % 2 === 0 : level === 1 ? x % 2 === 0 && y % 2 === 0 : false;
export function paintRecord(create, { base = '#16110e', opacity = 100, splashes = [], splatter = false, gaps = [], seed = '', light = 'lamp' } = {}) {
  const P = paletteFor(light), { recordRadius: R, labelRadius: L, outerGroove: outer, innerGroove: inner } = GEOMETRY;
  const size = recordSize(), c = size / 2, random = seeded(hash(seed) || 1);
  const colour = hex(base), sheen = hex(P.sheen), alpha = Math.round(255 * Math.max(.55, Math.min(1, opacity / 100)));
  const dark = (colour[0] + colour[1] + colour[2]) / 3 < 70, gapRadii = gaps.map((gap) => outer - gap * (outer - inner)), geo = { gapRadii, R, outer, inner };
  const blobs = splatter ? Array.from({ length: 9 }, () => ({ a: random() * TAU, d: random() * R * .8, r: 4 + random() * 9, c: hex(splashes[Math.floor(random() * splashes.length)] || '#e8bc74') })) : [];
  const paint = (rgb, r) => { const k = grooveShade(r, geo); return dark ? toward(scale(rgb, k), [255, 255, 255], Math.max(0, k - 1) * .22) : scale(rgb, k); };
  // Static layer: the whole record for a plain vinyl; only shading for a splatter one.
  const still = canvasOf(size, size, create), img = buffer(size, size);
  eachInDisc(c, c, R, (x, y, r, a) => {
    if (r <= L) { img.set(x, y, hex(P.shadow)); return; }
    const level = sheenLevel(a, r, P), lit = sheenOn(level, x, y);
    if (splatter) { // translucent shading over the turning colour
      const k = grooveShade(r, geo);
      if (lit) img.set(x, y, sheen, 120); else if (k < 1) img.set(x, y, [0, 0, 0], Math.round((1 - k) * 420)); else if (k > 1) img.set(x, y, [255, 240, 220], Math.round((k - 1) * 150));
      return;
    }
    const rgb = paint(colour, r);
    img.set(x, y, lit ? toward(rgb, sheen, level === 2 ? .5 : .32) : rgb, alpha);
  });
  img.flush(still.getContext('2d'));
  let frames = null;
  if (splatter) {
    // The colour turns: LABEL_FRAMES pre-rotated copies of the vinyl + splatter.
    frames = Array.from({ length: LABEL_FRAMES }, (_, index) => {
      const turn = index / LABEL_FRAMES * TAU, frame = canvasOf(size, size, create), f = buffer(size, size);
      eachInDisc(c, c, R, (x, y, r, a) => {
        if (r <= L) return;
        let rgb = colour; const local = a - turn;
        for (const blob of blobs) { const bx = Math.cos(blob.a) * blob.d, by = Math.sin(blob.a) * blob.d, lx = Math.cos(local) * r, ly = Math.sin(local) * r; if ((lx - bx) ** 2 + (ly - by) ** 2 < blob.r * blob.r) rgb = blob.c; }
        f.set(x, y, r > R - 1 ? toward(rgb, [255, 255, 255], .3) : rgb, alpha);
      });
      f.flush(frame.getContext('2d'));
      return frame;
    });
  }
  return { still, frames, size };
}

// The label: the cover (or a generated sleeve) printed on paper, rotated into
// LABEL_FRAMES sprites. Rotation happens here, once per record, with smoothing
// from the full-size artwork; the lamp's light on the label stays put.
export function paintLabelFrames(create, { art = null, paper = '#c9a47a', light = 'lamp' } = {}) {
  const P = paletteFor(light), L = GEOMETRY.labelRadius, size = L * 2 + 1, c = size / 2;
  const mask = canvasOf(size, size, create), mctx = mask.getContext('2d');
  mctx.fillStyle = '#000'; eachInDisc(c, c, L - .3, (x, y) => mctx.fillRect(x, y, 1, 1));
  // Static light on the label: a lit top-left crescent and a darker rim.
  const shade = canvasOf(size, size, create), sctx = shade.getContext('2d');
  eachInDisc(c, c, L - .3, (x, y, d, a) => {
    if (d > L - 1.3) { sctx.fillStyle = 'rgba(13,8,5,.55)'; sctx.fillRect(x, y, 1, 1); }
    else if (d > L - 4 && facing(a) > .55 && (x + y) % 2 === 0) { sctx.fillStyle = 'rgba(255,236,200,.38)'; sctx.fillRect(x, y, 1, 1); }
  });
  eachInDisc(c, c, 3.4, (x, y, d) => { sctx.fillStyle = d < 1.4 ? P.alloy[2] : 'rgba(13,8,5,.45)'; sctx.fillRect(x, y, 1, 1); });
  const paperColour = hex(paper);
  return Array.from({ length: LABEL_FRAMES }, (_, index) => {
    const frame = canvasOf(size, size, create), ctx = frame.getContext('2d'), turn = index / LABEL_FRAMES * TAU;
    ctx.fillStyle = css(paperColour); ctx.fillRect(0, 0, size, size);
    ctx.save(); ctx.translate(c, c); ctx.rotate(turn);
    if (art) {
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(art, -L, -L, L * 2, L * 2); } catch {}
    } else {
      ctx.fillStyle = css(scale(paperColour, .78)); ctx.fillRect(-L, -2, L * 2, 1); ctx.fillRect(-L * .6, 5, L * 1.2, 1); ctx.fillRect(-L * .5, -8, L, 2);
    }
    // Index mark: a light chord at the label's edge that shows the turning.
    ctx.fillStyle = 'rgba(255,240,215,.85)'; ctx.fillRect(L - 6, -1, 4, 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(shade, 0, 0);
    ctx.clearRect(Math.floor(c), Math.floor(c), 1, 1); // spindle hole
    return frame;
  });
}

// ── Strobe dots ──────────────────────────────────────────────────────────
// 48 dots on the platter's near sidewall. At the locked speed they look still
// (as under a mains strobe lamp); they drift while spinning up or coasting.
export const STROBE_DOTS = 48, STROBE_PHASES = 8;
export function paintStrobe(create, { lit = false, light = 'lamp' } = {}) {
  const P = paletteFor(light), { center: [cx, cy], platterRadius: R } = GEOMETRY, spacing = TAU / STROBE_DOTS;
  return Array.from({ length: STROBE_PHASES }, (_, phase) => {
    const canvas = canvasOf(GEOMETRY.width, GEOMETRY.height, create), ctx = canvas.getContext('2d');
    for (let i = 0; i < STROBE_DOTS; i++) {
      const a = i * spacing + phase / STROBE_PHASES * spacing, s = Math.sin(a);
      if (s < .12) continue; // only the near half shows its side
      const x = Math.round(cx + Math.cos(a) * R - .5), y = Math.round(cy + s * R) + 1;
      ctx.fillStyle = lit ? (s > .5 ? P.strobeHi : P.strobe) : P.alloy[3]; ctx.fillRect(x, y, 1, 2);
    }
    return canvas;
  });
}
export const strobePhase = (strobe) => { const spacing = TAU / STROBE_DOTS, t = ((strobe % spacing) + spacing) % spacing; return Math.floor(t / spacing * STROBE_PHASES) % STROBE_PHASES; };

// ── Tonearm sprite ───────────────────────────────────────────────────────
// Gimbal, ridged counterweight, a 3 px three-tone tube, an offset headshell
// with finger lift and cartridge, and a checker shadow that drops further the
// higher the arm is lifted. Painted per pixel in the arm's own frame.
export function paintArm(create, angle, lift = 0, { touch = false, light = 'lamp' } = {}) {
  const P = paletteFor(light), [ax, ay] = GEOMETRY.pivot, L = GEOMETRY.armLength, [sx, sy] = stylusPoint(angle);
  const al = P.alloy.map(hex), shadow = hex(P.shadow), cart = P.cartridge.map(hex);
  const raise = lift > .5 ? 1 : 0, sh = [2 + Math.round(3 * lift), 3 + Math.round(3 * lift)];
  const x0 = Math.floor(Math.min(ax - 28, sx - 16)), y0 = Math.floor(Math.min(ay - 28, sy - 16)), x1 = Math.ceil(Math.max(ax + 28, sx + 16)) + sh[0], y1 = Math.ceil(Math.max(ay + 28, sy + 16)) + sh[1];
  const width = x1 - x0, height = y1 - y0, img = buffer(width, height);
  const dir = [Math.cos(angle), Math.sin(angle)];
  // The normal that faces the lamp (top-left).
  let n = [-dir[1], dir[0]]; if (n[0] + n[1] > 0) n = [-n[0], -n[1]];
  const offset = .42, hd = [Math.cos(angle + offset), Math.sin(angle + offset)]; let hn = [-hd[1], hd[0]]; if (hn[0] + hn[1] > 0) hn = [-hn[0], -hn[1]];
  const head = [sx - hd[0] * 1, sy - hd[1] * 1];
  // Shapes in arm space: t along the axis, s across it (+ towards the lamp).
  const local = (x, y, o, d, nn) => { const dx = x - o[0], dy = y - o[1]; return [dx * d[0] + dy * d[1], dx * nn[0] + dy * nn[1]]; };
  const shapes = (x, y) => {
    const [t, s] = local(x, y, [ax, ay], dir, n);
    const [ht, hs] = local(x, y, head, hd, hn);
    const pivot = Math.hypot(x - ax, y - ay);
    if (ht > -11 && ht < 2 && Math.abs(hs) <= 3.2) { // headshell
      if (ht > -5 && hs < .2) return ht > 1 ? cart[0] : hs < -2.2 ? cart[0] : cart[1]; // cartridge
      return hs > 2.2 ? al[3] : hs < -2.2 ? al[0] : ht < -9.5 ? al[1] : al[2];
    }
    if (ht > -8 && ht < -6 && hs > 3.2 && hs < 7) return hs > 6 ? al[2] : al[3]; // finger lift
    if (t > -1 && t < L - 8 && Math.abs(s) <= 1.5) return s > .5 ? al[3] : s < -.5 ? al[1] : al[2]; // tube
    if (t > -1 && t < L - 8 && s < -1.5 && s > -2.4) return al[0];
    if (t < -9 && t > -21 && Math.abs(s) <= 5.2) return (Math.abs(t + 12.5) < .55 || Math.abs(t + 16) < .55) ? al[0] : Math.abs(s) > 4.6 || t < -20.3 ? al[0] : s > 2.4 ? al[3] : s > -1.6 ? al[2] : al[1]; // counterweight
    if (t <= -1 && t >= -9 && Math.abs(s) <= 1.2) return s > .4 ? al[2] : al[1];
    if (pivot < 5.5) return pivot < 2 ? al[3] : pivot < 3.5 ? al[2] : al[1]; // gimbal cap
    return null;
  };
  // Shadow first (50 % checker), then the arm on top.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 2 === 0 && shapes(x - sh[0] + .5, y - sh[1] + .5)) img.set(x - x0, y - y0, shadow);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const inHead = local(x + .5, y + .5, head, hd, hn)[0] > -9.5;
    const drop = touch && inHead ? 1 : 0;
    const colour = shapes(x + .5, y + .5 + raise - drop);
    if (colour) img.set(x - x0, y - y0, colour);
  }
  // Stylus tip.
  if (lift > .1) img.set(Math.round(sx) - x0, Math.round(sy) - y0 - raise + 1, al[0]);
  const canvas = canvasOf(width, height, create); img.flush(canvas.getContext('2d'));
  return { canvas, x: x0, y: y0 };
}

// ── Compositing ──────────────────────────────────────────────────────────
function layerLike(width, height) {
  try { if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width, height }); if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height); } catch {}
  return null;
}
// Everything the deck needs for one light mode, cached per record/state.
export function createDeckArt(light = 'lamp', create) {
  const deck = paintDeck(create, light), strobe = { on: null, off: null }, bases = new Map(), arms = new Map();
  const strobeFrames = (lit) => (lit ? strobe.on ||= paintStrobe(create, { lit: true, light }) : strobe.off ||= paintStrobe(create, { lit: false, light }));
  return {
    light, deck,
    // Deck + record shading + controls, composed once per state.
    base(record, { speed = 33, motor = false, cueUp = true } = {}) {
      const key = `${record?.id || ''}|${speed}|${motor ? 1 : 0}|${cueUp ? 1 : 0}`;
      if (bases.has(key)) return bases.get(key);
      if (bases.size > 8) bases.delete(bases.keys().next().value);
      const layer = create ? canvasOf(GEOMETRY.width, GEOMETRY.height, create) : layerLike(GEOMETRY.width, GEOMETRY.height), ctx = layer.getContext('2d');
      ctx.imageSmoothingEnabled = false; ctx.drawImage(deck, 0, 0);
      if (record && !record.frames) ctx.drawImage(record.still, GEOMETRY.center[0] - record.size / 2, GEOMETRY.center[1] - record.size / 2);
      drawControls(ctx, { speed, motor, cueUp, light });
      bases.set(key, layer); return layer;
    },
    strobe: strobeFrames,
    // One-entry-per-pose cache: 1/900 rad is well under a pixel at the arm's length.
    arm(angle, lift, touch) {
      const qa = Math.round(angle * 900) / 900, ql = Math.round(lift * 4) / 4, key = `${qa}:${ql}:${touch ? 1 : 0}`;
      let hit = arms.get(key);
      if (hit) { arms.delete(key); arms.set(key, hit); return hit; }
      hit = paintArm(create, qa, ql, { touch, light });
      arms.set(key, hit); if (arms.size > 48) arms.delete(arms.keys().next().value);
      return hit;
    }
  };
}

// One frame: base, strobe dots, (turning splatter colour + shading), label, arm.
export function drawFrame(ctx, { art, record = null, labels = null, physics, speed = 33, motor = false }) {
  const { center: [cx, cy] } = GEOMETRY, cueUp = physics.lift > .5;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'copy'; ctx.drawImage(art.base(record, { speed, motor, cueUp }), 0, 0); ctx.globalCompositeOperation = 'source-over';
  const lit = motor || physics.omega > 0;
  ctx.drawImage(art.strobe(lit)[lit ? strobePhase(physics.strobe) : 0], 0, 0);
  const frame = labelFrame(physics.angle);
  if (record?.frames) { const half = record.size / 2; ctx.drawImage(record.frames[frame], cx - half, cy - half); ctx.drawImage(record.still, cx - half, cy - half); }
  if (labels) { const label = labels[frame], half = label.width / 2; ctx.drawImage(label, Math.round(cx - half), Math.round(cy - half)); }
  const arm = art.arm(physics.arm ?? REST_ANGLE, physics.lift || 0, physics.touch > 0);
  ctx.drawImage(arm.canvas, arm.x, arm.y);
}
