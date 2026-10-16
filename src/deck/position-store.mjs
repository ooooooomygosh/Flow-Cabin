// The deck's playhead lives outside React state: `timeupdate` (~4 Hz) and the
// remote players' polls write here, and only the few leaves that draw time
// (progress bar, close-up clock, widget bar) subscribe. The cabin no longer
// re-renders on every tick. Writes are dropped unless the value moved by
// `minDelta` s and `minInterval` ms passed, except duration changes and `force`.
export function createPositionStore({ minDelta = .05, minInterval = 250, now = () => Date.now() } = {}) {
  let snapshot = Object.freeze({ position: 0, duration: 0 }), written = -Infinity;
  const listeners = new Set();
  const store = {
    get: () => snapshot,
    get position() { return snapshot.position; },
    get duration() { return snapshot.duration; },
    set(position = snapshot.position, duration = snapshot.duration, { force = false } = {}) {
      position = Number.isFinite(Number(position)) ? Math.max(0, Number(position)) : 0;
      duration = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
      if (position === snapshot.position && duration === snapshot.duration) return false;
      const time = now();
      if (!force && duration === snapshot.duration && (Math.abs(position - snapshot.position) < minDelta || time - written < minInterval)) return false;
      snapshot = Object.freeze({ position, duration }); written = time;
      for (const fn of [...listeners]) fn(snapshot);
      return true;
    },
    reset() { return store.set(0, 0, { force: true }); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
  return store;
}
// Resolution helpers for subscribers that only redraw on visible changes.
export const quantise = (value, step = 0) => step > 0 ? Math.floor((Number(value) || 0) / step) * step : Number(value) || 0;
