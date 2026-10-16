// The 唱机特写 room: layout and a pure pixel painter for the backdrop.
// One canvas the size of the window in art pixels, scaled by the same whole
// number (in device pixels) as the deck, so wall, desk, lamp and turntable
// share one pixel grid. Painted once per size / light / weather — nothing in
// it moves; the only ambient life is a CSS-stepped weather tile in the window
// panes and dust in the lamp pool.
import { GEOMETRY } from './turntable-physics.mjs';
import { BAYER } from './turntable-render.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const BAR = 48;
// Keep at least this much room above the deck for the wall (window, lamp).
const AIR = 1.3;

// Window size (CSS px) → where everything goes. `s` is CSS px per art pixel;
// rects are CSS px on that grid. Pure: unit-tested at the supported sizes.
export function cornerLayout({ width, height, dpr = 1 }) {
  const ratio = Math.max(1, dpr), narrow = width < 900 || width / height < 1.15;
  const crateH = height >= 760 ? 136 : height >= 640 ? 120 : 108, gutter = clamp(Math.round(width * .025), 16, 40);
  const fit = (w, h) => Math.floor(Math.min(w * ratio / GEOMETRY.width, h * ratio / GEOMETRY.height));
  let k, cardW, stageW, stageH;
  if (narrow) {
    stageW = width - gutter * 2; stageH = height - BAR - crateH;
    k = Math.max(1, fit(stageW, stageH * .7));
  } else {
    cardW = clamp(Math.round(width * .29), 300, 420); stageW = width - cardW - gutter * 3; stageH = height - BAR - crateH - 8;
    const kFit = fit(stageW, stageH), kAir = Math.floor(stageH * ratio / (GEOMETRY.height * AIR));
    k = Math.max(1, Math.max(Math.min(kFit, kAir), Math.min(kFit, Math.round(2 * ratio))));
  }
  const s = k / ratio, snap = (value) => Math.round(value / s) * s;
  const deckW = GEOMETRY.width * s, deckH = GEOMETRY.height * s;
  const crateTop = height - crateH;
  let deck, card;
  if (narrow) {
    deck = { x: snap((width - deckW) / 2), y: snap(BAR + 4), w: deckW, h: deckH };
    const top = deck.y + deckH - 4 * s;
    card = { x: gutter, y: Math.round(top), w: width - gutter * 2, h: Math.max(0, Math.round(crateTop - 8 - top)) };
  } else {
    const bottom = snap(crateTop - 10 * s);
    deck = { x: snap(gutter + (stageW - deckW) / 2), y: bottom - deckH, w: deckW, h: deckH };
    const cardBottom = Math.round(bottom - 12 * s), cardH = Math.round(Math.min(stageH - 8, Math.max(deckH * .9, 400)));
    card = { x: width - gutter - cardW, y: Math.max(BAR + 8, cardBottom - cardH), w: cardW, h: Math.min(cardH, cardBottom - BAR - 8) };
  }
  const down = (value) => Math.floor(value / s) * s;
  card = { x: snap(card.x), y: snap(card.y), w: down(card.w), h: down(card.h) };
  // The room, in art pixels.
  const art = { w: Math.ceil(width / s), h: Math.ceil(height / s) };
  const D = { x: Math.round(deck.x / s), y: Math.round(deck.y / s), w: GEOMETRY.width, h: GEOMETRY.height };
  const deskBack = D.y + 62, deskFront = narrow ? Math.round((card.y + card.h) / s) + 2 : D.y + D.h + 4;
  return { k, s, dpr: ratio, narrow, width, height, gutter, crateH, crateTop, deck, card, art, D, deskBack, deskFront };
}

