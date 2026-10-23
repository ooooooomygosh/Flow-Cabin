// How lyrics look, wherever they are shown. Per-song timing offsets stay with the song
// (lyric-session.mjs); these are the person's display choices and apply everywhere.
export const PREFS_KEY = 'flow-cabin-lyric-prefs-v1', PREFS_EVENT = 'cabin:lyric-prefs';
export const SKIN_CHOICES = Object.freeze(['cabin', 'paper', 'neon', 'mono']);
export const DEFAULT_PREFS = Object.freeze({
  scale: 1, translation: true, romanization: false,
  // Desktop lyric bar.
  deskLayout: 'double', deskSkin: 'cabin', deskSize: 34, deskLocked: false, deskPet: true, deskHideWhenPaused: false,
  // Fullscreen stage.
  stageParticles: true
});
const pick = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const num = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
export function normalizePrefs(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const flag = (key) => typeof v[key] === 'boolean' ? v[key] : DEFAULT_PREFS[key];
  return {
    scale: Math.round(num(v.scale, .7, 1.6, 1) * 100) / 100,
    translation: flag('translation'), romanization: flag('romanization'),
    deskLayout: pick(v.deskLayout, ['single', 'double'], DEFAULT_PREFS.deskLayout),
    deskSkin: pick(v.deskSkin, SKIN_CHOICES, DEFAULT_PREFS.deskSkin),
    deskSize: Math.round(num(v.deskSize, 20, 64, DEFAULT_PREFS.deskSize)),
    deskLocked: flag('deskLocked'), deskPet: flag('deskPet'), deskHideWhenPaused: flag('deskHideWhenPaused'),
    stageParticles: flag('stageParticles')
  };
}
export function readPrefs(storage = globalThis.localStorage) { try { return normalizePrefs(JSON.parse(storage.getItem(PREFS_KEY) || '{}')); } catch { return normalizePrefs(); } }
export function writePrefs(patch, storage = globalThis.localStorage) {
  const next = normalizePrefs({ ...readPrefs(storage), ...patch });
  storage.setItem(PREFS_KEY, JSON.stringify(next));
  globalThis.dispatchEvent?.(new Event(PREFS_EVENT));
  return next;
}
