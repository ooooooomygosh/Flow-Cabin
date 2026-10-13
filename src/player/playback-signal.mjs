// `cabin:playback` — one global, read-only signal other parts of the cabin
// (turntable, pet, wallpaper) can follow without importing the player.
// Contract and examples: docs/events.md.
export const PLAYBACK_EVENT = 'cabin:playback';
export const ENERGY_INTERVAL_MS = 66; // ≈15 fps

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// RMS of an analyser's byte time-domain frame (128 = silence), mapped to 0..1.
// Typical mastered music sits around RMS 0.1–0.3, so a gain lifts it into a
// useful range and a soft knee keeps loud passages from pinning at 1.
export function rmsEnergy(frame, gain = 3.2) {
  if (!frame?.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) { const sample = (frame[i] - 128) / 128; sum += sample * sample; }
  const rms = Math.sqrt(sum / frame.length) * gain;
  return clamp01(rms / (1 + rms * 0.35) * 1.35);
}

// Attack fast, release slower: motion follows beats without flicker.
export function smoothEnergy(previous, next, attack = 0.6, release = 0.18) {
  const prev = clamp01(previous), value = clamp01(next);
  return clamp01(prev + (value - prev) * (value > prev ? attack : release));
}

// Used when no analyser can be attached (remote speakers, system player,
// cross-origin audio). Gentle and clearly marked as estimated.
export function estimatedEnergy(time) { return clamp01(0.32 + Math.sin(time / 420) * 0.08 + Math.sin(time / 173) * 0.04); }

// Any beat time serves as the phase anchor, so the next beat of the same
// tempo is not news: only a tempo change or a 30 ms+ phase shift is.
function beatMoved(previous, next) {
  if (Math.abs((previous.bpm || 0) - (next.bpm || 0)) >= .5) return true;
  if (!next.bpm || !previous.beatAt) return Boolean(next.bpm);
  const length = 60000 / next.bpm, error = ((next.beatAt - previous.beatAt) % length + length) % length;
  return Math.min(error, length - error) > 30;
}
const sameTrack = (a, b) => (a?.id || '') === (b?.id || '') && (a?.index ?? -1) === (b?.index ?? -1) && (a?.title || '') === (b?.title || '');

// Throttles energy ticks to ~15 fps; play/pause and track changes go out at
// once. `target` is `window` in the app and a stub in tests.
export function createPlaybackBroadcaster({ target, now = () => Date.now(), interval = ENERGY_INTERVAL_MS, EventClass = globalThis.CustomEvent } = {}) {
  let last = null, lastAt = -Infinity;
  const send = (detail) => {
    last = detail; lastAt = now();
    if (target && EventClass) target.dispatchEvent(new EventClass(PLAYBACK_EVENT, { detail }));
    return detail;
  };
  return {
    update({ playing = false, energy = 0, provider = '', estimated = false, track = null, spinning = false, bpm = 0, beatAt = 0 } = {}) {
      const tempo = playing && bpm >= 40 && bpm <= 220 ? Math.round(bpm * 10) / 10 : 0;
      const detail = { playing: Boolean(playing), energy: playing ? Math.round(clamp01(energy) * 1000) / 1000 : 0, provider: String(provider || ''), estimated: Boolean(estimated), spinning: Boolean(spinning), bpm: tempo, beatAt: tempo && Number.isFinite(beatAt) ? Math.round(beatAt) : 0, track: track ? { id: String(track.id || ''), index: Number(track.index) || 0, title: String(track.title || ''), artist: String(track.artist || ''), album: String(track.album || '') } : null };
      if (!last) return send({ ...detail, reason: 'state' });
      if (!sameTrack(last.track, detail.track)) return send({ ...detail, reason: 'track' });
      if (last.playing !== detail.playing || last.provider !== detail.provider || last.spinning !== detail.spinning) return send({ ...detail, reason: 'state' });
      if (!detail.playing) return null;
      // A new tempo, or a beat that has drifted from the last one sent, goes out at once.
      if (beatMoved(last, detail)) return send({ ...detail, reason: 'beat' });
      if (now() - lastAt < interval) return null;
      if (Math.abs(last.energy - detail.energy) < 0.004) return null;
      return send({ ...detail, reason: 'energy' });
    },
    last: () => last
  };
}
