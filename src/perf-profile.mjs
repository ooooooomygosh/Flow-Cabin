// 流畅模式: some machines (older laptops, low-power CPUs, software rendering)
// can't keep every ambient effect at full rate. The cabin picks a level:
//   high — everything as designed;  low — fewer motes, slower canvas loops,
//   no blur filters, no decorative notes. 'auto' decides from the hardware
//   hints and a short frame-rate probe after start-up; the user can override.
export const PERFORMANCE_KEY = 'album-circle-performance-v1';
export const DETECTED_KEY = 'album-circle-performance-detected-v1';
export const PERFORMANCE_MODES = Object.freeze([['auto', '自动'], ['smooth', '流畅优先'], ['quality', '画质优先']]);
const EVENT = 'album-performance';
const read = (key) => { try { return globalThis.localStorage?.getItem(key) || ''; } catch { return ''; } };
const write = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch {} };

export function hardwareHint(nav = globalThis.navigator) {
  const cores = Number(nav?.hardwareConcurrency) || 0, memory = Number(nav?.deviceMemory) || 0;
  return (cores && cores <= 4) || (memory && memory <= 4) ? 'low' : 'high';
}
export function performanceMode() { const value = read(PERFORMANCE_KEY); return PERFORMANCE_MODES.some(([id]) => id === value) ? value : 'auto'; }
// Pure decision, for tests: an explicit choice wins; auto uses a probe result, then hardware hints.
export function resolveLevel(mode, detected, hint) {
  if (mode === 'smooth') return 'low';
  if (mode === 'quality') return 'high';
  return detected === 'low' || detected === 'high' ? detected : hint;
}
export function performanceLevel() { return resolveLevel(performanceMode(), read(DETECTED_KEY), hardwareHint()); }
export function applyPerformance(root = globalThis.document?.documentElement) {
  const level = performanceLevel();
  const mode = performanceMode();
  if (root && (root.dataset.perf !== level || root.dataset.perfMode !== mode)) { root.dataset.perf = level; root.dataset.perfMode = mode; globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: { level, mode } })); }
  return level;
}
export function setPerformanceMode(mode) { write(PERFORMANCE_KEY, PERFORMANCE_MODES.some(([id]) => id === mode) ? mode : 'auto'); return applyPerformance(); }
export function onPerformanceChange(callback) {
  const listener = (event) => callback(event.detail);
  globalThis.addEventListener?.(EVENT, listener); return () => globalThis.removeEventListener?.(EVENT, listener);
}
// Storage events reach other windows, including an already-open wallpaper.
export function syncPerformance(win = globalThis.window) {
  if (!win?.addEventListener) return () => {};
  const changed = (event) => { if (event.key === null || [PERFORMANCE_KEY, DETECTED_KEY].includes(event.key)) applyPerformance(win.document.documentElement); };
  win.addEventListener('storage', changed);
  return () => win.removeEventListener('storage', changed);
}
// Frames per second over a sample of rAF timestamps (ignores the first frame).
export function measuredFps(stamps) {
  if (stamps.length < 3) return 0;
  return (stamps.length - 1) / ((stamps.at(-1) - stamps[0]) / 1000);
}
// After the room settles, watch ~2.5 s of frames while the window is visible.
// Slow rendering marks this machine 'low' (remembered); smooth frames on a
// machine previously marked low clear the mark only when effects are at full rate.
export function startPerformanceProbe({ delay = 4000, duration = 2500, win = globalThis.window } = {}) {
  if (!win?.requestAnimationFrame) return () => {};
  let stopped = false, frame = 0;
  // A background tab can suspend rAF for minutes. Never classify that gap as
  // slow hardware, even when the window is visible again at the final frame.
  const visibility = () => { if (win.document.hidden) { stopped = true; win.cancelAnimationFrame?.(frame); win.document.removeEventListener?.('visibilitychange', visibility); } };
  win.document.addEventListener?.('visibilitychange', visibility);
  const timer = win.setTimeout(() => {
    if (stopped || win.document.hidden) { win.document.removeEventListener?.('visibilitychange', visibility); return; }
    const stamps = [];
    const tick = (time) => {
      if (stopped) return; stamps.push(time);
      if (time - stamps[0] < duration) { frame = win.requestAnimationFrame(tick); return; }
      win.document.removeEventListener?.('visibilitychange', visibility);
      const fps = measuredFps(stamps), level = win.document.documentElement.dataset.perf;
      if (win.document.hidden) return;
      if (fps < 45) write(DETECTED_KEY, 'low');
      else if (fps >= 56 && level === 'high') write(DETECTED_KEY, 'high');
      applyPerformance(win.document.documentElement);
    };
    frame = win.requestAnimationFrame(tick);
  }, delay);
  return () => { stopped = true; win.clearTimeout(timer); win.cancelAnimationFrame?.(frame); win.document.removeEventListener?.('visibilitychange', visibility); };
}
