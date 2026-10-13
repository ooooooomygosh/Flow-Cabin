import { useEffect, useRef } from 'react';
import { useFocus } from './focus/useFocus';
import { useSoundscape } from './audio/useSoundscape';
import { focusSnapshot } from './focus/focus-model.mjs';
import { PLAYBACK_EVENT } from './player/playback-signal.mjs';

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
  latest.current = { focus, sound };
  useEffect(() => {
    const getter = () => {
      const { focus: f, sound: s } = latest.current, room = window.albumRoomSnapshot?.() || null;
      return {
        room,
        petId: room?.petId || 'cat',
        focus: f ? focusSnapshot(f.state, Date.now()) : null,
        sound: s ? { enabled: s.enabled, lofi: s.lofiState === 'playing' } : null,
        playing: Boolean(room?.grooving || (s?.lofiState === 'playing')),
        track: room?.track || '',
        // Real audio only (see docs/events.md); `playing` above also covers lo-fi / spinning.
        musicPlaying: music.current.playing, energy: Number(music.current.energy.toFixed(2)), energyEstimated: music.current.estimated,
        // The detected beat (tempo + one beat's wall-clock time): the pet window keeps its own beat clock.
        bpm: music.current.bpm, beatAt: music.current.beatAt,
        // Lo-fi has a section tempo, but no shared beat-phase anchor.
        lofiBpm: !music.current.playing && s?.lofiState === 'playing' ? Number(s.section?.bpm) || 0 : 0
      };
    };
    window.albumCompanionSnapshot = getter;
    return () => { if (window.albumCompanionSnapshot === getter) delete window.albumCompanionSnapshot; };
  }, []);
  return null;
}
