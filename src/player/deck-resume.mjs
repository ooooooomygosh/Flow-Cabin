// 重启后恢复上次播放: what the deck remembers between launches. Only the song's
// identity (record id + track index) and where it was — never a resolved stream
// URL, which expires and may carry account tokens. The deck comes back paused at
// that spot; a page reload made by the app itself (切换首页) may resume playing.
import { queueId } from './player-queue.mjs';

export const RESUME_KEY = 'flow-cabin-deck-resume-v1';
// Set just before the app reloads its own page; read (and removed) once on the next start.
export const RESUME_ONCE_KEY = 'flow-cabin-deck-resume-once-v1';
const RESUME_ONCE_MS = 2 * 60 * 1000;
// Saving every timeupdate would hammer storage: a new spot is written only after this much movement.
export const RESUME_SAVE_STEP_S = 5;
// Near the very end there is nothing left to resume; start the song over instead.
const END_MARGIN_S = 5;

const finite = (value) => Number.isFinite(value) ? value : 0;
// A clean point, or null when there is nothing worth remembering.
export function resumePoint({ record, trackIndex = 0, position = 0, duration = 0, playing = false, at = Date.now() } = {}) {
  const id = queueId(record?.id ?? record);
  if (!id || id.length > 80 || !Number.isSafeInteger(trackIndex) || trackIndex < 0) return null;
  const length = Math.max(0, finite(duration)), spot = Math.max(0, finite(position));
  const near = length > 0 && spot > length - END_MARGIN_S;
  return { id, index: trackIndex, position: near ? 0 : Math.round(Math.min(spot, length || spot) * 10) / 10, duration: Math.round(length * 10) / 10, playing: playing === true, at: finite(at) };
}
export function readResume(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage?.getItem(RESUME_KEY)); return value && typeof value === 'object' ? resumePoint({ record: value.id, trackIndex: value.index, position: value.position, duration: value.duration, playing: value.playing, at: value.at }) : null; }
  catch { return null; }
}
export function writeResume(point, storage = globalThis.localStorage) {
  try { if (!point) storage?.removeItem(RESUME_KEY); else storage?.setItem(RESUME_KEY, JSON.stringify(point)); return true; } catch { return false; }
}
// Write when the song, the play state or the spot (by RESUME_SAVE_STEP_S while playing) changed.
// A paused deck only moves when someone seeks, so every move of half a second counts.
export function resumeChanged(previous, next) {
  if (!previous || !next) return previous !== next;
  const step = next.playing ? RESUME_SAVE_STEP_S : .5;
  return previous.id !== next.id || previous.index !== next.index || previous.playing !== next.playing || Math.abs(previous.position - next.position) >= step || (previous.duration === 0) !== (next.duration === 0);
}
export function markResumeOnLoad(storage = globalThis.localStorage, now = Date.now()) { try { storage?.setItem(RESUME_ONCE_KEY, String(now)); } catch {} }
export function takeResumeOnLoad(storage = globalThis.localStorage, now = Date.now()) {
  try { const at = Number(storage?.getItem(RESUME_ONCE_KEY)); storage?.removeItem(RESUME_ONCE_KEY); return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < RESUME_ONCE_MS; } catch { return false; }
}
// What to put back on the deck: the record (found by id among `items`), the track,
// the spot, and whether to start playing (only after the app's own reload, and
// only if it was playing then). Null when the record left the shelf.
export function restorePlan(point, items, { resumeOnLoad = false } = {}) {
  if (!point) return null;
  const item = (Array.isArray(items) ? items : []).find((entry) => queueId(entry?.id) === point.id);
  if (!item) return null;
  const count = Array.isArray(item.tracks) ? item.tracks.length : 0;
  const index = count ? Math.min(point.index, count - 1) : 0, sameTrack = index === point.index;
  return { item, index, position: sameTrack ? point.position : 0, duration: sameTrack ? point.duration : 0, autoplay: Boolean(resumeOnLoad && point.playing) };
}
