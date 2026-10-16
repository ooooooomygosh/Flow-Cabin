// Pixel painters for the window sky (behind the room art, seen through its transparent sky)
// and the window weather (in front of the art, inside the glass). Both write straight into an
// RGBA byte buffer at 1 canvas px = 4 art px, so every mark lands on the room's own pixel grid
// with no anti-aliasing. Coverage is ordered (Bayer) dithering, never soft alpha ramps.
// Pure and allocation-free per frame (callers own the buffers), so node tests can render it.
import { hash, lightningAt } from './sky-weather.mjs';

export const CELL = 4; // art px per canvas px
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + .5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const fract = (v) => v - Math.floor(v);

// Window description (art px, from scene-catalog): box [x, y, w, h]; shape rect | ellipse | arch
// ({ cx, cy, rx, ry } relative to the box; arch = half-ellipse top over a rectangle); optional
// panes (glass rects; elsewhere is frame) and mullions (frame rects); horizon = fraction of the
// box height where the painted land / sea starts (the sun and moon set behind it).
export function insideShape(shape, x, y) {
  if (!shape || shape.type === 'rect') return true;
  const dx = (x - shape.cx) / shape.rx, dy = (y - shape.cy) / shape.ry;
  if (shape.type === 'arch' && y >= shape.cy) return Math.abs(dx) <= 1;
  return dx * dx + dy * dy <= 1;
}
const inRects = (rects, x, y) => rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
export function windowMasks(win) {
  const [, , w, h] = win.box, width = Math.ceil(w / CELL), height = Math.ceil(h / CELL);
  const back = new Uint8Array(width * height), front = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ax = x * CELL + CELL / 2, ay = y * CELL + CELL / 2, i = y * width + x;
    if (ax >= w || ay >= h || !insideShape(win.shape, ax, ay)) continue;
    back[i] = 1;
    front[i] = (!win.panes || inRects(win.panes, ax, ay)) && !(win.mullions && inRects(win.mullions, ax, ay)) ? 1 : 0;
  }
  return { width, height, back, front };
}
// Colour helpers: '#rrggbb[aa]' → [r, g, b, a(0..1)].
export const rgba = (hex, alpha) => { const h = hex.slice(1), a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha ?? a]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t];
// Source-over into a straight-alpha RGBA buffer.
function put(data, i, c, alpha = c[3]) {
  if (alpha <= 0) return;
  const o = i * 4, da = data[o + 3] / 255, a = alpha + da * (1 - alpha);
  if (a <= 0) return;
  for (let k = 0; k < 3; k++) data[o + k] = (c[k] * alpha + data[o + k] * da * (1 - alpha)) / a;
  data[o + 3] = a * 255;
}

// Derived palette for one sky sample (computed once a minute, not per frame).
export function skyPalette(colors, layers) {
  const top = rgba(colors.top, 1), horizon = rgba(colors.horizon, 1), light = colors.light ?? 1;
  const white = [248, 246, 236, 1], dusk = mix(horizon, white, .35);
  const grey = Math.max(layers.rain, layers.storm * 1.1, layers.snow * .6, layers.fog * .5);
  const body = mix(mix(dusk, white, .55 * light), [96, 104, 120, 1], Math.min(.75, grey * .7) * (.4 + light * .6));
  return {
    top, horizon, light,
    cloudLit: mix(body, mix(horizon, white, .7), .45), cloud: body, cloudShade: mix(body, top, .45), cloudDeep: mix(body, [40, 44, 60, 1], .45),
    fog: mix(mix(horizon, white, .45), [170, 176, 186, 1], .4), rain: mix([200, 216, 240, 1], horizon, .2), snow: [236, 242, 252, 1],
    star: [255, 246, 214, 1], starDim: mix([255, 246, 214, 1], top, .55),
    moon: [246, 236, 202, 1], moonShade: [214, 200, 160, 1], moonDark: mix(top, [255, 255, 255, 1], .08), moonHalo: mix(top, [246, 236, 202, 1], .25),
    sun: mix([255, 250, 224, 1], horizon, Math.max(0, .7 - light * .7)), sunHalo: mix(horizon, [255, 236, 190, 1], .5),
    flash: [226, 230, 255, 1], bolt: [255, 255, 255, 1], glass: [214, 230, 255, 1], dropLit: [236, 246, 255, 1], dropShade: mix([60, 74, 98, 1], top, .3)
  };
}

