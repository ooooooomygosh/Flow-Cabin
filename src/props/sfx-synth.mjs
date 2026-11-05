// Ported from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), src/sfx.c.
//
// The desk's sounds, made from nothing: pure DSP, no DOM, no WebAudio.
// Nothing here is a recording. Struck things ring at a few frequencies of
// their own (mode/strike); rubbed or let-go things are coloured noise
// (burst/friction); paper is a shower of crackles behind a breath of air
// (crackle/swish); a hinge is stick and slip (creak).
//
// makeSfx(name, variant) -> Float32Array, mono, SFX_RATE Hz, deterministic
// per (name, variant). The RNG is mulberry32 seeded from hash(name, variant),
// so output does not match the C build bit for bit.
//
// Skipped from sfx.c (irrelevant to a focus/music app): firework-whistle,
// firework-boom, firework-crackle, popper, aerial-up, aerial-down, set-warm,
// set-off, guard-lift, guard-stop (and their helpers: hum, squash, aerial).

export const SFX_RATE = 48000;
const SR = SFX_RATE;
const PI = Math.PI;
const TAU = 2 * Math.PI;

// ---- the dice ----

function seedOf(name, variant) {
  let h = 2166136261; // FNV-1a
  const s = `${name}#${variant}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  const r = { s: seed >>> 0 };
  for (let k = 0; k < 4; k++) rnd(r);
  return r;
}

// mulberry32 -> [0, 1)
function rnd(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const rnd2 = (r) => rnd(r) * 2 - 1;

// a value near x: within a fraction j either way
const near = (r, x, j) => x * (1 + j * rnd2(r));

// ---- filters: the cookbook's biquads ----

const F_LP = 0, F_HP = 1, F_BP = 2, F_PK = 3;
const LP = (f, q) => ({ type: F_LP, f, q, g: 0 });
const HP = (f, q) => ({ type: F_HP, f, q, g: 0 });
const BP = (f, q) => ({ type: F_BP, f, q, g: 0 });

function newBq() {
  return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0 };
}

// (re)design f for spec s; keep=true leaves the filter state alone
function bqSet(f, s, keep) {
  const fr = s.f < 10 ? 10 : s.f > SR * 0.45 ? SR * 0.45 : s.f;
  const q = s.q > 0.05 ? s.q : 0.05;
  const w = (TAU * fr) / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (s.type) {
    case F_LP:
      b0 = (1 - cw) * 0.5; b1 = 1 - cw; b2 = b0;
      a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case F_HP:
      b0 = (1 + cw) * 0.5; b1 = -(1 + cw); b2 = b0;
      a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case F_BP:
      b0 = al; b1 = 0; b2 = -al;
      a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case F_PK: {
      const A = Math.pow(10, s.g / 40);
      b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
      a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
      break;
    }
    default:
      break;
  }
  f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0;
  f.a1 = a1 / a0; f.a2 = a2 / a0;
  if (!keep) f.z1 = f.z2 = 0;
}

function bq(s) {
  const f = newBq();
  bqSet(f, s, false);
  return f;
}

function bqRun(f, x) {
  const y = f.b0 * x + f.z1;
  f.z1 = f.b1 * x - f.a1 * y + f.z2;
  f.z2 = f.b2 * x - f.a2 * y;
  return y;
}

// ---- the sheet of sound being made ----

const at = (t) => Math.round(t * SR);

function put(b, i, v) {
  if (i >= 0 && i < b.n) b.x[i] += v;
}

// noise through up to three filters, len samples, brought to an RMS of 0.3
// whatever the filters took out of it, so amp means much the same however
// narrow the band
function coloured(r, len, f1, f2, f3) {
  const t = new Float32Array(len + 1);
  const fs = [f1, f2, f3].filter(Boolean).map(bq);
  let ss = 0;
  for (let i = 0; i < len; i++) {
    let s = rnd2(r);
    for (let k = 0; k < fs.length; k++) s = bqRun(fs[k], s);
    t[i] = s;
    ss += s * s;
  }
  const rms = Math.sqrt(ss / (len > 0 ? len : 1));
  const g = rms > 1e-9 ? 0.3 / rms : 0;
  for (let i = 0; i < len; i++) t[i] *= g;
  return t;
}

// One resonance of something struck at t0: ringing at f, dying to 1/e in
// decay seconds. A quarter of a millisecond to rise, so a low one does not
// start with a click it does not have.
function mode(b, t0, f, amp, decay) {
  const i0 = at(t0);
  const w = (TAU * f) / SR;
  const k = Math.exp(-1 / (decay * SR));
  let e = amp;
  const na = Math.trunc(0.00025 * SR) + 1;
  for (let i = i0, j = 0; i < b.n && e > 1e-5; i++, j++) {
    const a = j < na ? 0.5 - 0.5 * Math.cos((PI * j) / na) : 1;
    if (i >= 0) b.x[i] += e * a * Math.sin(w * j);
    e *= k;
  }
}

// Struck: a set of resonances at once, with the click of the blow on top --
// a sliver of bright noise. f, a, d are parallel arrays.
function strike(b, r, t0, amp, click, f, a, d, detune) {
  for (let k = 0; k < f.length; k++) {
    mode(b, t0, f[k] * (1 + detune * rnd2(r)), amp * a[k], d[k] * near(r, 1, 0.1));
  }
  if (click > 0) {
    const len = at(0.004);
    const n = coloured(r, len, HP(2500, 0.7), null, null);
    const i0 = at(t0);
    for (let j = 0; j < len; j++) put(b, i0 + j, n[j] * click * Math.exp(-j / (0.0007 * SR)));
  }
}

// Noise, coloured, rising over attack and falling away over decay.
function burst(b, r, t0, attack, decay, amp, f1, f2) {
  const len = at(attack + decay * 7) + 1;
  const n = coloured(r, len, f1, f2 || null, null);
  const i0 = at(t0);
  for (let j = 0; j < len; j++) {
    const t = j / SR;
    let e;
    if (t < attack) {
      const u = Math.sin((0.5 * PI * t) / attack);
      e = u * u;
    } else {
      e = Math.exp(-(t - attack) / decay);
    }
    put(b, i0 + j, n[j] * amp * e);
  }
}

// The shape most things that move have: up from nothing to its peak at
// fraction p of the way, and down to nothing again.
function hump(u, p) {
  if (u <= 0 || u >= 1) return 0;
  const s = u < p ? Math.sin((0.5 * PI * u) / p) : Math.cos((0.5 * PI * (u - p)) / (1 - p));
  return s * s;
}

// A shower of crackles: fibres letting go, one at a time and then in a rush.
// rate a second at the height of a hump over dur, peaking at p; most small
// and a few much louder (sizes fall off as a power, which is what makes it
// paper rather than rain); kept to lo..hi.
function crackle(b, r, t0, dur, p, rate, amp, lo, hi) {
  const len = at(dur);
  if (len < 2) return;
  const t = new Float32Array(len + 16);
  let sum = 0, count = 0;
  for (let j = 0; j < len; j++) {
    const e = hump(j / len, p);
    if (rnd(r) < (rate * e) / SR) {
      const u = rnd(r);
      let a = Math.pow(1 - 0.999 * u, -1 / 1.6);
      a = a > 14 ? 14 : a;
      a *= rnd(r) < 0.5 ? -1 : 1;
      const w = 2 + Math.trunc(rnd(r) * 5);
      for (let k = 0; k < w; k++) t[j + k] += a * Math.exp(-k * 1.1) * (k & 1 ? -0.55 : 1);
      sum += Math.abs(a);
      count++;
    }
  }
  const h = bq(HP(lo, 0.7)), h2 = bq(HP(lo, 0.7)), l = bq(LP(hi, 0.7));
  const mean = count ? sum / count : 1;
  const i0 = at(t0);
  const g = (amp * 0.35) / mean;
  for (let j = 0; j < len + 16; j++) {
    put(b, i0 + j, bqRun(l, bqRun(h2, bqRun(h, t[j]))) * g);
  }
}

// Air pushed along by something moving: noise through a band that slides
// from f0 to f1, loudest at fraction p of dur.
function swish(b, r, t0, dur, p, f0, f1, q, amp) {
  const len = at(dur);
  if (len < 2) return;
  const t = new Float32Array(len);
  const f = bq(BP(f0, q));
  const spec = { type: F_BP, f: f0, q, g: 0 };
  let ss = 0;
  for (let j = 0; j < len; j++) {
    if ((j & 15) === 0) {
      spec.f = f0 * Math.pow(f1 / f0, j / len);
      bqSet(f, spec, true);
    }
    const s = bqRun(f, rnd2(r));
    t[j] = s;
    ss += s * s;
  }
  const g = 0.3 / Math.max(Math.sqrt(ss / len), 1e-9);
  const i0 = at(t0);
  for (let j = 0; j < len; j++) put(b, i0 + j, t[j] * g * amp * hump(j / len, p));
}

// Something drawn along a surface: noise in the bands of what is rubbing,
// roughened by the grain of it -- a slow random wobble in how hard it
// catches -- under the envelope env (a function of time from t0).
function friction(b, r, t0, dur, bands, qs, gains, grainHz, grain, amp, env) {
  const len = at(dur);
  const nb = Math.min(bands.length, 6);
  const n = new Float32Array(len);
  const gr = new Float32Array(len);
  const f = [];
  for (let k = 0; k < nb; k++) f.push(bq(BP(bands[k], qs[k])));
  const g1 = bq(LP(grainHz, 0.7)), g2 = bq(LP(grainHz, 0.7));
  let ss = 0, gs = 0;
  for (let j = 0; j < len; j++) {
    const w = rnd2(r);
    let s = 0;
    for (let k = 0; k < nb; k++) s += bqRun(f[k], w) * gains[k];
    n[j] = s;
    ss += s * s;
    const c = bqRun(g2, bqRun(g1, rnd2(r)));
    gr[j] = c;
    gs += c * c;
  }
  const gn = 0.3 / Math.max(Math.sqrt(ss / len), 1e-9);
  const gg = 1 / Math.max(Math.sqrt(gs / len), 1e-9);
  const i0 = at(t0);
  for (let j = 0; j < len; j++) {
    const rough = 1 - grain + grain * Math.min(Math.abs(gr[j] * gg) * 0.8, 1.6);
    put(b, i0 + j, n[j] * gn * rough * amp * env(j / SR, dur));
  }
}

// Stick and slip: a hinge, a key's pins. A train of little catches, its rate
// wandering from f0 towards f1, each one ringing the metal at a few
// resonances.
function creak(b, r, t0, dur, f0, f1, amp, res) {
  const len = at(dur);
  const t = new Float32Array(len + 1);
  let ph = 0, wob = 0;
  for (let j = 0; j < len; j++) {
    const u = j / len;
    wob += rnd2(r) * 0.08 - wob * 0.002;
    const f = (f0 + (f1 - f0) * u) * (1 + 0.04 * wob + 0.06 * Math.sin(TAU * 4.3 * u));
    ph += f / SR;
    if (ph >= 1) {
      ph -= 1;
      t[j] += 0.7 + 0.3 * rnd(r);
    }
  }
  const nres = Math.min(res.length, 6);
  const f = [];
  for (let k = 0; k < nres; k++) f.push(bq(BP(res[k], 6 + 2 * k)));
  const i0 = at(t0);
  for (let j = 0; j < len; j++) {
    let s = 0;
    for (let k = 0; k < nres; k++) s += bqRun(f[k], t[j]) / (1 + 0.5 * k);
    put(b, i0 + j, s * amp * 3 * Math.sqrt(hump(j / len, 0.25)));
  }
}

// A stroke of a pencil: graphite on paper, a scratch with the grain of the
// paper in it, rising and falling with the pressure of the hand.
function pencil(b, r, t0, dur, fc, amp, wobbleHz) {
  const len = at(dur);
  const n = coloured(r, len, BP(fc, 0.9), HP(1500, 0.7), null);
  const g = coloured(r, len, LP(260, 0.7), null, null);
  const i0 = at(t0);
  for (let j = 0; j < len; j++) {
    const e = hump(j / len, 0.35);
    const grain = 0.45 + 0.55 * Math.min(Math.abs(g[j]) * 3, 1.4);
    const turn = wobbleHz > 0 ? 0.65 + 0.35 * Math.cos((TAU * wobbleHz * j) / SR) : 1;
    put(b, i0 + j, n[j] * amp * e * grain * turn);
  }
}

// ---- finishing: rumble out, a level of its own, no clicks at the ends ----

// rmsDb: the loudest 30 ms of it, as RMS; peakDb: no sample higher. The
// quieter of the two wins: a click is held by its peak, a rustle by its body.
function finish(b, rmsDb, peakDb) {
  const hp = bq(HP(28, 0.7));
  for (let i = 0; i < b.n; i++) b.x[i] = bqRun(hp, b.x[i]);
  const win = at(0.03);
  let ss = 0, best = 0, peak = 0;
  for (let i = 0; i < b.n; i++) {
    const v = b.x[i];
    ss += v * v;
    if (i >= win) {
      const o = b.x[i - win];
      ss -= o * o;
    }
    if (ss / win > best) best = ss / win;
    const av = Math.abs(v);
    if (av > peak) peak = av;
  }
  if (best <= 1e-12 || peak <= 1e-9) return;
  const g = Math.min(Math.pow(10, rmsDb / 20) / Math.sqrt(best), Math.pow(10, peakDb / 20) / peak);
  for (let i = 0; i < b.n; i++) b.x[i] *= g;
  // the tail that is past hearing goes, and what is left fades out
  const floor = Math.pow(10, -78 / 20);
  let last = b.n - 1;
  while (last > 0 && Math.abs(b.x[last]) < floor) last--;
  const n = last + at(0.01);
  b.n = n < b.n ? n : b.n;
  const fo = at(0.008);
  for (let i = 0; i < fo && i < b.n; i++) b.x[b.n - 1 - i] *= i / fo;
  const fi = at(0.0004);
  for (let i = 0; i < fi && i < b.n; i++) b.x[i] *= i / fi;
}

// ================================================================
// The sounds. Each is given its sheet, its dice, and which time this is.

// -- paper --

function sPaperSwing(b, r) {
  // the flap going over: air, rising as it gathers speed and falling as it
  // comes down; the band rises with it
  swish(b, r, 0, 0.4, 0.5, near(r, 520, 0.1), near(r, 1900, 0.1), 0.85, 0.9);
  swish(b, r, 0.06, 0.3, 0.55, 2400, 4200, 1.2, 0.18);
  crackle(b, r, 0.02, 0.1, 0.3, 700, 0.25, 2000, 8000);
  finish(b, -31, -14);
}

function sPaperPress(b, r) {
  // down: the soft pat of the flap on the stack, then the crease run under a
  // thumbnail -- a short, dense rush of crackle
  burst(b, r, 0, 0.002, 0.012, 0.9, BP(near(r, 700, 0.1), 0.8));
  mode(b, 0, near(r, 175, 0.08), 0.1, 0.025);
  crackle(b, r, 0.004, 0.075, 0.25, near(r, 5200, 0.15), 0.9, 1800, 8500);
  crackle(b, r, 0.03, 0.09, 0.5, 1600, 0.35, 3000, 10000);
  finish(b, -27, -11);
}

function sPaperUnpress(b, r) {
  // a crease letting go, and the flap lifting off
  crackle(b, r, 0, 0.06, 0.3, near(r, 2600, 0.2), 0.6, 1500, 7000);
  swish(b, r, 0.02, 0.22, 0.4, 2200, 800, 0.8, 0.45);
  finish(b, -31, -14);
}

function sPaperSettle(b, r) {
  // a packet laid on the desk: a soft "fwap" and the wood under it
  swish(b, r, 0, 0.05, 0.8, 600, 1500, 0.8, 0.3);
  burst(b, r, 0.045, 0.003, 0.022, 0.8, BP(near(r, 1000, 0.1), 0.7));
  mode(b, 0.045, near(r, 150, 0.06), 0.16, 0.03);
  mode(b, 0.045, near(r, 330, 0.06), 0.06, 0.02);
  crackle(b, r, 0.045, 0.03, 0.2, 1800, 0.25, 2000, 7000);
  finish(b, -29, -12);
}

function sPaperUnfold(b, r) {
  // a sheet opening out: air, and the folds letting go one after another;
  // it lies down flat at the end
  swish(b, r, 0, 0.46, 0.45, 480, 1700, 0.7, 0.75);
  let t = 0.02;
  for (let k = 0; k < 3; k++) {
    crackle(b, r, t, 0.07, 0.3, near(r, 2200, 0.2), near(r, 0.55, 0.3), 1500, 7500);
    t += near(r, 0.12, 0.25);
  }
  burst(b, r, 0.43, 0.004, 0.02, 0.45, BP(900, 0.7));
  mode(b, 0.43, 160, 0.06, 0.03);
  finish(b, -31, -14);
}

function sPaperCrumple(b, r) {
  // screwed up in the hand: rushes of crackle as it is squeezed, each with
  // the crunch of the whole sheet giving under it
  let t = 0;
  const n = 5 + Math.trunc(rnd(r) * 3);
  for (let k = 0; k < n; k++) {
    const d = near(r, 0.075, 0.3);
    const a = 0.5 + 0.5 * rnd(r);
    crackle(b, r, t, d, near(r, 0.35, 0.3), near(r, 7500, 0.2), a, 1300, 9500);
    burst(b, r, t + d * 0.25, 0.006, 0.035, a * 0.45, BP(near(r, 650, 0.2), 0.6));
    t += d * near(r, 0.8, 0.2);
  }
  // and the last squeeze, the ball made
  crackle(b, r, t, 0.05, 0.3, 9000, 0.8, 2000, 10000);
  finish(b, -23, -8);
}

function sPaperToss(b, r) {
  // a ball of paper in the air: a whoosh, rising and falling past
  swish(b, r, 0, 0.42, 0.35, near(r, 320, 0.1), near(r, 1100, 0.1), 1.1, 0.8);
  finish(b, -35, -20);
}

function sPaperLand(b, r) {
  // landing on the floor, past the edge of the desk: muffled by the
  // distance, a little bounce
  const f = [210, 470, 980], a = [1, 0.5, 0.25], d = [0.03, 0.02, 0.012];
  strike(b, r, 0, 0.3, 0, f, a, d, 0.06);
  burst(b, r, 0, 0.002, 0.02, 0.5, BP(650, 0.7), LP(1600, 0.7));
  strike(b, r, near(r, 0.11, 0.15), 0.1, 0, f, a, d, 0.06);
  burst(b, r, 0.11, 0.002, 0.015, 0.15, BP(700, 0.7), LP(1500, 0.7));
  finish(b, -40, -24);
}

function sCornerLift(b, r) {
  // a corner turning up off the page: a flick of air and a crackle
  swish(b, r, 0, 0.09, 0.4, 1600, 4200, 0.9, 0.6);
  crackle(b, r, 0.005, 0.04, 0.3, 1500, 0.4, 2500, 9000);
  finish(b, -39, -21);
}

function sCornerTap(b, r) {
  // a finger on the back of a turned-up corner
  burst(b, r, 0, 0.0015, 0.01, 0.9, BP(near(r, 1500, 0.1), 0.8));
  mode(b, 0, near(r, 340, 0.08), 0.12, 0.012);
  crackle(b, r, 0, 0.025, 0.2, 1200, 0.2, 2500, 8000);
  finish(b, -33, -15);
}

// -- the drawer --

// pulled: at speed at once, slowing as it runs out
function envPull(t, dur) {
  const up = 1 - Math.exp(-t / 0.018);
  const down = 0.3 + 0.7 * Math.exp(-t / 0.28);
  const end = t > dur - 0.08 ? (dur - t) / 0.08 : 1;
  return up * down * (end > 0 ? end : 0);
}

// pushed home: it picks up speed and keeps it
function envPush(t, dur) {
  const up = 1 - Math.exp(-t / 0.035);
  const down = 0.55 + 0.45 * Math.exp(-t / 0.4);
  const end = t > dur - 0.08 ? (dur - t) / 0.08 : 1;
  return up * down * (end > 0 ? end : 0);
}

// the small things in it shifting on the felt: soft, muffled clicks
function contents(b, r, t0, span, n, amp) {
  for (let k = 0; k < n; k++) {
    const t = t0 + span * rnd(r);
    mode(b, t, near(r, 2300, 0.3), amp * near(r, 0.7, 0.4), 0.004);
    mode(b, t, near(r, 850, 0.2), amp * 0.6, 0.008);
    burst(b, r, t, 0.001, 0.006, amp * 0.5, LP(2600, 0.7));
  }
}

function sDrawerOut(b, r) {
  // Wood on wood along the runners: a low rumble of the drawer's box, the
  // rub of the runners above it, and a hiss of the fibres, all roughened by
  // the grain. Long enough for the slowest pull.
  friction(b, r, 0, 1, [165, 430, 1250, 3200], [1.1, 1.6, 0.9, 0.8],
    [0.8, 0.55, 0.22, 0.06], 32, 0.55, 0.9, envPull);
  crackle(b, r, 0, 0.6, 0.1, 55, 0.18, 600, 3000);
  contents(b, r, 0.015, 0.08, 3, 0.1);
  finish(b, -29, -15);
}

function sDrawerIn(b, r) {
  friction(b, r, 0, 1, [140, 380, 1100, 3000], [1.1, 1.5, 0.9, 0.8],
    [0.85, 0.5, 0.2, 0.05], 28, 0.5, 0.9, envPush);
  crackle(b, r, 0, 0.7, 0.4, 45, 0.15, 600, 3000);
  contents(b, r, 0.02, 0.06, 2, 0.07);
  finish(b, -30, -16);
}

function sDrawerStopOut(b, r) {
  // out against its stop: a knock in the wood, the box rattling once in its
  // runners, and the things in it sliding on and settling
  const f = [190, 420, 960, 2150, 3700];
  const a = [1, 0.7, 0.45, 0.25, 0.12];
  const d = [0.045, 0.03, 0.02, 0.009, 0.005];
  strike(b, r, 0, 0.45, 0.35, f, a, d, 0.04);
  burst(b, r, 0, 0.001, 0.012, 0.5, BP(600, 0.8));
  strike(b, r, near(r, 0.014, 0.2), 0.08, 0.08, f, a, d, 0.05);
  contents(b, r, 0.025, 0.07, 4, 0.12);
  finish(b, -22, -7);
}

function sDrawerStopIn(b, r) {
  // home: the face meeting the carcass -- deeper, with the clack of the
  // edges, and a shiver of the things inside
  const f = [112, 245, 560, 1250, 2600];
  const a = [1, 0.75, 0.45, 0.25, 0.1];
  const d = [0.068, 0.045, 0.028, 0.013, 0.006];
  strike(b, r, 0, 0.5, 0.3, f, a, d, 0.04);
  burst(b, r, 0, 0.001, 0.015, 0.5, BP(450, 0.8));
  mode(b, 0.001, near(r, 820, 0.05), 0.12, 0.012);
  contents(b, r, 0.02, 0.06, 2, 0.08);
  finish(b, -21, -6);
}

function sFeltPick(b, r) {
  // lifted off the felt: the nap brushed, and a tiny tick
  burst(b, r, 0, 0.012, 0.035, 0.8, BP(near(r, 700, 0.15), 0.7), LP(2000, 0.7));
  mode(b, 0.004, near(r, 2600, 0.2), 0.04, 0.004);
  finish(b, -37, -22);
}

function sFeltDrop(b, r) {
  // laid on the felt: a muffled thud, the wood of the drawer under it
  burst(b, r, 0, 0.002, 0.018, 0.9, LP(near(r, 900, 0.1), 0.7));
  mode(b, 0, near(r, 160, 0.08), 0.3, 0.035);
  mode(b, 0, near(r, 345, 0.08), 0.14, 0.02);
  finish(b, -30, -14);
}

// -- the bookcase --

function sBinderLift(b, r) {
  // drawn out of the row: board rubbing board
  friction(b, r, 0, 0.22, [420, 1300, 2900], [1, 0.9, 0.9], [0.5, 0.35, 0.12],
    45, 0.5, 0.8, envPull);
  finish(b, -36, -22);
}

// the ring they hang on: a little steel, rattling
function ringRattle(b, r, t0, amp, hits) {
  const f = [2900, 4350, 6200, 7900], a = [1, 0.7, 0.45, 0.25], d = [0.12, 0.09, 0.06, 0.04];
  let t = t0;
  for (let k = 0; k < hits; k++) {
    strike(b, r, t, amp, amp * 0.6, f, a, d, 0.015);
    t += near(r, 0.035, 0.3);
    amp *= 0.45;
  }
}

function sBinderOpen(b, r) {
  // laid open on the desk: the board coming down flat on the wood, the ring
  // rattling, the sheets settling after it
  strike(b, r, 0, 0.5, 0.15, [140, 310, 720, 1500], [1, 0.6, 0.35, 0.15],
    [0.05, 0.035, 0.02, 0.01], 0.05);
  burst(b, r, 0, 0.002, 0.016, 0.6, BP(near(r, 1200, 0.1), 0.7));
  ringRattle(b, r, 0.008, 0.1, 3);
  crackle(b, r, 0.05, 0.12, 0.3, 1100, 0.25, 2000, 7500);
  finish(b, -24, -8);
}

function sBinderClose(b, r) {
  // shut: the boards meeting over the sheets, and the ring
  swish(b, r, 0, 0.08, 0.8, 500, 1400, 0.8, 0.35);
  strike(b, r, 0.075, 0.4, 0.12, [180, 400, 900], [1, 0.55, 0.3], [0.04, 0.025, 0.015], 0.05);
  burst(b, r, 0.075, 0.002, 0.014, 0.6, BP(1500, 0.7));
  ringRattle(b, r, 0.09, 0.07, 2);
  finish(b, -25, -9);
}

function sPageTurn(b, r) {
  // a sheet swung up over the ring: its hole ticking round the steel, the
  // air it moves, and a flap as it comes down on the others
  strike(b, r, 0.008, 0.05, 0, [4600, 6900], [1, 0.5], [0.02, 0.012], 0.03);
  crackle(b, r, 0, 0.04, 0.3, 1400, 0.3, 2200, 8000);
  swish(b, r, 0, 0.17, 0.45, near(r, 850, 0.12), near(r, 3100, 0.12), 0.8, 0.8);
  burst(b, r, near(r, 0.15, 0.08), 0.003, 0.018, 0.45, BP(near(r, 1700, 0.12), 0.8));
  finish(b, -31, -15);
}

function sSheetTake(b, r) {
  // off the ring: a tick of steel, the paper giving at the hole, and the
  // sheet lifted away
  strike(b, r, 0, 0.12, 0.08, [3900, 5800], [1, 0.6], [0.03, 0.02], 0.03);
  crackle(b, r, 0, 0.05, 0.25, 6000, 0.6, 2000, 9000);
  swish(b, r, 0.03, 0.22, 0.4, 1100, 2600, 0.8, 0.5);
  finish(b, -28, -12);
}

function sSheetDown(b, r) {
  // put down flat on the desk: the air under it, then "fwap"
  swish(b, r, 0, 0.07, 0.85, 500, 1500, 0.8, 0.5);
  burst(b, r, 0.06, 0.006, 0.03, 1, BP(near(r, 900, 0.1), 0.6));
  mode(b, 0.06, near(r, 170, 0.06), 0.25, 0.04);
  crackle(b, r, 0.06, 0.04, 0.2, 1500, 0.25, 2000, 7000);
  finish(b, -27, -10);
}

// -- the post box --

// painted sheet steel, struck
function clank(b, r, t0, amp, pitch) {
  const f = [245, 580, 1215, 2650, 3980, 5300].map((x) => x * pitch);
  const a = [1, 0.75, 0.55, 0.35, 0.22, 0.12];
  const d = [0.12, 0.1, 0.075, 0.045, 0.032, 0.022];
  strike(b, r, t0, amp, amp * 0.8, f, a, d, 0.02);
  // the panel's own thud: it is a box, not a bell
  burst(b, r, t0, 0.001, 0.03, amp * 1.4, BP(420 * pitch, 0.8));
}

function sPostOpen(b, r) {
  // its door on its hinge -- a short creak -- and the door at the end of its
  // swing, a dull clank of painted steel, once more as it rocks
  creak(b, r, 0, 0.2, near(r, 250, 0.1), near(r, 330, 0.1), 0.7, [950, 2300, 3650]);
  clank(b, r, 0.23, 0.45, near(r, 1, 0.03));
  clank(b, r, 0.23 + near(r, 0.07, 0.2), 0.12, near(r, 1.02, 0.03));
  finish(b, -22, -8);
}

function sPostClose(b, r) {
  // swung shut: a squeak of the hinge, the clank, and the latch
  creak(b, r, 0, 0.09, 380, 300, 0.5, [1100, 2600, 3900]);
  clank(b, r, 0.1, 0.5, near(r, 0.92, 0.03));
  strike(b, r, 0.112, 0.25, 0.25, [3400, 5100], [1, 0.6], [0.015, 0.01], 0.03);
  finish(b, -21, -7);
}

function sLetterArrive(b, r) {
  // A letter through the slot in the front: the brass flap pushed open, the
  // paper sliding in, the letter dropping onto the others, and the flap
  // snapping shut behind it.
  strike(b, r, 0, 0.1, 0.05, [2100, 3900], [1, 0.6], [0.03, 0.02], 0.03);
  swish(b, r, 0.02, 0.21, 0.5, 1100, 2500, 0.8, 0.55);
  crackle(b, r, 0.02, 0.2, 0.5, 900, 0.25, 2000, 8000);
  burst(b, r, 0.235, 0.003, 0.025, 0.7, BP(1300, 0.7));
  mode(b, 0.235, 200, 0.15, 0.03);
  // the flap: brass, and the box it is in
  const ff = [640, 1650, 3300, 4950], fa = [0.7, 1, 0.6, 0.35], fd = [0.035, 0.045, 0.03, 0.02];
  strike(b, r, 0.3, 0.45, 0.4, ff, fa, fd, 0.02);
  strike(b, r, 0.3 + near(r, 0.035, 0.15), 0.12, 0.1, ff, fa, fd, 0.02);
  finish(b, -20, -6);
}

function sLetterTake(b, r) {
  // drawn out from among the others
  swish(b, r, 0, 0.28, 0.35, 2400, 900, 0.7, 0.75);
  crackle(b, r, 0, 0.12, 0.3, 1500, 0.3, 2000, 8000);
  burst(b, r, 0.25, 0.003, 0.02, 0.3, BP(1100, 0.7));
  finish(b, -30, -14);
}

function sLetterFlick(b, r) {
  // the letters turned over, one
  swish(b, r, 0, 0.11, 0.45, near(r, 1400, 0.12), near(r, 3500, 0.12), 0.8, 0.8);
  burst(b, r, 0.095, 0.002, 0.014, 0.4, BP(near(r, 2000, 0.12), 0.8));
  finish(b, -34, -18);
}

// -- keys, switches --

function sKeyPress(b, r) {
  // a hard plastic key going down: the click of it, and the thock of it
  // meeting the bottom
  strike(b, r, 0, 0.35, 0.6, [2250, 3650, 5200], [1, 0.65, 0.3], [0.005, 0.004, 0.0025], 0.04);
  strike(b, r, 0.004, 0.35, 0, [330, 780, 1500], [1, 0.55, 0.3], [0.008, 0.006, 0.004], 0.05);
  finish(b, -25, -11);
}

function sKeyRelease(b, r) {
  // and back up: higher and lighter
  strike(b, r, 0, 0.25, 0.35, [2650, 4200], [1, 0.6], [0.004, 0.003], 0.04);
  mode(b, 0, near(r, 420, 0.06), 0.12, 0.006);
  finish(b, -30, -15);
}

function sToggle(b, r) {
  // a bat lever: it slides over its spring, and snaps
  strike(b, r, 0, 0.06, 0.1, [5200], [1], [0.003], 0.05);
  strike(b, r, 0.007, 0.32, 0.9, [1850, 3350, 5700, 8100], [1, 0.8, 0.5, 0.2],
    [0.025, 0.018, 0.012, 0.007], 0.03);
  mode(b, 0.007, near(r, 230, 0.06), 0.35, 0.03);
  finish(b, -22, -8);
}

function sKnobTick(b, r) {
  // a detent going by under the fingers
  strike(b, r, 0, 0.3, 0.3, [3600, 6100, 900], [1, 0.6, 0.35], [0.004, 0.0025, 0.006], 0.05);
  finish(b, -34, -19);
}

function sKeyIn(b, r) {
  // the key going in: steel past the pins, each one ticking over a cut
  friction(b, r, 0, 0.26, [4800, 7200], [2, 1.5], [0.6, 0.3], 60, 0.6, 0.35, envPush);
  const f = [4200, 6800], a = [1, 0.5], d = [0.006, 0.004];
  for (let k = 0; k < 5; k++) strike(b, r, 0.03 + k * near(r, 0.045, 0.15), 0.12, 0.1, f, a, d, 0.05);
  finish(b, -31, -15);
}

function sLockClunk(b, r) {
  // turned: the cylinder going round and the bolt thrown
  strike(b, r, 0, 0.1, 0.1, [3300, 5000], [1, 0.5], [0.008, 0.005], 0.04);
  strike(b, r, 0.03, 0.4, 0.4, [600, 1450, 3100], [1, 0.6, 0.3], [0.05, 0.03, 0.015], 0.03);
  mode(b, 0.03, near(r, 170, 0.05), 0.35, 0.04);
  finish(b, -24, -9);
}

function sPowerPress(b, r) {
  // the big button, all the way down, and the relay behind the panel
  // dropping out a moment later
  strike(b, r, 0, 0.3, 0.4, [1400, 2600], [1, 0.5], [0.01, 0.006], 0.04);
  mode(b, 0.002, 210, 0.45, 0.035);
  strike(b, r, 0.075, 0.35, 0.5, [2500, 4300, 7000], [1, 0.6, 0.3], [0.012, 0.008, 0.005], 0.03);
  mode(b, 0.075, 120, 0.3, 0.03);
  finish(b, -21, -7);
}

function sPowerDown(b, r) {
  // The set going out. The mains hum of its transformer dies away; the whine
  // of the tube's deflection falls through the octaves to nothing; there is
  // a crackle of the charge on the glass going, and as it cools the glass
  // ticks.
  const n = b.n;
  const ph = [0, 0, 0, 0, 0];
  let wp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const humE = Math.exp(-t / 0.9) * (1 - Math.exp(-t / 0.01));
    let h = 0;
    for (let k = 0; k < 5; k++) {
      const f = 100 * (k + 1) * (1 - 0.04 * (1 - Math.exp(-t / 1.2)));
      ph[k] += f / SR;
      h += Math.sin(TAU * ph[k]) / (1 + k * 1.3);
    }
    const fw = 70 + 1150 * Math.exp(-t / 0.55);
    wp += fw / SR;
    const w = Math.sin(TAU * wp) + 0.3 * Math.sin(TAU * 2 * wp) + 0.12 * Math.sin(TAU * 3 * wp);
    const we = Math.exp(-t / 0.75) * (1 - Math.exp(-t / 0.02));
    b.x[i] += 0.2 * humE * h + 0.1 * we * w;
  }
  crackle(b, r, 0, 0.18, 0.2, 4500, 0.5, 2500, 12000);
  for (let k = 0; k < 6; k++) mode(b, 0.9 + 1.7 * rnd(r), near(r, 4800, 0.3), 0.03, 0.003);
  finish(b, -27, -12);
}

function sCardSlide(b, r) {
  // a card drawn out from under the console, card on wood
  friction(b, r, 0, 0.3, [1800, 3600, 700], [0.9, 1, 1], [0.6, 0.3, 0.25], 70, 0.6, 0.8, envPull);
  finish(b, -35, -19);
}

// -- writing --

function sPencilTick(b, r) {
  // a tick: a short stroke down, and a longer one up and away
  pencil(b, r, 0, near(r, 0.055, 0.1), near(r, 3600, 0.1), 0.8, 0);
  pencil(b, r, near(r, 0.07, 0.1), near(r, 0.12, 0.1), near(r, 4200, 0.1), 1, 0);
  finish(b, -32, -16);
}

function sPencilRing(b, r) {
  // a ring drawn round a word: round once and a bit, the stroke changing as
  // the pencil changes direction
  pencil(b, r, 0, near(r, 0.34, 0.08), near(r, 3900, 0.1), 1, near(r, 5.6, 0.1));
  finish(b, -33, -17);
}

// -- the days kept --

function sBeep(b) {
  // The clock's buzzer playing a tune: a soft square of a note, odd
  // harmonics rolled off, struck and held a moment and let go. C5.
  const f = 523.25;
  for (let i = 0; i < b.n; i++) {
    const t = i / SR;
    const env = (t < 0.006 ? t / 0.006 : 1) * (t < 0.16 ? 1 : Math.exp(-(t - 0.16) / 0.16));
    const w = TAU * f * t;
    const x = Math.sin(w) + 0.28 * Math.sin(3 * w) + 0.1 * Math.sin(5 * w) + 0.04 * Math.sin(7 * w);
    b.x[i] += 0.25 * env * x;
  }
  finish(b, -21, -7);
}

// a pendulum metronome's escapement: a hard little knock in wood
function metronome(b, r, accent) {
  if (accent) {
    strike(b, r, 0, 0.45, 0.5, [1250, 2350, 3900], [1, 0.55, 0.25], [0.02, 0.012, 0.006], 0.02);
  } else {
    strike(b, r, 0, 0.35, 0.4, [2150, 3380, 5300], [1, 0.6, 0.25], [0.012, 0.008, 0.004], 0.02);
  }
  mode(b, 0, near(r, accent ? 380 : 520, 0.03), 0.2, 0.018);
}

function sTick(b, r) {
  metronome(b, r, false);
  finish(b, -30, -14);
}

function sTock(b, r) {
  metronome(b, r, true);
  finish(b, -27, -11);
}

function sBell(b, r) {
  // a glockenspiel bar, C6: its own inharmonic partials, the high ones gone
  // first, and the little knock of the mallet
  strike(b, r, 0, 0.5, 0.25, [1046.5, 2884, 5651, 9345], [1, 0.42, 0.18, 0.07],
    [1.1, 0.45, 0.18, 0.08], 0);
  finish(b, -24, -8);
}

function sJingle(b, r) {
  // a strap of sleigh bells shaken once: a shower of tiny bells, each with
  // its pea rattling inside
  const n = 18 + Math.trunc(rnd(r) * 8);
  for (let i = 0; i < n; i++) {
    const t0 = 0.01 + Math.pow(rnd(r), 1.6) * 0.2;
    const f0 = 3600 + rnd(r) * 3200;
    const fr = [f0, f0 * 1.58, f0 * 2.31];
    const de = [0.06 + rnd(r) * 0.07, 0.035, 0.02];
    strike(b, r, t0, 0.1 + rnd(r) * 0.12, 0.25, fr, [1, 0.5, 0.25], de, 0);
  }
  finish(b, -28, -12);
}

// ---- the table: name, seconds of sheet, variants, maker ----

const TABLE = [
  ['paper-swing', 0.42, 3, sPaperSwing],
  ['paper-press', 0.16, 4, sPaperPress],
  ['paper-unpress', 0.26, 3, sPaperUnpress],
  ['paper-settle', 0.16, 3, sPaperSettle],
  ['paper-unfold', 0.62, 2, sPaperUnfold],
  ['paper-crumple', 0.75, 3, sPaperCrumple],
  ['paper-toss', 0.44, 2, sPaperToss],
  ['paper-land', 0.3, 2, sPaperLand],
  ['corner-lift', 0.12, 3, sCornerLift],
  ['corner-tap', 0.08, 3, sCornerTap],
  ['drawer-out', 1.02, 2, sDrawerOut],
  ['drawer-in', 1.02, 2, sDrawerIn],
  ['drawer-stop-out', 0.32, 3, sDrawerStopOut],
  ['drawer-stop-in', 0.4, 3, sDrawerStopIn],
  ['felt-pick', 0.14, 3, sFeltPick],
  ['felt-drop', 0.16, 3, sFeltDrop],
  ['binder-lift', 0.24, 2, sBinderLift],
  ['binder-open', 0.45, 2, sBinderOpen],
  ['binder-close', 0.45, 2, sBinderClose],
  ['page-turn', 0.24, 4, sPageTurn],
  ['sheet-take', 0.28, 2, sSheetTake],
  ['sheet-down', 0.2, 3, sSheetDown],
  ['post-open', 0.9, 2, sPostOpen],
  ['post-close', 0.8, 2, sPostClose],
  ['letter-arrive', 0.62, 2, sLetterArrive],
  ['letter-take', 0.32, 3, sLetterTake],
  ['letter-flick', 0.15, 4, sLetterFlick],
  ['key-press', 0.07, 3, sKeyPress],
  ['key-release', 0.05, 3, sKeyRelease],
  ['toggle', 0.16, 3, sToggle],
  ['knob-tick', 0.03, 3, sKnobTick],
  ['key-in', 0.3, 2, sKeyIn],
  ['lock-clunk', 0.2, 2, sLockClunk],
  ['power-press', 0.25, 1, sPowerPress],
  ['power-down', 2.9, 1, sPowerDown],
  ['card-slide', 0.32, 2, sCardSlide],
  ['pencil-tick', 0.22, 3, sPencilTick],
  ['pencil-ring', 0.4, 3, sPencilRing],
  ['beep', 1.2, 1, sBeep],
  ['tick', 0.1, 2, sTick],
  ['tock', 0.12, 2, sTock],
  ['bell', 2.4, 1, sBell],
  ['jingle', 0.45, 3, sJingle],
];

const BY_NAME = new Map(TABLE.map((e) => [e[0], e]));

export const SFX_NAMES = TABLE.map((e) => e[0]);

// variants per sound, as sfx.c has them
export const SFX_VARIANTS = Object.fromEntries(TABLE.map((e) => [e[0], e[2]]));

// Synthesise one sound: mono Float32Array at SFX_RATE. The same
// (name, variant) always gives the same samples. Returns null for an unknown
// name.
export function makeSfx(name, variant = 0) {
  const def = BY_NAME.get(name);
  if (!def) return null;
  const v = Math.max(0, Math.trunc(variant) || 0) % def[2];
  const n = at(def[1]) + 1;
  const b = { x: new Float32Array(n), n };
  def[3](b, makeRng(seedOf(name, v)), v);
  return b.x.slice(0, b.n);
}
