// 小猫照顾: mood, feeding with 小鱼干, pets and focus rounds. Pure functions plus a tiny
// localStorage store. Never punishing: mood drifts down slowly but stops at 「无精打采」
// (FLOOR), the cat never gets sick or leaves. Contract: docs/cat-care.md, docs/events.md.
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

export function normalizeCare(value, now = Date.now()) {
  const v = value && typeof value === 'object' ? value : {};
  const num = (x, f) => Number.isFinite(Number(x)) ? Number(x) : f;
  return {
    version: 1,
    mood: clamp(num(v.mood, START), 0, MAX), at: num(v.at, now),
    feeds: (Array.isArray(v.feeds) ? v.feeds : []).map(Number).filter(Number.isFinite).slice(-500),
    totalFeeds: Math.max(0, Math.round(num(v.totalFeeds, 0))),
    pets: v.pets && typeof v.pets === 'object' ? { day: String(v.pets.day || ''), count: Math.max(0, num(v.pets.count, 0)) } : { day: '', count: 0 },
    rewarded: (Array.isArray(v.rewarded) ? v.rewarded : []).map(String).slice(-200)
  };
}
// Mood now: slow decay since `at`, never below FLOOR (and never pulled up by decay).
export function moodAt(care, now = Date.now()) {
  const hours = Math.max(0, now - care.at) / HOUR;
  return care.mood <= FLOOR ? care.mood : Math.max(FLOOR, care.mood - hours * DECAY_PER_HOUR);
}
export function tierOf(mood) { return mood >= 70 ? 'happy' : mood >= 45 ? 'ok' : 'sleepy'; }
export const TIER_LABELS = Object.freeze({ happy: '开心', ok: '还不错', sleepy: '无精打采' });
const settle = (care, now, delta) => ({ ...care, mood: Math.round(clamp(moodAt(care, now) + delta, 0, MAX) * 10) / 10, at: now });
export const feedsOn = (care, now = Date.now()) => care.feeds.filter((t) => dayKey(t) === dayKey(now)).length;
export const feedsBetween = (care, from, to) => care.feeds.filter((t) => t >= from && t < to).length;
export const unlockedActions = (care) => FEED_ACTIONS.filter((a) => care.totalFeeds >= a.feeds);

export function canFeed(care, fish, now = Date.now()) {
  if (feedsOn(care, now) >= DAILY_FEEDS) return { ok: false, reason: 'full', message: '小猫今天已经吃饱啦，明天再喂吧～' };
  if (fish < 1) return { ok: false, reason: 'nofish', message: '还没有小鱼干。完成一轮专注就能得到一条。' };
  return { ok: true, reason: '', message: '' };
}
export function feed(care, fish, now = Date.now()) {
  const check = canFeed(care, fish, now); if (!check.ok) return { ...check, care };
  const next = { ...settle(care, now, FEED_MOOD), feeds: [...care.feeds, now].slice(-500), totalFeeds: care.totalFeeds + 1 };
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
export function readCare(storage = globalThis.localStorage, now = Date.now()) { try { return normalizeCare(JSON.parse(storage.getItem(MOOD_KEY)), now); } catch { return normalizeCare(null, now); } }
export function writeCare(care, storage = globalThis.localStorage) { try { storage.setItem(MOOD_KEY, JSON.stringify(care)); return true; } catch { return false; } }
