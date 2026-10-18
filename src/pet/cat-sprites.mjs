// Pixel cat drawn from primitives on a 32×32 palette-indexed grid. Shapes are
// filled first, then an automatic outline pass gives the pixel-art edge.
export const SIZE = 32;
export const PALETTE = Object.freeze([
  null, // 0 transparent
  '#3b2a20', // 1 outline
  '#e8a25a', // 2 fur
  '#f8dcae', // 3 light fur
  '#c47634', // 4 stripes
  '#ef98a4', // 5 pink
  '#2a1d16', // 6 eyes
  '#fffaf0', // 7 highlight
  '#c8413b', // 8 scarf red
  '#59606c', // 9 headphones
  '#4f7bb5', // 10 beanie
  '#7a5236', // 11 book cover
  '#efe6cf', // 12 pages
  '#ffe08a' // 13 sparkle / notes / zzz
]);
export const CAT_PALETTES = Object.freeze({
  orange: Object.freeze(PALETTE.map((color, i) => ({ 2: '#b77d48', 3: '#ccb18a', 4: '#88522f', 5: '#bd7e86', 7: '#dfceb0', 12: '#cabea2', 13: '#d0b370' }[i] || color))),
  black: Object.freeze(PALETTE.map((color, i) => ({ 1: '#292932', 2: '#55545e', 3: '#85808a', 4: '#3c3b46', 5: '#ad7f88', 6: '#24232c', 7: '#c9bd96', 12: '#cabea2', 13: '#d0b370' }[i] || color)))
});
const EFFECT = 13;

function grid() { return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0)); }
function put(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) g[y][x] = c; }
function ellipse(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1) put(g, x, y, c);
  }
}
function rect(g, x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c); }
function triangle(g, ax, ay, left, right, baseY, c) {
  for (let y = ay; y <= baseY; y++) { const t = (y - ay) / Math.max(1, baseY - ay); for (let x = Math.round(ax + (left - ax) * t); x <= Math.round(ax + (right - ax) * t); x++) put(g, x, y, c); }
}
function outline(g) {
  const out = g.map((row) => [...row]);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = g[y + dy]?.[x + dx]; return v && v !== EFFECT && v !== 1; })) out[y][x] = 1;
  }
  return out;
}

