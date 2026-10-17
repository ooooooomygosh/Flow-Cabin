// A top-down pixel record (48×48 art px) for the record card, editor preview and
// preset swatches. Pure: returns RGBA pixels the caller puts on a canvas and CSS
// enlarges by a whole factor. Same rules as the deck: one lamp at the top left (lit
// rim and two stepped sheen wedges, no blur), grooves in rotationally symmetric
// bands (so it can never shimmer), the label in the cover's colour, and the user's
// vinyl style (base colour, transparency, 1–3 colour radial splatter) honoured.
import { hashString, seededRandom } from '../player/pixel-cover.mjs';

export const RECORD_PX = 48;
const LAMP = '#e4dfcc', INK = '#0d0805', PAPER = '#fff7e6';
const rgb = (hex) => { const n = parseInt(String(hex || '').replace('#', '').slice(0, 6), 16); return Number.isFinite(n) ? [n >> 16, (n >> 8) & 255, n & 255] : [36, 26, 15]; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const TAU = Math.PI * 2, angleGap = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

// Streaks thrown outward from the label: angle, angular width, start and reach, colour slot.
// Slot weights follow the editor's copy: one main colour, a second for weave, a dot of a third.
function streaks(seed, colours) {
  const rand = seededRandom(hashString(`splatter:${seed}`)), weights = [[1], [.7, .3], [.58, .3, .12]][colours - 1] || [1];
  return Array.from({ length: 16 }, () => {
    let pick = rand(), slot = 0; while (slot < weights.length - 1 && pick > weights[slot]) pick -= weights[slot++];
    return { angle: rand() * TAU, width: .07 + rand() * .12, from: .36 + rand() * .12, reach: .3 + rand() * .32, slot };
  });
}

export function recordPixels({ base = '#241a0f', opacity = 100, splatter = false, splashes = [], label = '#c9a47a', seed = '' } = {}) {
  const n = RECORD_PX, c = n / 2, out = new Uint8ClampedArray(n * n * 4), alpha = Math.round(255 * Math.max(.15, Math.min(1, opacity / 100)));
  const body = rgb(base), tag = rgb(label), paint = splatter && splashes.length ? splashes.slice(0, 3).map(rgb) : [];
  const thrown = paint.length ? streaks(seed, paint.length) : [], rand = seededRandom(hashString(`drops:${seed}`));
  const drops = paint.length ? Array.from({ length: 22 }, () => ({ r: .42 + rand() * .52, a: rand() * TAU, slot: Math.floor(rand() * paint.length * .99) })) : [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + .5 - c, dy = y + .5 - c, d = Math.hypot(dx, dy) / c, a = Math.atan2(dy, dx), i = (y * n + x) * 4;
    if (d > 1) continue;
    let colour, a255 = alpha;
    if (d < .07) { colour = rgb(INK); a255 = 255; }                                   // spindle hole
    else if (d < .34) {                                                                  // label
      a255 = 255; colour = tag;
      if (d > .3) colour = mix(tag, rgb(INK), .32);                                      // pressed label edge
      else if (d > .16 && d < .26 && angleGap(a, -2.36) < .7) colour = mix(tag, rgb(PAPER), .4);
      else if (d > .14 && d < .2) colour = mix(tag, rgb(INK), .12);                     // printed ring
    } else {
      colour = body;
      for (const s of thrown) if (d >= s.from && d <= s.from + s.reach && angleGap(a, s.angle) < s.width * (1 - (d - s.from) / s.reach * .6)) colour = paint[s.slot];
      for (const p of drops) if (Math.hypot(dx - Math.cos(p.a) * p.r * c, dy - Math.sin(p.a) * p.r * c) < .9) colour = paint[p.slot];
      if (d > .4 && d < .955) {
        const band = Math.floor(d * n);
        if (band % 3 === 0) colour = mix(colour, rgb(INK), .28);                         // grooves
        if (Math.abs(d - .62) < .012 || Math.abs(d - .8) < .012) colour = mix(colour, rgb(INK), .45); // track gaps
        const lamp = Math.min(angleGap(a, -2.36), angleGap(a, .78) + .25);               // wedge toward the lamp, fainter opposite
        if (lamp < .13) colour = mix(colour, rgb(LAMP), .26); else if (lamp < .3) colour = mix(colour, rgb(LAMP), .12);
      } else if (d >= .955) colour = angleGap(a, -2.36) < 1.1 ? mix(colour, rgb(LAMP), .3) : mix(colour, rgb(INK), .4); // lit / shaded rim
      else colour = mix(colour, rgb(LAMP), .07);                                         // smooth run-out by the label
    }
    out[i] = colour[0]; out[i + 1] = colour[1]; out[i + 2] = colour[2]; out[i + 3] = a255;
  }
  return out;
}
