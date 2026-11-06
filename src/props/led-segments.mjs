// The red LED clock's glass: seven-segment digits, fourteen-segment letters, a five-by-seven
// dot matrix. Geometry only — each function returns plain data the SVG component draws.
// Ported from DEsk's try-it page (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk
// authors, index.html: segPoly, strokes, SEG7, SEG14, FONT, dots).

// One segment from (u1,v1) to (u2,v2), pointed at both ends, t thick, in a box whose top
// leans right by a tenth of its height. Returns the six corner points.
export function segPoly(box, u1, v1, u2, v2, t, inset) {
  let dx = u2 - u1, dy = v2 - v1; const length = Math.hypot(dx, dy); dx /= length; dy /= length;
  u1 += dx * inset; v1 += dy * inset; u2 -= dx * inset; v2 -= dy * inset;
  const nx = -dy * t / 2, ny = dx * t / 2, hx = dx * t / 2, hy = dy * t / 2;
  const pu = [u1, u1 + hx + nx, u2 - hx + nx, u2, u2 - hx - nx, u1 + hx - nx];
  const pv = [v1, v1 + hy + ny, v2 - hy + ny, v2, v2 - hy - ny, v1 + hy - ny];
  return pu.map((u, k) => [box.x + u + box.h * 0.1 * (1 - pv[k] / box.h), box.y + pv[k]]);
}

// The fourteen strokes in hardware order A B C D E F G1 G2 H J K L M N.
export function strokes(w, h, t) {
  const e = t / 2, gap = t * 0.18, dt = t * 0.8, m = h / 2, c = w / 2, d = t * 0.55;
  return [[e, e, w - e, e, t, gap], [w - e, e, w - e, m, t, gap], [w - e, m, w - e, h - e, t, gap], [e, h - e, w - e, h - e, t, gap],
    [e, m, e, h - e, t, gap], [e, e, e, m, t, gap], [e, m, c, m, t, gap], [c, m, w - e, m, t, gap],
    [e + d, e + d, c, m, dt, d], [c, e, c, m, dt, gap + t * 0.35], [w - e - d, e + d, c, m, dt, d],
    [c, m, w - e - d, h - e - d, dt, d], [c, m, c, h - e, dt, gap + t * 0.35], [c, m, e + d, h - e - d, dt, d]];
}

export const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
export const SEG14 = { '0': 0x243F, '1': 0x0006, '2': 0x00DB, '3': 0x008F, '4': 0x00E6, '5': 0x00ED, '6': 0x00FD, '7': 0x0007, '8': 0x00FF, '9': 0x00EF,
  A: 0x00F7, B: 0x128F, C: 0x0039, D: 0x120F, E: 0x0079, F: 0x0071, G: 0x00BD, H: 0x00F6, I: 0x1209, J: 0x001E, K: 0x0C70, L: 0x0038, M: 0x0536,
  N: 0x0936, O: 0x003F, P: 0x00F3, Q: 0x083F, R: 0x08F3, S: 0x00ED, T: 0x1201, U: 0x003E, V: 0x2430, W: 0x2836, X: 0x2D00, Y: 0x1500, Z: 0x2409, '/': 0x2400, '-': 0x00C0 };
