import { playbackErrorMessage } from './player/playback-cache.mjs';
import { rankForAutoplay, matchKey, AUTO_MATCH_ATTEMPTS } from './player/auto-match.mjs';
import { toSimplified, toTraditional } from './player/hanzi.mjs';
// A playlist's tracks each have their own artist and album; an album's share the record's.
export const trackArtist = (item, index) => item?.trackDetails?.[index]?.artist || (item?.type === 'playlist' ? '' : item?.artist || '');
export const trackAlbum = (item, index) => item?.trackDetails?.[index]?.album || (item?.type === 'song' ? item.albumTitle || '' : item?.type === 'playlist' ? '' : item?.title || '');
export function exactTrack(item, index, provider) {
  if (provider === 'netease') {
    const detail = item?.trackDetails?.[index];
    return detail?.source === 'netease' && /^\d{1,20}$/.test(detail.providerId || '') ? { id: detail.providerId, provider: 'netease', title: detail.title, artist: trackArtist(item, index), album: trackAlbum(item, index) } : null;
  }
  if (provider === 'local') {
    const detail = item?.trackDetails?.[index];
    return detail?.source === 'local' && /^[a-f\d]{16}$/.test(detail.providerId || '') ? { id: detail.providerId, provider: 'local', title: detail.title, artist: trackArtist(item, index), album: trackAlbum(item, index) } : null;
  }
  if (provider !== 'qq') return null;
  const detail = item?.trackDetails?.[index], mid = (['netease', 'apple', 'local'].includes(detail?.source) ? '' : detail?.providerId) || (item?.type === 'song' ? item.externalIds?.qqSongMid : '');
  return /^[a-z\d]{14}$/i.test(mid || '') ? { id: mid, provider: 'qq', title: item.tracks?.[index] || item.title, artist: trackArtist(item, index), mediaMid: /^[a-z\d]{14}$/i.test(detail?.mediaMid || '') ? detail.mediaMid : '' } : null;
}
// Metadata scans can take minutes on large folders; ordinary network calls
// retain a short timeout. Aborting a request does not cancel a native scan.
export const musicRequestTimeout = (path) => ['/local/rescan', '/local/remove-folder'].includes(path) ? 10 * 60 * 1000 : 20000;
export async function musicRequest(path, value, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, musicRequestTimeout(path));
  try {
    const response = await fetch('/desktop-music' + path, { signal: controller.signal, ...(value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }) });
    let result;
    try { result = await response.json(); } catch { throw new Error('音源服务未返回有效数据，请检查桌面客户端与连接。'); }
    if (!response.ok || result?.error) throw new Error(result?.error || '音源请求失败，请稍后重试。');
    if (!result || typeof result !== 'object') throw new Error('音源服务返回了无效数据。');
    return result;
  } catch (error) {
    if (timedOut) throw new Error('音源请求超时，请检查连接后重试。');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

// The local-music service may answer with `{}` (no index yet, older desktop
// build, scan in progress) or with partial entries. Everything the UI reads
// from it goes through here, so missing arrays never crash a render.
const list = (value) => Array.isArray(value) ? value : [];
const count = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
export function normalizeLocalAlbum(album) {
  if (!album || typeof album !== 'object') return null;
  const tracks = list(album.tracks).filter((track) => track && typeof track === 'object').map((track) => ({ ...track, title: String(track.title || track.name || '未命名曲目') }));
  return { ...album, id: String(album.id || ''), title: String(album.title || '未命名专辑'), artist: String(album.artist || '未知歌手'), tracks };
}
export function normalizeLocalLibrary(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const albums = list(raw.albums).map(normalizeLocalAlbum).filter((album) => album && album.id);
  return { ...raw, albums, folders: list(raw.folders).filter((folder) => folder && typeof folder.path === 'string'), albumCount: count(raw.albumCount, albums.length), trackCount: count(raw.trackCount, albums.reduce((sum, album) => sum + album.tracks.length, 0)) };
}

// What the track should sound like, for ranking platform search results.
export function wantedTrack(record, index) {
  const raw = record?.tracks?.[index], title = typeof raw === 'string' ? raw : raw?.title || raw?.name || record?.title;
  return { title, artist: trackArtist(record, index), album: trackAlbum(record, index), duration: Number(record?.trackDetails?.[index]?.lengthMillis) || (record?.type === 'song' && index === 0 ? Number(record.trackTimeMillis) || 0 : 0) };
}
export function rankCandidates(candidates, record, index) {
  return rankForAutoplay(candidates, wantedTrack(record, index));
}

const SOURCE_NAMES = { qq: 'QQ 音乐', netease: '网易云' };
// Plays the first source that really starts. Order: the match that worked last
// time (memory) → the record's own platform id → ranked search results, up to
// AUTO_MATCH_ATTEMPTS per platform. Nothing is reported as playing unless
// `play` resolved; when nothing works the caller gets the candidates + error.
export async function findPlayableSource({ record, index, provider, request, play, isCurrent = () => true, memory = null }) {
  const tried = new Set(), candidates = [], attempts = new Map(), searchErrors = new Map(), missing = [];
  const canAttempt = source => (attempts.get(source) || 0) < AUTO_MATCH_ATTEMPTS;
  let lastError = '', hadMatches = false, aborted = false;
  const active = () => !aborted && isCurrent();
  const key = memory ? matchKey(record, index) : '';
  const attempt = async (candidate) => {
    const id = `${candidate.provider}:${candidate.id}`;
    if (!active() || tried.has(id) || !canAttempt(candidate.provider)) return false;
    attempts.set(candidate.provider, (attempts.get(candidate.provider) || 0) + 1);
    tried.add(id); hadMatches = true;
    try {
      const result = await request('/resolve', candidate);
      if (!active()) return false;
      await play(candidate, result);
      if (!active()) return false;
      if (!result?.remote) memory?.put(key, candidate);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') aborted = true;
      if (!active()) return false;
      lastError = playbackErrorMessage(error);
      // Browser gesture restrictions are not a reason to try unrelated recordings.
      if (error.name === 'NotAllowedError') throw error;
      return false;
    }
  };
  // 自动匹配 tries the platform the track came from first (a NetEase playlist → 网易云).
  const origin = record?.trackDetails?.[index]?.source;
  const providers = provider === 'auto' ? (origin === 'netease' ? ['netease', 'qq'] : ['qq', 'netease']) : provider === 'qq' ? ['qq', 'netease'] : provider === 'netease' ? ['netease', 'qq'] : [provider];
  const raw = record?.tracks?.[index], name = typeof raw === 'string' ? raw : raw?.title || raw?.name;
  if (!name) return { candidates: [], error: '原始资料没有曲目，无法定位音频。' };
  const remembered = memory?.get(key);
  if (remembered && providers.includes(remembered.provider)) {
    if (await attempt(remembered)) return { candidate: remembered, candidates: [], remembered: true };
    if (!active()) return null;
    memory.forget(key);
  }
  for (const source of providers) {
    if (!active()) return null;
    const exact = exactTrack(record, index, source);
    if (exact && await attempt(exact)) return { candidate: exact, candidates: [] };
    if (!active()) return null;
    // Catalogs and libraries index one script: QQ / 网易云 mostly Simplified,
    // a Taiwan Apple Music library Traditional. Try each written form until one
    // yields a playable match; later searches only run when earlier ones failed.
    const query = `${trackArtist(record, index)} ${name}`.trim(), seen = new Set();
    let searched = false;
    for (const variant of [...new Set([toSimplified(query), query, toTraditional(query)])]) {
      if (!canAttempt(source)) break;
      try {
        const result = await request(`/search?provider=${source}&query=${encodeURIComponent(variant)}`);
        if (!active()) return null;
        searched = true;
        const found = (Array.isArray(result.candidates) ? result.candidates : []).filter((candidate) => !seen.has(`${candidate.provider}:${candidate.id}`) && seen.add(`${candidate.provider}:${candidate.id}`));
        candidates.push(...found);
        for (const candidate of rankCandidates(found, record, index).slice(0, AUTO_MATCH_ATTEMPTS)) {
          if (!canAttempt(source)) break;
          if (await attempt(candidate)) return { candidate, candidates: [] };
          if (!active()) return null;
        }
      } catch (error) {
        if (!active() || error.name === 'AbortError') return null;
        if (error.name === 'NotAllowedError') throw error;
        // The platform refused or could not be reached: the other spellings
        // would only repeat the refusal, so move on to the next platform.
        searchErrors.set(source, error.message);
        break;
      }
    }
    if (searched && !hadMatches && SOURCE_NAMES[source]) missing.push(SOURCE_NAMES[source]);
    // 系统 Apple Music plays library songs. A song the library lacks is taken
    // from Apple's catalogue (the record's own iTunes id, else a search) and
    // opened in Music.app, where the listener presses play.
    if (source === 'appleMusic' && canAttempt(source)) {
      const detail = record?.trackDetails?.[index] || {};
      const importedSongId = record?.type === 'song' && index === 0 ? record.externalIds?.itunesTrackId : '';
      const exactId = /^\d{1,12}$/.test(detail.providerId || '') && /itunes|apple/i.test(detail.source || '') ? detail.providerId : importedSongId;
      const own = /^\d{1,12}$/.test(exactId || '') ? { id: String(exactId), provider: 'appleMusic', ...wantedTrack(record, index) } : null;
      try {
        const found = own ? [own] : rankCandidates((await request(`/search?provider=appleMusic&scope=catalog&query=${encodeURIComponent(query)}`)).candidates || [], record, index);
        if (!active()) return null;
        if (!own) candidates.push(...found);
        if (found[0] && await attempt(found[0])) return { candidate: found[0], candidates: [] };
        if (!active()) return null;
      } catch (error) {
        if (!active() || error.name === 'AbortError') return null;
        lastError = error.message;
      }
    }
  }
  if (hadMatches) return { candidates, error: `匹配的音源暂时不可播放。${lastError}` };
  // Say what each platform answered: one refusing searches is not the same as
  // the song being absent, and an old error must not hide a later clean miss.
  const refused = [...searchErrors.values()];
  if (refused.length) return { candidates, error: [...refused, missing.length ? `${missing.join('、')}没有找到这首歌。` : ''].filter(Boolean).join(' ') };
  return { candidates, error: lastError || (provider === 'local' ? '本地音乐里没有找到这首歌，请先在音源设置中添加文件夹。' : '未找到可播放的同版本音源，可切换音源或手动选择。') };
}

// Builds a collection item from a scanned local album. Track ids let the
// turntable play the exact files; the cover stays local unless replaced.
export function localAlbumItem(value) {
  const album = normalizeLocalAlbum(value) || normalizeLocalAlbum({});
  return { type: 'album', title: album.title, artist: album.artist, year: album.year || '', cover: album.cover || '', label: '本地音乐', platforms: ['本地文件'], source: 'local-music',
    tracks: album.tracks.slice(0, 60).map((track) => track.title), externalIds: { localAlbum: album.id },
    trackDetails: album.tracks.slice(0, 60).map((track, index) => ({ title: track.title, trackNumber: index + 1, lengthMillis: (track.duration || 0) * 1000, source: 'local', providerId: track.id })) };
}
