import { frameBudget, performanceLevel, onPerformanceChange } from './perf-profile.mjs';

// One shared requestAnimationFrame chain for every animation loop, hard-capped at
// 60 fps. High-refresh displays (120/144 Hz) fire rAF faster than we ever need to
// draw; each subscriber is paced against an accumulator so a jittery 60 Hz display
// does not drop to 30 fps, and nothing is scheduled while paused or unsubscribed.
export const MAX_FPS = 60;
const clampFps = (value, fallback) => Math.max(1, Math.min(MAX_FPS, Number(value) || fallback));

export function createFrameClock({ request, cancel, now, maxFps = MAX_FPS }) {
  const subs = new Set();
  let handle = null, paused = false, ticking = false, cap = clampFps(maxFps, MAX_FPS);
  const rate = (sub) => Math.min(sub.fps, cap);
  const ensure = () => { if (handle === null && !ticking && !paused && subs.size) handle = request(tick); };
  function tick(t) {
    handle = null; ticking = true;
    try {
      if (paused) return;
      for (const sub of [...subs]) {
        if (!subs.has(sub)) continue;
        const interval = 1000 / rate(sub);
        let dt;
        if (sub.last === null) dt = 1 / rate(sub);
        else if (t >= sub.due - interval * .25) dt = Math.min(.1, Math.max(0, (t - sub.last) / 1000));
        else continue;
        sub.due = sub.last === null ? t + interval : Math.max(sub.due + interval, t + interval * .5);
        sub.last = t;
        try { sub.callback(t, dt); }
        catch (error) { if (!sub.failed) { sub.failed = true; console.error(error); } }
      }
    } finally { ticking = false; ensure(); }
  }
  return {
    subscribe(callback, { fps = MAX_FPS } = {}) {
      const sub = { callback, fps: clampFps(fps, MAX_FPS), due: 0, last: null, failed: false };
      subs.add(sub); ensure();
      return () => { subs.delete(sub); if (!subs.size && handle !== null) { cancel(handle); handle = null; } };
    },
    setMaxFps(value) { cap = clampFps(value, MAX_FPS); },
    setPaused(value) {
      value = Boolean(value); if (value === paused) return;
      paused = value;
      if (paused) { if (handle !== null) { cancel(handle); handle = null; } }
      else { for (const sub of subs) sub.last = null; ensure(); }
    },
    get size() { return subs.size; },
    get paused() { return paused; }
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
export function onBackgroundChange(cb) {
  const clock = frameClock(); watchers.add(cb); cb(clock.paused);
  return () => watchers.delete(cb);
}
let shared = null;
// Browser singleton. Paused while the document is hidden or (outside the desktop
// wallpaper/pet windows) minimized; Electron keeps such a page "visible", so the
// state is also published as data-app-background for a global CSS animation pause.
export function frameClock() {
  if (shared) return shared;
  const win = globalThis.window, doc = globalThis.document;
  shared = createFrameClock({ request: (cb) => win.requestAnimationFrame(cb), cancel: (id) => win.cancelAnimationFrame(id), now: () => win.performance.now() });
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
