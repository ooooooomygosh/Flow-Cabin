export { handleQQSearch, handleQQSongUrl, getQQLoginInfo, parseCookieString, qqCookieUin, qqCookieMusicKey } from './vendor/simple-music/server/lib/qq-client';
import { qqMusicRequest } from './vendor/simple-music/server/lib/qq-client';
export { handleSearch, handleSongUrl, normalizeLoginInfo, call, audioProxyHeadersFor } from './vendor/simple-music/server/lib/netease-client';

// Flow Cabin adapter: stored cookies are not proof of an authenticated account.
import { call as ncmCall, normalizeLoginInfo as normalizeNcmLogin, asObj } from './vendor/simple-music/server/lib/netease-client';
export async function getNeteaseLoginInfo(cookie: string) {
  if (!cookie) return { loggedIn: false };
  let confirmedExpired = false;
  for (const endpoint of ['login_status', 'user_account']) {
    try {
      const response = await ncmCall(endpoint, { cookie, timestamp: Date.now() });
      const body = asObj(response.body), data = asObj(body.data || body);
      if (response.status === 401 || Number(data.code) === 301 || Number(body.code) === 301) confirmedExpired = true;
      if (response.status >= 400 || (data.code != null && Number(data.code) !== 200) || (body.code != null && Number(body.code) !== 200)) continue;
      const info = normalizeNcmLogin(data.profile || body.profile, data.account || body.account, data);
      if (info.loggedIn) return info;
      confirmedExpired = true;
    } catch { /* No entitlement is inferred from an unavailable status endpoint. */ }
  }
  if (confirmedExpired) return { loggedIn: false };
  throw new Error('暂时无法验证网易云账号，已保存的登录仍保留，请稍后重试。');
}

// ---------- Flow Cabin: "my playlists" for the playlist library ----------
// QQ already has user / playlist handlers in Simple Music; NetEase needs a thin
// adapter over NeteaseCloudMusicApi's user_playlist / playlist_detail /
// playlist_track_all. Everything is mapped to the same plain shape.
export { handleQQUserPlaylists, handleQQPlaylistTracks } from './vendor/simple-music/server/lib/qq-client';
import { mapSongRecord, isNeteaseSongAvailable, asArr, asStr, asNum } from './vendor/simple-music/server/lib/netease-client';

import { createHash } from 'node:crypto';
const NCM_PLAYLIST_LIMIT = 5000, NCM_PAGE = 500;
const ok = (response: { status: number, body: Record<string, unknown> }) => response.status < 400 && (response.body?.code == null || Number(response.body.code) === 200);
const httpsCover = (value: unknown) => asStr(value).replace(/^http:\/\//, 'https://');

export async function neteaseUserPlaylists(cookie: string) {
  const info = await getNeteaseLoginInfo(cookie) as { loggedIn?: boolean, userId?: unknown, nickname?: unknown };
  const uid = asStr(info.userId);
  if (!info.loggedIn || !uid) return { loggedIn: false, provider: 'netease', playlists: [] };
  const playlists: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 600; offset += 100) {
    const response = await ncmCall('user_playlist', { uid, limit: 100, offset, cookie, timestamp: Date.now() });
    if (!ok(response)) throw new Error('网易云歌单读取失败，请重新登录后再试。');
    const page = asArr(response.body.playlist);
    for (const raw of page) {
      const pl = asObj(raw), creator = asObj(pl.creator);
      playlists.push({ provider: 'netease', id: asStr(pl.id), name: asStr(pl.name), cover: httpsCover(pl.coverImgUrl), trackCount: asNum(pl.trackCount), creator: asStr(creator.nickname),
        kind: Number(pl.specialType) === 5 ? 'liked' : pl.subscribed || asStr(creator.userId) !== uid ? 'collect' : 'created' });
    }
    if (!response.body.more || page.length < 100) break;
  }
  return { loggedIn: true, provider: 'netease', user: asStr(info.nickname), playlists: playlists.filter((pl) => pl.id && pl.name) };
}

