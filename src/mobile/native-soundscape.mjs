import { normalizeMix } from '../audio/ambience.mjs';
// Android owns audio beyond the WebView lifetime. Never instantiate Web Audio here.
export function createNativeSoundscapeController({ native, initialMix, persist = () => {}, onChange = () => {}, schedule = setInterval, cancel = clearInterval }) {
  let live = false, timer, serial = Promise.resolve(), revision = 0, section = 0;
  let state = { mix: normalizeMix(initialMix), enabled: false, section: null, lofiState: 'off', error: '', ducked: false };
  const emit = patch => { state = { ...state, ...patch }; if (live) onChange(state); };
  const update = () => {
    const config = { mix: state.mix, enabled: state.enabled, ducked: state.ducked, section }, current = ++revision;
    serial = serial.then(() => native.ambience(config)).catch(() => { if (current === revision) emit({ enabled: false, error: '手机环境音未能启动，请重新开启。' }); });
    emit({ section: state.enabled && state.mix.lofiOn ? { seed: section, bpm: 72, key: 'C', chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'].map(name => ({ name })) } : null, lofiState: state.enabled && state.mix.lofiOn ? 'playing' : 'off' }); return serial;
  };
  const save = mix => { const value = normalizeMix(mix); persist(value); emit({ mix: value, error: '' }); update(); return value; };
  const turnOn = () => { emit({ enabled: true, error: '' }); return update(); };
  const turnOff = () => { emit({ enabled: false }); return update(); };
  return {
    getState: () => state,
    activate() {
      live = true;
      const poll = async () => { const before = revision; try { const value = await native.ambienceState(); if (live && before === revision) emit({ enabled: value.enabled, lofiState: value.enabled && state.mix.lofiOn ? 'playing' : 'off' }); } catch {} };
      poll(); timer = schedule(poll, 1000);
    },
    dispose() { live = false; cancel(timer); },
    turnOn, turnOff, toggle: () => state.enabled ? turnOff() : turnOn(),
    replaceMix(mix) { turnOff(); return save(mix); },
    setTrack(id, volume) { const value = save({ ...state.mix, tracks: { ...state.mix.tracks, [id]: volume } }); if (value.tracks[id] > 0 && !state.enabled) turnOn(); return value; },
    setMaster: master => save({ ...state.mix, master }),
    setLofi(lofiOn) { save({ ...state.mix, lofiOn }); if (lofiOn && !state.enabled) turnOn(); },
    setLofiVolume: lofi => save({ ...state.mix, lofi }),
    setDucked(ducked) { emit({ ducked: Boolean(ducked) }); update(); },
    lofiBeatAt: () => 0, // The PCM mixer does not claim output-latency-correct beat timing.
    skipSection() { if (state.enabled && state.mix.lofiOn) { section++; update(); } }
  };
}