// ── Palettes: three light modes as full swaps, not overlays ──────────────
export const SCENE_PALETTES = Object.freeze({
  lamp: { wall: ['#1e100a', '#2f1a0d', '#3c2213', '#4a2a16', '#5a331b'], desk: ['#2f1a0d', '#4a2a16', '#5d351c', '#6b3f22', '#8a5530'], floor: '#120a06', shadow: '#0d0805',
    pool: '#ffcf86', poolAt: 'lamp', lampOn: true, brass: ['#5e3f22', '#a8743c', '#d4a46b', '#ffd99c'], shade: ['#1d3a2c', '#2c5a42', '#3f7a58'], glass: '#ffe9b8', frame: ['#2a170c', '#4a2a16', '#6b3f22', '#8a5530'] },
  dusk: { wall: ['#26121a', '#3a1d26', '#47242c', '#552c33', '#66363b'], desk: ['#33191a', '#4f2a26', '#62352d', '#714033', '#8c5540'], floor: '#160a0c', shadow: '#110607',
    pool: '#ff9a6a', poolAt: 'window', lampOn: false, brass: ['#5e3a24', '#a86c42', '#d69a6c', '#ffcf9e'], shade: ['#1f2f2a', '#2c4a3c', '#3a5e4a'], glass: '#6a4a3a', frame: ['#2c140d', '#4a2619', '#6c3b28', '#8c5536'] },
  night: { wall: ['#0e0d16', '#161420', '#1f1c2c', '#28243a', '#322c46'], desk: ['#1d110a', '#2c1a10', '#3f2717', '#4f311d', '#5f3b22'], floor: '#07060b', shadow: '#05040a',
    pool: '#e7c48a', poolAt: 'lamp', lampOn: true, small: true, brass: ['#4a3420', '#87613a', '#b98d5c', '#e7c48a'], shade: ['#16241f', '#22382e', '#2e4a3c'], glass: '#ffe0a8', frame: ['#120f18', '#1f1a28', '#2c2538', '#3a3248'] }
});
const SKIES = {
  morning: ['#f2d6a8', '#e9c49a', '#c9b8a8', '#9fb3c4', '#7f9fb8'], day: ['#9cc4dc', '#8ab8d6', '#7aaccf', '#6aa0c8', '#5a94bf'],
  dusk: ['#e98a5b', '#d0705a', '#a85a5c', '#8a4a5c', '#5e3650'], night: ['#22304a', '#1d2a42', '#18223a', '#141c30', '#101628']
};
const hex = (value) => { const n = parseInt(String(value).slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toward = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Where the props go for this layout (art px). Pure; the painter and the DOM
// overlays (weather in the panes, dust in the lamp pool) share it.
export function sceneProps(layout, { light = 'lamp' } = {}) {
  const { art, D, deskBack, deskFront, narrow, card, s } = layout, P = SCENE_PALETTES[light] || SCENE_PALETTES.lamp;
  const top = Math.ceil(BAR / s), cardX = narrow ? art.w : Math.floor(card.x / s);
  const wallRoom = D.y - top;
  // Window: upper right of the deck, never under the liner notes.
  const wh = clamp(Math.round(wallRoom * .64), 52, 100), ww = clamp(Math.round(wh * .9), 64, 112);
  const wx = clamp(Math.round(D.x + D.w * .66 - ww / 2), 8, Math.max(8, cardX - ww - 10)), wy = top + clamp(Math.round((wallRoom - wh) * .4), 6, 40);
  const win = { x: wx, y: wy, w: ww, h: wh };
  // Lamp: a brass banker's lamp on the desk when there is room left of the
  // deck, else a swing-arm lamp on the wall above the deck's left corner.
  const standing = D.x >= 66;
  const lamp = standing ? { kind: 'desk', x: D.x - 62, y: D.y + 72, w: 58, h: 82 } : wallRoom >= 30 ? { kind: 'wall', x: Math.max(4, D.x - 6), y: top + 2, w: 54, h: Math.min(56, wallRoom + 20) } : { kind: 'none', x: D.x, y: top, w: 0, h: 0 };
  const bulb = lamp.kind === 'desk' ? [lamp.x + 38, lamp.y + 24] : lamp.kind === 'wall' ? [lamp.x + 44, lamp.y + lamp.h - 6] : [D.x + 40, top];
  const deckMid = [D.x + D.w * .42, D.y + D.h * .5];
  const poolCenter = P.poolAt === 'window' ? [win.x + win.w * .2, deskBack + 30] : [bulb[0] * .3 + deckMid[0] * .7, bulb[1] * .3 + deckMid[1] * .7];
  const poolRadius = (P.small ? .66 : .82) * Math.max(D.w, 220);
  // Plant on the desk to the right of the deck when it fits, else on the sill.
  const right = narrow ? art.w : cardX, room = right - (D.x + D.w);
  const plant = room >= 54 ? { kind: 'desk', big: true, x: D.x + D.w + Math.min(14, room - 50), y: D.y + D.h - 92 } : room >= 30 ? { kind: 'desk', x: D.x + D.w + Math.min(10, room - 26), y: D.y + D.h - 52 } : { kind: 'sill', x: win.x + win.w - 16, y: win.y + win.h - 14 };
  // A record ledge on the wall over the liner notes, level with the sill, and a
  // framed print above the lamp: the wall is part of the room, not a backdrop.
  const sill = win.y + win.h + 4, ledgeX = narrow ? 0 : cardX + 8, ledgeW = narrow ? 0 : Math.min(art.w - ledgeX - 6, Math.floor(card.w / s) - 16);
  const ledge = !narrow && ledgeW > 60 && sill - 34 > top + 4 ? { x: ledgeX, y: sill, w: ledgeW } : null;
  const printH = 56, print = lamp.kind === 'desk' && lamp.y - 8 - (win.y + 4) >= printH ? { x: lamp.x - 4, y: Math.max(win.y + 4, lamp.y - 12 - printH), w: 46, h: printH } : null;
  return { top, window: win, lamp, ledge, print, bulb, poolCenter, poolRadius, plant, deskBack, deskFront, panes: { x: win.x + 4, y: win.y + 4, w: win.w - 8, h: win.h - 8 } };
}

// Paints the room into `ctx` at art resolution (layout.art.w × layout.art.h).
export function paintScene(ctx, layout, { light = 'lamp', weather = 'snow', time = 'night' } = {}) {
  const P = SCENE_PALETTES[light] || SCENE_PALETTES.lamp, { art, D } = layout, W = art.w, H = art.h;
  const props = sceneProps(layout, { light }), { window: win, lamp, deskBack, deskFront } = props;
  const data = new Uint8ClampedArray(W * H * 4), random = seeded(7 + W * 31 + H);
  const set = (x, y, rgb) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; };
  const rect = (x, y, w, h, rgb) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, rgb); };
  const wall = P.wall.map(hex), desk = P.desk.map(hex), shadow = hex(P.shadow), pool = hex(P.pool), brass = P.brass.map(hex), frame = P.frame.map(hex);
  // Light pool: four stepped bands, Bayer-dithered between steps (no alpha, no blur).
  const [pcx, pcy] = props.poolCenter, pr = props.poolRadius;
  const lit = (x, y, rgb, strength = 1) => {
    if (!P.lampOn && P.poolAt !== 'window') return rgb;
    const d = Math.hypot((x - pcx) / 1.25, (y - pcy) * (y < deskBack ? 1 : 1.5)) / pr;
    const level = clamp((1 - d) * 4, 0, 4), step = Math.floor(level) + (level % 1 > (BAYER[y & 3][x & 3] + .5) / 16 ? 1 : 0);
    return step ? toward(rgb, pool, Math.min(.5, step * .11 * strength)) : rgb;
  };
  // Wall: walnut (or painted) boards, 12 px, lit left edge, dark seam, vertical grain.
  const phase = Array.from({ length: Math.ceil(W / 12) + 1 }, () => random() * 20);
  for (let y = 0; y < deskBack; y++) for (let x = 0; x < W; x++) {
    const b = Math.floor(x / 12), local = x % 12;
    const grain = Math.sin((x + Math.sin(y * .06 + phase[b]) * 1.6) * 1.9 + phase[b]);
    let tone = local === 0 ? 0 : local === 1 ? 3 : grain > .86 ? 1 : grain < -.9 ? 3 : 2;
    if (y >= deskBack - 7) tone = y === deskBack - 7 ? 4 : y === deskBack - 6 ? 3 : y >= deskBack - 2 ? 0 : 1; // skirting rail
    set(x, y, lit(x, y, wall[tone]));
  }
  // Dusk light: the window throws a slanted patch of warm light onto the wall.
  if (P.poolAt === 'window') for (let y = win.y + win.h + 4; y < deskBack - 8; y++) for (let x = 0; x < W; x++) {
    const shift = (y - win.y - win.h) * .55, inside = x > win.x - shift - 6 && x < win.x + win.w - shift - 10;
    if (inside) { const i = (y * W + x) * 4, edge = x < win.x - shift || x > win.x + win.w - shift - 16; if (!edge || (x + y) % 2 === 0) set(x, y, toward([data[i], data[i + 1], data[i + 2]], pool, edge ? .22 : .3)); }
  }
  // Desk top: planks running left–right, closer together towards the back.
  for (let y = deskBack; y < deskFront; y++) {
    const depth = (y - deskBack) / Math.max(1, deskFront - deskBack), seam = Math.round(Math.sqrt(depth) * 6) !== Math.round(Math.sqrt(Math.max(0, (y - 1 - deskBack) / Math.max(1, deskFront - deskBack))) * 6);
    for (let x = 0; x < W; x++) {
      const grain = Math.sin(x * .05 + y * .9 + Math.sin(x * .013 + y) * 2);
      const tone = y === deskBack ? 4 : seam ? 0 : grain > .8 ? 3 : grain < -.85 ? 1 : 2;
      set(x, y, lit(x, y, desk[tone]));
    }
  }
  // Desk front: a lit edge, the apron with a drawer seam, then the dark under the
  // desk and the floor boards the crate stands on.
  const floor = hex(P.floor), board = toward(floor, desk[1], .35), boardHi = toward(floor, desk[2], .5), apron = deskFront + 12;
  for (let y = deskFront; y < H; y++) for (let x = 0; x < W; x++) {
    let rgb;
    if (y === deskFront) rgb = desk[4];
    else if (y < apron) rgb = y === apron - 1 ? shadow : y === deskFront + 1 ? desk[3] : (y === deskFront + 6 && x % 160 > 6 && x % 160 < 150) ? desk[0] : desk[1];
    else if (y < apron + 3) rgb = shadow;
    else { const row = Math.floor((y - apron) / 7), local = (y - apron) % 7, joint = (x + row * 53) % 120 === 0; rgb = local === 0 ? floor : joint ? floor : local === 1 ? boardHi : board; rgb = toward(rgb, floor, clamp(1 - (y - apron) / 60, 0, .85)); }
    set(x, y, rgb);
  }
  // Deck shadow on the desk is in the deck canvas; here only an ambient occlusion line.
  rect(D.x + 6, D.y + D.h - 8, D.w - 12, 1, desk[0]);
  // The liner notes' cast shadow: solid contact edge, then a 50 % checker, lit from the top-left.
  const C = { x: Math.round(layout.card.x / layout.s), y: Math.round(layout.card.y / layout.s), w: Math.round(layout.card.w / layout.s), h: Math.round(layout.card.h / layout.s) };
  if (C.w > 0 && C.h > 0) for (let y = C.y + 2; y < C.y + C.h + 5; y++) for (let x = C.x + 2; x < C.x + C.w + 5; x++) {
    if (x < C.x + C.w && y < C.y + C.h) continue;
    if (x < C.x + C.w + 2 && y < C.y + C.h + 2) set(x, y, shadow); else if ((x + y) % 2 === 0) set(x, y, shadow);
  }
  paintWindow(set, rect, win, P, { weather, time: light === 'dusk' ? 'dusk' : light === 'night' ? 'night' : time, random });
  paintLamp(set, rect, lamp, P, props.bulb);
  paintPlant(set, rect, props.plant, P, desk);
  if (props.ledge) paintLedge(set, rect, props.ledge, P, random);
  if (props.print) paintPrint(set, rect, props.print, P, time);
  ctx.putImageData(new ImageData(data, W, H), 0, 0);
  return props;
}

