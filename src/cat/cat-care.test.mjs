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
  assert.equal(art.catArtPose({ tier: 'happy' }), 'cat-rub'); assert.equal(art.catArtPose({ tier: 'ok' }), 'cat-wait'); assert.equal(art.catArtPose({ tier: 'happy', pose: 'sleep' }), 'cat-rub'); assert.equal(art.catArtPose({ tier: 'droopy', pose: 'sleep' }), 'cat-droopy'); assert.equal(art.catArtPose({ tier: 'ok', pose: 'sleep' }), 'cat-sleep-books'); assert.equal(art.catArtPose({ tier: 'droopy', full: true }), 'cat-rub');
  assert.deepEqual(Object.keys(art.CAT_POSES).sort(), ['cat-desk', 'cat-droopy', 'cat-listen', 'cat-rub', 'cat-sleep-books', 'cat-wait']);
  assert.ok(art.CAT_EATING.frames >= 6 && art.CAT_EATING.frames <= 8); assert.equal(art.CAT_EATING.frameMs, 120);
  assert.equal(art.catArtLayer({ tier: 'happy' }), null, 'not ready → placeholder');
  const layer = art.catArtLayer({ eating: true }, { eating: { ...art.CAT_EATING, ready: true } }); assert.equal(layer.url, '/cat/cat-eat.png'); assert.equal(layer.frames, 8);
  assert.equal(art.catArtLayer({ tier: 'ok' }, { poses: { 'cat-wait': { size: 64, ready: true } } }).url, '/cat/cat-wait.png');
});

test('decay keeps the stored tier fresh; getCatMoodNow reads without writing', () => {
  const data = new Map(), s = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  const t0 = Date.UTC(2026, 9, 1, 12);
  s.setItem(care.MOOD_KEY, JSON.stringify({ v: 1, mood: 72, tier: 'happy', updatedAt: t0, feeds: [], totalFeeds: 0, unlockedActions: [] }));
  assert.deepEqual(care.getCatMoodNow(s, t0 + 3600e3), { mood: 71, tier: 'happy' });
  assert.equal(care.refreshCare(s, t0 + 3600e3).changed, false);
  const later = t0 + 5 * 3600e3; assert.deepEqual(care.getCatMoodNow(s, later), { mood: 67, tier: 'ok' });
  assert.equal(JSON.parse(s.getItem(care.MOOD_KEY)).tier, 'happy', 'reading does not write');
  assert.equal(care.refreshCare(s, later).changed, true);
  const stored = JSON.parse(s.getItem(care.MOOD_KEY)); assert.equal(stored.tier, 'ok'); assert.equal(stored.updatedAt, later); assert.equal(stored.mood, 67);
});

test('beat: the cat dances only to a real detected beat, peaks on the beat', async () => {
  const sync = await import('./beat-sync.mjs'), clock = await import('../player/beat-clock.mjs'), model = await import('../pet/pet-model.mjs'), art = await import('./cat-art.mjs');
  const beat = { bpm: 120, beatAt: 1_000_000, detected: true, known: true };
  assert.equal(sync.beatSynced({ playing: true, beat }), true);
  assert.equal(sync.beatSynced({ playing: false, beat }), false, 'paused: nothing');
  assert.equal(sync.beatSynced({ playing: true, beat: { bpm: 96, beatAt: 0, detected: false, known: false } }), false, 'default clock');
  assert.equal(sync.beatSynced({ playing: true, beat: clock.setBeat({ bpm: 88 }) }), true, 'lo-fi: its own exact tempo');
  assert.equal(sync.beatSynced({ playing: true, beat: clock.setBeat({ bpm: 0 }) }), false, 'estimated: no tempo, default clock');
  // 120 BPM: 500 ms beats, frames every 250 ms: L on beat k, dip, R on beat k+1, dip.
  assert.deepEqual([0, 250, 500, 750, 1000, 1500].map((t) => sync.grooveFrameIndex(beat.beatAt + t, beat)), [0, 1, 2, 3, 0, 2]);
  assert.equal(sync.cyclePhase(beat.beatAt - 1, beat, 2), 999);
  // The sway peaks (±3°) sit exactly on beats (offsets 0 and .5 of a 2-beat cycle).
  assert.deepEqual(sync.SWAY_KEYS.filter((k) => k.rotate !== '0deg').map((k) => k.offset), [0, .5, 1]);
  const anim = { currentTime: 0, timing: { duration: 1000 }, effect: { getTiming: () => anim.timing, updateTiming: (t) => Object.assign(anim.timing, t) } };
  sync.lockToBeat(anim, { now: beat.beatAt + 1100, beat, beats: 2 }); assert.equal(anim.timing.duration, 1000); assert.equal(anim.currentTime, 100);
  sync.lockToBeat(anim, { now: beat.beatAt + 1100, beat: { ...beat, bpm: 60 }, beats: 1 }); assert.equal(anim.timing.duration, 1000);
  // Sprite cat: no beat → listen (idle until the sprite has it), never a made-up 96 BPM groove.
  assert.equal(model.petPose({ playing: true, synced: true }), 'groove');
  assert.equal(model.petPose({ playing: true, synced: false }), 'listen');
  assert.deepEqual(model.grooveFrame(5000, { bpm: 0, beatAt: 0 }), { index: 0, wait: 250 });
  // PNG cat: groove strip with a beat, cat-listen without; droopy and focus keep their poses.
  assert.equal(art.catArtPose({ tier: 'happy', music: 'beat' }), 'cat-groove'); assert.equal(art.catArtPose({ tier: 'ok', music: 'free' }), 'cat-listen');
  assert.equal(art.catArtPose({ tier: 'droopy', music: 'beat' }), 'cat-droopy'); assert.equal(art.catArtPose({ tier: 'happy', phase: 'focus', music: 'beat' }), 'cat-desk');
  assert.equal(art.catArtLayer({ tier: 'happy', music: 'beat' }, { groove: { ...art.CAT_GROOVE, ready: false } }), null, 'missing strip: the sprite cat dances instead');
  assert.equal(art.catArtLayer({ tier: 'happy', music: 'beat' }, { groove: { ...art.CAT_GROOVE, ready: true } }).frames, 4);
});

