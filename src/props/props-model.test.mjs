import test from 'node:test';
import assert from 'node:assert/strict';
import { spring, drawerEase, lookEase, springLinear, PACES, readPace, savePace, moveSeconds, PACE_KEY } from './motion.mjs';
import { LAMP, lampFor, shadowOffset, lampStrength } from './lamp.mjs';
import { noise2p, fbm, paperTile, grainTile } from './paper-noise.mjs';
import { digit, digitRow, letters, dotMatrix, strokes, segPoly, SEG7, SEG14, FONT } from './led-segments.mjs';

test('a spring starts at 0, overshoots when underdamped and lands exactly on 1', () => {
  assert.equal(spring(0, 0.8, 12), 0);
  assert.equal(spring(1, 0.8, 12), 1);
  assert(Math.max(...Array.from({ length: 101 }, (_, i) => drawerEase(i / 100))) > 1, 'drawer overshoots');
  assert(Math.max(...Array.from({ length: 101 }, (_, i) => lookEase(i / 100))) > 1, 'look overshoots');
  assert(drawerEase(0.5) > 0.5, 'a drawer is mostly out by half time');
  for (let i = 0; i <= 100; i++) assert(Number.isFinite(lookEase(i / 100)));
});

test('the CSS spring easing is a linear() with matching ends', () => {
  const css = springLinear(0.8, 12, 20);
  assert.match(css, /^linear\(0, /);
  assert.match(css, /, 1\)$/);
  assert.equal(css.split(',').length, 21);
});

test('pace: brisk < normal < gentle, stored per desk, reduced motion is a cut', () => {
  assert(PACES.brisk < PACES.normal && PACES.normal < PACES.gentle);
  const data = {}; const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(readPace(storage), 'normal');
  data[PACE_KEY] = 'gentle'; assert.equal(readPace(storage), 'gentle');
  data[PACE_KEY] = 'bogus'; assert.equal(readPace(storage), 'normal');
  assert.equal(savePace('nope', storage), false);
  assert.equal(moveSeconds(0.6, 'brisk', false), 0.6 * PACES.brisk);
  assert.equal(moveSeconds(0.6, 'gentle', true), 0.0001);
});

test('the lamp throws shadows away from itself, longer when the thing is higher', () => {
  const w = 1440, h = 900, lamp = lampFor('pixel');
  const low = shadowOffset(w / 2, h / 2, w, h, 10, lamp), high = shadowOffset(w / 2, h / 2, w, h, 40, lamp);
  assert(low.x < 0 && low.y < 0, 'a lamp low on the right casts up and to the left');
  assert(Math.hypot(high.x, high.y) > Math.hypot(low.x, low.y) * 3.9);
  const right = shadowOffset(w * 0.9, h / 2, w, h, 20, lamp), left = shadowOffset(w * 0.1, h / 2, w, h, 20, lamp);
  assert(left.x < right.x, 'the further left of the lamp, the further left it leans');
  // right under the lamp: no NaN
  const under = shadowOffset(LAMP.x * w, LAMP.y * h, w, h, 20, lamp);
  assert(Number.isFinite(under.x) && Number.isFinite(under.y));
  assert.deepEqual(lampFor('seaside'), lampFor('pixel'), 'one desk, one lamp');
});

test('night is the lamp\'s time and a dimmed room turns it down', () => {
  assert(lampStrength({ bucket: 'night' }) > lampStrength({ bucket: 'day' }));
  assert(lampStrength({ bucket: 'night', dim: true }) < lampStrength({ bucket: 'night' }));
});

test('paper noise tiles: periodic, bounded, deterministic', () => {
  assert(Math.abs(noise2p(3.3, 4.4, 8, 8) - noise2p(3.3 + 8, 4.4 + 8, 8, 8)) < 1e-9);
  for (let i = 0; i < 50; i++) { const v = fbm(i * 0.7, i * 1.3, 100, 40); assert(v >= 0 && v <= 1); }
  const a = paperTile(32), b = paperTile(32);
  assert.equal(a.length, 32 * 32 * 4);
  assert.deepEqual([...a], [...b]);
  let r = 0, g = 0, bl = 0; for (let i = 0; i < a.length; i += 4) { r += a[i]; g += a[i + 1]; bl += a[i + 2]; assert.equal(a[i + 3], 255); }
  const n = a.length / 4; r /= n; g /= n; bl /= n;
  assert(r > 225 && r < 250 && g > 220 && g < 245 && bl > 210 && bl < 240, `cream, got ${r|0},${g|0},${bl|0}`);
  assert(r > g && g > bl, 'warm: red > green > blue');
  const grain = grainTile(16); assert.equal(grain.length, 16 * 16 * 4);
  for (let i = 3; i < grain.length; i += 4) assert(grain[i] <= 44);
});