// Sun and moon positions in canvas px, from altitude/azimuth (a fixed south-facing view).
export function bodies(sky, mask, horizon = .72) {
  const { width, height } = mask, ground = Math.round(height * horizon), span = Math.max(4, ground - Math.round(height * .14));
  const sunAz = ((sky.azimuth ?? 180) - 60) / 240;
  const sun = { x: Math.round(width * (.12 + .76 * Math.max(0, Math.min(1, sunAz)))), y: Math.round(ground - Math.min(1, sky.altitude / 50) * span), r: Math.max(2, Math.round(Math.min(width, height) / 18)) };
  sun.visible = sky.altitude > -1.5 && sun.y < ground + sun.r;
  const moonAlt = sky.moon?.altitude ?? -10;
  const moon = { x: Math.round(width * .7), y: Math.round(ground - Math.min(1, Math.max(0, moonAlt) / 50) * span * .9 - 2), r: Math.max(3, Math.round(Math.min(width, height) / 13)) };
  moon.visible = moonAlt > 0 && sky.altitude < 2 && (sky.moon?.fraction ?? 0) > .03;
  return { sun, moon, ground };
}

const STAR_COUNT = 0.022; // stars per canvas px
function paintStars(data, mask, pal, level, seconds, twinkle) {
  const { width, height, back } = mask, count = Math.round(width * height * STAR_COUNT);
  for (let s = 0; s < count; s++) {
    const x = Math.floor(hash(s * 3.1 + 1) * width), y = Math.floor(hash(s * 7.7 + 2) * height * .8), i = y * width + x;
    if (!back[i] || hash(s * 1.3 + 9) > level) continue;
    let bright = hash(s + 40) > .72;
    if (twinkle && hash(s * 5.1 + Math.floor(seconds * 2)) > .8) bright = !bright;
    put(data, i, bright ? pal.star : pal.starDim, bright ? 1 : .8);
    if (bright && hash(s + 70) > .8 && level > .6) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < width && yy < height && back[yy * width + xx]) put(data, yy * width + xx, pal.starDim, .55); }
  }
}
// Moon phase: the terminator is an ellipse; waxing lights the right limb (northern sky).
export function moonLit(nx, ny, phase) {
  const s = Math.sqrt(Math.max(0, 1 - ny * ny)), k = Math.cos(phase * 2 * Math.PI);
  return phase < .5 ? nx > k * s : nx < -k * s;
}
function paintDisc(data, mask, cx, cy, r, inside) {
  const { width, height, back } = mask;
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(height - 1, cy + r + 2); y++) for (let x = Math.max(0, cx - r - 2); x <= Math.min(width - 1, cx + r + 2); x++) {
    const i = y * width + x; if (!back[i]) continue;
    const nx = (x + .5 - cx) / r, ny = (y + .5 - cy) / r; inside(data, i, nx, ny, nx * nx + ny * ny, x, y);
  }
}
function paintMoon(data, mask, pal, moon, phase) {
  paintDisc(data, mask, moon.x, moon.y, moon.r, (d, i, nx, ny, r2, x, y) => {
    if (r2 > 1) { if (r2 < 1.7 && bayer(x, y) < .5) put(d, i, pal.moonHalo, .55); return; }
    if (!moonLit(nx, ny, phase)) { put(d, i, pal.moonDark); return; }
    const crater = (Math.abs(nx + .25) < .22 && Math.abs(ny + .2) < .18) || (Math.abs(nx - .3) < .16 && Math.abs(ny - .35) < .14);
    put(d, i, crater || nx + ny > .9 ? pal.moonShade : pal.moon);
  });
}
function paintSun(data, mask, pal, sun) {
  paintDisc(data, mask, sun.x, sun.y, sun.r, (d, i, nx, ny, r2, x, y) => {
    if (r2 <= 1) put(d, i, pal.sun); else if (r2 < 2.2 && bayer(x, y) < (2.2 - r2) / 1.2 * .75) put(d, i, pal.sunHalo, .8);
  });
}
// Clouds: each is a few overlapping puffs (after Skycons, CC0) drifting with the wind; lit on
// top, shaded underneath, dissolved by Bayer threshold while the layer fades in or out.
const CLOUDS = Array.from({ length: 6 }, (_, c) => ({ x0: hash(c * 9.1 + 3), y: .1 + hash(c * 4.7 + 1) * .34, scale: .7 + hash(c * 2.3 + 5) * .6, speed: .6 + hash(c * 6.1 + 2) * .8, puffs: Array.from({ length: 5 }, (_, p) => [(p - 2) * .62 + (hash(c * 11 + p) - .5) * .3, -Math.sin((p + .5) / 5 * Math.PI) * .45 + (hash(c * 13 + p) - .5) * .2, .55 + hash(c * 17 + p) * .45]) }));
function paintClouds(data, mask, pal, amount, wind, seconds) {
  const { width, height, back } = mask, count = Math.min(CLOUDS.length, Math.ceil(amount * CLOUDS.length)), unit = Math.max(3, Math.min(width, height) / 9);
  for (let c = 0; c < count; c++) {
    const cloud = CLOUDS[c], weight = Math.min(1, amount * CLOUDS.length - c), r0 = unit * cloud.scale * (.8 + amount * .5), spanX = width + r0 * 4;
    const cx = Math.round(fract(cloud.x0 + seconds * (.15 + wind) * cloud.speed / spanX * .25) * spanX - r0 * 2), cy = Math.round(height * cloud.y);
    const left = Math.max(0, Math.floor(cx - r0 * 2.2)), right = Math.min(width - 1, Math.ceil(cx + r0 * 2.2)), top = Math.max(0, Math.floor(cy - r0 * 1.3)), bottom = Math.min(height - 1, Math.ceil(cy + r0 * .7));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * width + x; if (!back[i] || bayer(x, y) >= weight) continue;
      let inside = false, edge = 0; // depth inside the deepest puff: only the outer rim is lit
      for (const [px, py, pr] of cloud.puffs) { const dx = x + .5 - (cx + px * r0), dy = y + .5 - (cy + py * r0), rr = pr * r0, d = Math.hypot(dx, dy) - rr; if (d <= 0) { inside = true; edge = Math.max(edge, -d / rr); } }
      if (!inside || y + .5 > cy + r0 * .45) continue;
      const below = (y + .5 - (cy - r0 * .6)) / (r0 * 1.05);
      put(data, i, below > .78 ? pal.cloudDeep : below > .5 ? pal.cloudShade : edge < .18 && below < .3 ? pal.cloudLit : pal.cloud);
    }
  }
}
// Overcast veil: a flat grey ceiling that deepens with heavy cloud, two solid steps with a
// two-row dithered seam each (a ramp, not a checkerboard over the whole sky).
function paintVeil(data, mask, pal, amount) {
  if (amount <= .55) return;
  const { width, height, back } = mask, strength = (amount - .55) / .45, low = Math.round(height * (.2 + .45 * strength)), high = Math.round(low * .45);
  for (let y = 0; y < Math.min(height, low + 2); y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; if (!back[i]) continue;
    const seam = (edge) => y >= edge && y < edge + 2 ? bayer(x, y) < (edge + 2 - y) / 3 : y < edge;
    if (seam(high)) put(data, i, pal.cloudDeep, .55 + strength * .3);
    else if (seam(low)) put(data, i, pal.cloudShade, .5 + strength * .3);
  }
}
function paintBolt(data, mask, pal, seed) {
  const { width, height, back } = mask; let x = Math.floor(width * (.2 + hash(seed + .2) * .6));
  const end = Math.floor(height * (.45 + hash(seed + .7) * .3));
  for (let y = 0; y < end; y++) {
    if (hash(seed * 3 + y) > .55) x += hash(seed * 5 + y) > .5 ? 1 : -1;
    const i = y * width + x; if (x >= 0 && x < width && back[i]) put(data, i, pal.bolt);
    if (y > 4 && hash(seed * 7 + y) > .93) for (let k = 1; k < 5; k++) { const bx = x + k, by = y + k, j = by * width + bx; if (bx < width && by < height && back[j]) put(data, j, pal.flash, .9); }
  }
}