function paintWindow(set, rect, win, P, { weather, time, random }) {
  const sky = (SKIES[time] || SKIES.night).map(hex), frame = P.frame.map(hex), shadow = hex(P.shadow);
  const { x, y, w, h } = win;
  rect(x + 3, y + 3, w, h, shadow); // cast shadow on the wall
  // Sky bands, dithered at each step.
  for (let j = 4; j < h - 4; j++) for (let i = 4; i < w - 4; i++) {
    const t = (j - 4) / (h - 8) * (sky.length - 1), band = Math.floor(t) + ((t % 1) > (((i + j) & 1) ? .7 : .3) ? 1 : 0);
    set(x + i, y + j, sky[Math.min(sky.length - 1, band)]);
  }
  const night = time === 'night' || time === 'dusk', ink = hex('#ffe9cb');
  if (time === 'night' && weather !== 'rain') for (let n = 0; n < (weather === 'starry' ? 26 : 12); n++) set(x + 5 + random() * (w - 10), y + 5 + random() * (h * .55), random() < .3 ? hex('#ffd99c') : ink);
  // Moon or sun.
  const mx = x + Math.round(w * .68), my = y + Math.round(h * .28);
  if (weather !== 'rain') for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const d = Math.hypot(i, j); if (d > 4.6) continue;
    if (night && time === 'night') { if (Math.hypot(i + 2, j - 1) > 4.2) set(mx + i, my + j, d > 3.6 ? hex('#e9d9b8') : ink); }
    else set(mx + i, my + j, d > 3.6 ? hex('#ffd99c') : hex('#fff3d6'));
  }
  // Far hills and pines: depth without detail.
  const hill = toward(sky.at(-1), shadow, .55), pine = toward(sky.at(-1), shadow, .75);
  for (let i = 4; i < w - 4; i++) {
    const hh = Math.round(h * .16 + Math.sin(i * .09 + 1) * 3 + Math.sin(i * .23) * 1.5);
    for (let j = h - 5 - hh; j < h - 4; j++) set(x + i, y + j, hill);
    const tree = (i * 7) % 13 < 3 ? Math.round(h * .22 + ((i * 5) % 7)) : 0;
    for (let j = 0; j < tree; j++) if (Math.abs((i * 7) % 13 - 1) <= Math.floor(j / 3) % 2 + (j > 3 ? 1 : 0)) set(x + i, y + h - 5 - j, pine);
  }
  if (weather === 'snow') for (let i = 4; i < w - 4; i++) { set(x + i, y + h - 5, hex('#e8e4dc')); if ((i * 3) % 7 < 3) set(x + i, y + h - 6, hex('#cfcac0')); }
  // Frame: 4 px walnut, lit top/left, cross mullions, a deep sill.
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const edge = i < 4 || j < 4 || i >= w - 4 || j >= h - 4, mull = Math.abs(i - w / 2) < 1.5 || Math.abs(j - Math.round(h * .45)) < 1;
    if (!edge && !mull) continue;
    const tone = (i === 0 || j === 0) ? 3 : (i === w - 1 || j === h - 1) ? 0 : (i === 3 || j === 3) && edge ? 0 : (i < 2 || j < 2) ? 2 : 1;
    set(x + i, y + j, frame[mull && !edge ? 2 : tone]);
  }
  rect(x - 4, y + h, w + 8, 4, frame[2]); rect(x - 4, y + h, w + 8, 1, frame[3]); rect(x - 4, y + h + 4, w + 8, 1, shadow);
  if (weather === 'snow') rect(x - 3, y + h - 1, w + 6, 1, hex('#e8e4dc'));
  // Glass glint (top-left of each pane).
  for (const [gx, gy] of [[x + 6, y + 6], [x + Math.round(w / 2) + 3, y + 6]]) { set(gx, gy, ink); set(gx + 1, gy, ink); set(gx, gy + 1, ink); }
}

