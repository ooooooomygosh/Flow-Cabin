// Ported from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), src/sfx.c.
//
// WebAudio player for the synthesised desk sounds (see sfx-synth.mjs).
// A module-level singleton: sounds are synthesised lazily on first use (or
// ahead of time, in small idle slices, with warmSfx), each play picks a
// different variant than the last one for that sound, rate is jittered
// +-3.5%, gain +-1.2 dB, and pan is clamped to +-0.7. No AudioContext exists
// until the first play after a user gesture; everything is a safe no-op when
// AudioContext is unavailable (tests, SSR). Independent of reduced motion.

import { makeSfx, SFX_NAMES, SFX_RATE, SFX_VARIANTS } from './sfx-synth.mjs';

export const SFX_STORAGE_KEY = 'flow-cabin-sfx-v1';
const DEFAULT_VOLUME = 0.6;
const DUCK_GAIN = 0.3;
const PAN_LIMIT = 0.7;
const SLICE_MS = 8;

// ---- settings (persisted) ----

const settings = { enabled: true, volume: DEFAULT_VOLUME };
let loaded = false;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// (Re)read the persisted settings; falls back to the defaults.
export function reloadSfxSettings() {
  settings.enabled = true;
  settings.volume = DEFAULT_VOLUME;
  try {
    const raw = storage()?.getItem(SFX_STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.enabled === 'boolean') settings.enabled = o.enabled;
      if (Number.isFinite(o.volume)) settings.volume = clamp(o.volume, 0, 1);
    }
  } catch { /* ignore: defaults */ }
  loaded = true;
  applyMaster();
}

function ensureLoaded() {
  if (!loaded) reloadSfxSettings();
}

function save() {
  try {
    storage()?.setItem(SFX_STORAGE_KEY, JSON.stringify({ enabled: settings.enabled, volume: settings.volume }));
  } catch { /* ignore: private mode, quota */ }
}

export function sfxEnabled() {
  ensureLoaded();
  return settings.enabled;
}

export function sfxVolume() {
  ensureLoaded();
  return settings.volume;
}

export function setSfxEnabled(on) {
  ensureLoaded();
  settings.enabled = !!on;
  if (!settings.enabled) stopAll();
  save();
}

export function setSfxVolume(v) {
  ensureLoaded();
  const n = Number(v);
  settings.volume = Number.isFinite(n) ? clamp(n, 0, 1) : DEFAULT_VOLUME;
  applyMaster();
  save();
}

// ---- audio graph ----

let customGetContext = null; // set by configureSfx
let ctx = null;
let master = null;
let ducked = false;
let gestured = false;
const live = new Set(); // handles still playing

// Host override (and test hook): getContext() returns an AudioContext-like
// object. When given, the user-gesture gate is the host's responsibility.
export function configureSfx({ getContext } = {}) {
  customGetContext = typeof getContext === 'function' ? getContext : null;
  ctx = null;
  master = null;
}