// Paints the sky window (under the art). Returns true when something there moves.
export function paintSky(data, mask, frame) {
  data.fill(0);
  const { layers, pal, sky, seconds = 0, reduced = false, bodies: b } = frame, overcast = Math.max(layers.clouds, layers.storm);
  const starLevel = Math.max(sky.stars ?? 0, layers.starry) * (1 - Math.min(1, overcast * 1.2));
  if (starLevel > .02) paintStars(data, mask, pal, starLevel, seconds, layers.starry > .5 && !reduced);
  if (b.moon.visible || layers.starry > .5) { const moon = b.moon.visible ? b.moon : { ...b.moon, y: Math.round(mask.height * .22) }; if (overcast < .85) paintMoon(data, mask, pal, moon, sky.moon?.phase ?? .5); }
  if (b.sun.visible && layers.starry <= .5 && overcast < .9) paintSun(data, mask, pal, b.sun);
  paintVeil(data, mask, pal, overcast);
  if (layers.fog > .02) { const { back } = mask; for (let i = 0; i < back.length; i++) if (back[i]) put(data, i, pal.fog, layers.fog * .5); } // distant haze
  if (layers.clouds > .02) paintClouds(data, mask, pal, layers.clouds, layers.wind, reduced ? 0 : seconds);
  if (!reduced) {
    const { flash, seed } = lightningAt(seconds, layers.storm);
    if (flash) { const { back } = mask; for (let i = 0; i < back.length; i++) if (back[i]) put(data, i, pal.flash, flash === 2 ? .62 : .3); if (flash === 2) paintBolt(data, mask, pal, seed); }
  }
  return layers.clouds > .02 || layers.storm > .05 || layers.starry > .5;
}