function head(g, hx, hy, { eyes = 'open', look = 0 } = {}) {
  triangle(g, hx - 5, hy - 10, hx - 7, hx - 2, hy - 4, 2); triangle(g, hx + 5, hy - 10, hx + 2, hx + 7, hy - 4, 2);
  triangle(g, hx - 5, hy - 8, hx - 6, hx - 4, hy - 5, 5); triangle(g, hx + 5, hy - 8, hx + 4, hx + 6, hy - 5, 5);
  ellipse(g, hx, hy, 7, 5.5, 2);
  ellipse(g, hx - 4, hy + 2, 2, 1.5, 3); ellipse(g, hx + 4, hy + 2, 2, 1.5, 3); ellipse(g, hx, hy + 3, 3, 2, 3);
  [-2, 0, 2].forEach((dx) => { put(g, hx + dx, hy - 5, 4); put(g, hx + dx, hy - 4, 4); });
  put(g, hx - 7, hy + 1, 4); put(g, hx + 7, hy + 1, 4);
  const ey = hy + look;
  for (const ex of [hx - 3, hx + 3]) {
    if (eyes === 'open') { rect(g, ex, ey - 1, ex + 1, ey, 6); put(g, ex, ey - 1, 7); }
    else if (eyes === 'happy') { put(g, ex, ey, 6); put(g, ex + 1, ey - 1, 6); put(g, ex + 2, ey, 6); }
    else if (eyes === 'calm') { put(g, ex - 1, ey - 1, 6); put(g, ex, ey, 6); put(g, ex + 1, ey, 6); put(g, ex + 2, ey - 1, 6); }
    else { put(g, ex, ey, 6); put(g, ex + 1, ey, 6); }
  }
  put(g, hx, hy + 2, 5); put(g, hx + 1, hy + 2, 5);
  put(g, hx - 1, hy + 3, 6); put(g, hx + 2, hy + 3, 6);
}
function accessory(g, kind, hx, hy) {
  if (kind === 'headphones') {
    for (let x = hx - 7; x <= hx + 8; x++) { const t = (x - hx - .5) / 8; put(g, x, hy - 3 - Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 5), 9); }
    rect(g, hx - 9, hy - 2, hx - 7, hy + 2, 9); rect(g, hx + 8, hy - 2, hx + 10, hy + 2, 9);
    put(g, hx - 8, hy - 1, 8); put(g, hx + 9, hy - 1, 8);
  } else if (kind === 'scarf') {
    rect(g, hx - 6, hy + 5, hx + 7, hy + 6, 8); rect(g, hx + 3, hy + 7, hx + 5, hy + 10, 8); put(g, hx + 4, hy + 10, 4);
  } else if (kind === 'beanie') {
    for (let y = hy - 8; y <= hy - 3; y++) { const half = Math.round(Math.sqrt(Math.max(0, 1 - ((y - (hy - 3)) / 6) ** 2)) * 7.5); for (let x = hx - half; x <= hx + half + 1; x++) put(g, x, y, 10); }
    rect(g, hx - 7, hy - 3, hx + 8, hy - 3, 12); rect(g, hx, hy - 11, hx + 1, hy - 10, 7);
  }
}
// A thick polyline; the last segment is the darker tail tip.
function tail(g, points) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i], steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1), colour = i === points.length - 1 ? 4 : 2;
    for (let s = 0; s <= steps; s++) { const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps; put(g, x, y, colour); put(g, x + 1, y, colour); put(g, x, y + 1, colour); }
  }
}
// 8x6 envelope with a red wax dot, drawn over the outline as a prop.
function letter(g, x, y) { rect(g, x, y, x + 7, y + 5, 1); rect(g, x + 1, y + 1, x + 6, y + 4, 12); for (let i = 0; i < 3; i++) { put(g, x + 1 + i, y + 1 + i, 3); put(g, x + 6 - i, y + 1 + i, 3); } put(g, x + 3, y + 3, 8); put(g, x + 4, y + 3, 8); }
function sparkle(g, x, y) { put(g, x, y, EFFECT); put(g, x - 1, y, EFFECT); put(g, x + 1, y, EFFECT); put(g, x, y - 1, EFFECT); put(g, x, y + 1, EFFECT); }
function letterZ(g, x, y, size) { for (let i = 0; i < size; i++) { put(g, x + i, y, EFFECT); put(g, x + i, y + size - 1, EFFECT); put(g, x + size - 1 - i, y + i, EFFECT); } }
function note(g, x, y) { rect(g, x, y + 3, x + 1, y + 4, EFFECT); rect(g, x + 2, y, x + 2, y + 4, EFFECT); put(g, x + 3, y, EFFECT); put(g, x + 4, y + 1, EFFECT); }

function sitting(g, { dx = 0, dy = 0, hdx = 0, hdy = 0, eyes, tailUp = 0, swing = 0, paws = [0, 0], acc }) {
  // swing bends the upper tail sideways (0 at the base, full at the tip) so it can follow the head.
  const tailPoints = [[23, 29], [25, 28], [26, 26], [27, 24], [27, 22 - tailUp], [26, 20 - tailUp], [25, 19 - tailUp]].map(([x, y], i) => [x + dx + Math.round(swing * Math.max(0, i - 2) / 4), y + dy + (swing && i > 4 ? 1 : 0)]);
  tail(g, tailPoints);
  ellipse(g, 16 + dx, 24 + dy, 8, 6.5, 2); ellipse(g, 16 + dx, 25 + dy, 4, 4.5, 3);
  put(g, 11 + dx, 22 + dy, 4); put(g, 11 + dx, 24 + dy, 4); put(g, 21 + dx, 22 + dy, 4); put(g, 21 + dx, 24 + dy, 4);
  ellipse(g, 13 + dx, 30 + dy + paws[0], 2, 1, 3); ellipse(g, 19 + dx, 30 + dy + paws[1], 2, 1, 3);
  const hx = 16 + dx + hdx, hy = 13 + dy + hdy; head(g, hx, hy, { eyes });
  if (acc) accessory(g, acc, hx, hy);
  return { hx, hy };
}
function lying(g, { hx = 9, hy = 21, eyes = 'closed', look = 0, tailFlick = 0, acc }) {
  tail(g, [[27, 27], [28, 28 - tailFlick], [27, 30 - tailFlick], [25, 31], [23, 31], [21, 31]]);
  ellipse(g, 18, 26, 10, 4.5, 2); ellipse(g, 17, 28, 6, 2, 3);
  [14, 18, 22].forEach((x) => { put(g, x, 22, 4); put(g, x, 23, 4); });
  ellipse(g, hx + 4, 30, 2, 1, 3);
  head(g, hx, hy, { eyes, look }); if (acc) accessory(g, acc, hx, hy);
}

