import { JOURNAL_KEY, JOURNAL_CHANGE, normalizeJournalStoredRecord } from '../focus/journal-entries.mjs';
import { SESSION_LOG_KEY, SESSION_EVENT } from '../focus/session-log.mjs';
import { validateLayout } from '../room2/layout.mjs';
const META = 'flow-cabin-lan-revisions-v1', DEVICE = 'flow-cabin-lan-device-v1';
const PREFIX = 'flow-cabin-room-layout-art-v2:', CONFLICT = 'flow-cabin-lan-layout-conflict:';
let queue = Promise.resolve();
export function withSyncLock(operation) { const next = queue.then(operation, operation); queue = next.catch(() => {}); return next; }
export function storageFingerprint(storage = localStorage) {
  const keys = [JOURNAL_KEY, SESSION_LOG_KEY];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(PREFIX) || key.startsWith(CONFLICT)) keys.push(key); }
  return JSON.stringify(keys.sort().map(key => [key, storage.getItem(key)]));
}
export function applyIfUnchanged(snapshot, fingerprint, storage = localStorage, target = globalThis.window) {
  if (fingerprint !== storageFingerprint(storage)) throw new Error('同步期间本机内容发生变化，已保留本机内容，请重试同步。');
  return applySnapshot(snapshot, storage, target);
}
const empty = () => ({ version: 1, notes: [], layouts: [], focus: [] });
const json = (storage, key, fallback) => { const raw = storage.getItem(key); return raw == null ? fallback : JSON.parse(raw); };
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
export async function exportSnapshot(storage = localStorage) {
  let device = storage.getItem(DEVICE); if (!device) { device = crypto.randomUUID(); storage.setItem(DEVICE, device); }
  const previous = json(storage, META, empty()), result = empty();
  const data = { notes: json(storage, JOURNAL_KEY, []), focus: json(storage, SESSION_LOG_KEY, []), layouts: [] };
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(PREFIX) || key.startsWith(CONFLICT)) data.layouts.push({ id: key.slice(key.startsWith(PREFIX) ? PREFIX.length : CONFLICT.length), ...json(storage, key, {}) }); }
  for (const domain of ['notes', 'layouts', 'focus']) {
    const old = new Map(previous[domain].map(r => [r.id, r]));
    for (const value of data[domain]) {
      const id = value.id, before = old.get(id); old.delete(id);
      if (!id) throw new Error('本机同步数据缺少标识');
      const deleted = value.purgedAt != null;
      if (before && before.deleted === deleted && (deleted || JSON.stringify(before.value) === JSON.stringify(value))) result[domain].push(before);
      else result[domain].push({ id, rev: (before?.rev || 0) + 1, device, at: Date.now(), deleted, ...(deleted ? {} : { value }), ...(before ? { base: await hash(before) } : {}) });
    }
    // Keep deletion markers indefinitely; taking a device offline cannot resurrect a deletion.
    for (const before of old.values()) result[domain].push(before.deleted ? before : { id: before.id, rev: before.rev + 1, device, at: Date.now(), deleted: true, base: await hash(before) });
  }
  storage.setItem(META, JSON.stringify(result)); return result;
}
export function applySnapshot(snapshot, storage = localStorage, target = globalThis.window) {
  if (snapshot?.version !== 1 || !['notes', 'layouts', 'focus'].every(d => Array.isArray(snapshot[d]) && snapshot[d].length <= 5000)) throw new Error('收到的同步格式无效');
  const notes = snapshot.notes.map(r => {
    const value = r.deleted ? { id: r.id, purgedAt: r.at } : normalizeJournalStoredRecord({ ...r.value, id: r.id });
    if (!value) throw new Error('收到的手记格式无效'); return value;
  });
  const focus = snapshot.focus.filter(r => !r.deleted).map(r => {
    const v = r.value;
    if (!v || v.id !== r.id || !Number.isFinite(v.start) || !Number.isFinite(v.end) || v.end < v.start || !Number.isFinite(v.durationMs) || v.durationMs < 0 || typeof v.completed !== 'boolean') throw new Error('收到的专注记录无效');
    return { id: v.id, start: v.start, end: v.end, durationMs: v.durationMs, completed: v.completed, taskId: String(v.taskId || '').slice(0, 100), taskText: String(v.taskText || '').slice(0, 8000), album: v.album, track: v.track, cover: typeof v.cover === 'string' && v.cover.startsWith('data:image/') && v.cover.length <= 400 * 1024 ? v.cover : '' };
  });
  const layouts = snapshot.layouts.map(r => ({ record: r, value: r.deleted ? null : validateLayout(r.value) }));
  // Validate everything before writing, then roll back if quota/storage rejects any write.
  const writes = [[JOURNAL_KEY, JSON.stringify(notes)], [SESSION_LOG_KEY, JSON.stringify(focus)], [META, JSON.stringify(snapshot)]];
  for (const { record: r, value } of layouts) {
    const key = r.id.includes('~conflict-') ? `flow-cabin-lan-layout-conflict:${r.id}` : PREFIX + r.id;
    writes.push([key, value ? JSON.stringify(value) : null]);
  }
  const before = writes.map(([key]) => [key, storage.getItem(key)]);
  try { for (const [key, raw] of writes) raw === null ? storage.removeItem(key) : storage.setItem(key, raw); }
  catch (error) { for (const [key, raw] of before) { try { raw === null ? storage.removeItem(key) : storage.setItem(key, raw); } catch {} } throw error; }
  target?.dispatchEvent(new Event(JOURNAL_CHANGE)); target?.dispatchEvent(new Event(SESSION_EVENT));
  target?.dispatchEvent(new Event('cabin:lan-synced'));
  return { notes: notes.length, focus: focus.length, layouts: layouts.length, conflicts: snapshot.layouts.filter(r => r.id.includes('~conflict-')).length };
}
export async function syncRequest(route, data) {
  if (globalThis.window?.albumMobile?.syncRequest) return window.albumMobile.syncRequest(route, data);
  const response = await fetch(`/desktop-sync${route}`, { method: data === undefined ? 'GET' : 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '局域网同步暂不可用'); return value;
}
// Install once at the app root. Listener remains off until explicitly enabled in settings.
export function startLanBridge({ onError = () => {} } = {}) {
  let busy = false, closed = false;
  const tick = async () => {
    if (busy || closed) return; busy = true;
    try { await withSyncLock(async () => { const state = await syncRequest('/status'); if (state.enabled && !closed) { const fingerprint = storageFingerprint(); const local = await exportSnapshot(); const merged = await syncRequest('/stage', local); if (!closed && JSON.stringify(merged) !== JSON.stringify(local)) applyIfUnchanged(merged, fingerprint); } }); } catch (error) { onError(error); } finally { busy = false; }
  };
  const timer = setInterval(tick, 5000); tick();
  return () => { closed = true; clearInterval(timer); };
}

export function layoutConflicts(storage = localStorage) { const result = []; for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(CONFLICT)) { try { result.push({ key, value: validateLayout(json(storage, key)) }); } catch {} } } return result; }
export function restoreLayoutConflict(key, storage = localStorage) { if (!key.startsWith(CONFLICT)) throw new Error('布局副本无效'); const value = validateLayout(json(storage, key)); storage.setItem(PREFIX + value.theme, JSON.stringify(value)); storage.removeItem(key); return value; }
