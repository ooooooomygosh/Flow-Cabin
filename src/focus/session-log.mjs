// A local, append-only log of focus sessions, richer than the synced focus record.
// Format shared with 小屋日记 (src/focus/stats/session-source.mjs, PR #52, docs/events.md):
// localStorage['flow-cabin-focus-sessions-v1'] is a JSON array of
//   { id, start, end, durationMs, completed, taskId, taskText,
//     album: { id, title, artist } | null, track: { title, artist, album } | null, cover }
// `cover` is the deck cover drawn at 32×32 as a PNG data URL (so the PNG export can render
// it), or '' while the thumbnail is not ready or the image is cross-origin without CORS
// (the journal then draws the pixel sleeve from album title + artist). Never the original. Each end also fires
// `cabin:focus-session` on window with the same record.
export const SESSION_LOG_KEY = 'flow-cabin-focus-sessions-v1';
export const SESSION_EVENT = 'cabin:focus-session';
const MAX = 5000, MINUTE = 60000;

export function sessionRecord({ start, end, completed, todo = null, album = null, track = null }) {
  const s = Math.round(start), e = Math.round(end);
  return {
    id: `s${s}`, start: s, end: e, durationMs: Math.max(0, e - s), completed: Boolean(completed),
    taskId: todo?.id || '', taskText: todo?.text || '',
    album: album?.title ? { id: album.id || '', title: album.title, artist: album.artist || '' } : null,
    track: track?.title ? { title: track.title, artist: track.artist || '', album: track.album || '' } : null,
    cover: storableCover(album?.thumb)  // only the 32×32 thumbnail, '' until it is ready
  };
}
// Only small image data URLs are stored (≤ 400 KB, what 小屋日记 can export).
export function storableCover(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length <= 400 * 1024 ? value : '';
}
// Draws any cover (same-origin path, data URL, or CORS-enabled remote) at 32×32 and returns
// a PNG data URL; '' when it cannot be read (e.g. cross-origin without CORS).
export function coverThumb(url, { size = 32, doc = globalThis.document } = {}) {
  if (!url || !doc) return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { try { const c = doc.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; const s = Math.min(img.naturalWidth, img.naturalHeight); ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size); resolve(c.toDataURL('image/png')); } catch { resolve(''); } };
    img.onerror = () => resolve('');
    img.src = url;
  });
}
export function readSessions(storage = globalThis.localStorage) {
  try { const raw = JSON.parse(storage.getItem(SESSION_LOG_KEY)); const list = Array.isArray(raw) ? raw : Array.isArray(raw?.sessions) ? raw.sessions : []; return list.filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end)); } catch { return []; }
}
export function appendSession(record, storage = globalThis.localStorage) {
  const list = [...readSessions(storage).filter((s) => s.id !== record.id), record].slice(-MAX);
  try { storage.setItem(SESSION_LOG_KEY, JSON.stringify(list)); } catch {}
  return list;
}
// What ended between two focus states (null when no focus round ended): a new entry in
// state.sessions (finished or skipped), or a round stopped from the focus phase (abandoned).
export function endedSession(previous, next, now) {
  const before = previous?.sessions || [], after = next?.sessions || [];
  const task = (id) => (next?.tasks || previous?.tasks || []).find((t) => t.id === id) || (id ? { id } : null);
  if (after.length > before.length || (after.length === before.length && after.length && after.at(-1) !== before.at(-1))) {
    const s = after.at(-1); return { start: s.start, end: s.end, completed: Boolean(s.completed), todo: task(s.taskId) };
  }
  const t = previous?.timer;
  if (t?.phase === 'focus' && next?.timer?.phase === 'idle') {
    const remaining = t.paused ? (t.remaining ?? 0) : Math.max(0, (t.endsAt || now) - now);
    const worked = Math.max(0, (t.duration || 0) - remaining);
    if (worked >= MINUTE) return { start: now - worked, end: now, completed: false, todo: task(t.taskId) };
  }
  return null;
}
export function recordEnd(previous, next, now, { storage = globalThis.localStorage, target = globalThis.window, album = target?.__cabinDeckItem, track = target?.__cabinLastPlayback?.track } = {}) {
  const ended = endedSession(previous, next, now); if (!ended) return null;
  const record = sessionRecord({ ...ended, album, track });
  appendSession(record, storage);
  target?.dispatchEvent?.(new CustomEvent(SESSION_EVENT, { detail: record }));
  return record;
}
