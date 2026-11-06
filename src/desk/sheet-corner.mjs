// A sheet's turned-down corner, and what becomes of a sheet: folded away into a packet on the desk,
// opened out below the back edge, or thrown away. Pure functions, tested (src/desk/desk.test.mjs).
//
// Ported from DEsk's try-it compositor (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors:
// tryit.js curlTick, curlFrame, cornerAt, slotXY, MAX_RECT, after wm.c curls_tick). The pictures of the
// corner are DEsk's own (public/desk/curl.webp; its rectangles, sizes and the printed items' boxes are
// plates.json `curl`). What changed: the corner's state is a plain object and curlTick reports what was
// chosen instead of calling the compositor, so a React dialog can carry it out.
import plates from './plates.json' with { type: 'json' };

export const CURL = plates.curl;
// The three things printed on the back of the corner, in the atlas' order.
export const CORNER_ACTS = Object.freeze([
  { id: 'fold', name: '折起' },
  { id: 'max', name: '展开' },
  { id: 'throw', name: '丢掉' },
]);
// DEsk's opened-out sheet: below the desk's back edge, the full width, on its 1440x900 desk.
export const MAX_RECT = Object.freeze([0, 86, 1440, 814]);
export const DESK_W = 1440, DESK_H = 900;
// The blank packet a sheet folds into (public/desk/packet.webp, from DEsk's packets).
export const PACKET = Object.freeze({ w: 190, h: 141 });

export const newCurl = (set = CURL) => ({ s: set.rest, v: 0, near: false, hoverAt: 0, hot: -1, act: -1, actAt: 0, done: false });

// One step of the corner's spring (dt and t in seconds). Returns { busy, fire }: busy while it still
// moves or waits; fire is the index of the act to carry out now (0 fold, 1 open out, 2 throw), or -1.
export function curlTick(c, dt, t, set = CURL, cut = false) {
  const open = set.open, rest = set.rest;
  let fire = -1;
  if (!c.near && c.hoverAt > 0 && t - c.hoverAt >= 0.5) { c.near = true; c.hoverAt = 0; }
  let to = c.near ? open : (c.hoverAt > 0 ? rest * 1.7 : rest);
  if (c.act >= 0) {
    const e = t - c.actAt;
    if (c.act === 0) {
      // turned further, as if to fold the sheet in -- then it is
      to = open * 1.55;
      if (e > 0.20) { Object.assign(c, { act: -1, near: false, hot: -1, s: rest, v: 0 }); return { busy: true, fire: 0 }; }
    } else if (c.act === 1) {
      // laid flat, and the sheet opens out
      to = rest * 0.15;
      if (e > 0.16) { Object.assign(c, { act: -1, near: false, hot: -1 }); fire = 1; to = rest; }
    } else {
      // peeled right back, the way a sheet is torn off a pad
      to = open * 1.9;
      if (e > 0.22 && !c.done) { c.done = true; return { busy: true, fire: 2 }; }
    }
  }
  const k = 240, cc = 2 * 0.60 * 15.49;
  c.v += (k * (to - c.s) - cc * c.v) * dt;
  c.s += c.v * dt;
  if (cut) { c.s = to; c.v = 0; }
  if (Math.abs(to - c.s) < 0.15 && Math.abs(c.v) < 2) { c.s = to; c.v = 0; return { busy: c.act >= 0 || c.hoverAt > 0, fire }; }
  return { busy: true, fire };
}

// The picture of the corner nearest a size, lit (one item underlined) or not: [size, [x, y, w, h]].
export function curlFrame(set, sz, hot) {
  if (hot >= 0 && Math.abs(sz - set.open) < 10) {
    const hs = set.hot_sizes.reduce((a, b) => Math.abs(b - sz) < Math.abs(a - sz) ? b : a);
    return [hs, set.rects[hs + ':' + hot]];
  }
  const s = set.sizes.reduce((a, b) => Math.abs(b - sz) < Math.abs(a - sz) ? b : a);
  return [s, set.rects[s + ':-1']];
}
// The square the corner picture of size cs is drawn in, at the sheet's top-right.
export const curlBox = (cs) => Math.ceil(Math.max(cs, 1) * 1.12 + 18);

// What is under the pointer on a sheet's corner: the fold, the turned-up flap, and which printed item.
// rect is the sheet's { x, y, w } on screen.
export function cornerAt(rect, c, px, py, set = CURL) {
  const { x, y, w } = rect;
  const dx = x + w - px, ly = py - y;
  const onFold = dx >= -6 && dx <= set.rest * 2.6 && ly >= -6 && ly <= set.rest * 2.6;
  const near = dx >= -6 && dx <= set.open * 1.30 && ly >= -6 && ly <= set.open * 1.30;
  let hot = -1;
  if (c.near && near) {
    const B = set.box, lx = px - (x + w - B);
    set.items.forEach((r, i) => { if (lx >= r[0] && lx < r[0] + r[2] && ly >= r[1] && ly < r[1] + r[3]) hot = i; });
  }
  return { onFold, near, hot };
}

// Where the k-th folded packet lies: a row along the front of the desk, from the left (DEsk slotXY),
// for a window width x height whose desk is drawn at scale s, with the packet `scale` of its picture.
export function slotXY(k, { width = DESK_W, height = DESK_H, s = 1, scale = 0.8 } = {}) {
  const pw = PACKET.w * scale * s, ph = PACKET.h * scale * s, gap = 18 * s;
  const per = Math.max(1, Math.floor((width - 48 * s) / (pw + gap)));
  return { x: 36 * s + (k % per) * (pw + gap), y: height - 32 * s - ph - gap - Math.floor(k / per) * (ph + 16 * s), w: pw, h: ph };
}

// The opened-out sheet's rectangle for a window, in px: DEsk's MAX_RECT, its top at the desk's back edge.
export function maxRect(width, height, top = MAX_RECT[1] * Math.min(1.5, Math.max(0.5, width / DESK_W))) {
  const t = Math.round(Math.min(top, height * 0.3));
  return { x: 0, y: t, w: width, h: height - t };
}
