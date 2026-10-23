import { parseLrc, parseEslrc, parseYrc, parseQrc, parseTTML } from '@applemusic-like-lyrics/lyric';
export const MAX_LYRIC_BYTES = 1024 * 1024;
export function parseLyrics(text, format = 'lrc', source = 'local') {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_LYRIC_BYTES) throw Error('歌词文件不能超过 1 MiB。');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('歌词不支持外部 XML 实体。');
  const kind = format.toLowerCase();
  if (kind === 'txt') return { version: 1, source, precision: 'plain', lines: [], plain: text, offset: 0 };
  const enhanced = kind === 'eslrc' || (kind === 'lrc' && /<\d+:\d+(?:\.\d+)?>/.test(text));
  const parser = { lrc: enhanced ? parseEslrc : parseLrc, eslrc: parseEslrc, yrc: parseYrc, qrc: parseQrc, ttml: value => parseTTML(value).lines }[kind];
  if (!parser) throw Error('支持 LRC、增强 LRC、YRC、QRC、TTML 和 TXT。');
  const lines = parser(text).slice(0, 10000).filter(line => Number.isFinite(line.startTime) && line.startTime >= 0 && Array.isArray(line.words))
    .map(line => ({ ...line, words: line.words.filter(w => Number.isFinite(w.startTime) && Number.isFinite(w.endTime)).map(w => ({ ...w, word: String(w.word).slice(0, 10000) })) })).sort((a, b) => a.startTime - b.startTime);
  const offset = Number(text.match(/^\[offset:([+-]?\d+)\]/m)?.[1]) || 0;
  return { version: 1, source, precision: (enhanced || ['yrc', 'qrc', 'ttml'].includes(kind)) && lines.some(l => l.words.length > 1) ? 'word' : 'line', lines, plain: lines.map(l => l.words.map(w => w.word).join('')).join('\n'), offset: Math.max(-30000, Math.min(30000, offset)) };
}
export function activeLyric(lines, time, offset = 0) {
  if (!Number.isFinite(time)) return -1;
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >>> 1; if (lines[mid].startTime <= time - offset) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
}
export function lyricTrackKey({ provider = '', id = '', title = '', artist = '', album = '', duration = 0 }) {
  return JSON.stringify([provider, id, title, artist, album, Math.round(duration)]);
}