function paintLamp(set, rect, lamp, P, [bx, by]) {
  const brass = P.brass.map(hex), shade = P.shade.map(hex), shadow = hex(P.shadow), glass = hex(P.glass);
  if (lamp.kind === 'desk') {
    // A brass banker's lamp: oval foot in its contact shadow, a stem lit on the
    // left, a yoke, and a green glass shade aimed at the deck, glowing beneath.
    const { x, y } = lamp, foot = y + 72;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 4; j++) if ((x + 6 + i + foot + 8 + j) % 2 === 0 || j < 2) set(x + 6 + i, foot + 8 + j, shadow);
    for (let j = 0; j < 8; j++) { const inset = j < 2 ? 2 - j : 0; rect(x + 4 + inset, foot + j, 40 - inset * 2, 1, j === 0 ? brass[3] : j === 1 ? brass[2] : j >= 6 ? brass[0] : brass[1]); }
    rect(x + 4, foot + 2, 2, 5, brass[2]); rect(x + 42, foot + 2, 2, 5, brass[0]);
    rect(x + 30, foot - 3, 6, 3, brass[1]); rect(x + 30, foot - 3, 6, 1, brass[3]); // switch
    rect(x + 16, y + 28, 4, foot - y - 28, brass[2]); rect(x + 16, y + 28, 1, foot - y - 28, brass[3]); rect(x + 19, y + 28, 1, foot - y - 28, brass[0]);
    rect(x + 14, foot - 4, 8, 4, brass[1]); rect(x + 14, foot - 4, 8, 1, brass[3]);
    rect(x + 16, y + 24, 22, 3, brass[2]); rect(x + 16, y + 24, 22, 1, brass[3]); rect(x + 16, y + 26, 22, 1, brass[0]); // yoke
    rect(x + 36, y + 20, 3, 6, brass[1]);
    // Shade: a half-cylinder of green glass, rows widening towards the rim.
    for (let j = 0; j < 16; j++) {
      const half = Math.round(10 + Math.sqrt(j / 15) * 14), cx = x + 38;
      for (let i = -half; i < half; i++) set(cx + i, y + 6 + j, j < 2 ? shade[2] : i < -half + 3 ? shade[2] : i > half - 4 ? shade[0] : (i + j) % 7 === 0 ? shade[2] : shade[1]);
      set(cx + half - 1, y + 6 + j, shade[0]);
    }
    rect(x + 13, y + 22, 50, 2, brass[2]); rect(x + 13, y + 22, 50, 1, brass[3]); rect(x + 13, y + 24, 50, 1, brass[0]);
    if (P.lampOn) { rect(x + 18, y + 25, 40, 2, glass); rect(x + 24, y + 27, 28, 1, toward(glass, hex(P.pool), .5)); }
    else rect(x + 18, y + 25, 40, 1, shadow);
    for (let j = 0; j < 9; j++) set(x + 58, y + 24 + j, j % 2 ? brass[3] : brass[1]); // pull chain
    rect(x + 57, y + 33, 3, 2, brass[2]);
  } else if (lamp.kind === 'wall') {
    // Swing-arm wall lamp: wall plate, two arm segments, a cone shade pointing down.
    const { x, y, h } = lamp;
    rect(x + 2, y + 2, 7, 12, shadow); rect(x, y, 7, 12, brass[1]); rect(x, y, 7, 1, brass[3]); rect(x, y, 1, 12, brass[2]);
    for (let i = 0; i < 26; i++) { set(x + 6 + i, y + 6 + Math.round(i * .3), brass[2]); set(x + 6 + i, y + 7 + Math.round(i * .3), brass[0]); }
    const ex = x + 31, ey = y + 14;
    for (let i = 0; i < h - 22; i++) { set(ex + Math.round(i * .4), ey + i, brass[2]); set(ex + 1 + Math.round(i * .4), ey + i, brass[0]); }
    const sx = ex + Math.round((h - 22) * .4) - 8, sy = ey + h - 22;
    for (let j = 0; j < 9; j++) { const half = 3 + Math.round(j * .9); rect(sx + 8 - half, sy + j, half * 2, 1, j < 2 ? shade[2] : shade[1]); set(sx + 8 + half - 1, sy + j, shade[0]); }
    if (P.lampOn) rect(sx + 1, sy + 9, 14, 1, glass); else rect(sx + 1, sy + 9, 14, 1, shadow);
  }
}

