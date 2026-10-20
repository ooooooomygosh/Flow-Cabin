import { frameBudget, performanceLevel, onPerformanceChange } from './perf-profile.mjs';

// One shared requestAnimationFrame chain for every animation loop, hard-capped at
// 60 fps. High-refresh displays (120/144 Hz) fire rAF faster than we ever need to
// draw; each subscriber is paced against an accumulator so a jittery 60 Hz display
// does not drop to 30 fps, and nothing is scheduled while paused or unsubscribed.
// When every subscriber is slow (the 8–12 fps cabin atmosphere), the chain sleeps on
// a timer until one frame before the next due time instead of waking rAF 60×/s: each
// rAF wake costs a full style/paint pass even when nothing is drawn.
export const MAX_FPS = 60;
const clampFps = (value, fallback) => Math.max(1, Math.min(MAX_FPS, Number(value) || fallback));

export function createFrameClock({ request, cancel, now, maxFps = MAX_FPS, setTimer = null, clearTimer = null }) {
  const subs = new Set();
  let handle = null, timer = null, paused = false, ticking = false, cap = clampFps(maxFps, MAX_FPS);
  const rate = (sub) => Math.min(sub.fps, cap);
  const stopTimer = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  const ensure = () => { if (handle === null && timer === null && !ticking && !paused && subs.size) handle = request(tick); };
  // After a tick: the earliest moment any subscriber may draw (already a quarter
  // interval early). More than ~1.5 frames away → sleep on a timer until then.
  const plan = (t) => {
    if (handle !== null || timer !== null || paused || !subs.size) return;
    const frame = 1000 / cap;
    let next = Infinity;
    for (const sub of subs) next = Math.min(next, sub.last === null ? -Infinity : sub.due - 1000 / rate(sub) * .25);
    const wait = next - t;
    if (setTimer && wait > frame * 1.5) timer = setTimer(() => { timer = null; if (!paused && subs.size && handle === null) handle = request(tick); }, wait);
    else handle = request(tick);
  };
  function tick(t) {
    handle = null; ticking = true;
    try {
      if (paused) return;
      for (const sub of [...subs]) {
        if (!subs.has(sub)) continue;
        const interval = 1000 / rate(sub);
        let dt;
        if (sub.last === null) dt = 1 / rate(sub);
        else if (t >= sub.due - interval * .25) {
          // Bound suspend/stall jumps, not ordinary low-fps frames. Allow one
          // subscriber interval plus scheduling jitter (8 fps needs >125 ms).
          const maxStep = Math.max(.1, interval * 1.5 / 1000);
          dt = Math.min(maxStep, Math.max(0, (t - sub.last) / 1000));
        }
        else continue;
        sub.due = sub.last === null ? t + interval : Math.max(sub.due + interval, t + interval * .5);
        sub.last = t;
        try { sub.callback(t, dt); }
        catch (error) { if (!sub.failed) { sub.failed = true; console.error(error); } }
      }
    } finally { ticking = false; plan(t); }
  }
  return {
    subscribe(callback, { fps = MAX_FPS } = {}) {
      const sub = { callback, fps: clampFps(fps, MAX_FPS), due: 0, last: null, failed: false };
      // A new subscriber starts on the next frame, not after a sleeping timer.
      subs.add(sub); if (!ticking) stopTimer(); ensure();
      return () => { subs.delete(sub); if (!subs.size) { stopTimer(); if (handle !== null) { cancel(handle); handle = null; } } };
    },
    setMaxFps(value) { cap = clampFps(value, MAX_FPS); },
    setPaused(value) {
      value = Boolean(value); if (value === paused) return;
      paused = value;
      if (paused) { stopTimer(); if (handle !== null) { cancel(handle); handle = null; } }
      else { for (const sub of subs) sub.last = null; ensure(); }
    },
    get size() { return subs.size; },
    get paused() { return paused; },
    get sleeping() { return timer !== null; }
  };
}