const FRAMES = {
  idle: [{ tailUp: 0 }, { tailUp: 1 }, { tailUp: 2 }, { tailUp: 1, eyes: 'closed' }],
  groove: [{ hdx: -1, eyes: 'happy', swing: -3, note: [3, 3] }, { hdy: 1, swing: 0, note: [4, 1] }, { hdx: 1, eyes: 'happy', swing: 3, note: [26, 2] }, { hdy: 1, swing: 0, note: [25, 0] }],
  celebrate: [{ dy: 0, eyes: 'happy', tailUp: 2, sparkles: [[4, 8], [27, 6]] }, { dy: -3, eyes: 'happy', tailUp: 3, paws: [-1, -1], sparkles: [[6, 4], [25, 10]] }, { dy: -1, eyes: 'happy', tailUp: 2, sparkles: [[3, 12], [28, 3]] }],
  walk: [{ dx: -1, paws: [-1, 0], tailUp: 1 }, { dx: 1, paws: [0, -1], tailUp: 0 }],
  sleep: [{ z: [22, 8, 4] }, { z: [24, 4, 5] }],
  focus: [{ tailFlick: 0 }, { tailFlick: 1 }]
};
export const POSES = Object.freeze(Object.fromEntries(Object.entries(FRAMES).map(([pose, frames]) => [pose, frames.length])));
// Cat-only eyes-closed listening pose (body still; only the note drifts) for music whose
// beat is missing or estimated. Kept out of POSES so other pet species need not draw it.
// v1.18 cat-only extras (art only; pet logic decides when to play them):
//  typing  – paw-tap loop at a little keyboard: left down, up, right down, up.
//  eat     – desktop-pet eating, mirrors public/cat/cat-eat.png (fish shrinks bite by bite).
//  hop     – double-click reaction: crouch, surprised hop with "!", land, settle.
//  deliver – walks in from the right with a letter in its mouth, drops it, sits proud.
const EXTRA_FRAMES = {
  listen: [{ eyes: 'calm', hdy: 1, tailUp: 1, note: [25, 1] }, { eyes: 'calm', hdy: 1, tailUp: 1, note: [25, 0] }],
  typing: [{ tap: [1, 0], hdx: -1 }, { tap: [0, 0] }, { tap: [0, 1], hdx: 1 }, { tap: [0, 0] }].map((f) => ({ dy: -3, eyes: 'open', ...f })),
  eat: [{ bite: 0, hdy: 0, eyes: 'open', sparkles: [[4, 18], [28, 18]] }, { bite: 0, hdy: 3 }, { bite: 2, hdy: 3, eyes: 'happy' }, { bite: 4, hdy: 2, eyes: 'happy' }, { bite: 6, hdy: 3, eyes: 'happy' }, { bite: 9, hdy: 0, eyes: 'happy', sparkles: [[5, 6], [27, 4]] }],
  hop: [{ dy: 1, paws: [0, 0], tailUp: 0 }, { dy: -4, eyes: 'open', tailUp: 3, paws: [-1, -1], bang: [27, 1] }, { dy: -5, eyes: 'open', tailUp: 3, swing: 3, paws: [-1, -1], bang: [27, 0] }, { dy: -2, eyes: 'happy', tailUp: 2, swing: -2 }, { dy: 1, eyes: 'happy', tailUp: 0 }, { dy: 0, eyes: 'happy', tailUp: 1, sparkles: [[4, 8], [27, 6]] }],
  deliver: [{ dx: 14, paws: [-1, 0] }, { dx: 10, paws: [0, -1] }, { dx: 6, paws: [-1, 0] }, { dx: 2, paws: [0, -1] }, { dx: 0 }, { dx: 0, hdy: 3, drop: 'mid' }, { dx: 0, eyes: 'happy', tailUp: 2, drop: 'floor' }, { dx: 0, eyes: 'happy', tailUp: 3, drop: 'floor', sparkles: [[5, 6]] }].map((f) => ({ tailUp: 1, eyes: 'open', letter: !f.drop, ...f }))
};
export const LISTEN_POSE = 'listen';
export const LISTEN_FRAMES = EXTRA_FRAMES.listen.length;
export const TYPING_POSE = 'typing';
export const TYPING_FRAMES = EXTRA_FRAMES.typing.length;
export const EAT_POSE = 'eat';
export const EAT_FRAMES = EXTRA_FRAMES.eat.length;
export const HOP_POSE = 'hop';
export const HOP_FRAMES = EXTRA_FRAMES.hop.length;
export const DELIVER_POSE = 'deliver';
export const DELIVER_FRAMES = EXTRA_FRAMES.deliver.length;
export const ACCESSORIES = Object.freeze(['', 'headphones', 'scarf', 'beanie']);

