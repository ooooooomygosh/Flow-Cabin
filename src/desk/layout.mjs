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
