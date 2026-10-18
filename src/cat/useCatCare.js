import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useFocusState } from '../focus/useFocus';
import * as care from './cat-care.mjs';

// One live view of the cat's care per window. useCatCareHost() runs once in the cabin: it owns
// the focus-session listener, the feed requests (button or a 小鱼干 dropped on the cat), pets and
// the slow mood clock. Everything else reads useCatCare().
let snapshot = null; const listeners = new Set();
const emit = () => { for (const fn of [...listeners]) fn(); };
const view = (c, now = Date.now(), message = snapshot?.message || '') => {
  const mood = Math.round(care.moodAt(c, now)), tier = care.tierOf(mood);
  return { mood, tier, label: care.TIER_LABELS[tier], feedsToday: care.feedsOn(c, now), dailyFeeds: care.DAILY_FEEDS, totalFeeds: c.totalFeeds, actions: care.unlockedActions(c), next: care.FEED_ACTIONS.find((a) => a.feeds > c.totalFeeds) || null, message };
};
const current = () => snapshot || (snapshot = view(care.readCare()));
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const publish = (c, message, { announceMood = true, force = false } = {}) => {
  const before = snapshot; snapshot = view(c, Date.now(), message); emit();
  document.documentElement.dataset.catMood = snapshot.tier;
  if (announceMood && (force || !before || before.mood !== snapshot.mood || before.tier !== snapshot.tier)) window.dispatchEvent(new CustomEvent(care.MOOD_EVENT, { detail: { mood: snapshot.mood, tier: snapshot.tier } }));
};
const update = (change, message) => { const next = change(care.readCare()); if (next) { care.writeCare(next); publish(next, message); } return next; };

export const requestFeed = () => window.dispatchEvent(new CustomEvent(care.FEED_REQUEST_EVENT));
// The last feed attempt, for the desktop pet (CompanionBridge → companion snapshot `care`): it plays
// its eating frames on a new `fedAt`, or shows `note` when the feed was refused (no fish / full).
let lastFeed = { fedAt: 0, ok: false, note: '' };
export const careForCompanion = () => ({ ...lastFeed, tier: snapshot?.tier || '' });
export function useCatCare() { return useSyncExternalStore(subscribe, current, current); }

export function useCatCareHost() {
  const live = useRef(null); live.current = useFocusState();
  useEffect(() => {
    // A stale stored tier rewritten by decay is always announced: the first render already shows
    // the decayed mood, so comparing with it would swallow the change (bini's retest #5).
    const refresh = (message) => { const { care: c, changed } = care.refreshCare(); publish(c, message, { force: changed }); };
    refresh('');
    const onSession = (event) => update((c) => care.focusDone(c, event.detail), '专注完成，小猫很开心。');
    const onPet = () => update((c) => care.pet(c), snapshot?.message || '');
    const onFeed = () => {
      const focus = live.current; if (!focus) return;
      const fish = focus.state.rewards.fish, c = care.readCare(), result = care.feed(c, fish);
      if (!result.ok) { lastFeed = { fedAt: Date.now(), ok: false, note: result.message || '' }; publish(c, result.message, { announceMood: false }); return; }
      focus.spendFish(1);
      care.writeCare(result.care); publish(result.care, result.message);
      const last = result.care.feeds.at(-1); lastFeed = { fedAt: last.at, ok: true, note: '' };
      window.dispatchEvent(new CustomEvent(care.FED_EVENT, { detail: { at: last.at, mood: snapshot.mood, tier: snapshot.tier, fishLeft: last.fishLeft, totalFeeds: result.care.totalFeeds } }));
    };
    // 「喂一条」 from the desktop pet (right-click menu, or a 小鱼干 dropped on it) arrives through the shell.
    const onCommand = (event) => { if (event.detail?.command === 'cat-feed') onFeed(); };
    window.addEventListener('album-companion-command', onCommand);
    const onStorage = (event) => { if (event.key === care.MOOD_KEY || event.key === care.META_KEY) publish(care.readCare(), ''); };
    const clock = setInterval(() => refresh(snapshot?.message || ''), 10 * 60000);
    window.addEventListener('cabin:focus-session', onSession); window.addEventListener('cabin:cat-petted', onPet);
    window.addEventListener(care.FEED_REQUEST_EVENT, onFeed); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('album-companion-command', onCommand); clearInterval(clock); window.removeEventListener('cabin:focus-session', onSession); window.removeEventListener('cabin:cat-petted', onPet); window.removeEventListener(care.FEED_REQUEST_EVENT, onFeed); window.removeEventListener('storage', onStorage); };
  }, []);
}
