import { useCallback, useEffect, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { readLights, setRoomLight } from '../home/recipes.mjs';
import { LAMP_KEY, readLamp, lampFollowing, lampIsDim, lampBrightness } from './views/console-model.mjs';

// The desk lamp (the 台灯 fader on the console): a level 0..1 the desk and the console are lit by.
// The room's dim switch (场景配方, 睡前模式: recipes.mjs setRoomLight) is the same lamp seen as on /
// off, so turning the fader past half throws it, and throwing it elsewhere moves the fader.
const EVENT = 'cabin:desk-lamp';
export default function useDeskLamp() {
  const runtime = useCabinRuntime(), look = runtime?.look || 'pixel';
  const dimNow = () => readLights()[look] === true;
  const [level, setLevel] = useState(() => readLamp(globalThis.localStorage, dimNow()));
  useEffect(() => {
    const sync = () => setLevel(lampFollowing(readLamp(globalThis.localStorage, dimNow()), dimNow()));
    const own = (event) => setLevel(event.detail);
    sync();
    addEventListener('cabin:lights', sync); addEventListener('storage', sync); addEventListener(EVENT, own);
    return () => { removeEventListener('cabin:lights', sync); removeEventListener('storage', sync); removeEventListener(EVENT, own); };
  }, [look]);
  const set = useCallback((value) => {
    const next = Math.max(0, Math.min(1, value));
    try { localStorage.setItem(LAMP_KEY, String(next)); } catch { /* storage closed: the lamp still moves */ }
    dispatchEvent(new CustomEvent(EVENT, { detail: next }));
    if (lampIsDim(next) !== dimNow()) { try { setRoomLight(look, lampIsDim(next)); } catch { /* an unknown room keeps its switch */ } }
  }, [look]);
  return { level, set, brightness: lampBrightness(level) };
}
