// 小猫照顾: mood, feeding with 小鱼干, pets and focus rounds. Pure functions plus a tiny
// localStorage store. Never punishing: mood drifts down slowly but stops at 「无精打采」
// (FLOOR, tier 'droopy'), the cat never gets sick or leaves. Contract: docs/cat-care.md, docs/events.md.
export const MOOD_KEY = 'flow-cabin-cat-mood-v1';
export const FED_EVENT = 'cabin:cat-fed';
export const MOOD_EVENT = 'cabin:cat-mood';
export const FEED_REQUEST_EVENT = 'cabin:cat-feed-request'; // the button or a 小鱼干 dropped on the cat
export const FISH_DRAG_TYPE = 'application/x-cabin-fish';
export const START = 60, FLOOR = 30, MAX = 100;
export const DECAY_PER_HOUR = 1;            // ~a day from 开心 to 还不错, then it rests at the floor
export const FEED_MOOD = 12, PET_MOOD = 2, FOCUS_MOOD = 8;
export const DAILY_FEEDS = 5, DAILY_PETS = 10;
export const FEED_ACTIONS = Object.freeze([
  { feeds: 3, id: 'stretch', name: '伸懒腰' },
  { feeds: 10, id: 'roll', name: '打滚' },
  { feeds: 25, id: 'groom', name: '洗脸' },
  { feeds: 50, id: 'loaf', name: '揣手手' }
]);
const HOUR = 3600000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// Stored exactly as 小屋日记 (#57) reads it:
//   flow-cabin-cat-mood-v1 = { v: 1, mood, tier, updatedAt, feeds: [{ at, fishLeft }] (last 400), totalFeeds, unlockedActions }
// Daily pet counts and already-rewarded focus sessions live beside it in META_KEY.
export const META_KEY = 'flow-cabin-cat-care-meta-v1';
export function normalizeCare(value, now = Date.now(), meta = null) {
  const v = value && typeof value === 'object' ? value : {}, m = meta && typeof meta === 'object' ? meta : {};
  const num = (x, f) => Number.isFinite(Number(x)) ? Number(x) : f;
  const feeds = (Array.isArray(v.feeds) ? v.feeds : []).map((f) => typeof f === 'number' ? { at: f, fishLeft: 0 } : f && { at: num(f.at, NaN), fishLeft: Math.max(0, Math.round(num(f.fishLeft, 0))) }).filter((f) => f && Number.isFinite(f.at)).slice(-400);
  const totalFeeds = Math.max(feeds.length, Math.round(num(v.totalFeeds, 0)));
  const mood = clamp(num(v.mood, START), 0, MAX);
  return {
    v: 1, mood, tier: tierOf(mood), updatedAt: num(v.updatedAt, now), feeds, totalFeeds,
    unlockedActions: FEED_ACTIONS.filter((a) => totalFeeds >= a.feeds).map((a) => a.id),
    pets: m.pets && typeof m.pets === 'object' ? { day: String(m.pets.day || ''), count: Math.max(0, num(m.pets.count, 0)) } : { day: '', count: 0 },
    rewarded: (Array.isArray(m.rewarded) ? m.rewarded : []).map(String).slice(-200)
  };
}
// Mood now: slow decay since `at`, never below FLOOR (and never pulled up by decay).
export const FISH_DRAG_TEXT = 'cabin-fish';
export function moodAt(care, now = Date.now()) {
  const hours = Math.max(0, now - care.updatedAt) / HOUR;
  return care.mood <= FLOOR ? care.mood : Math.max(FLOOR, care.mood - hours * DECAY_PER_HOUR);
}
export function tierOf(mood) { return mood >= 70 ? 'happy' : mood >= 45 ? 'ok' : 'droopy'; }
export const TIER_LABELS = Object.freeze({ happy: '开心', ok: '还不错', droopy: '无精打采' });
const settle = (care, now, delta) => { const mood = Math.round(clamp(moodAt(care, now) + delta, 0, MAX) * 10) / 10; return { ...care, mood, tier: tierOf(mood), updatedAt: now }; };
export const feedsOn = (care, now = Date.now()) => care.feeds.filter((f) => dayKey(f.at) === dayKey(now)).length;
export const feedsBetween = (care, from, to) => care.feeds.filter((f) => f.at >= from && f.at < to).length;
export const unlockedActions = (care) => FEED_ACTIONS.filter((a) => care.totalFeeds >= a.feeds);

export function canFeed(care, fish, now = Date.now()) {
  if (feedsOn(care, now) >= DAILY_FEEDS) return { ok: false, reason: 'full', message: '小猫今天已经吃饱啦，明天再喂吧～' };
  if (fish < 1) return { ok: false, reason: 'nofish', message: '还没有小鱼干。完成一轮专注就能得到一条。' };
  return { ok: true, reason: '', message: '' };
}
export function feed(care, fish, now = Date.now()) {
  const check = canFeed(care, fish, now); if (!check.ok) return { ...check, care };
  const totalFeeds = care.totalFeeds + 1;
  const next = { ...settle(care, now, FEED_MOOD), feeds: [...care.feeds, { at: now, fishLeft: fish - 1 }].slice(-400), totalFeeds, unlockedActions: FEED_ACTIONS.filter((a) => totalFeeds >= a.feeds).map((a) => a.id) };
  const unlocked = FEED_ACTIONS.find((a) => a.feeds === next.totalFeeds) || null;
  return { ok: true, reason: '', message: unlocked ? `小猫学会了「${unlocked.name}」！` : '小猫吃得很香。', care: next, unlocked };
}
export function pet(care, now = Date.now()) {
  const day = dayKey(now), count = care.pets.day === day ? care.pets.count : 0;
  if (count >= DAILY_PETS) return { ...care, pets: { day, count } };
  return { ...settle(care, now, PET_MOOD), pets: { day, count: count + 1 } };
}
export function focusDone(care, record, now = Date.now()) {
  if (!record?.completed) return care;
  const id = String(record.id || record.end || now); if (care.rewarded.includes(id)) return care;
  return { ...settle(care, now, FOCUS_MOOD), rewarded: [...care.rewarded, id].slice(-200) };
}
const parse = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
export function readCare(storage = globalThis.localStorage, now = Date.now()) { return normalizeCare(parse(storage, MOOD_KEY), now, parse(storage, META_KEY)); }
// The stored record, exactly the shared schema (no extra fields).
export const storedCare = (care) => ({ v: 1, mood: care.mood, tier: tierOf(care.mood), updatedAt: care.updatedAt, feeds: care.feeds.slice(-400), totalFeeds: care.totalFeeds, unlockedActions: care.unlockedActions });
// Decay applied: the mood and tier right now, without writing (journal relies on the stored tier).
export function getCatMoodNow(storage = globalThis.localStorage, now = Date.now()) { const mood = Math.round(moodAt(readCare(storage, now), now)); return { mood, tier: tierOf(mood) }; }
// Re-settle the stored record when decay has moved it to another tier, so the stored tier stays true.
export function refreshCare(storage = globalThis.localStorage, now = Date.now()) {
  const care = readCare(storage, now), stored = parse(storage, MOOD_KEY);
  const tier = tierOf(moodAt(care, now));
  if (!stored || stored.tier === tier) return { care, changed: false };
  const next = settle(care, now, 0); writeCare(next, storage); return { care: next, changed: true };
}
export function writeCare(care, storage = globalThis.localStorage) {
  try { storage.setItem(MOOD_KEY, JSON.stringify(storedCare(care))); storage.setItem(META_KEY, JSON.stringify({ pets: care.pets, rewarded: care.rewarded })); return true; } catch { return false; }
}