const DROPS = Array.from({ length: 64 }, (_, i) => ({ x0: hash(i + 300), y0: hash(i + 400), speed: .9 + hash(i + 500) * .6, len: 3 + Math.floor(hash(i + 600) * 3), tone: hash(i + 700) }));
const FLAKES = Array.from({ length: 64 }, (_, i) => { const depth = hash(i + 9); return { depth, speed: 9 + depth * 21, x0: hash(i + 21), y0: hash(i + 61), alpha: .5 + depth * .45 }; });
const BEADS = Array.from({ length: 12 }, (_, i) => ({ x: hash(i + 800), y: hash(i + 900) * .8, cycle: 6 + hash(i + 1000) * 9, hold: .35 + hash(i + 1100) * .4, run: 3 + Math.floor(hash(i + 1200) * 6) }));
// Paints the weather in the glass (over the art). Returns true when something moves.
export function paintWeather(data, mask, frame) {
  data.fill(0);
  const { width, height, front } = mask, { layers, pal, seconds: s = 0, reduced = false } = frame, wind = layers.wind;
  if (layers.fog > .02) {
    // Three drifting banks with wavy tops: a translucent core and a dithered fringe, 1 px per 3 s.
    const drift = reduced ? 0 : Math.floor(s / 3);
    [[.5, .09, 1], [.66, .11, -1], [.82, .1, 1]].forEach(([center, thick, dir], band) => {
      const half = height * thick * (.6 + layers.fog * .5);
      for (let x = 0; x < width; x++) {
        const cy = height * center + Math.round(Math.sin((x + drift * dir) * .21 + band * 2.1) * 1.5 + Math.sin((x - drift * dir) * .07 + band) * 2);
        for (let y = Math.max(0, Math.floor(cy - half)); y < Math.min(height, Math.ceil(cy + half)); y++) {
          const i = y * width + x; if (!front[i]) continue;
          const core = 1 - Math.abs(y + .5 - cy) / half;
          if (core > .3 || bayer(x + drift * dir, y) < core / .3 * .45) put(data, i, pal.fog, .32 + layers.fog * .18);
        }
      }
    });
  }
  const slant = -wind * .9;
  const rainCount = Math.round(DROPS.length * Math.min(1, layers.rain));
  for (let d = 0; d < rainCount; d++) {
    const drop = DROPS[d], span = height + drop.len + 4, y = Math.floor(fract(drop.y0 + s * drop.speed * 1.4) * span) - drop.len;
    const x0 = Math.floor(fract(drop.x0 + (y / height) * slant * .25 + s * wind * .02) * (width + 4)) - 2;
    for (let k = 0; k < drop.len; k++) {
      const yy = y - k, xx = Math.round(x0 - k * slant); if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
      const i = yy * width + xx; if (front[i]) put(data, i, pal.rain, k ? .3 + drop.tone * .25 - k * .04 : .78);
    }
  }
  const snowCount = Math.round(FLAKES.length * Math.min(1, layers.snow));
  for (let f = 0; f < snowCount; f++) {
    const flake = FLAKES[f], x = Math.floor(fract(flake.x0 + Math.sin(s * .21 + f) * .035 + s * (.003 + flake.depth * .002 + wind * .004)) * width);
    const y = Math.floor(((flake.y0 * height * CELL + s * flake.speed) % (height * CELL)) / CELL), i = y * width + x;
    if (front[i]) put(data, i, pal.snow, flake.alpha);
    if (flake.depth > .82 && x + 1 < width && front[i + 1]) put(data, i + 1, pal.snow, flake.alpha * .7);
  }
  // Beads on the glass while it rains: they cling, then run down in 1 px steps (Weatherd-style).
  const wet = Math.min(1, (layers.rain - .2) * 1.6), beads = Math.round(BEADS.length * Math.max(0, wet));
  for (let b = 0; b < beads; b++) {
    const bead = BEADS[b], p = reduced ? 0 : fract(s / bead.cycle + bead.x), slide = Math.max(0, p - bead.hold) / (1 - bead.hold);
    const x = Math.floor(bead.x * width), y = Math.floor(bead.y * height) + Math.floor(slide * bead.run * 3);
    for (const [dx, dy, c, a] of [[0, 0, pal.dropLit, .95], [0, 1, pal.dropShade, .6], [1, 1, pal.dropLit, .35]]) {
      const xx = x + dx, yy = y + dy; if (xx < width && yy < height && front[yy * width + xx]) put(data, yy * width + xx, c, a);
    }
  }
  if (!reduced) { const { flash } = lightningAt(s, layers.storm); if (flash) for (let i = 0; i < front.length; i++) if (front[i] && bayer(i % width, Math.floor(i / width)) < (flash === 2 ? .5 : .25)) put(data, i, pal.glass, .35); }
  return layers.rain > .02 || layers.snow > .02 || layers.fog > .02;
}
// Frames per second each mix needs: falling rain/snow 12; drifting cloud/fog/twinkle 4; else 0 (still).
export function weatherFps(layers, low = false) {
  if (layers.rain > .02 || layers.snow > .02 || layers.storm > .05) return low ? 8 : 12;
  if (layers.clouds > .02 || layers.fog > .02 || layers.starry > .5) return low ? 2 : 4;
  return 0;
}
