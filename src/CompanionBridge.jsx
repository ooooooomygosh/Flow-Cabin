import { createLivingPet, bindPetLife } from './pet/living-pet.mjs';
import { readLife } from './home/life-state.mjs';
import { selectedPack } from './pet/imported-pack.mjs';
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
  const life = useRef(null); life.current ||= createLivingPet();
  useEffect(() => bindPetLife(life.current), []);
  useEffect(() => {
    const receive = (event) => { const d = event.detail || {}, energy = Number(d.energy); music.current = { playing: d.playing === true, energy: d.playing === true && Number.isFinite(energy) ? Math.round(Math.max(0, Math.min(1, energy)) / ENERGY_STEP) * ENERGY_STEP : 0, estimated: d.estimated === true, bpm: d.playing === true ? Number(d.bpm) || 0 : 0, beatAt: d.playing === true ? Number(d.beatAt) || 0 : 0 }; };
    window.addEventListener(PLAYBACK_EVENT, receive); return () => window.removeEventListener(PLAYBACK_EVENT, receive);
  }, []);
  // 键鼠跟随 fallback: keyboard and pointer activity inside the cabin.
  // Ignore event objects entirely. Keyboard and click are independent so a click
  // can interrupt typing immediately instead of sharing one timestamp.
  const typedAt = useRef(0), clickedAt = useRef(0);
  useEffect(() => {
    const last = { keyboard: -Infinity, click: -Infinity };
    const activity = (type) => {
      const at = Date.now();
      if (at - last[type] < 120) return;
      last[type] = at;
      if (type === 'click') clickedAt.current = at;
      else typedAt.current = at;
    };
    const keydown = () => activity('keyboard'), pointerdown = () => activity('click');
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('pointerdown', pointerdown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('pointerdown', pointerdown, true);
    };
  }, []);
  latest.current = { focus, sound };
  useEffect(() => {
    const getter = () => {
      const { focus: f, sound: s } = latest.current, room = window.albumRoomSnapshot?.() || null;
      const now=Date.now(), timer=f?.state.timer;
      const pose=life.current.resolve({now,focus:timer?.phase==='focus'&&!timer.paused,playing:music.current.playing||s?.lofiState==='playing',synced:Boolean(music.current.bpm&&music.current.beatAt),resting:readLife().resting,input:now-typedAt.current<900?'keyboard':now-clickedAt.current<500?'click':'',reduced:document.documentElement.dataset.desktopReduceMotion==='true'}).pose;
      return {
        room, pose,
        petId: room?.petId || 'cat',
        petPack: selectedPack(),
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
        clickAt: clickedAt.current,
        lofiBpm: !music.current.playing && s?.lofiState === 'playing' ? Number(s.section?.bpm) || 0 : 0
      };
    };
    window.albumCompanionSnapshot = getter;
    return () => { if (window.albumCompanionSnapshot === getter) delete window.albumCompanionSnapshot; };
  }, []);
  return null;
}
