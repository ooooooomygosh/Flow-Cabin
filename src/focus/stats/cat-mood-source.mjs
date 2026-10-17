// Defensive reader for the cat mood / feeding data owned by the pet logic
// (docs/events.md § cabin:cat-fed). Everything here tolerates the key or the
// event being absent: callers hide the line when this returns null.
export const CAT_MOOD_KEY = 'flow-cabin-cat-mood-v1', CAT_FED_EVENT = 'cabin:cat-fed';
const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const LEVELS = { happy: '心情很好', ok: '心情不错', low: '有点无精打采' };
export function moodLevel(raw) {
  if (typeof raw === 'string') { const s = raw.toLowerCase(); if (/happy|开心|great|good/.test(s)) return 'happy'; if (/low|sad|蔫|无精打采|droopy|hungry/.test(s)) return 'low'; return 'ok'; }
  const n = num(raw); if (n == null) return null;
  const v = n <= 1 ? n * 100 : n; // 0..1 or 0..100
  return v >= 70 ? 'happy' : v >= 35 ? 'ok' : 'low';
}
const feedTime = (f) => num(f) ?? num(f?.at) ?? num(f?.time) ?? num(f?.t) ?? null;
// Returns { feeds, level, label } for [from, to), or null when there is no usable data.
export function readCatMood(storage, from, to) {
  let data; try { data = JSON.parse(storage?.getItem?.(CAT_MOOD_KEY) || 'null'); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const log = [data.feeds, data.fedLog, data.feedLog, data.history].find(Array.isArray) || [];
  const feeds = log.map(feedTime).filter((t) => t != null && t >= from && t < to).length;
  const level = moodLevel(data.mood ?? data.value ?? data.level);
  if (!feeds && !level) return null;
  return { feeds, level, label: level ? LEVELS[level] : '' };
}
export function subscribeCatFed(target, fn) {
  if (!target?.addEventListener) return () => {};
  const on = () => fn(); target.addEventListener(CAT_FED_EVENT, on);
  const onStorage = (e) => { if (!e || e.key === CAT_MOOD_KEY) fn(); }; target.addEventListener('storage', onStorage);
  return () => { target.removeEventListener(CAT_FED_EVENT, on); target.removeEventListener('storage', onStorage); };
}
