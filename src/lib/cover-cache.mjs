// A small LRU of decoded artwork (ImageBitmap promises). Decoded bitmaps hold native memory until
// closed, so evicted entries are closed — after `closeDelayMs`, because a paint already in flight may
// still draw them — and the whole cache is released once nobody has asked for a cover for `idleMs`.
export function createCoverCache({ load, capacity = 100, idleMs = 90000, closeDelayMs = 60000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const entries = new Map();
  let idle = null;
  const close = (promise) => setTimer(() => { promise.then((bitmap) => bitmap?.close?.(), () => {}); }, closeDelayMs);
  function release() {
    if (idle) { clearTimer(idle); idle = null; }
    for (const promise of entries.values()) close(promise);
    entries.clear();
  }
  function get(key) {
    if (!key) return Promise.resolve(null);
    let promise = entries.get(key);
    if (promise) entries.delete(key); // re-insert: most recently used last
    else promise = Promise.resolve().then(() => load(key)).catch(() => null);
    entries.set(key, promise);
    while (entries.size > capacity) { const [oldest, value] = entries.entries().next().value; entries.delete(oldest); close(value); }
    if (idle) clearTimer(idle);
    idle = setTimer(release, idleMs);
    return promise;
  }
  return { get, release, get size() { return entries.size; } };
}