export async function neteasePlaylistTracks(cookie: string, id: string, options: { offset?: number, request?: typeof ncmCall } = {}) {
  if (!/^\d{1,20}$/.test(id)) throw new Error('网易云歌单 ID 无效。');
  const offset = options.offset ?? 0, request = options.request || ncmCall;
  if (!Number.isInteger(offset) || offset < 0 || offset >= NCM_PLAYLIST_LIMIT) throw new Error('歌单页码无效，请重新打开歌单。');
  const detail = await request('playlist_detail', { id, s: 0, cookie, timestamp: Date.now() });
  if (!ok(detail)) throw new Error(Number(detail.body?.code) === 404 ? '找不到这个网易云歌单，可能已删除或设为私密。' : '网易云歌单读取失败，请稍后再试。');
  const pl = asObj(detail.body.playlist), creator = asObj(pl.creator), ids = asArr(pl.trackIds).map(raw => asStr(asObj(raw).id));
  const total = asNum(pl.trackCount) || ids.length, limit = Math.min(NCM_PAGE, NCM_PLAYLIST_LIMIT - offset);
  const snapshot = createHash('sha256').update(JSON.stringify([pl.updateTime, total, ids.slice(0, NCM_PLAYLIST_LIMIT)])).digest('hex');
  const tracks: Record<string, unknown>[] = [];
  if (total > offset) {
    const response = await request('playlist_track_all', { id, limit, offset, cookie, timestamp: Date.now() });
    if (!ok(response)) throw new Error('这一批歌曲读取失败，已读取的内容仍保留，可以重试。');
    const privileges = new Map(asArr(response.body.privileges).map(p => [asStr(asObj(p).id), asObj(p)]));
    const rawSongs = asArr(response.body.songs).map(asObj), order = ids.slice(offset, offset + limit);
    const byId = new Map(rawSongs.map(song => [asStr(song.id), song]));
    const songs = order.length ? order.map(key => byId.get(key)).filter((song): song is Record<string, unknown> => Boolean(song)) : rawSongs;
    if (!songs.length) throw new Error('这一批没有返回可读取的歌曲，请检查平台权限或稍后重试。');
    for (const [index, song] of songs.entries()) {
      const mapped = mapSongRecord(song), privilege = privileges.get(asStr(song.id));
      tracks.push({ id: asStr(mapped.id), name: asStr(mapped.name), artist: mapped.artist, album: mapped.album, cover: httpsCover(mapped.cover), duration: mapped.duration, fee: mapped.fee,
        playlistIndex: order.length ? offset + order.indexOf(asStr(song.id)) : offset + index, playable: isNeteaseSongAvailable({ ...song, privilege }) });
    }
  }
  const returnedIds = new Set(tracks.filter(track => track.name).map(track => track.id));
  const missingIds = ids.slice(offset, offset + limit).filter(key => !returnedIds.has(key));
  const end = Math.min(total, offset + limit), nextOffset = end < Math.min(total, NCM_PLAYLIST_LIMIT) ? end : null;
  return { provider: 'netease', playlist: { provider: 'netease', id, name: asStr(pl.name), cover: httpsCover(pl.coverImgUrl), trackCount: total, creator: asStr(creator.nickname), description: asStr(pl.description).slice(0, 600) }, tracks,
    page: { offset, nextOffset, snapshot, total, missingPages: missingIds.length ? [{ offset, ids: missingIds }] : [], limit: NCM_PLAYLIST_LIMIT, capped: total > NCM_PLAYLIST_LIMIT && nextOffset === null } };
}


// Older shelf records may have a QQ song mid but no file media_mid. Resolve
// only that exact recording; metadata is not a grant of playback permission.
export async function getQQMediaMid(cookie: string, mid: string): Promise<string> {
  if (!/^[a-z\d]{14}$/i.test(mid)) return '';
  const json = asObj(await qqMusicRequest(cookie, {
    comm: { ct: 24, cv: 0 },
    songinfo: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { song_mid: mid } }
  }, { cookie: true }));
  const result = asObj(json.songinfo), track = asObj(asObj(result.data).track_info);
  if (Number(json.code || 0) !== 0 || Number(result.code || 0) !== 0 || asStr(track.mid) !== mid) return '';
  const mediaMid = asStr(asObj(track.file).media_mid);
  return /^[a-z\d]{14}$/i.test(mediaMid) ? mediaMid : '';
}

// ---------- Flow Cabin: QQ song search that survives code 2001 ----------
// QQ answers DoSearchForQQMusicDesktop with business code 2001 now and then
// (seen live: one query refused, the next answered). Simple Music retried the
// same request five times in 1.2 s. Here the forms QQ's own clients use take
// turns (checked live by scripts/qq-live-check.mjs: the desktop and PC-client
// forms answer with full song data; c.y.qq.com's old search page now fails).
// Results are mapped to the plain shape `candidate()` reads.
import { requestText, parseJSONText, QQ_HEADERS, QQ_MUSICU_URL } from './vendor/simple-music/server/lib/qq-client';

