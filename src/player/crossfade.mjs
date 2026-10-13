// 歌曲过渡: how the deck moves from one song to the next. The next song is
// always matched and buffered while the current one plays; with a crossfade
// it also starts early and the two overlap, the old one fading out.
export const CROSSFADE_KEY = 'flow-cabin-crossfade-v1';
export const CROSSFADE_OPTIONS = Object.freeze([[0, '无缝衔接'], [3, '淡入淡出 3 秒'], [6, '淡入淡出 6 秒'], [10, '淡入淡出 10 秒']]);
const EVENT = 'flow-cabin-crossfade';
const valid = (value) => CROSSFADE_OPTIONS.some(([seconds]) => seconds === value);

export function crossfadeSeconds(storage = globalThis.localStorage) {
  try { const value = Number(storage?.getItem(CROSSFADE_KEY)); return valid(value) ? value : 0; } catch { return 0; }
}
export function setCrossfadeSeconds(value, storage = globalThis.localStorage) {
  const seconds = valid(Number(value)) ? Number(value) : 0;
  try { storage?.setItem(CROSSFADE_KEY, String(seconds)); } catch {}
  globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: seconds }));
  return seconds;
}
export function onCrossfadeChange(callback) {
  const listener = (event) => callback(event.detail);
  globalThis.addEventListener?.(EVENT, listener); return () => globalThis.removeEventListener?.(EVENT, listener);
}
// When to start the next song early. Short songs (or an unknown length) never
// overlap: a crossfade longer than a third of the song would swallow it.
export function crossfadeStartsAt(duration, seconds) {
  if (!seconds || !Number.isFinite(duration) || duration < seconds * 3) return Infinity;
  return duration - seconds;
}
