// Where everything on the desk goes, for a window of a given size. Pure functions, tested.
//
// The pictures are DEsk's (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), rendered
// for a 1440x900 desk (src/desk/plates.json). The things at the back edge (the Control Panel's corner,
// the clock, the post box, the bookcase plate) are separate pieces over plain walnut, so a narrow window
// sets them closer and a phone stacks them; on a 16:10 window everything is exactly where DEsk put it.
import plates from './plates.json' with { type: 'json' };

export const PLATES = plates;
export const W = plates.w, H = plates.h;
export const PHONE = 700;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The drawer's things, in the felt's own coordinates (the 1440x181 band). Six places across the felt.
export const DRAWER_SLOTS = Object.freeze([300, 470, 640, 810, 980, 1150].map((x) => ({ x, y: 72 })));

// One rectangle, scaled: [x, y, w, h] at scale s, offset by (ox, oy).
const at = (r, s, ox = 0, oy = 0) => ({ x: ox + r[0] * s, y: oy + r[1] * s, w: r[2] * s, h: r[3] * s });

export function deskLayout(width, height) {
  const phone = width < PHONE;
  const edge = plates.edge;
  if (!phone) {
    // The desk keeps DEsk's proportions across the width; past 1.5x it stops growing and the gaps open.
    const s = clamp(width / W, 0.5, 1.5);
    const clockX = width / 2 + (edge.clock[0] + edge.clock[2] / 2 - W / 2) * s - edge.clock[2] * s / 2;
    const console = at(edge.console, s, 0, 0), clock = at(edge.clock, s, clockX - edge.clock[0] * s, 0);
    const post = at(edge.post, s, width - W * s, 0);
    const shift = { console: 0, clock: clockX - edge.clock[0] * s, post: width - W * s };
    const drawerS = width / W;
    return {
      phone, s, width, height,
      console, clock, post,
      consolePlate: at(plates.console, s, shift.console, 0),
      clockFace: at(plates.clock.faceAt, s, shift.clock, 0),
      clockKeys: at(plates.clock.keysAt, s, shift.clock, 0),
      postBox: at(plates.post1, s, shift.post, 0),
      shelfPlate: at(plates.shelfPlate, s, width - W * s, 0),
      drawer: { s: drawerS, x: 0, w: width, h: plates.drawerBand * drawerS, band: plates.drawer.bandH * drawerS },
      pull: Math.max(plates.pullH * s, 28),
      top: plates.trayBottom * s,
    };
  }
  // A phone: the clock across the top and, under it, three brass plates in a row (唱机 · 信箱 · 唱片架):
  // the Control Panel's corner and the post box would be too small to read at a phone's width. The
  // drawer's band is shown larger, its wooden sides cut off, so its things stay big enough to take.
  const s = clamp((width - 16) / edge.clock[2], 0.45, 0.9);
  const clockX = (width - edge.clock[2] * s) / 2, clockShift = clockX - edge.clock[0] * s;
  const rowY = edge.clock[3] * s + 10, gap = 8, plateW = (width - 24 - gap * 2) / 3, plateH = Math.max(44, plateW * plates.shelfPlate[3] / plates.shelfPlate[2]);
  const plate = (i) => ({ x: 12 + i * (plateW + gap), y: rowY, w: plateW, h: plateH });
  const drawerS = width / 900;
  return {
    phone, s, width, height,
    clock: at(edge.clock, s, clockShift, 0),
    clockFace: at(plates.clock.faceAt, s, clockShift, 0),
    clockKeys: at(plates.clock.keysAt, s, clockShift, 0),
    console: null, post: null,
    consolePlate: plate(0), postPlate: plate(1), shelfPlate: plate(2), postBox: null,
    drawer: { s: drawerS, x: (width - W * drawerS) / 2, w: W * drawerS, h: plates.drawerBand * drawerS, band: plates.drawer.bandH * drawerS, span: Math.min(940, width / drawerS - 140) },
    pull: 44,
    top: rowY + plateH + 12,
  };
}

// A whole-window picture (a view, 1440x900) laid to cover the window: its scale and offset, and how to
// place a rectangle given in the picture's coordinates. On a phone the picture is as tall as the window
// and can be slid sideways (pan, 0..1).
export function viewLayout(width, height, pan = 0.5) {
  const s = Math.max(width / W, height / H);
  const ox = (width - W * s) * clamp(pan, 0, 1), oy = (height - H * s) / 2;
  return { s, ox, oy, place: (r) => at(r, s, ox, oy) };
}

