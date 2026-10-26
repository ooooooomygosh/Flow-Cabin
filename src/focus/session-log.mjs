// A local, append-only log of focus sessions, richer than the synced focus record.
// Format shared with 小屋日记 (src/focus/stats/session-source.mjs, PR #52, docs/events.md):
// localStorage['flow-cabin-focus-sessions-v1'] is a JSON array of
//   { id, start, end, durationMs, completed, taskId, taskText,
//     album: { id, title, artist } | null, track: { title, artist, album } | null, cover, note? }
// `taskText` is the picked todo, or the typed 「这一段做什么？」 intention (then `taskId` is '').
// `note` (optional, ≤ 140 chars) is 「留一句话给这一段」 from the 压制唱片 card; records without it stay valid.
// `cover` is the deck cover drawn at 32×32 as a PNG data URL (so the PNG export can render
// it), or '' while the thumbnail is not ready or the image is cross-origin without CORS
// (the journal then draws the pixel sleeve from album title + artist). Never the original. Each end also fires
// `cabin:focus-session` on window with the same record.
export const SESSION_LOG_KEY = 'flow-cabin-focus-sessions-v1';
export const SESSION_EVENT = 'cabin:focus-session';
// A record already in the log changed (a note was added): readers reload. Never a new round.
export const SESSIONS_CHANGED = 'cabin:focus-sessions-changed';
export const NOTE_LIMIT = 140;
// 「留一句话给这一段」: plain text, line breaks folded, at most NOTE_LIMIT characters ('' when empty).
export function normalizeSessionNote(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, NOTE_LIMIT).join('').trim();
}
const MAX = 5000, MINUTE = 60000;

export function sessionRecord({ start, end, completed, todo = null, album = null, track = null }) {
  const s = Math.round(Number(start)), e = Math.round(Number(end));
  // 没有可用时间就不写记录：一条 NaN 记录会在读回时被丢掉，等于悄悄消失。
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
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
  // 图片构造器也从注入的文档里取：这段画缩略图的代码因此可以被假文档测到。
  const ImageClass = doc.defaultView?.Image || globalThis.Image;
  if (typeof ImageClass !== 'function') return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new ImageClass(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { try { const c = doc.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; const s = Math.min(img.naturalWidth, img.naturalHeight); ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size); resolve(c.toDataURL('image/png')); } catch { resolve(''); } };
    img.onerror = () => resolve('');
    img.src = url;
  });
}
export function readSessions(storage = globalThis.localStorage) {
  try { const raw = JSON.parse(storage.getItem(SESSION_LOG_KEY)); const list = Array.isArray(raw) ? raw : Array.isArray(raw?.sessions) ? raw.sessions : []; return list.filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end)); } catch { return []; }
}
// 写进本机才算数：写失败时如实返回失败，不把没落盘的记录说成已保存。
export function appendSession(record, storage = globalThis.localStorage) {
  if (!record || typeof record.id !== 'string') return { ok: false, list: readSessions(storage), error: '专注日志记录无效，未写入。' };
  const list = [...readSessions(storage).filter((s) => s.id !== record.id), record].slice(-MAX);
  try { storage.setItem(SESSION_LOG_KEY, JSON.stringify(list)); return { ok: true, list, error: '' }; }
  catch { return { ok: false, list: readSessions(storage), error: '专注日志未能保存，原有记录保持不变。请检查本机存储后重试。' }; }
}
// Adds (or clears) the note on one logged record, in place. Same honesty as appendSession.
export function setSessionNote(id, note, { storage = globalThis.localStorage, target = globalThis.window } = {}) {
  const text = normalizeSessionNote(note);
  let raw;
  try { raw = JSON.parse(storage.getItem(SESSION_LOG_KEY)); } catch { raw = null; }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.sessions) ? raw.sessions : [];
  const index = list.findIndex((s) => s && s.id === id);
  if (index < 0) return { ok: false, error: '没有找到这一段的记录，这句话没有保存。' };
  const { note: _old, ...rest } = list[index], record = text ? { ...rest, note: text } : rest;
  const next = [...list]; next[index] = record;
  try { storage.setItem(SESSION_LOG_KEY, JSON.stringify(Array.isArray(raw) ? next : { ...raw, sessions: next })); }
  catch { return { ok: false, error: '这句话没能保存，唱片本身已经收好了。请检查本机存储后重试。' }; }
  target?.dispatchEvent?.(new CustomEvent(SESSIONS_CHANGED, { detail: { id } }));
  return { ok: true, record };
}
// Two records describe the same round when they cover the same window; a
// re-read (re-normalised) state must not look like a second finished round.
const sameRound = (a, b) => Boolean(a) && Boolean(b) && a.start === b.start && a.end === b.end && Boolean(a.completed) === Boolean(b.completed);
// What ended between two focus states (null when no focus round ended): a new entry in
// state.sessions (finished or skipped), or a round stopped from the focus phase (abandoned).
export function endedSession(previous, next, now) {
  const before = previous?.sessions || [], after = next?.sessions || [];
  // A typed intention (no todo picked) is kept as the session's text with an empty taskId.
  const typed = previous?.timer?.intent || next?.timer?.intent || '';
  const task = (id) => (next?.tasks || previous?.tasks || []).find((t) => t.id === id) || (id ? { id } : typed ? { id: '', text: typed } : null);
  const last = (list) => (list.length ? list[list.length - 1] : null);
  if (after.length > before.length || (after.length === before.length && after.length && !sameRound(last(after), last(before)))) {
    const s = last(after); return { start: s.start, end: s.end, completed: Boolean(s.completed), todo: task(s.taskId) };
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
  if (!record) return null;
  const saved = appendSession(record, storage);
  // 没写进本机就不对外宣布：这轮专注否则只活在别人的内存里。
  if (!saved.ok) return null;
  target?.dispatchEvent?.(new CustomEvent(SESSION_EVENT, { detail: record }));
  return record;
}
