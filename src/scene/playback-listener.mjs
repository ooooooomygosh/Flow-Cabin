import { PLAYBACK_EVENT } from '../player/playback-signal.mjs';
import { setBeat } from '../player/beat-clock.mjs';

// Visual-side subscription to the player's `cabin:playback` window event
// (broadcast by src/player/playback-signal.mjs, contract in docs/events.md):
//   detail = { playing: boolean, energy: 0..1 }, ~15 Hz while playing, once on change.
// Listeners are coalesced to one call per animation frame; everything keeps
// working (idle) when the event never fires.
const listeners = new Set();
let latest = { playing: false, energy: 0, bpm: 0, beatAt: 0 }, frame = 0, attached = false;
const flush = () => { frame = 0; for (const fn of listeners) fn(latest); };
const receive = (event) => {
  const d = event?.detail || {};
  const energy = Number(d.energy);
  const bpm = d.playing && Number(d.bpm) >= 40 && Number(d.bpm) <= 220 ? Number(d.bpm) : 0, beatAt = bpm && Number(d.beatAt) > 0 ? Number(d.beatAt) : 0;
  latest = { playing: Boolean(d.playing), energy: Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : (d.playing ? .5 : 0), bpm, beatAt };
  if (d.playing) setBeat({ bpm, beatAt });
  if (!frame) frame = (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16)))(flush);
};
export function onCabinPlayback(fn) {
  if (typeof window === 'undefined') return () => {};
  listeners.add(fn); fn(latest);
  if (!attached) { window.addEventListener(PLAYBACK_EVENT, receive); attached = true; }
  return () => { listeners.delete(fn); if (!listeners.size && attached) { window.removeEventListener(PLAYBACK_EVENT, receive); attached = false; } };
}
export const latestPlayback = () => latest;