// Pure: paused only when truly not visible. Ordinary focus loss never pauses; Electron's
// forwarded hide/minimize arrives as an untrusted 'blur' (see nextMinimized).
export function backgroundState({ hidden = false, minimized = false, desktop = false } = {}) { return Boolean(hidden || (minimized && !desktop)); }
export function nextMinimized(minimized, type, isTrusted) {
  if (type === 'blur') return isTrusted === false ? true : minimized;
  if (type === 'focus' || type === 'visible') return false;
  return minimized;
}

const watchers = new Set();
// Calls cb(background) now and whenever the shared clock's background state changes.
// Without a window (unit tests, prerender) there is no background to speak of.
export function onBackgroundChange(cb) {
  if (!globalThis.window) { cb(false); return () => {}; }
  const clock = frameClock(); watchers.add(cb); cb(clock.paused);
  return () => watchers.delete(cb);
}
// True while the app is in the background (hidden, or minimized outside the
// desktop wallpaper / pet windows). Reads the clock that already exists — it
// never creates one, so asking during a render has no side effect.
export const inBackground = () => Boolean(shared?.paused);
let shared = null;
// Browser singleton. Paused while the document is hidden or (outside the desktop
// wallpaper/pet windows) minimized; Electron keeps such a page "visible", so the
// state is also published as data-app-background for a global CSS animation pause.
export function frameClock() {
  if (shared) return shared;
  const win = globalThis.window, doc = globalThis.document;
  shared = createFrameClock({ request: (cb) => win.requestAnimationFrame(cb), cancel: (id) => win.cancelAnimationFrame(id), now: () => win.performance.now(), setTimer: (cb, ms) => win.setTimeout(cb, ms), clearTimer: (id) => win.clearTimeout(id) });
  const root = doc?.documentElement;
  const applyCap = () => {
    const injected = Number(root?.dataset.frameCap);
    shared.setMaxFps(Math.min(frameBudget(performanceLevel()).max, injected > 0 ? injected : MAX_FPS));
  };
  applyCap();
  if (root && typeof MutationObserver !== 'undefined') new MutationObserver(applyCap).observe(root, { attributes: true, attributeFilter: ['data-frame-cap'] });
  onPerformanceChange(applyCap);
  let minimized = false;
  const update = (event) => {
    const type = event?.type === 'visibilitychange' ? (doc.hidden ? 'hidden' : 'visible') : event?.type;
    minimized = nextMinimized(minimized, type, event?.isTrusted);
    const background = backgroundState({ hidden: doc.hidden, minimized, desktop: Boolean(win.albumWallpaper || win.albumPet) });
    const changed = shared.paused !== background;
    shared.setPaused(background);
    if (changed) for (const cb of [...watchers]) cb(background);
    if (root) { if (background) root.dataset.appBackground = 'true'; else delete root.dataset.appBackground; }
  };
  win.addEventListener('blur', update); win.addEventListener('focus', update); doc.addEventListener('visibilitychange', update);
  update();
  return shared;
}

// A full-screen layer (唱机特写, html.room-corner-open; 专注画面 filling the window,
// html.room-focus-display) hides the cabin scene: the room's own loops stop drawing
// while the layer on top keeps the clock.
export const OCCLUDING_CLASSES = Object.freeze(['room-corner-open', 'room-focus-display']);
export const occludedFrom = (classList) => OCCLUDING_CLASSES.some((name) => Boolean(classList?.contains?.(name)));
const occlusionWatchers = new Set();
let occlusion = null;
// Calls cb(occluded) now and whenever the cabin becomes covered or uncovered.
export function onOcclusionChange(cb) {
  const root = globalThis.document?.documentElement;
  if (!root) { cb(false); return () => {}; }
  if (!occlusion) {
    let value = occludedFrom(root.classList);
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      const next = occludedFrom(root.classList); if (next === value) return; value = next;
      for (const fn of [...occlusionWatchers]) fn(value);
    });
    observer?.observe(root, { attributes: true, attributeFilter: ['class'] });
    occlusion = { get value() { return value; }, stop: () => observer?.disconnect() };
  }
  occlusionWatchers.add(cb); cb(occlusion.value);
  return () => { occlusionWatchers.delete(cb); if (!occlusionWatchers.size && occlusion) { occlusion.stop(); occlusion = null; } };
}