// The film of a move from the desk to a view (DEsk's film_play): the step for a time t in 0..1.
export function filmStep(film, t) {
  const st = film.steps;
  return st[clamp(Math.round(clamp(t, 0, 1) * (st.length - 1)), 0, st.length - 1)];
}

// The clock: which picture goes in each digit cell. The atlas holds 0-2 for the first hour digit and
// 0-5 for the tens of minutes and seconds; anything else is drawn from the cell that has it (h2 or m2).
export function clockCells(text6) {
  // text6: six digits "HHMMSS" (or "MMSS" + two small ones), and the colon lit or not
  const names = ['h1', 'h2', 'm1', 'm2', 's1', 's2'];
  return names.map((name, i) => {
    const v = Number(text6[i]);
    const own = plates.clock.places[name];
    if (Number.isNaN(v)) return { name, from: name, v: -1 };
    if (own.digits.includes(v)) return { name, from: name, v };
    const from = name === 'h1' ? 'h2' : name === 'm1' || name === 's1' ? 'm2' : name;
    return { name, from, v };
  });
}

// What the clock says. mode: 'clock' | 'date' | 'music' | 'focus'.
//   focus: { phase, remaining (ms), rounds }   music: { playing, position (s), track (1-based) }
export function clockFace(mode, { now = new Date(), focus = null, music = null } = {}) {
  const two = (n) => String(Math.max(0, Math.floor(n)) % 100).padStart(2, '0');
  if (mode === 'focus' && focus && focus.phase !== 'idle') {
    const left = Math.ceil(Math.max(0, focus.remaining) / 1000), m = Math.floor(left / 60), sec = left % 60;
    return { digits: two(Math.min(m, 99)) + two(sec) + two(focus.rounds || 0), colon: true, word: focus.paused ? 'PAUSE' : focus.phase === 'focus' ? 'FOCUS' : 'BREAK', bar: focus.progress ?? null };
  }
  if (mode === 'music' && music) {
    const p = Math.max(0, music.position || 0);
    return { digits: two(Math.min(Math.floor(p / 60), 99)) + two(p % 60) + two(music.track || 1), colon: true, word: music.playing ? 'PLAY' : 'PAUSE', bar: music.progress ?? null };
  }
  if (mode === 'date') {
    return { digits: two(now.getMonth() + 1) + two(now.getDate()) + two(now.getDay() || 7), colon: false, word: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()], bar: null };
  }
  return { digits: two(now.getHours()) + two(now.getMinutes()) + two(now.getSeconds()), colon: now.getSeconds() % 2 === 0, word: mode === 'focus' ? 'READY' : 'CLOCK', bar: null };
}

// ----- the post box's letters -----
// A letter taken out lies on the desk where DEsk lays it (zh/desk.json `letter`: 515x414 at 463,227 on
// the 1440x900 desk); on a phone it is as wide as the window allows, in the middle.
export const LETTER = Object.freeze({ w: plates.letter[2], h: plates.letter[3] });
export function letterLayout(width, height) {
  const [lx, ly, lw, lh] = plates.letter;
  if (width >= PHONE) {
    const s0 = clamp(width / W, 0.5, 1.5), s = Math.min(s0, Math.max(0.4, (height - 40) / lh));
    const cx = width / 2 + (lx + lw / 2 - W / 2) * s0;
    return { s, x: cx - lw * s / 2, y: Math.max(12, Math.min(ly * s0, height - lh * s - 28)), w: lw * s, h: lh * s };
  }
  const s = Math.min(1, (width - 16) / lw);
  return { s, x: (width - lw * s) / 2, y: Math.max(12, (height - lh * s) / 2 - 24), w: lw * s, h: lh * s };
}

