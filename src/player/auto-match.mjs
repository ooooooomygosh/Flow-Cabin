// Automatic "重新匹配": the same search the 音源设置 picker shows, ranked so the
// deck can play the best version without asking. Pure and injectable for tests.
//
// Root cause this fixes: the old ranking accepted a candidate only when the
// normalised title AND artist were identical. Records added from iTunes /
// MusicBrainz / Discogs often carry "Jay Chou" while QQ lists "周杰伦", or a
// "(Remastered)" suffix, so every candidate scored 0, playback ended in an
// error and the listener had to pick the very same candidate by hand.
// Traditional and Simplified compare equal: 「討厭紅樓夢」 is 「讨厌红楼梦」.
import { toSimplified } from './hanzi.mjs';
const norm = (value) => toSimplified(String(value || '').normalize('NFKC')).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const VERSION = /live|remix|acoustic|instrumental|karaoke|demo|现场|伴奏|翻唱|混音|重混|不插电|纯音乐/g;
const versions = (value) => (toSimplified(String(value || '')).toLowerCase().match(VERSION) || []).sort().join('|');
// "(Remastered 2011)", "- 2015 Remaster", "（电影《X》插曲）": same recording, decorated title.
const bareTitle = (value) => norm(toSimplified(String(value || ''))
  .replace(/[（(【\[][^）)】\]]*(remaster|version|edit|mono|stereo|deluxe|bonus|插曲|主题曲|片尾曲|片头曲|版)[^）)】\]]*[）)】\]]/gi, '')
  .replace(/\s+-\s+.*(remaster|version|edit|mono|stereo).*$/i, ''));
const script = (value) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(value) ? 'cjk' : /[a-z]/i.test(value) ? 'latin' : '';
const parts = (value) => String(value || '').split(/[,，、/&;；]|\s+(?:feat\.?|ft\.?|with|x)\s+/i).map(norm).filter(Boolean);

// Durations arrive as milliseconds (QQ / 网易云 / records) or seconds (local).
const seconds = (value) => { const n = Number(value) || 0; return n > 3600 ? n / 1000 : n; };
export const AUTO_MATCH_THRESHOLD = 70;
export const AUTO_MATCH_ATTEMPTS = 4;

// Returns a score (0 = never auto-play). `want` = { title, artist, album, duration (ms or s) }.
export function scoreCandidate(candidate, want) {
  if (!candidate?.title || !want?.title) return 0;
  // A live take, cover or karaoke track is never substituted for a studio one.
  if (versions(candidate.title) !== versions(want.title)) return 0;
  let score;
  if (norm(candidate.title) === norm(want.title)) score = 50;
  else if (bareTitle(candidate.title) && bareTitle(candidate.title) === bareTitle(want.title)) score = 40;
  else return 0;
  const wantArtist = norm(want.artist), gotArtist = norm(candidate.artist);
  if (wantArtist && gotArtist) {
    const same = gotArtist === wantArtist || parts(candidate.artist).includes(wantArtist) || parts(want.artist).includes(gotArtist);
    if (same) score += 30;
    // Different writing systems ("Jay Chou" / "周杰伦") cannot be compared by
    // text: neither confirmed nor rejected, album and duration must decide.
    else if (script(want.artist) === script(candidate.artist)) return 0;
  } else if (wantArtist && !gotArtist && candidate.provider !== 'local') return 0;
  const wantAlbum = norm(want.album);
  if (wantAlbum && norm(candidate.album) === wantAlbum) score += 20;
  else if (wantAlbum && bareTitle(candidate.album) && bareTitle(candidate.album) === bareTitle(want.album)) score += 12;
  const a = seconds(want.duration), b = seconds(candidate.duration);
  if (a > 0 && b > 0) { const gap = Math.abs(a - b); score += gap <= 3 ? 15 : gap <= 8 ? 6 : gap > 20 ? -30 : 0; }
  return score;
}

export function rankForAutoplay(candidates, want, threshold = AUTO_MATCH_THRESHOLD) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, order) => ({ candidate, order, score: scoreCandidate(candidate, want) }))
    .filter(({ score }) => score >= threshold)
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .map(({ candidate }) => candidate);
}

// Remembers which candidate actually played for a track, so the next play
// skips the search. Recording metadata is part of the identity: edits or a
// refreshed playlist must never reuse a same-title match from another artist.
export const MATCH_MEMORY_KEY = 'flow-cabin-track-matches-v1';
export const MATCH_MEMORY_LIMIT = 400;
const KEEP = ['id', 'provider', 'title', 'artist', 'album', 'duration', 'mediaMid', 'fee'];
export function matchKey(record, index) {
  const raw = record?.tracks?.[index], title = typeof raw === 'string' ? raw : raw?.title || raw?.name || '';
  if (!record?.id || !title) return '';
  const detail = record?.trackDetails?.[index] || {};
  // JSON avoids delimiter collisions; old title-only keys cannot be reused.
  return 'track-v2:' + JSON.stringify([record.id, index, title,
    detail.artist || (record.type === 'playlist' ? '' : record.artist || ''),
    detail.album || (record.type === 'playlist' ? '' : record.title || ''),
    detail.lengthMillis || 0, detail.source || '', detail.providerId || '',
    detail.mediaMid || '', record.type === 'song' ? record.externalIds?.qqSongMid || '' : '']);
}
export function createMatchMemory(storage = globalThis.localStorage, limit = MATCH_MEMORY_LIMIT) {
  let entries;
  const load = () => { if (entries) return entries; try { entries = new Map(Object.entries(JSON.parse(storage?.getItem(MATCH_MEMORY_KEY) || '{}'))); } catch { entries = new Map(); } return entries; };
  const save = () => { try { storage?.setItem(MATCH_MEMORY_KEY, JSON.stringify(Object.fromEntries(entries))); } catch {} };
  return {
    get(key) { const value = key && load().get(key); return value && value.id && value.provider ? value : null; },
    put(key, candidate) {
      if (!key || !candidate?.id || !candidate?.provider || candidate.sessionUrl) return;
      const map = load(); map.delete(key); map.set(key, Object.fromEntries(KEEP.filter((name) => candidate[name] !== undefined).map((name) => [name, candidate[name]])));
      while (map.size > limit) map.delete(map.keys().next().value);
      save();
    },
    forget(key) { if (key && load().delete(key)) save(); },
    clear() { entries = new Map(); save(); },
    get size() { return load().size; }
  };
}
