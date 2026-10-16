import { useCallback, useSyncExternalStore } from 'react';
import { quantise } from './position-store.mjs';

// Leaf subscriptions to the deck's playhead (playback.clock, see position-store.mjs).
// `step` quantises the position so a component that shows whole seconds renders
// once a second, not on every timeupdate. Without a clock (visual/system decks) → 0.
const none = () => () => {};
export function usePlaybackPosition(playback, step = 0) {
  const clock = playback?.clock;
  const subscribe = useCallback((fn) => clock ? clock.subscribe(fn) : none(), [clock]);
  return useSyncExternalStore(subscribe, () => clock ? quantise(clock.get().position, step) : 0, () => 0);
}
export function usePlaybackDuration(playback) {
  const clock = playback?.clock;
  const subscribe = useCallback((fn) => clock ? clock.subscribe(fn) : none(), [clock]);
  return useSyncExternalStore(subscribe, () => clock ? clock.get().duration : 0, () => 0);
}
