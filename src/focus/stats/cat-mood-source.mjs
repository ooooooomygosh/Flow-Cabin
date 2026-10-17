// Reader for the cat mood / feeding store owned by the pet logic (docs/events.md
// § cabin:cat-fed). Format v1: { v: 1, mood: 0–100, tier: 'happy'|'ok'|'droopy',
// updatedAt, feeds: [{ at, fishLeft }] (last 400), totalFeeds, unlockedActions }.
// Missing or malformed data → null, and the journal hides the cat line.
export const CAT_MOOD_KEY = 'flow-cabin-cat-mood-v1', CAT_FED_EVENT = 'cabin:cat-fed', CAT_MOOD_EVENT = 'cabin:cat-mood';
export const TIER_LABEL = Object.freeze({ happy: '心情很好', ok: '心情不错', droopy: '有点无精打采' });
const isTier = (t) => Object.hasOwn(TIER_LABEL, t);
const isTime = (v) => typeof v === 'number' && Number.isFinite(v);
// Returns { feeds, tier, mood, label } for the week [from, to), or null.
export function readCatMood(storage, from, to) {
  let data; try { data = JSON.parse(storage?.getItem?.(CAT_MOOD_KEY) || 'null'); } catch { return null; }
  if (!data || typeof data !== 'object' || data.v !== 1) return null;
  const tier = isTier(data.tier) ? data.tier : null;
  const feeds = Array.isArray(data.feeds) ? data.feeds.filter((f) => isTime(f?.at) && f.at >= from && f.at < to).length : 0;
  if (!tier && !feeds) return null;
  return { feeds, tier, mood: isTime(data.mood) ? data.mood : null, label: tier ? TIER_LABEL[tier] : '' };
}
// Re-read on feeding, mood changes and cross-window writes of the key.
export function subscribeCatMood(target, fn) {
  if (!target?.addEventListener) return () => {};
  const on = () => fn(), onStorage = (e) => { if (!e || e.key === CAT_MOOD_KEY) fn(); };
  target.addEventListener(CAT_FED_EVENT, on); target.addEventListener(CAT_MOOD_EVENT, on); target.addEventListener('storage', onStorage);
  return () => { target.removeEventListener(CAT_FED_EVENT, on); target.removeEventListener(CAT_MOOD_EVENT, on); target.removeEventListener('storage', onStorage); };
}