function paintPlant(set, rect, plant, P, desk) {
  const leaf = ['#1c3a24', '#2f5a34', '#4a7a3e', '#7aa35a'].map(hex), pot = ['#5a2a1a', '#8a4428', '#b05e36', '#d4824e'].map(hex), shadow = hex(P.shadow);
  const { x, y } = plant;
  if (plant.kind === 'sill') {
    rect(x, y + 6, 10, 7, pot[1]); rect(x, y + 6, 10, 1, pot[3]); rect(x + 9, y + 6, 1, 7, pot[0]);
    for (const [i, j, c] of [[2, 5, 2], [3, 3, 3], [5, 2, 2], [6, 4, 1], [7, 3, 3], [4, 1, 3], [8, 5, 2]]) { set(x + i, y + j, leaf[c]); set(x + i, y + j + 1, leaf[c - 1]); }
    return;
  }
  if (plant.big) {
    // A taller plant: terracotta pot with a rim, contact shadow, arching leaves lit from the left.
    for (let i = 0; i < 40; i++) for (let j = 0; j < 4; j++) if (j < 2 || (x + i + y + j) % 2 === 0) set(x + 4 + i, y + 90 + j, shadow);
    rect(x + 2, y + 58, 38, 6, pot[2]); rect(x + 2, y + 58, 38, 1, pot[3]); rect(x + 2, y + 63, 38, 1, pot[0]);
    for (let j = 0; j < 26; j++) { const inset = Math.round(j * .15); rect(x + 5 + inset, y + 64 + j, 32 - inset * 2, 1, pot[1]); set(x + 5 + inset, y + 64 + j, pot[2]); set(x + 6 + inset, y + 64 + j, pot[2]); set(x + 36 - inset, y + 64 + j, pot[0]); }
    rect(x + 8, y + 89, 26, 1, pot[0]);
    const stems = [[21, 58, -1.75, 52], [21, 58, -1.35, 46], [21, 58, -2.15, 44], [21, 58, -.85, 36], [21, 58, -2.6, 34], [21, 58, -.45, 26], [21, 58, -2.95, 24], [21, 58, -1.55, 30]];
    for (const [ox, oy, a, len] of stems) for (let t = 0; t < len; t++) {
      const bend = t * t * .012, px = ox + Math.cos(a) * t, py = oy + Math.sin(a) * t + bend, wdt = t < len * .35 ? 0 : Math.max(1, Math.round(Math.sin((t - len * .35) / (len * .65) * Math.PI) * 5));
      if (!wdt) { set(x + px, y + py, leaf[1]); continue; }
      for (let k = -wdt; k <= wdt; k++) set(x + px - Math.sin(a) * k * .9, y + py + Math.cos(a) * k * .9, leaf[k < -1 ? 3 : k < 1 ? 2 : k < wdt ? 1 : 0]);
      set(x + px, y + py, leaf[0]);
    }
    return;
  }
  // Pot with a rim, standing in its contact shadow; leaves fan out, lit from the left.
  rect(x + 3, y + 50, 24, 3, shadow); rect(x + 2, y + 32, 22, 4, pot[2]); rect(x + 2, y + 32, 22, 1, pot[3]); rect(x + 4, y + 36, 18, 15, pot[1]); rect(x + 4, y + 36, 2, 15, pot[2]); rect(x + 20, y + 36, 2, 15, pot[0]); rect(x + 4, y + 50, 18, 1, pot[0]);
  const leaves = [[13, 30, -1.9, 22], [13, 30, -1.3, 26], [13, 30, -.7, 20], [13, 30, -2.5, 18], [13, 30, -.2, 14], [13, 30, -2.9, 12]];
  for (const [ox, oy, a, len] of leaves) for (let t = 0; t < len; t++) {
    const px = ox + Math.cos(a) * t + Math.sin(t * .3) * 1.2, py = oy + Math.sin(a) * t + t * t * .018, wdt = Math.max(1, Math.round(Math.sin(t / len * Math.PI) * 3));
    for (let k = -wdt; k <= wdt; k++) set(x + px + k * Math.sin(a) * -.8, y + py + k * Math.cos(a) * .8, leaf[k < 0 ? 3 : k === 0 ? 2 : 1]);
    if (t % 4 === 0) set(x + px, y + py, leaf[0]);
  }
}