export function catFrame(pose, index = 0, acc = '') {
  const frames = FRAMES[pose] || EXTRA_FRAMES[pose] || FRAMES.idle, frame = frames[((index % frames.length) + frames.length) % frames.length];
  const kind = ACCESSORIES.includes(acc) ? acc : '';
  let g = grid();
  if (pose === 'sleep') lying(g, { acc: kind === 'scarf' ? '' : kind });
  else if (pose === 'focus') {
    lying(g, { hx: 10, hy: 18, eyes: 'open', look: 1, tailFlick: frame.tailFlick, acc: kind });
  } else sitting(g, { ...frame, acc: kind });
  g = outline(g);
  if (pose === 'focus') { // An open book after the outline so it reads as a prop.
    rect(g, 16, 24, 29, 31, 1); rect(g, 17, 25, 22, 30, 12); rect(g, 23, 25, 28, 30, 12); rect(g, 22, 24, 23, 31, 11);
    [26, 28].forEach((y) => { rect(g, 18, y, 21, y, 4); rect(g, 24, y, 27 - frame.tailFlick, y, 4); });
  }
  if (pose === 'typing') { // Desk edge + tiny keyboard in front; the tapping paw presses a key.
    rect(g, 0, 27, 31, 31, 11); rect(g, 0, 27, 31, 27, 13); rect(g, 6, 24, 25, 28, 1); rect(g, 7, 25, 24, 27, 12);
    for (let x = 8; x <= 23; x += 3) { put(g, x, 25, 9); put(g, x, 27, 9); }
    const [l, r] = frame.tap;
    for (const [px, down] of [[11 + (frame.hdx || 0), l], [19 + (frame.hdx || 0), r]]) {
      const py = down ? 23 : 19; rect(g, px - 3, py - 2, px + 2, py + 2, 1); rect(g, px - 2, py - 1, px + 1, py + 1, 3); put(g, px - 1, py + 1, 5); if (down) { put(g, px - 3, 23, EFFECT); put(g, px + 3, 23, EFFECT); }
    }
  }
  if (pose === 'eat') { // Plate + fish after the outline; bites eat the fish from its head.
    rect(g, 7, 30, 25, 31, 1); rect(g, 8, 30, 24, 30, 12);
    if (frame.bite < 9) { rect(g, 10 + frame.bite, 27, 19, 29, 1); rect(g, 11 + frame.bite, 28, 18, 28, 10); rect(g, 19, 27, 22, 29, 10); put(g, 22, 28, 1); }
    else { rect(g, 11, 28, 18, 28, 12); rect(g, 19, 27, 21, 29, 10); }
  }
  if (frame.letter) letter(g, 12 + (frame.dx || 0), 16 + (frame.hdy || 0));
  if (frame.drop === 'mid') letter(g, 12, 23);
  if (frame.drop === 'floor') letter(g, 3, 25);
  if (frame.bang) { const [x, y] = frame.bang; rect(g, x, y, x + 1, y + 4, EFFECT); rect(g, x, y + 6, x + 1, y + 7, EFFECT); }
  if (frame.z) { const [x, y, size] = frame.z; letterZ(g, x, y, size); letterZ(g, x - 5, y + 6, Math.max(2, size - 2)); }
  if (frame.note) note(g, ...frame.note);
  (frame.sparkles || []).forEach(([x, y]) => sparkle(g, x, y));
  return g;
}

// Draws one frame onto a 2D canvas context at integer scale.
export function drawFrame(context, pixels, scale = 1, skin = 'orange') {
  context.clearRect(0, 0, SIZE * scale, SIZE * scale);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const colour = (CAT_PALETTES[skin] || CAT_PALETTES.orange)[pixels[y][x]]; if (!colour) continue;
    context.fillStyle = colour; context.fillRect(x * scale, y * scale, scale, scale);
  }
}