test('beat tracker: synthetic click tracks lock fast and precisely; a steady tone or noise never counts', async () => {
  const { createBeatTracker } = await import('../player/beat-tracker.mjs');
  const feed = (level, ms = 10000) => { const t = createBeatTracker(); let locked = 0; for (let at = 0; at < ms; at += 1000 / 60) { t.push(at, level(at)); if (!locked && t.state().confident) locked = at; } return { ...t.state(), locked }; };
  for (const bpm of [120, 90, 75, 150]) {
    const B = 60000 / bpm, s = feed((at) => { const p = at % B; return p < 60 ? .8 * Math.exp(-p / 25) : .1; });
    assert.equal(s.confident, true, `${bpm}`); assert.ok(Math.abs(s.bpm - bpm) < .6, `${bpm}: ${s.bpm}`);
    let err = ((s.beatAt % B) + B) % B; if (err > B / 2) err -= B; assert.ok(Math.abs(err) < 12, `${bpm} phase ${err}`); assert.ok(s.locked < 4500, `${bpm} locked at ${s.locked}`);
  }
  assert.equal(feed(() => .4 + Math.random() * .004).confident, false, 'steady tone');
  assert.equal(feed(() => Math.random() * .3).confident, false, 'noise');
  // Kicks stop (a quiet passage): confidence drops within ~2 s.
  const t = createBeatTracker(); for (let at = 0; at < 8000; at += 1000 / 60) t.push(at, at % 500 < 60 ? .8 : .1); assert.equal(t.state().confident, true);
  for (let at = 8000; at < 10500; at += 1000 / 60) t.push(at, .1); assert.equal(t.state().confident, false);
});

test('beat clock: one stable anchor — jittery estimates never flip beat parity; tempo change / reset re-anchor', async () => {
  const clock = await import('../player/beat-clock.mjs'), sync = await import('./beat-sync.mjs');
  clock.resetBeat(); const B = 500, t0 = 1_000_000;
  clock.setBeat({ bpm: 120, beatAt: t0 }, t0); const parity = (now) => Math.floor(sync.cyclePhase(now, clock.currentBeat(), 2) / B);
  const truth = (now) => Math.floor((((now - t0) % 1000) + 1000) % 1000 / B);
  let flips = 0, worst = 0;
  for (let now = t0; now < t0 + 12000; now += 66) { // ~15 updates a second, each naming "the latest beat" with ±15 ms jitter
    const latest = t0 + Math.floor((now - t0) / B) * B + (Math.random() * 30 - 15); clock.setBeat({ bpm: 120 + (Math.random() - .5) * .2, beatAt: latest }, now);
    const probe = now + 120, edge = Math.abs((((probe - t0) % B) + B) % B - B / 2) > B / 2 - 25; if (!edge && parity(probe) !== truth(probe)) flips++;
    let e = ((clock.currentBeat().beatAt - t0) % B + B) % B; if (e > B / 2) e -= B; worst = Math.max(worst, Math.abs(e));
  }
  assert.equal(flips, 0, 'parity stays'); assert.ok(worst < 20, `anchor stays within ${worst} ms`);
  // A real phase change (seek without reset) snaps after a few consistent updates; a new tempo re-anchors at once.
  for (let i = 0; i < 5; i++) clock.setBeat({ bpm: 120, beatAt: t0 + 250 }, t0 + 20000 + i * 66);
  let e = ((clock.currentBeat().beatAt - t0 - 250) % B + B) % B; if (e > B / 2) e -= B; assert.ok(Math.abs(e) < 5, `snapped (${e})`);
  clock.setBeat({ bpm: 90, beatAt: t0 + 123 }, t0 + 21000); assert.equal(clock.currentBeat().beatAt, t0 + 123);
  clock.setBeat({ bpm: 0 }); assert.equal(clock.currentBeat().known, false, 'bpm 0 (seek / skip / estimated) → listen');
  clock.resetBeat();
});
