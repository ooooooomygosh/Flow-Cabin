// Subscribe before requesting the initial value. A late invoke reply must not
// overwrite a newer broadcast, and a renderer reload must not cause an
// unhandled rejection or update an unmounted component.
// The pet window is a separate page, so the player's `cabin:playback` event
// never reaches it directly. Music state rides in the companion snapshot
// (`musicPlaying`, `energy`; desktop polls ~8 Hz while audio plays) and is
// re-dispatched here as the same window event, so pet code listens to one API.
export const PLAYBACK_EVENT = 'cabin:playback';
export function playbackFromCompanion(companion) {
  const playing = companion?.musicPlaying === true, energy = Number(companion?.energy);
  const bpm = playing ? Number(companion?.bpm) || 0 : 0, beatAt = bpm ? Number(companion?.beatAt) || 0 : 0;
  return { playing, energy: playing && Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0, estimated: playing && companion?.energyEstimated === true, bpm, beatAt, source: 'companion' };
}
export function createPlaybackRelay(target = globalThis.window, EventClass = globalThis.CustomEvent) {
  let last = '';
  return (value) => {
    if (!value || !('companion' in value) || !target?.dispatchEvent || !EventClass) return;
    const detail = playbackFromCompanion(value.companion), key = `${detail.playing}:${detail.energy}:${detail.estimated}:${detail.bpm}:${detail.beatAt}`;
    if (key === last) return;
    last = key; target.dispatchEvent(new EventClass(PLAYBACK_EVENT, { detail: { ...detail, reason: 'companion' } }));
  };
}

export function subscribePetSnapshot(api, apply, relay = createPlaybackRelay()) {
  let alive = true, receivedBroadcast = false;
  const deliver = (value) => { apply(value); try { relay?.(value); } catch {} };
  const off = api?.onSnapshot?.((value) => {
    if (!alive || !value) return;
    receivedBroadcast = true;
    deliver(value);
  });
  Promise.resolve().then(() => api?.getSnapshot?.()).then((value) => {
    if (alive && !receivedBroadcast && value) deliver(value);
  }).catch(() => {
    // Keep the default / last visible pet; a later live snapshot can recover
    // from IPC teardown or temporary main-process initialization failure.
  });
  return () => { alive = false; off?.(); };
}
