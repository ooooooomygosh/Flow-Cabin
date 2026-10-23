'use strict';
// Pure scoring for public lyric matches. "Song (2011 Remaster)", "Song - Live at …",
// "Song (feat. X)" and full-width punctuation all describe the same title; a live or
// instrumental recording, a different artist or a different length does not.
const VERSION_WORDS = /\b(remaster(?:ed)?|\d{4}\s*remaster|mono|stereo|single|radio|edit|version|deluxe|bonus|explicit|clean|original mix|album version|featuring)\b|重制|混音版?|单曲版|专辑版/gi;
const DISTINCT = [['live', /\b(live|concert)\b|现场|演唱会/i], ['instrumental', /\b(instrumental|karaoke|off vocal|inst\.?)\b|伴奏|纯音乐/i], ['acoustic', /\b(acoustic|unplugged)\b|不插电/i], ['remix', /\b(remix|rmx)\b/i], ['cover', /\bcover\b|翻唱|翻自/i]];
const fold = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[’'`]/g, "'").trim();
// Keep the distinguishing tags of a title (live, instrumental…) separately from its words.
function titleParts(raw) {
  let text = fold(raw);
  const tags = new Set(DISTINCT.filter(([, re]) => re.test(text)).map(([tag]) => tag));
  // Drop bracketed or dash-suffixed version notes: "(…)", "[…]", "【…】", "- 2011 Remaster".
  text = text.replace(/[(\[【「《{][^)\]】」》}]*[)\]】」》}]/g, ' ').replace(/\s[-–—~]\s.*$/, ' ').replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/, ' ');
  text = text.replace(VERSION_WORDS, ' ');
  return { core: text.replace(/[^\p{L}\p{N}]+/gu, ''), tags };
}
const artistSet = raw => new Set(fold(raw).split(/\s*(?:,|，|、|&|\/|;|；|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i).map(a => a.replace(/[^\p{L}\p{N}]+/gu, '')).filter(Boolean));

function titleScore(a, b) {
  const x = titleParts(a), y = titleParts(b);
  if (!x.core || !y.core) return 0;
  for (const tag of new Set([...x.tags, ...y.tags])) if (x.tags.has(tag) !== y.tags.has(tag)) return 0;
  if (x.core === y.core) return 1;
  const [short, long] = x.core.length <= y.core.length ? [x.core, y.core] : [y.core, x.core];
  return long.includes(short) && short.length / long.length >= .6 ? .8 : 0;
}
function artistScore(a, b) {
  const x = artistSet(a), y = artistSet(b);
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter(n => y.has(n) || [...y].some(m => m.length > 2 && n.length > 2 && (m.includes(n) || n.includes(m)))).length;
  return shared ? Math.min(1, .7 + .3 * shared / Math.max(x.size, y.size)) : 0;
}
function durationScore(want, got) {
  if (!Number.isFinite(want) || !Number.isFinite(got) || want <= 0 || got <= 0) return 0;
  const d = Math.abs(want - got);
  return d <= 2 ? 1 : d <= 5 ? .7 : d <= 10 ? .3 : 0;
}
// A candidate is usable automatically only with a matching title, artist and length.
function scoreCandidate(track, record) {
  const title = titleScore(track.title, record.trackName), artist = artistScore(track.artist, record.artistName), duration = durationScore(Number(track.duration), Number(record.duration));
  const album = track.album && record.albumName ? (titleScore(track.album, record.albumName) ? 1 : 0) : .5;
  const synced = record.syncedLyrics ? 1 : 0;
  const score = title * .45 + artist * .3 + duration * .17 + album * .03 + synced * .05;
  return { score: Math.round(score * 1000) / 1000, automatic: title > 0 && artist > 0 && duration > 0 && score >= .75 };
}
module.exports = { titleParts, artistSet, titleScore, artistScore, durationScore, scoreCandidate };