// A walnut ledge with sleeves standing face-out, leaning on the wall.
function paintLedge(set, rect, { x, y, w }, P, random) {
  const frame = P.frame.map(hex), shadow = hex(P.shadow), ink = hex('#ffe9cb');
  const covers = [['#6a2f26', '#e0ad69'], ['#2f4450', '#c9a47a'], ['#3a4a30', '#e8d8b0'], ['#4a3442', '#e98a5b'], ['#a8743c', '#2e1d12']].map((pair) => pair.map(hex));
  const size = 30, count = Math.max(1, Math.min(4, Math.floor((w - 8) / (size + 8))));
  for (let n = 0; n < count; n++) {
    const [bg, fg] = covers[Math.floor(random() * covers.length)], sx = x + 6 + n * (size + 10) + Math.round(random() * 4), sy = y - size - 1, motif = Math.floor(random() * 3);
    rect(sx + 3, sy + 3, size, size, shadow);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      let rgb = bg;
      const dx = i - size / 2, dy = j - size / 2;
      if (motif === 0 && Math.hypot(dx, dy) < 9) rgb = Math.hypot(dx, dy) < 3 ? bg : fg;
      else if (motif === 1 && j > size * .55 + Math.sin(i * .4) * 2) rgb = fg;
      else if (motif === 2 && (i + j) % 10 < 3 && j > 6) rgb = fg;
      if (i === 0 || j === 0) rgb = toward(rgb, ink, .35); else if (i === size - 1 || j === size - 1) rgb = toward(rgb, [0, 0, 0], .45);
      set(sx + i, sy + j, rgb);
    }
  }
  rect(x, y, w, 4, frame[2]); rect(x, y, w, 1, frame[3]); rect(x, y + 3, w, 1, frame[0]); rect(x + 2, y + 4, w, 2, shadow);
  for (const bx of [x + 10, x + w - 14]) { rect(bx, y + 4, 4, 6, frame[1]); rect(bx, y + 4, 1, 6, frame[2]); rect(bx + 4, y + 6, 1, 4, shadow); }
}
// A small framed print: hills under the same sky as the window.
function paintPrint(set, rect, { x, y, w, h }, P, time) {
  const frame = P.frame.map(hex), brass = P.brass.map(hex), shadow = hex(P.shadow), paper = hex('#e9d9b8');
  const sky = (SKIES[time === 'night' ? 'dusk' : time] || SKIES.dusk).map(hex), hill = ['#4a5a3a', '#3a4a30', '#2a3626'].map(hex);
  rect(x + 3, y + 3, w, h, shadow);
  rect(x, y, w, h, frame[1]); rect(x, y, w, 1, frame[3]); rect(x, y, 1, h, frame[2]); rect(x + w - 1, y, 1, h, frame[0]); rect(x, y + h - 1, w, 1, frame[0]);
  rect(x + 3, y + 3, w - 6, h - 6, brass[1]); rect(x + 4, y + 4, w - 8, h - 8, paper);
  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 22;
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    const t = j / ih * (sky.length - 1), band = Math.min(sky.length - 1, Math.floor(t) + ((t % 1) > ((i + j) & 1 ? .7 : .3) ? 1 : 0));
    let rgb = sky[band];
    const h1 = ih * .62 + Math.sin(i * .25) * 3, h2 = ih * .78 + Math.sin(i * .4 + 2) * 2;
    if (j > h2) rgb = hill[2]; else if (j > h1) rgb = hill[1];
    if (Math.hypot(i - iw * .3, j - ih * .35) < 4) rgb = hex('#fff3d6');
    set(ix + i, iy + j, rgb);
  }
  rect(ix, y + h - 11, iw * .6, 1, toward(paper, [0, 0, 0], .4)); rect(ix, y + h - 9, iw * .35, 1, toward(paper, [0, 0, 0], .25));
}

// Tiles for the CSS-stepped ambient layers (drawn once): snow / rain in the
// window panes, dust specks in the lamp pool. Returns a canvas.
export function weatherTile(kind, create) {
  const size = 32, canvas = create ? create(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size }), ctx = canvas.getContext('2d'), random = seeded(kind === 'rain' ? 3 : kind === 'dust' ? 5 : 9);
  canvas.width = canvas.height = size;
  if (kind === 'rain') { ctx.fillStyle = 'rgba(200,220,240,.55)'; for (let n = 0; n < 7; n++) { const x = Math.floor(random() * size), y = Math.floor(random() * size); for (let j = 0; j < 4; j++) ctx.fillRect((x - j + size) % size, (y + j * 2) % size, 1, 2); } }
  else if (kind === 'dust') { for (let n = 0; n < 5; n++) { ctx.fillStyle = n % 2 ? 'rgba(255,233,203,.55)' : 'rgba(255,217,156,.35)'; ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1); } }
  else { for (let n = 0; n < 9; n++) { ctx.fillStyle = n % 3 ? '#e8e4dc' : '#ffffff'; ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1); } }
  return canvas;
}
