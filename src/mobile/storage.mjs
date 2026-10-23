// The existing models keep a synchronous Storage contract. Android backs it with
// a native SQLite transaction queue, hydrated before any model module is loaded.
export const persistentKey = key => (key === 'cabin.petPack.v1' || /^(?:album-circle-|flow-cabin-)/.test(key)) && key !== 'flow-cabin-ai-key-v1';
const MAX_BYTES = 32 * 1024 * 1024;
export function createMobileStorage({ entries = {}, write, onError = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  const values = new Map(Object.entries(entries).filter(([key, value]) => persistentKey(key) && typeof value === 'string'));
  let dirty = new Map(), timer = null, running = null, lastError = '';
  const bytes = () => [...values].reduce((sum, [key, value]) => sum + (key.length + value.length) * 2, 0);
  const flush = async () => {
    if (timer !== null) { cancel(timer); timer = null; }
    if (running) { await running; return dirty.size ? flush() : undefined; }
    if (!dirty.size) return;
    const changes = dirty; dirty = new Map();
    running = Promise.resolve().then(() => write([...changes].map(([key, value]) => ({ key, value })))).then(() => { lastError = ''; }, error => {
        // Preserve edits made while the failed transaction was running.
        dirty = new Map([...changes, ...dirty]); lastError = error.message || '本机数据保存失败';
        onError(lastError); throw error;
    }).finally(() => { running = null; });
    await running;
    if (dirty.size) await flush();
  };
  const changed = (key, value) => {
    if (!persistentKey(key)) return;
    dirty.set(key, value);
    if (timer === null) timer = schedule(() => { timer = null; flush().catch(() => {}); }, 40);
  };
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][Number(index)] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem(key, value) {
      key = String(key); value = String(value);
      const before = values.get(key); values.set(key, value);
      if (bytes() > MAX_BYTES) { if (before === undefined) values.delete(key); else values.set(key, before); throw new Error('手机存储空间已满，请先导出备份。'); }
      if (before !== value) changed(key, value);
    },
    removeItem(key) { key = String(key); if (values.delete(key)) changed(key, null); },
    clear() { for (const key of [...values.keys()]) storage.removeItem(key); }
  };
  return { storage, flush, status: () => ({ pending: dirty.size > 0 || Boolean(running), error: lastError, bytes: bytes() }) };
}