// Putting it away (DEsk's tryit: 0.82 s; k = 1 - smoothstep(u) shrinks the letter to a fifth, carries its
// centre to the post box's slot and fades it once k is under 0.625). Keyframes for element.animate,
// relative to where it lies: `to` is the slot, in the same coordinates as `rect`.
export const PUT_AWAY = 0.82;
export function putAwayFrames(rect, to, n = 12) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, k = 1 - u * u * (3 - 2 * u);
    const dx = (to.x - cx) * (1 - k), dy = (to.y - cy) * (1 - k), sc = 0.2 + 0.8 * k;
    return { offset: u, opacity: Math.min(1, k * 1.6), transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sc.toFixed(3)})` };
  });
}
// DEsk's slot is at (1196, 30) on its desk: on ours, the same point of the post box wherever it stands.
export function slotPoint(lay) {
  if (!lay.postBox) return { x: lay.postPlate.x + lay.postPlate.w / 2, y: lay.postPlate.y + lay.postPlate.h / 2 }; // a phone: the 信箱 plate
  const k = lay.postBox.w / plates.post1[2];
  return { x: lay.postBox.x + (1196 - plates.post1[0]) * k, y: lay.postBox.y + 30 * k };
}

// Letters standing in the open post box (the view's 1440x900 picture), front one first: the front one
// in the slot where DEsk's welcome stands (VIEWS.post), each one behind it higher up, a little smaller
// and darker, so only its head shows -- as in DEsk's post box (docs/screenshots/post-box.jpg).
export const CARD = Object.freeze({ w: 416, h: 150, x: 512, y: 525, rise: 46, shrink: 0.03, dim: 0.075, behind: 4 });
export function boxCards(count, front = 0) {
  const cards = [];
  for (let i = front; i < count && i - front <= CARD.behind; i++) {
    const d = i - front, k = 1 - CARD.shrink * d;
    cards.push({ index: i, depth: d, k, x: CARD.x + CARD.w * (1 - k) / 2, y: CARD.y - CARD.rise * d, w: CARD.w * k, h: CARD.h * k, dim: CARD.dim * d });
  }
  return cards;
}

// The records on the desk (src/desk/RecordDesk.jsx): sleeves laid out in a grid on the left, the
// turntable on the right, a paper slip under it. Everything between the back edge and the drawer's pull.
// A phone: the turntable as a band across the top, the sleeves two to a row under it, scrolling.
export function recordDeskLayout(lay) {
  const { width, height } = lay, top = lay.top + 18 * (lay.phone ? 1 : lay.s), bottom = height - lay.pull - 14;
  const room = Math.max(120, bottom - top);
  if (lay.phone) {
    const tt = { x: 16, y: top, w: width - 32, h: Math.min((width - 32) * 0.78, 240) };
    const gy = tt.y + tt.h + 14, cols = 2, gap = 14, size = Math.floor((width - 32 - gap * (cols - 1)) / cols);
    return { phone: true, turntable: tt, slip: null, grid: { x: 16, y: gy, w: width - 32, h: bottom - gy, cols, rows: 0, size, gap, scroll: true } };
  }
  const s = lay.s, margin = 56 * s;
  const ttW = Math.min(width * 0.34, room * 0.92, 520 * s), ttH = ttW * 0.78;
  const tt = { x: width - margin - ttW, y: top + Math.max(0, (room - ttH - 110 * s) * 0.32), w: ttW, h: ttH };
  const slip = { x: tt.x + ttW * 0.06, y: tt.y + ttH + 18 * s, w: ttW * 0.88, h: 92 * s };
  const gridW = tt.x - margin * 1.6 - margin, gap = 22 * s, footer = 44 * s;
  // as many columns as fit at a sleeve of 150-230 px; rows to fill the height
  let cols = Math.max(2, Math.min(6, Math.round((gridW + gap) / (165 * s + gap))));
  let size = Math.floor((gridW - gap * (cols - 1)) / cols);
  let rows = Math.max(1, Math.floor((room - footer + gap) / (size + gap)));
  if (rows * (size + gap) - gap > room - footer) size = Math.floor((room - footer - gap * (rows - 1)) / rows);
  if (size > 196 * s) size = Math.floor(196 * s);
  const used = cols * size + gap * (cols - 1), gh = rows * size + gap * (rows - 1);
  const grid = { x: margin + (gridW - used) / 2, y: top + Math.max(0, (room - footer - gh) / 2), w: used, h: gh, cols, rows, size, gap, scroll: false };
  return { phone: false, turntable: tt, slip, grid };
}

// A small, stable tilt for each sleeve (degrees, -1.6..1.6), so the spread looks laid by hand.
export function sleeveTilt(id = '') {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 33 - 16) / 10;
}
