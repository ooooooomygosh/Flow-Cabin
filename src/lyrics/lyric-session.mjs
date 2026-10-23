import { musicRequest } from '../room-playback.mjs';
import { lyricTrackKey, parseLyrics } from './lyrics-model.mjs';
import { alignSecondary } from './lyric-timing.mjs';

const cache = new Map(), listeners = new Set();
export const LYRIC_CHANGED = 'cabin:lyrics-changed';
export const lyricStorageKey = track => `flow-cabin-lyrics-v1:${typeof track === 'string' ? track : lyricTrackKey(track)}`;
export function readLyricSettings(track) { try { return JSON.parse(localStorage.getItem(lyricStorageKey(track))) || {}; } catch { return {}; } }
export function writeLyricSettings(track, patch) {
  localStorage.setItem(lyricStorageKey(track), JSON.stringify({ ...readLyricSettings(track), ...patch }));
  if ('text' in patch || 'candidate' in patch) invalidateLyrics(track); else globalThis.dispatchEvent?.(new Event(LYRIC_CHANGED));
}
// In-memory identity of a song's lyrics. Unlike the stored settings key it ignores the exact
// duration (which arrives a moment after the title) and only notes whether one is known, so
// the lyrics load once more when a usable duration appears instead of on every change.
export const lyricCacheKey = ({ provider = '', id = '', title = '', artist = '', album = '', duration = 0 } = {}) => JSON.stringify([provider, id, title, artist, album, Number(duration) > 0]);
export function invalidateLyrics(track) { cache.delete(lyricCacheKey(track)); listeners.forEach(fn => fn()); globalThis.dispatchEvent?.(new Event(LYRIC_CHANGED)); }
export const subscribeLyrics = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const secondary = text => { try { return text ? parseLyrics(text).lines : []; } catch { return []; } };
// Pick one of the versions the lyric service listed (「换一版歌词」); 0 returns to automatic.
export function chooseLyricCandidate(track, candidate) { writeLyricSettings(track, { candidate: Number(candidate) > 0 ? Number(candidate) : 0 }); }
export function loadLyrics(track, retry = false) {
  if (!String(track?.title || track?.id || '').trim()) return Promise.resolve({ lines:[], plain:'', precision:'plain', source:'none', reason:'还没有正在播放的歌曲' });
  const key = lyricCacheKey(track);
  if (retry) cache.delete(key);
  if (cache.has(key)) return cache.get(key);
  const result = (async () => {
    const saved = readLyricSettings(track);
    const value = saved.text ? saved : await musicRequest('/lyrics', saved.candidate ? { ...track, candidate: saved.candidate } : track);
    const doc = value.text ? parseLyrics(value.text, value.format || 'lrc', value.source || 'local') : { lines: [], plain: '', precision: 'plain', source: value.source || 'none', instrumental: value.instrumental, reason: value.reason };
    if (doc.lines.length) doc.lines = alignSecondary(alignSecondary(doc.lines, secondary(value.translation), 'translatedLyric'), secondary(value.romanization), 'romanLyric');
    doc.candidates = Array.isArray(value.candidates) ? value.candidates.slice(0, 5) : [];
    doc.lrclibId = Number(value.lrclibId) || 0; doc.chosen = Boolean(saved.candidate);
    doc.hasTranslation = doc.lines.some(l => l.translatedLyric); doc.hasRomanization = doc.lines.some(l => l.romanLyric);
    return doc;
  })();
  cache.set(key, result);
  // Keep the recent ten songs only, including failures until explicitly retried.
  while (cache.size > 10) cache.delete(cache.keys().next().value);
  return result;
}
export function playbackPosition(playback, system) {
  const position = system ? system.timeline?.position() : playback?.audio?.current?.getAttribute('src') ? playback.audio.current.currentTime : playback?.clock?.position;
  return Number.isFinite(position) ? position * 1000 : null;
}
