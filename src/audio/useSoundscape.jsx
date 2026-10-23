import React, { createContext, useContext, useEffect, useState } from 'react';
import { createAmbience, normalizeMix, SOUND_KEY } from './ambience.mjs';
import { createSoundscapeController } from './lifecycle.mjs';
import { createNativeSoundscapeController } from '../mobile/native-soundscape.mjs';

const SoundContext = createContext(null);
const readMix = () => { try { return normalizeMix(JSON.parse(localStorage.getItem(SOUND_KEY) || '{}')); } catch { return normalizeMix(); } };

// Lives above the room, but starts only in response to a user action.
export function SoundscapeProvider({ children }) {
  const [state, setState] = useState(() => ({ mix: readMix(), enabled: false, section: null, lofiState: 'off', error: '', ducked: false }));
  const [controller] = useState(() => (window.albumMobile?.ambience ? createNativeSoundscapeController : createSoundscapeController)({
    native: window.albumMobile,
    initialMix: state.mix,
    createContext: () => new (window.AudioContext || window.webkitAudioContext)(),
    createAmbience,
    loadPlayer: async (options) => (await import('./lofi-engine.mjs')).createLofiPlayer(options),
    persist: (mix) => localStorage.setItem(SOUND_KEY, JSON.stringify(mix)),
    onChange: setState
  }));
  useEffect(() => {
    controller.activate();
    const command = (event) => { if (event.detail?.command === 'sound-toggle') controller.toggle(); };
    const phase = (event) => { if (event.detail?.autoSound && event.detail.phase === 'focus') controller.turnOn(); };
    window.addEventListener('album-companion-command', command);
    window.addEventListener('album-focus-start', phase);
    return () => {
      window.removeEventListener('album-companion-command', command);
      window.removeEventListener('album-focus-start', phase);
      controller.dispose();
    };
  }, [controller]);
  return <SoundContext.Provider value={{ ...state, ...controller }}>{children}</SoundContext.Provider>;
}
export function useSoundscape() { return useContext(SoundContext); }
