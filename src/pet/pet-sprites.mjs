// Original hand-built pixel silhouettes. No image assets or remote requests.
// Shared palette semantics let every accessory work on every species.
import { catFrame, SIZE, PALETTE, CAT_PALETTES, POSES, ACCESSORIES, LISTEN_POSE, LISTEN_FRAMES, TYPING_POSE, TYPING_FRAMES, EAT_POSE, EAT_FRAMES, HOP_POSE, HOP_FRAMES } from './cat-sprites.mjs';
const CAT_ACTIONS = { [TYPING_POSE]: TYPING_FRAMES, [EAT_POSE]: EAT_FRAMES, [HOP_POSE]: HOP_FRAMES };
// What other pets draw for the cat-only actions.
const ACTION_FALLBACK = { [TYPING_POSE]: 'idle', [EAT_POSE]: 'celebrate', [HOP_POSE]: 'celebrate' };
import { normalizePetId } from './pet-catalog.mjs';
export { SIZE, POSES, ACCESSORIES };
const palette = (fur, light, shade, blush = '#ed9c9c') => Object.freeze(PALETTE.map((c, i) => ({ 2: fur, 3: light, 4: shade, 5: blush }[i] || c)));
export const PET_PALETTES = Object.freeze({
  cat: PALETTE,
  chick: palette('#f4cd58', '#fff0a1', '#da913c', '#efac7d'),
  bunny: palette('#edddd1', '#fff7ef', '#c4a9a2', '#e8a4ad'),
  bear: palette('#b88a68', '#efd0a0', '#865c47'),
  fox: palette('#df8755', '#ffead0', '#a95137'),
});
const grid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(g, x + dx, y + dy, c); };
const oval = (g, cx, cy, rx, ry, c) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    if (((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1) put(g, x, y, c);
};
const triangle = (g, cx, y, half, height, c) => { for (let dy = 0; dy < height; dy++) { const r = Math.round(half * dy / Math.max(1, height - 1)); rect(g, cx - r, y + dy, r * 2 + 1, 1, c); } };
function outline(g) {
  return g.map((row, y) => row.map((v, x) => v || ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = g[y + dy]?.[x + dx]; return n && n !== 13; }) ? 1 : 0)));
}
function eyes(g, x, y, mood) {
  for (const dx of [-3, 3]) {
    if (mood === 'closed') rect(g, x + dx, y, 2, 1, 6);
    else if (mood === 'happy') { put(g, x + dx, y, 6); put(g, x + dx + 1, y - 1, 6); put(g, x + dx + 2, y, 6); }
    else { rect(g, x + dx, y - 1, 2, 2, 6); put(g, x + dx, y - 1, 7); }
  }
}
function head(g, pet, x, y, mood, earTilt = 0) {
  if (pet === 'bunny') {
    oval(g, x - 4 - earTilt, y - 8, 2, 6, 2); oval(g, x + 4 + earTilt, y - 8, 2, 6, 2);
    rect(g, x - 4 - earTilt, y - 12, 1, 7, 5); rect(g, x + 4 + earTilt, y - 12, 1, 7, 5);
  } else if (pet === 'bear') {
    oval(g, x - 6, y - 5, 3, 3, 2); oval(g, x + 6, y - 5, 3, 3, 2);
    oval(g, x - 6, y - 5, 1, 1, 4); oval(g, x + 6, y - 5, 1, 1, 4);
  } else if (pet === 'fox') {
    triangle(g, x - 5, y - 10, 3, 8, 4); triangle(g, x + 5, y - 10, 3, 8, 4);
    triangle(g, x - 5, y - 8, 1, 5, 3); triangle(g, x + 5, y - 8, 1, 5, 3);
  } else {
    rect(g, x - 1, y - 9, 2, 4, 2); put(g, x + 1, y - 10, 2); put(g, x - 2, y - 8, 2);
  }
  oval(g, x, y, pet === 'chick' ? 7 : 8, 6, 2);
  if (pet === 'fox') {
    oval(g, x - 5, y + 2, 3, 2, 3); oval(g, x + 5, y + 2, 3, 2, 3);
    triangle(g, x, y + 1, 4, 5, 3);
  } else if (pet === 'bear') oval(g, x, y + 3, 4, 2, 3);
  else if (pet === 'bunny') oval(g, x, y + 3, 4, 2, 3);
  eyes(g, x, y, mood);
  put(g, x - 5, y + 2, 5); put(g, x + 6, y + 2, 5);
  if (pet === 'chick') { rect(g, x - 1, y + 2, 4, 1, 4); rect(g, x, y + 3, 2, 1, 4); }
  else { rect(g, x, y + 2, 2, 1, pet === 'bunny' ? 5 : 6); put(g, x, y + 3, 6); put(g, x + 1, y + 4, 6); }
}
function accessory(g, kind, x, y, pet) {
  if (kind === 'scarf') { rect(g, x - 6, y + 5, 13, 2, 8); rect(g, x + 3, y + 7, 3, 4, 8); put(g, x + 4, y + 10, 3); }
  if (kind === 'headphones') {
    // Bunny ears remain visible above the headband.
    for (let dx = -7; dx <= 8; dx++) put(g, x + dx, y - 4 - Math.round(Math.sqrt(Math.max(0, 1 - (dx / 8) ** 2)) * 3), 9);
    rect(g, x - 9, y - 2, 3, 5, 9); rect(g, x + 8, y - 2, 3, 5, 9);
    put(g, x - 8, y, 8); put(g, x + 9, y, 8);
  }
  if (kind === 'beanie') {
    oval(g, x, y - 5, pet === 'chick' ? 6 : 7, 4, 10);
    rect(g, x - 7, y - 4, 15, 2, 12); oval(g, x, y - 10, 1, 1, 7);
  }
}
function effects(g, pose, i) {
  if (pose === 'celebrate') for (const [x, y] of [[3 + i, 9 - i], [27 - i, 5 + i * 2]]) { rect(g, x - 1, y, 3, 1, 13); rect(g, x, y - 1, 1, 3, 13); }
  if (pose === 'groove') { const x = i < 2 ? 2 : 27, y = 3 + i % 2; rect(g, x, y + 3, 2, 2, 13); rect(g, x + 2, y, 1, 4, 13); rect(g, x + 3, y, 2, 1, 13); }
  if (pose === 'sleep') { const x = 23 + i * 2, y = 8 - i * 3; rect(g, x, y, 4, 1, 13); rect(g, x, y + 3, 4, 1, 13); put(g, x + 2, y + 1, 13); put(g, x + 1, y + 2, 13); }
  if (pose === 'focus') {
    rect(g, 13, 25, 16, 7, 1); rect(g, 14, 26, 6, 5, 12); rect(g, 22, 26, 6, 5, 12); rect(g, 20, 25, 2, 7, 11);
    for (const y of [27, 29]) { rect(g, 15, y, 4, 1, 4); rect(g, 23, y, 4 - i, 1, 4); }
  }
}
export function normalizeFrame(pose = 'idle', index = 0) {
  // Cat-only poses (beauty's TYPING / EAT / HOP and listen) are not in POSES; they must survive
  // normalisation or the cache and hit-test fall back to idle (bini: eat looked like sitting).
  const counts = { ...POSES, ...CAT_ACTIONS, [LISTEN_POSE]: LISTEN_FRAMES };
  const safePose = Object.hasOwn(counts, pose) ? pose : 'idle';
  const integer = Number.isFinite(index) ? Math.floor(index) : 0;
  return { pose: safePose, index: ((integer % counts[safePose]) + counts[safePose]) % counts[safePose] };
}
export function petFrame(petId = 'cat', pose = 'idle', index = 0, acc = '') {
  const pet = normalizePetId(petId);
  // The cat's 听歌 pose lives outside POSES (cat-sprites.mjs); other pets idle instead.
  if (pet === 'cat' && pose === LISTEN_POSE) { const i = Number.isFinite(index) ? Math.floor(index) : 0; return catFrame(LISTEN_POSE, ((i % LISTEN_FRAMES) + LISTEN_FRAMES) % LISTEN_FRAMES, ACCESSORIES.includes(acc) ? acc : ''); }
  if (Object.hasOwn(CAT_ACTIONS, pose)) {
    if (pet === 'cat') { const n = CAT_ACTIONS[pose], i = Number.isFinite(index) ? Math.floor(index) : 0; return catFrame(pose, ((i % n) + n) % n, ACCESSORIES.includes(acc) ? acc : ''); }
    pose = ACTION_FALLBACK[pose];
  }
  const normalized = normalizeFrame(Object.hasOwn(POSES, pose) ? pose : 'idle', index);
  pose = normalized.pose; index = normalized.index;
  acc = ACCESSORIES.includes(acc) ? acc : '';
  if (pet === 'cat') return catFrame(pose, index, acc);
  let g = grid();
  const resting = pose === 'sleep', focus = pose === 'focus';
  const dx = pose === 'walk' ? (index ? 1 : -1) : pose === 'groove' ? [-1, 0, 1, 0][index] : 0;
  const dy = pose === 'celebrate' ? [0, -2, -1][index] : pose === 'groove' ? index % 2 : 0;
  const x = 15 + dx, y = (resting ? 23 : pet === 'bunny' ? 17 : 14) + dy + (pose === 'idle' && index === 1 ? 1 : 0);
  const mood = resting || (pose === 'idle' && index === 3) ? 'closed' : ['groove', 'celebrate'].includes(pose) ? 'happy' : 'open';
  // Tail silhouettes: cotton puff, bear nub, and the fox's broad white-tipped brush.
  if (pet === 'fox') { oval(g, 25, resting ? 27 : 24 + dy, 4, resting ? 3 : 6, 2); oval(g, 27, resting ? 26 : 19 + dy - index % 2, 2, 3, 3); }
  if (pet === 'bunny') oval(g, x + 8, 27 + dy, 3, 3, 3);
  if (pet === 'bear') oval(g, x + 8, 27 + dy, 2, 2, 4);
  oval(g, x, resting ? 27 : 24 + dy, resting ? 10 : pet === 'chick' ? 8 : 7, resting ? 3 : 6, 2);
  oval(g, x, resting ? 28 : 25 + dy, 4, resting ? 2 : 4, 3);
  const step = pose === 'walk' ? index : 0;
  for (const [side, lift] of [[-1, step], [1, pose === 'walk' ? 1 - step : 0]]) {
    oval(g, x + side * 4, 30 + dy - lift, pet === 'chick' ? 2 : 3, 1, pet === 'chick' ? 4 : 3);
    if (!resting) oval(g, x + side * (pet === 'chick' ? 7 : 6), 24 + dy - (pose === 'celebrate' ? 4 : 0) - (pose === 'groove' ? index % 2 : 0), 2, 3, pet === 'chick' ? 4 : 2);
  }
  head(g, pet, resting ? x - 3 : x, y, mood, pet === 'bunny' && (pose === 'walk' || pose === 'groove') ? index % 2 : 0);
  accessory(g, acc, resting ? x - 3 : x, y, pet);
  // Focus reads as attentive sitting, with a book at the front; sleeping lowers the entire silhouette.
  if (focus) oval(g, x - 6, 26, 2, 1, 3);
  g = outline(g); effects(g, pose, index);
  return g;
}
const cache = new Map();
export function cachedPetFrame(petId, pose, index, acc) {
  const pet = normalizePetId(petId), safe = normalizeFrame(pose, index), accessory = ACCESSORIES.includes(acc) ? acc : '';
  const key = `${pet}:${safe.pose}:${safe.index}:${accessory}`;
  if (!cache.has(key)) cache.set(key, petFrame(pet, safe.pose, safe.index, accessory));
  return cache.get(key);
}
export function petOpaqueAt(petId, pose, index, acc, rx, ry) {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || ry < 0 || rx >= 1 || ry >= 1) return false;
  return Boolean(cachedPetFrame(petId, pose, index, acc)[Math.floor(ry * SIZE)][Math.floor(rx * SIZE)]);
}
export function drawPetFrame(context, pixels, petId = 'cat', scale = 1, catSkin = 'orange') {
  context.clearRect(0, 0, SIZE * scale, SIZE * scale);
  const id = normalizePetId(petId);
  // Preserve the original orange pixels; a cat cosmetic must never recolor another species.
  const colors = id === 'cat' && catSkin === 'black' ? CAT_PALETTES.black : PET_PALETTES[id];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (pixels[y][x]) {
    context.fillStyle = colors[pixels[y][x]]; context.fillRect(x * scale, y * scale, scale, scale);
  }
}