test('seven-segment digits light the right segments', () => {
  assert.equal(SEG7.length, 10);
  const lit = (d) => digit(0, 0, 20, 40, d).filter((s) => s.on).length;
  assert.deepEqual([0, 1, 2, 7, 8].map(lit), [6, 2, 5, 3, 7]);
  assert.equal(lit(-1), 0);
  assert.equal(lit(-2), 1);
  for (const segment of digit(0, 0, 20, 40, 8)) { assert.equal(segment.points.length, 6); for (const [x, y] of segment.points) assert(Number.isFinite(x) && Number.isFinite(y)); }
});

test('digit rows advance by width + gap', () => {
  const row = digitRow('12-3', 10, 5, 20, 40, 6);
  assert.equal(row.digits.length, 4);
  assert.deepEqual(row.digits.map((d) => d.x), [10, 36, 62, 88]);
  assert.equal(row.width, 4 * 20 + 3 * 6);
});

test('fourteen-segment letters and the dot matrix cover what the clock prints', () => {
  assert.equal(strokes(10, 20, 3).length, 14);
  for (const ch of 'FOCUSBREAKPLAY0123456789') assert(SEG14[ch] !== undefined, ch);
  const word = letters('Focus', 0, 0, 10, 20, 3); assert.equal(word.length, 5);
  assert(word[0].some((s) => s.on) && word[0].some((s) => !s.on), 'ghost segments stay drawn');
  for (const ch of 'FOCUS BREAK PLAY NOW READY:0123456789%-+<>') if (ch !== ' ') assert(FONT[ch], `dot matrix has ${ch}`);
  const { dots, width } = dotMatrix('Hi', 0, 0, 3);
  assert.equal(dots.length, 2 * 35);
  assert.equal(width, (2 * 6 - 1) * 3);
  assert(dots.some((d) => d.on) && dots.some((d) => !d.on));
  assert.equal(dotMatrix('', 0, 0, 3).dots.length, 0);
  assert.equal(dotMatrix('A', 100, 0, 2, 1).dots[0].cx < 100, true, 'right-aligned print ends at x');
  assert.equal(segPoly({ x: 0, y: 0, h: 10 }, 0, 0, 10, 0, 2, 0.5).length, 6);
});

// The paper scope redefines --ui-* for everything on a sheet; text must stay readable on it.
test('ink, brass and red meet AA on every paper surface', async () => {
  const fs = await import('node:fs'), path = await import('node:path'), { fileURLToPath } = await import('node:url');
  const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'props.css'), 'utf8');
  const block = css.match(/\.paper, \.cabin-dialog:not\(\.is-full\)[^{]*\{([^}]*)\}/)[1];
  const raw = new Map([...block.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const parse = (name) => {
    const v = raw.get(name); assert(v, name);
    const hex = v.match(/^#([\da-f]{6})$/i); if (hex) return { rgb: hex[1].match(/../g).map((h) => parseInt(h, 16)), a: 1 };
    const m = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/); assert(m, `${name}: ${v}`);
    return { rgb: m.slice(1, 4).map(Number), a: Number(m[4]) };
  };
  const lum = (rgb) => rgb.map((c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const over = (top, bottom) => top.rgb.map((c, i) => c * top.a + bottom[i] * (1 - top.a));
  const surface = parse('--ui-surface').rgb;
  const grounds = { surface, raised: parse('--ui-surface-raised').rgb, field: parse('--ui-field').rgb, hover: over(parse('--ui-surface-hover'), surface), accentSoft: over(parse('--ui-accent-soft'), surface) };
  for (const [name, ground] of Object.entries(grounds)) for (const text of ['--ui-text', '--ui-text-2', '--ui-text-3', '--ui-accent', '--ui-danger', '--ui-good']) {
    assert(ratio(parse(text).rgb, ground) >= 4.5, `${text} on ${name}: ${ratio(parse(text).rgb, ground).toFixed(2)}:1`);
  }
  assert(ratio(parse('--ui-accent-text').rgb, parse('--ui-accent').rgb) >= 4.5, 'accent text on accent');
});