function watchGesture() {
  if (gestured || typeof window === 'undefined' || !window.addEventListener) return;
  const on = () => {
    gestured = true;
    for (const t of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(t, on, true);
  };
  for (const t of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(t, on, true);
}
watchGesture();

function userHasActed() {
  if (gestured || customGetContext) return true;
  try {
    return !!globalThis.navigator?.userActivation?.hasBeenActive;
  } catch {
    return false;
  }
}

function getCtx() {
  if (ctx) return ctx;
  try {
    if (customGetContext) {
      ctx = customGetContext() || null;
    } else {
      if (!userHasActed()) return null;
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (!ctx) return null;
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyMaster(true);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function applyMaster(immediate) {
  if (!ctx || !master) return;
  const target = settings.volume * (ducked ? DUCK_GAIN : 1);
  try {
    const t = ctx.currentTime || 0;
    master.gain.cancelScheduledValues?.(t);
    if (immediate || !master.gain.setTargetAtTime) master.gain.value = target;
    else master.gain.setTargetAtTime(target, t, 0.04);
  } catch { /* ignore */ }
}

// Lower the effects under something else (a voice, a notification).
export function duckSfx(on) {
  ducked = !!on;
  applyMaster();
}

// ---- synthesis cache ----

const pcm = new Map(); // "name#variant" -> Float32Array
const lastVariant = new Map(); // name -> last variant played
const audioBuffers = new WeakMap(); // ctx -> Map(key -> AudioBuffer)

function pcmFor(name, variant) {
  const key = `${name}#${variant}`;
  let a = pcm.get(key);
  if (!a) {
    a = makeSfx(name, variant);
    if (a) pcm.set(key, a);
  }
  return a;
}

function bufferFor(c, name, variant) {
  let m = audioBuffers.get(c);
  if (!m) audioBuffers.set(c, (m = new Map()));
  const key = `${name}#${variant}`;
  let buf = m.get(key);
  if (!buf) {
    const a = pcmFor(name, variant);
    if (!a) return null;
    buf = c.createBuffer(1, a.length, SFX_RATE);
    if (buf.copyToChannel) buf.copyToChannel(a, 0);
    else buf.getChannelData(0).set(a);
    m.set(key, buf);
  }
  return buf;
}

function pickVariant(name) {
  const n = SFX_VARIANTS[name] || 1;
  const last = lastVariant.get(name);
  let v = Math.floor(Math.random() * n);
  if (n > 1 && v === last) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n;
  lastVariant.set(name, v);
  return v;
}

// Synthesise ahead of time, in slices that stay within ~8 ms where the work
// allows (one sound-variant is the smallest unit), using idle time when the
// browser offers it. Returns { cancel(), done: Promise }.
export function warmSfx(names = SFX_NAMES) {
  const queue = [];
  for (const name of names) {
    const n = SFX_VARIANTS[name];
    for (let v = 0; v < (n || 0); v++) if (!pcm.has(`${name}#${v}`)) queue.push([name, v]);
  }
  let cancelled = false;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  const schedule = (fn) => {
    if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(fn, { timeout: 500 });
    else setTimeout(fn, 0);
  };
  const slice = (deadline) => {
    if (cancelled) return resolveDone();
    const t0 = now();
    const budget = Math.min(SLICE_MS, deadline?.timeRemaining ? Math.max(deadline.timeRemaining(), 1) : SLICE_MS);
    do {
      const item = queue.shift();
      if (!item) break;
      try { pcmFor(item[0], item[1]); } catch { /* skip a broken sound */ }
    } while (queue.length && now() - t0 < budget);
    if (queue.length) schedule(slice);
    else resolveDone();
  };
  if (queue.length) schedule(slice);
  else resolveDone();
  return { cancel: () => { cancelled = true; resolveDone(); }, done };
}

// ---- playing ----

const NOOP_HANDLE = Object.freeze({ stop() {} });

function stopAll() {
  for (const h of [...live]) h.stop();
}

// Play a sound. opts: { pan: -1..1, when: seconds from now, rate: playback
// rate multiplier for motion sounds }. Returns a handle with stop().
export function playSfx(name, opts = {}) {
  ensureLoaded();
  try {
    if (!settings.enabled || settings.volume <= 0 || !SFX_VARIANTS[name]) return NOOP_HANDLE;
    const c = getCtx();
    if (!c) return NOOP_HANDLE;
    if (c.state === 'suspended' && c.resume) c.resume()?.catch?.(() => {});
    const variant = pickVariant(name);
    const buf = bufferFor(c, name, variant);
    if (!buf) return NOOP_HANDLE;

    const src = c.createBufferSource();
    src.buffer = buf;
    const jitter = 1 + (Math.random() * 2 - 1) * 0.035;
    const baseRate = Number.isFinite(opts.rate) && opts.rate > 0 ? opts.rate : 1;
    src.playbackRate.value = clamp(baseRate * jitter, 0.25, 4);

    const gain = c.createGain();
    gain.gain.value = Math.pow(10, ((Math.random() * 2 - 1) * 1.2) / 20);
    src.connect(gain);
    let tail = gain;
    let panner = null;
    if (typeof c.createStereoPanner === 'function') {
      panner = c.createStereoPanner();
      panner.pan.value = clamp(Number(opts.pan) || 0, -PAN_LIMIT, PAN_LIMIT);
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(master);

    const when = Number.isFinite(opts.when) && opts.when > 0 ? opts.when : 0;
    const t = (c.currentTime || 0) + when;
    let stopped = false;
    const handle = {
      stop() {
        if (stopped) return;
        stopped = true;
        live.delete(handle);
        try { src.stop(); } catch { /* not started or already ended */ }
        try { src.disconnect(); gain.disconnect(); panner?.disconnect(); } catch { /* ignore */ }
      },
    };
    src.onended = () => handle.stop();
    live.add(handle);
    src.start(t);
    return handle;
  } catch {
    return NOOP_HANDLE;
  }
}

export { SFX_NAMES };
