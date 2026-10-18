import { useEffect, useRef } from 'react';
import { useFocusState as useFocus } from './focus/useFocus'; // read on demand: no clock re-renders
import { useSoundscape } from './audio/useSoundscape';
import { focusSnapshot } from './focus/focus-model.mjs';
import { PLAYBACK_EVENT } from './player/playback-signal.mjs';
import { currentFocusDisplay } from './focus/useFocusDisplay';
import { careForCompanion } from './cat/useCatCare';

// Energy is quantised so the desktop shell's change detection only relays
// visible differences to the pet window.
const ENERGY_STEP = 0.05;

// Read by the desktop shell for the wallpaper and the desktop pet. It holds
// display data only: no session, platform cookies or audio URLs.
export default function CompanionBridge() {
  const focus = useFocus(), sound = useSoundscape(), latest = useRef({}), music = useRef({ playing: false, energy: 0, estimated: false, bpm: 0, beatAt: 0 });
  useEffect(() => {
    const receive = (event) => { const d = event.detail || {}, energy = Number(d.energy); music.current = { playing: d.playing === true, energy: d.playing === true && Number.isFinite(energy) ? Math.round(Math.max(0, Math.min(1, energy)) / ENERGY_STEP) * ENERGY_STEP : 0, estimated: d.estimated === true, bpm: d.playing === true ? Number(d.bpm) || 0 : 0, beatAt: d.playing === true ? Number(d.beatAt) || 0 : 0 }; };
    window.addEventListener(PLAYBACK_EVENT, receive); return () => window.removeEventListener(PLAYBACK_EVENT, receive);
  }, []);
  // 键鼠跟随 fallback: keyboard and pointer activity inside the cabin.
  // Ignore event objects entirely; both sources share a timestamp-only throttle.
  const typedAt = useRef(0);
  useEffect(() => {
    let last = -Infinity;
    const activity = () => { const at = Date.now(); if (at - last >= 120) { last = at; typedAt.current = at; } };
    window.addEventListener('keydown', activity, true);
    window.addEventListener('pointerdown', activity, true);
    return () => {
      window.removeEventListener('keydown', activity, true);
      window.removeEventListener('pointerdown', activity, true);
    };
  }, []);
  latest.current = { focus, sound };
  useEffect(() => {
    const getter = () => {
      const { focus: f, sound: s } = latest.current, room = window.albumRoomSnapshot?.() || null;
      return {
        room,
        petId: room?.petId || 'cat',
        focus: f ? focusSnapshot(f.state, Date.now()) : null,
        // The 专注画面 choice, so the wallpaper shows the same face (its own partition cannot read it).
        focusDisplay: currentFocusDisplay(),
        sound: s ? { enabled: s.enabled, lofi: s.lofiState === 'playing' } : null,
        playing: Boolean(room?.grooving || (s?.lofiState === 'playing')),
        track: room?.track || '',
        // Real audio only (see docs/events.md); `playing` above also covers lo-fi / spinning.
        musicPlaying: music.current.playing, energy: Number(music.current.energy.toFixed(2)), energyEstimated: music.current.estimated,
        // The detected beat (tempo + one beat's wall-clock time): the pet window keeps its own beat clock.
        bpm: music.current.bpm, beatAt: music.current.beatAt,
        // Lo-fi has a section tempo, but no shared beat-phase anchor.
        // The desktop pet eats on a new fedAt (fed from its own menu or the cabin), or says `note`.
        care: careForCompanion(),
        typingAt: typedAt.current,
        lofiBpm: !music.current.playing && s?.lofiState === 'playing' ? Number(s.section?.bpm) || 0 : 0
      };
    };
    window.albumCompanionSnapshot = getter;
    return () => { if (window.albumCompanionSnapshot === getter) delete window.albumCompanionSnapshot; };
  }, []);
  return null;
}
