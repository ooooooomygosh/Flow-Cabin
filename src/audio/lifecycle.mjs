import { normalizeMix } from './ambience.mjs';
import { createIdleSuspend } from './idle-suspend.mjs';

// All async work is fenced by generations. Injected audio/timer factories keep
// cancellation, rapid toggles and import restoration testable without a browser.
export function createSoundscapeController({ initialMix, createContext, createAmbience, loadPlayer, onChange = () => {}, persist = () => {}, schedule = setTimeout, cancel = clearTimeout, idleSuspend = (context) => createIdleSuspend(context, { ms: 1500 }) }) {
  let alive = false, wanted = false, generation = 0, musicGeneration = 0;
  let context = null, ambience = null, player = null, loading = null, restart = null, idle = null;
  let state = { mix: normalizeMix(initialMix), enabled: false, section: null, lofiState: 'off', error: '', ducked: false };
  const emit = (patch) => { state = { ...state, ...patch }; if (alive) onChange(state); };
  const safely = (fn) => { try { const result = fn(); result?.catch?.(() => {}); } catch {} };
  const stopMusic = () => {
    musicGeneration++;
    if (restart !== null) cancel(restart);
    restart = null; loading = null;
    const old = player; player = null;
    if (old) safely(() => old.dispose());
    emit({ lofiState: 'off', section: null });
  };
  const syncAmbience = () => {
    if (!ambience) return;
    ambience.setMaster(state.mix.master);
    for (const [id, volume] of Object.entries(state.mix.tracks)) ambience.set(id, state.enabled ? volume : 0);
  };
  const startMusic = () => {
    if (!alive || !state.enabled || !state.mix.lofiOn || player || loading || restart !== null) return;
    const token = ++musicGeneration;
    const valid = () => alive && state.enabled && state.mix.lofiOn && token === musicGeneration;
    emit({ lofiState: 'loading', error: '' });
    const pending = Promise.resolve().then(() => {
      if (!valid()) return null;
      return loadPlayer({ onSection: (section) => { if (valid()) emit({ section }); } });
    }).then((next) => {
      if (!next) return;
      if (!valid()) { safely(() => next.dispose()); return; }
      player = next;
      next.setVolume(state.mix.lofi * state.mix.master);
      next.setDuck(state.ducked);
      next.start();
      emit({ lofiState: 'playing' });
    }).catch(() => {
      if (!valid()) return;
      stopMusic();
      emit({ error: 'Lo-fi 电台没有响，请检查系统音频后重试。' });
    }).finally(() => { if (loading === pending) loading = null; });
    loading = pending;
  };
  const sync = () => {
    syncAmbience();
    if (!state.enabled || !state.mix.lofiOn) stopMusic();
    else if (player) { player.setVolume(state.mix.lofi * state.mix.master); player.setDuck(state.ducked); }
    else startMusic();
  };
  const turnOff = () => {
    wanted = false; generation++;
    emit({ enabled: false }); stopMusic(); safely(syncAmbience);
    idle?.idle(); // after the fade-out, the silent ambience context stops waking the audio thread
  };
  const turnOn = async () => {
    if (!alive || wanted) return;
    wanted = true;
    const token = ++generation;
    emit({ error: '' });
    try {
      if (!context) { context = createContext(); ambience = createAmbience(context); idle = idleSuspend(context); }
      idle?.cancel();
      const current = context;
      if (current.state === 'suspended') await current.resume();
      if (!alive || !wanted || token !== generation) return;
      emit({ enabled: true }); sync();
    } catch {
      if (!alive || token !== generation) return;
      turnOff();
      safely(() => ambience?.stop()); ambience = null; idle?.cancel(); idle = null;
      safely(() => context?.close()); context = null;
      emit({ error: '音频无法启动，请检查浏览器权限或系统音频后重试。' });
    }
  };
  const save = (mix) => {
    const value = normalizeMix(mix);
    emit({ mix: value }); safely(() => persist(value)); sync(); return value;
  };
  return {
    getState: () => state,
    activate() { alive = true; },
    dispose() {
      alive = false; turnOff();
      safely(() => ambience?.stop()); ambience = null; idle?.cancel(); idle = null;
      const old = context; context = null; safely(() => old?.close());
    },
    turnOn, turnOff,
    toggle: () => wanted ? turnOff() : turnOn(),
    replaceMix(mix) {
      turnOff();
      const value = normalizeMix(mix);
      // Imports must report storage failures to their caller. Persist before
      // publishing the new configuration so a rejected restore is not transient.
      persist(value);
      emit({ mix: value }); sync(); return value;
    },
    setTrack(id, volume) { const next = save({ ...state.mix, tracks: { ...state.mix.tracks, [id]: volume } }); if (next.tracks[id] > 0 && !wanted) void turnOn(); return next; },
    setMaster: (master) => save({ ...state.mix, master }),
    setLofi(lofiOn) { save({ ...state.mix, lofiOn }); if (lofiOn && !wanted) void turnOn(); },
    setLofiVolume: (lofi) => save({ ...state.mix, lofi }),
    setDucked(ducked) { emit({ ducked: Boolean(ducked) }); player?.setDuck(state.ducked); },
    skipSection() {
      if (!alive || !state.enabled || !state.mix.lofiOn) return;
      stopMusic();
      const token = musicGeneration;
      restart = schedule(() => {
        if (!alive || token !== musicGeneration) return;
        restart = null; startMusic();
      }, 450);
    }
  };
}
