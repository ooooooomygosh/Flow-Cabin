// Focus-session source for the stats panel. Pure, storage/event-agnostic.
//
// ASSUMED SCHEMA (to reconcile with the focus-entry work, see docs/events.md):
// Each finished focus session is appended to localStorage[SESSION_LOG_KEY] as
// a JSON array (or { version, sessions: [] }) and announced on window as
// `cabin:focus-session` with the same record in `event.detail`:
//   { id?, start, end, durationMs, completed, taskId, taskText?,
//     album?: { id?, title, artist? } | string, track?: { title, artist?, album? },
//     cover?: string /* album cover: data:image/… or http(s)/same-site URL */,
//     note?: string /* 「留一句话给这一段」, ≤ 140 chars */ }
// `start`/`end` are epoch ms. Aliases startedAt/endedAt/startAt/endAt are read
// too. Records without a usable start/end are dropped.
//
// FALLBACK: main already stores `{ start, end, taskId, completed }` in the
// pomodoro state (`album-circle-focus-v1:<user>` → sessions). Those are read as
// well and merged; a logged record that matches a legacy one (same minute
// window) wins because it carries album/track.
export const FOCUS_SESSION_EVENT = 'cabin:focus-session';
export const SESSION_LOG_KEY = 'flow-cabin-focus-sessions-v1';
import { normalizeSessionNote } from '../session-log.mjs';
const MINUTE = 60000, MAX_SESSION = 4 * 60 * MINUTE, MAX_RECORDS = 5000;

const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const str = (value, max = 120) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';

// Cover: data:image/…, http(s) or a same-site path. Anything else is dropped.
export function normalizeCover(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v)) return v.length <= 400000 ? v : '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v) || /^\/[^/\s"'<>][^\s"'<>]*$/.test(v)) return v.slice(0, 2000);
  return '';
}
function normalizeAlbum(album, track, cover = '') {
  const withCover = (a) => a && { ...a, cover: normalizeCover(cover) || normalizeCover(album?.cover) };
  if (typeof album === 'string' && str(album)) return withCover({ key: str(album).toLowerCase(), title: str(album), artist: '' });
  if (album && typeof album === 'object' && str(album.title)) {
    const title = str(album.title), artist = str(album.artist);
    return withCover({ key: str(album.id, 80) || `${title}\u0000${artist}`.toLowerCase(), title, artist });
  }
  if (track && typeof track === 'object' && str(track.album)) return normalizeAlbum({ title: track.album, artist: track.artist }, null, cover);
  return null;
}

export function normalizeSessionRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let start = num(raw.start ?? raw.startedAt ?? raw.startAt), end = num(raw.end ?? raw.endedAt ?? raw.endAt);
  const duration = num(raw.durationMs);
  if (!end && start && duration > 0) end = start + duration;
  if (!start && end && duration > 0) start = end - duration;
  if (!start || end <= start || end - start > MAX_SESSION) return null;
  const durationMs = duration > 0 && duration <= end - start ? Math.round(duration) : end - start;
  const track = raw.track && typeof raw.track === 'object' ? { title: str(raw.track.title), artist: str(raw.track.artist), album: str(raw.track.album) } : null;
  const note = normalizeSessionNote(raw.note);
  return { id: str(raw.id, 60) || `s${start}`, start, end, durationMs, completed: raw.completed !== false, taskId: str(raw.taskId, 40), taskText: str(raw.taskText), album: normalizeAlbum(raw.album, track, raw.cover), track, ...(note ? { note } : {}) };
}

export function readSessionLog(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SESSION_LOG_KEY) || '[]');
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return list.map(normalizeSessionRecord).filter(Boolean);
  } catch { return []; }
}

// Legacy pomodoro sessions (main ≤ v1.16) → the same shape.
export const fromLegacySessions = (sessions) => (Array.isArray(sessions) ? sessions : []).map((s) => normalizeSessionRecord(s && { ...s, id: `legacy-${s.start}` })).filter(Boolean);

const richness = (s) => (s.album ? 2 : 0) + (s.taskText ? 1 : 0) + (s.note ? 1 : 0) + (s.id.startsWith('legacy-') ? 0 : 1);
// Merge sources, dropping duplicates whose start and end are both within a minute.
export function mergeSessions(...lists) {
  const all = lists.flat().filter(Boolean).sort((a, b) => a.start - b.start || richness(b) - richness(a)), out = [];
  for (const session of all) {
    const twin = out.findLast((s) => Math.abs(s.start - session.start) < MINUTE && Math.abs(s.end - session.end) < MINUTE);
    if (!twin) { out.push(session); continue; }
    if (richness(session) > richness(twin)) out[out.indexOf(twin)] = { ...twin, ...session, taskId: session.taskId || twin.taskId };
  }
  return out.slice(-MAX_RECORDS);
}

export function loadSessions({ storage, legacy } = {}) { return mergeSessions(fromLegacySessions(legacy), readSessionLog(storage)); }

// Listen for live sessions; returns an unsubscribe function.
export function subscribeSessions(target, onSession) {
  if (!target?.addEventListener) return () => {};
  const handler = (event) => { const record = normalizeSessionRecord(event?.detail); if (record) onSession(record); };
  target.addEventListener(FOCUS_SESSION_EVENT, handler);
  return () => target.removeEventListener(FOCUS_SESSION_EVENT, handler);
}