type QQSearchShape = { name: string, run: (query: string, limit: number) => Promise<unknown[]> };
type QQSearchOptions = { fetchText?: (url: string, init: { method?: string, headers?: Record<string, string> }, body?: string) => Promise<string>, wait?: (ms: number) => Promise<void>, now?: () => number };
const QQ_SEARCH_MODULE = 'music.search.SearchCgiService';
let preferredQQShape = 0, nextQQSearchAt = 0;
// QQ refuses searches (2001) in bursts after quick runs of requests, so
// searches are paced: 0.3 s apart, 1.2 s after a refusal.
const QQ_SEARCH_GAP_MS = 300, QQ_SEARCH_COOLDOWN_MS = 1200;

export function mapQQSearchSong(raw: unknown) {
  const song = asObj(raw), album = asObj(song.album), file = asObj(song.file), pay = asObj(song.pay);
  const singers = asArr(song.singer).map((value) => ({ name: asStr(asObj(value).name) })).filter((artist) => artist.name);
  const mediaMid = asStr(file.media_mid || song.strMediaMid || song.media_mid);
  return {
    mid: asStr(song.mid || song.songmid),
    name: asStr(song.name || song.title || song.songname),
    artists: singers,
    artist: singers.map((artist) => artist.name).join(' / '),
    album: asStr(album.name || album.title || song.albumname),
    mediaMid: /^[a-z\d]{14}$/i.test(mediaMid) ? mediaMid : '',
    cover: /^[a-z\d]{14}$/i.test(asStr(album.mid || album.pmid)) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${asStr(album.mid || album.pmid)}.jpg` : '',
    duration: asNum(song.interval) * 1000,
    fee: asNum(pay.pay_play || pay.payplay) ? 1 : 0
  };
}

class QQSearchError extends Error { code: number; constructor(code: number) { super(`QQ_SEARCH_FAILED (${code})`); this.code = code; } }

export function qqSearchShapes(options: QQSearchOptions = {}): QQSearchShape[] {
  const fetchText = options.fetchText || requestText;
  const post = async (payload: unknown) => {
    const body = JSON.stringify(payload);
    return asObj(parseJSONText(await fetchText(QQ_MUSICU_URL, { method: 'POST', headers: { ...QQ_HEADERS, 'Content-Type': 'application/json;charset=UTF-8' } }, body)));
  };
  const block = (json: Record<string, unknown>, key: string) => {
    const part = asObj(json[key]), code = Number(json.code || 0) || Number(part.code || 0);
    if (code !== 0 || !json[key]) throw new QQSearchError(code || -1);
    return asArr(asObj(asObj(asObj(part.data).body).song).list);
  };
  const get = async (url: string, params: Record<string, string | number>) => {
    const target = new URL(url);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    return asObj(parseJSONText(await fetchText(target.toString(), { headers: { ...QQ_HEADERS } })));
  };
  return [
    // What y.qq.com's desktop page sends: envelope key = module, no comm.
    { name: 'desktop', run: async (query, limit) => block(await post({ [QQ_SEARCH_MODULE]: { module: QQ_SEARCH_MODULE, method: 'DoSearchForQQMusicDesktop', param: { search_type: 0, query, page_num: 1, num_per_page: limit } } }), QQ_SEARCH_MODULE) },
    // The PC client's form (Listen1 and others): comm + req, grouped results.
    { name: 'client', run: async (query, limit) => block(await post({ comm: { ct: '19', cv: '1859', uin: '0' }, req: { module: QQ_SEARCH_MODULE, method: 'DoSearchForQQMusicDesktop', param: { grp: 1, num_per_page: limit, page_num: 1, query, search_type: 0 } } }), 'req') },
    // The search box's suggestions: song ids, names and singers. Each is filled
    // in from the song's detail (album, length, media id), which QQ keeps
    // answering while it refuses searches, so the ranking can still check them.
    { name: 'smartbox', run: async (query, limit) => {
      const json = await get('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg', { key: query, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', platform: 'yqq.json', is_xml: 0 });
      const code = Number(json.code || 0);
      if (code !== 0) throw new QQSearchError(code);
      const items = asArr(asObj(asObj(json.data).song).itemlist).slice(0, Math.min(limit, 5)).map(asObj);
      const songs = [];
      for (const item of items) {
        const basic = { mid: item.mid, name: item.name, singer: asStr(item.singer).split(/\s*[/、]\s*/).filter(Boolean).map((name) => ({ name })) };
        try {
          const detail = await post({ comm: { ct: 24, cv: 0 }, songinfo: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { song_mid: asStr(item.mid) } } });
          const track = asObj(asObj(asObj(detail.songinfo).data).track_info);
          songs.push(asStr(track.mid) === asStr(item.mid) ? track : basic);
        } catch { songs.push(basic); }
      }
      return songs;
    } }
  ];
}

export async function searchQQSongs(query: string, limit = 8, options: QQSearchOptions = {}) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const count = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const shapes = qqSearchShapes(options), wait = options.wait || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // The two full forms (album, length, media id) take turns, starting with the
  // one that answered last; QQ's 2001 comes and goes, so both get a second try
  // after a pause. Search-box suggestions (title and singer only) come last
  // and are never preferred.
  const full = [preferredQQShape, 1 - preferredQQShape];
  const order = [...full, ...full, shapes.length - 1];
  let lastError: unknown = null;
  const now = options.now || Date.now;
  for (const [step, index] of order.entries()) {
    if (step) await wait(step === full.length ? 700 : 250);
    // The slot is reserved before waiting, so overlapping searches queue up
    // one gap apart instead of all leaving when the same moment comes.
    const slot = Math.max(now(), nextQQSearchAt);
    nextQQSearchAt = slot + QQ_SEARCH_GAP_MS;
    if (slot > now()) await wait(slot - now());
    try {
      const seen = new Set<string>();
      const songs = (await shapes[index].run(keyword, count)).map(mapQQSearchSong).filter((song) => /^[a-z\d]{14}$/i.test(song.mid) && song.name && !seen.has(song.mid) && seen.add(song.mid));
      if (index < full.length) preferredQQShape = index;
      return songs;
    } catch (error) { lastError = error; if (error instanceof QQSearchError && error.code === 2001) nextQQSearchAt = Math.max(nextQQSearchAt, now() + QQ_SEARCH_COOLDOWN_MS); }
  }
  const code = lastError instanceof QQSearchError ? lastError.code : 0;
  throw new Error(code > 0 ? `QQ 音乐搜索暂时不可用（${code}），稍后会自动重试。` : 'QQ 音乐搜索暂时连不上，请检查网络后重试。');
}
export function resetQQSearchPreference() { preferredQQShape = 0; nextQQSearchAt = 0; }

// ---------- Flow Cabin: a song's own album art ----------
// Playlists saved before covers were kept per song, and songs played by their
// exact platform id, carry no artwork; the deck asks for it here.
export async function trackCover(provider: string, id: string, cookie = '') {
  if (provider === 'qq' && /^[a-z\d]{14}$/i.test(id)) {
    const json = asObj(await qqMusicRequest(cookie, { comm: { ct: 24, cv: 0 }, songinfo: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { song_mid: id } } }));
    const track = asObj(asObj(asObj(json.songinfo).data).track_info), album = asObj(track.album), mid = asStr(album.mid || album.pmid);
    return asStr(track.mid) === id && /^[a-z\d]{14}$/i.test(mid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : '';
  }
  if (provider === 'netease' && /^\d{1,20}$/.test(id)) {
    const response = await ncmCall('song_detail', { ids: id, cookie, timestamp: Date.now() });
    const song = asObj(asArr(asObj(response.body).songs)[0]);
    return asStr(song.id) === id ? httpsCover(asObj(song.al).picUrl) : '';
  }
  return '';
}

import { handleQQLyric } from './vendor/simple-music/server/lib/qq-client';
export async function lyrics(provider: string, id: string, cookie: string) {
  if (provider === 'qq') {
    const result = await handleQQLyric(cookie, id, '');
    return { text: String(result.lyric || ''), format: 'lrc', translation: String(result.tlyric || '') };
  }
  const result = await ncmCall('lyric', { id, cookie });
  if (result.status >= 400) throw new Error('平台歌词暂时不可用。');
  const body = asObj(result.body), yrc = asObj(body.yrc), lrc = asObj(body.lrc);
  return { text: String(yrc.lyric || lrc.lyric || ''), format: yrc.lyric ? 'yrc' : 'lrc', translation: String(asObj(body.tlyric).lyric || '') };
}
