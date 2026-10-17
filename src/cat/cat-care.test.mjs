import test from 'node:test';
import assert from 'node:assert/strict';
import * as care from './cat-care.mjs';
import * as model from '../focus/focus-model.mjs';

const T = new Date(2026, 9, 18, 9).getTime(), H = 3600000;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('mood decays slowly and rests at 无精打采, never lower', () => {
  const c = care.normalizeCare({ mood: 80, updatedAt: T });
  assert.equal(care.moodAt(c, T + 10 * H), 70); assert.equal(care.tierOf(70), 'happy');
  assert.equal(care.moodAt(c, T + 1000 * H), care.FLOOR); assert.equal(care.tierOf(care.FLOOR), 'droopy'); assert.equal(care.TIER_LABELS.droopy, '无精打采');
  assert.equal(care.moodAt(care.normalizeCare({ mood: 10, updatedAt: T }), T + 99 * H), 10, 'decay never raises or lowers a mood already under the floor');
});
test('feeding costs a fish, lifts mood, has a friendly daily cap, and unlocks actions', () => {
  let c = care.normalizeCare({ mood: 50, updatedAt: T });
  assert.equal(care.feed(c, 0, T).reason, 'nofish');
  let r = care.feed(c, 3, T); assert.ok(r.ok); assert.equal(r.care.mood, 62); c = r.care;
  for (let i = 1; i < care.DAILY_FEEDS; i++) c = care.feed(c, 3, T + i).care;
  r = care.feed(c, 3, T + 99); assert.equal(r.ok, false); assert.equal(r.reason, 'full'); assert.match(r.message, /吃饱/);
  assert.equal(care.feed(c, 3, T + 24 * H).ok, true, 'a new day');
  assert.equal(care.feedsOn(c, T), care.DAILY_FEEDS); assert.equal(care.feedsBetween(c, T - 1, T + H), care.DAILY_FEEDS);
  let d = care.normalizeCare({ totalFeeds: 2, updatedAt: T }); const u = care.feed(d, 1, T); assert.equal(u.unlocked.id, 'stretch'); assert.match(u.message, /伸懒腰/);
  assert.deepEqual(care.unlockedActions(u.care).map((a) => a.id), ['stretch']); assert.deepEqual(u.care.unlockedActions, ['stretch']); assert.deepEqual(u.care.feeds.at(-1), { at: T, fishLeft: 0 });
  assert.equal(care.normalizeCare({ mood: 99, updatedAt: T }) && care.feed(care.normalizeCare({ mood: 99, updatedAt: T }), 1, T).care.mood, 100);
});
test('pets (capped per day) and each completed focus round (once) cheer the cat up', () => {
  let c = care.normalizeCare({ mood: 50, updatedAt: T });
  for (let i = 0; i < 20; i++) c = care.pet(c, T);
  assert.equal(c.mood, 50 + care.DAILY_PETS * care.PET_MOOD);
  const f = care.focusDone(c, { id: 's1', completed: true }, T); assert.equal(f.mood, c.mood + care.FOCUS_MOOD);
  assert.equal(care.focusDone(f, { id: 's1', completed: true }, T), f, 'the same session counts once');
  assert.equal(care.focusDone(f, { id: 's2', completed: false }, T), f, 'an unfinished round does not');
});
test('store round-trips and survives garbage', () => {
  const s = memory(); assert.equal(care.readCare(s, T).mood, care.START);
  s.setItem(care.MOOD_KEY, '{bad'); assert.equal(care.readCare(s, T).mood, care.START);
  assert.equal(care.writeCare(care.feed(care.readCare(s, T), 1, T).care, s), true); assert.equal(care.readCare(s, T).totalFeeds, 1);
  assert.equal(care.MOOD_KEY, 'flow-cabin-cat-mood-v1'); assert.equal(care.FED_EVENT, 'cabin:cat-fed');
  // The shared schema, exactly (小屋日记 #57 reads it).
  const stored = JSON.parse(s.getItem(care.MOOD_KEY));
  assert.deepEqual(Object.keys(stored).sort(), ['feeds', 'mood', 'tier', 'totalFeeds', 'unlockedActions', 'updatedAt', 'v']);
  assert.equal(stored.v, 1); assert.equal(stored.updatedAt, T); assert.deepEqual(stored.feeds, [{ at: T, fishLeft: 0 }]); assert.equal(stored.tier, care.tierOf(stored.mood)); assert.deepEqual(stored.unlockedActions, []);
  let big = care.normalizeCare({ mood: 50, updatedAt: T }); for (let i = 0; i < 450; i++) big = { ...big, feeds: [...big.feeds, { at: T - i * 86400000, fishLeft: 1 }] };
  assert.equal(care.storedCare(care.normalizeCare(big)).feeds.length, 400, 'keeps the last 400 feeds');
});
test('小鱼干 buy extras early and are spent by feeding', () => {
  let s = model.normalizeFocus({ rewards: { fish: 10, xp: 0 } });
  assert.equal(model.spendFish(s).rewards.fish, 9); assert.equal(model.spendFish(model.normalizeFocus({}), 1).rewards.fish, 0);
  const scarf = model.UNLOCKS.find((u) => u.id === 'scarf'); assert.equal(model.unlockPrice(scarf), 9);
  assert.equal(model.equip(s, 'accessory', 'scarf'), s, 'locked before buying');
  s = model.buyUnlock(s, 'scarf'); assert.equal(s.rewards.fish, 1); assert.deepEqual(s.rewards.bought, ['scarf']);
  assert.equal(model.equip(s, 'accessory', 'scarf').rewards.equipped.accessory, 'scarf');
  assert.equal(model.buyUnlock(s, 'beanie'), s, 'not enough fish');
  assert.deepEqual(model.normalizeFocus({ rewards: { bought: ['scarf', 'nope', 'scarf'], equipped: { accessory: 'scarf' } } }).rewards.bought, ['scarf']);
  assert.equal(model.normalizeFocus({ rewards: { bought: ['scarf'], equipped: { accessory: 'scarf' } } }).rewards.equipped.accessory, 'scarf', 'a bought extra stays equipped after reload');
});
test('care states map to the agreed art slots, and placeholders request nothing', async () => {
  const art = await import('./cat-art.mjs');
  assert.equal(art.catArtPose({ tier: 'droopy' }), 'cat-droopy'); assert.equal(art.catArtPose({ tier: 'happy', phase: 'focus' }), 'cat-desk');
  assert.equal(art.catArtPose({ tier: 'happy' }), 'cat-rub'); assert.equal(art.catArtPose({ tier: 'ok' }), 'cat-wait'); assert.equal(art.catArtPose({ tier: 'happy', pose: 'sleep' }), 'cat-sleep-books');
  assert.deepEqual(Object.keys(art.CAT_POSES).sort(), ['cat-desk', 'cat-droopy', 'cat-rub', 'cat-sleep-books', 'cat-wait']);
  assert.ok(art.CAT_EATING.frames >= 6 && art.CAT_EATING.frames <= 8); assert.equal(art.CAT_EATING.frameMs, 120);
  assert.equal(art.catArtLayer({ tier: 'happy' }), null, 'not ready → placeholder');
  const layer = art.catArtLayer({ eating: true }, { eating: { ...art.CAT_EATING, ready: true } }); assert.equal(layer.url, '/cat/cat-eat.png'); assert.equal(layer.frames, 8);
  assert.equal(art.catArtLayer({ tier: 'ok' }, { poses: { 'cat-wait': { size: 64, ready: true } } }).url, '/cat/cat-wait.png');
});