export const FONT = { '0': [0x3E, 0x51, 0x49, 0x45, 0x3E], '1': [0x00, 0x42, 0x7F, 0x40, 0x00], '2': [0x42, 0x61, 0x51, 0x49, 0x46], '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7F, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39], '6': [0x3C, 0x4A, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36], '9': [0x06, 0x49, 0x49, 0x29, 0x1E], A: [0x7E, 0x11, 0x11, 0x11, 0x7E], B: [0x7F, 0x49, 0x49, 0x49, 0x36],
  C: [0x3E, 0x41, 0x41, 0x41, 0x22], D: [0x7F, 0x41, 0x41, 0x22, 0x1C], E: [0x7F, 0x49, 0x49, 0x49, 0x41], F: [0x7F, 0x09, 0x09, 0x09, 0x01],
  G: [0x3E, 0x41, 0x49, 0x49, 0x7A], H: [0x7F, 0x08, 0x08, 0x08, 0x7F], I: [0x00, 0x41, 0x7F, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3F, 0x01],
  K: [0x7F, 0x08, 0x14, 0x22, 0x41], L: [0x7F, 0x40, 0x40, 0x40, 0x40], M: [0x7F, 0x02, 0x0C, 0x02, 0x7F], N: [0x7F, 0x04, 0x08, 0x10, 0x7F],
  O: [0x3E, 0x41, 0x41, 0x41, 0x3E], P: [0x7F, 0x09, 0x09, 0x09, 0x06], Q: [0x3E, 0x41, 0x51, 0x21, 0x5E], R: [0x7F, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7F, 0x01, 0x01], U: [0x3F, 0x40, 0x40, 0x40, 0x3F], V: [0x1F, 0x20, 0x40, 0x20, 0x1F],
  W: [0x3F, 0x40, 0x38, 0x40, 0x3F], X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00], ':': [0x00, 0x36, 0x36, 0x00, 0x00], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '%': [0x23, 0x13, 0x08, 0x64, 0x62], '+': [0x08, 0x08, 0x3E, 0x08, 0x08], '<': [0x08, 0x14, 0x22, 0x41, 0x00], '>': [0x00, 0x41, 0x22, 0x14, 0x08] };

// A seven-segment digit at (x,y), w by h. d: 0-9, -1 blank, -2 dash. Seven polygons, each lit or not.
export function digit(x, y, w, h, d) {
  const box = { x, y, h }, t = w * 0.19, code = d >= 0 ? SEG7[d] : d === -2 ? 0x40 : 0, s = strokes(w, h, t);
  s[6] = [t / 2, h / 2, w - t / 2, h / 2, t, t * 0.18];   // the middle bar whole
  return s.slice(0, 7).map((q, i) => ({ points: segPoly(box, ...q), on: Boolean(code & (1 << i)) }));
}

// A row of digits ("12:34" without the colon, '-' a dash). Returns { digits, width }.
export function digitRow(text, x, y, w, h, gap) {
  const out = []; let cx = x;
  for (const ch of text) {
    out.push({ x: cx, segments: digit(cx, y, w, h, ch >= '0' && ch <= '9' ? Number(ch) : ch === '-' ? -2 : -1) });
    cx += w + gap;
  }
  return { digits: out, width: Math.max(0, cx - x - gap) };
}

// Fourteen-segment letters (the small caps of the glass). Returns one segment list per character.
export function letters(text, x, y, w, h, gap) {
  return [...text.toUpperCase()].map((ch, i) => {
    const code = SEG14[ch] || 0;
    return strokes(w, h, w * 0.17).map((q, k) => ({ points: segPoly({ x: x + i * (w + gap), y, h }, ...q), on: Boolean(code & (1 << k)) }));
  });
}

// Dot-matrix print: circles centre/radius, with `on` for the lit ones. align -1 left, 0 centre, 1 right of x.
export function dotMatrix(text, x, y, pitch, align = -1) {
  text = text.toUpperCase();
  const width = text.length ? (text.length * 6 - 1) * pitch : 0, r = pitch * 0.46, dots = [];
  const left = x - (align === 0 ? width / 2 : align > 0 ? width : 0);
  [...text].forEach((ch, i) => {
    const glyph = FONT[ch];
    for (let c = 0; c < 5; c++) for (let row = 0; row < 7; row++) {
      dots.push({ cx: left + i * 6 * pitch + c * pitch + pitch / 2, cy: y + row * pitch + pitch / 2, r, on: Boolean(glyph && (glyph[c] >> row) & 1) });
    }
  });
  return { dots, width };
}

export const pointsAttr = (points) => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
