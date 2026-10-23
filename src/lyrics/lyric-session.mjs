import { musicRequest } from '../room-playback.mjs';
import { lyricTrackKey, parseLyrics } from './lyrics-model.mjs';

const cache = new Map(), listeners = new Set();
export const LYRIC_CHANGED = 'cabin:lyrics-changed';
export const lyricStorageKey = track => `flow-cabin-lyrics-v1:${typeof track === 'string' ? track : lyricTrackKey(track)}`;
export function readLyricSettings(track) { try { return JSON.parse(localStorage.getItem(lyricStorageKey(track))) || {}; } catch { return {}; } }
export function invalidateLyrics(track) { cache.delete(lyricTrackKey(track)); listeners.forEach(fn => fn()); globalThis.dispatchEvent?.(new Event(LYRIC_CHANGED)); }
export const subscribeLyrics = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function loadLyrics(track, retry = false) {
  if (!String(track?.title || track?.id || '').trim()) return Promise.resolve({ lines:[], plain:'', precision:'plain', source:'none', reason:'还没有正在播放的歌曲' });
  const key = lyricTrackKey(track);
  if (retry) cache.delete(key);
  if (cache.has(key)) return cache.get(key);
  const result = (async () => {
    const saved = readLyricSettings(track);
    const value = saved.text ? saved : await musicRequest('/lyrics', track);
    const doc = value.text ? parseLyrics(value.text, value.format || 'lrc', value.source || 'local') : { lines: [], plain: '', precision: 'plain', source: value.source || 'none', instrumental: value.instrumental, reason: value.reason };
    if (value.translation && doc.lines.length) {
      const translated = parseLyrics(value.translation).lines;
      doc.lines = doc.lines.map(line => ({ ...line, translatedLyric: translated.find(t => Math.abs(t.startTime - line.startTime) < 100)?.words.map(w => w.word).join('') || line.translatedLyric }));
    }
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
