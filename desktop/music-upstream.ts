export { handleQQSearch, handleQQSongUrl, getQQLoginInfo, parseCookieString, qqCookieUin, qqCookieMusicKey } from './vendor/simple-music/server/lib/qq-client';
import { qqMusicRequest } from './vendor/simple-music/server/lib/qq-client';
export { handleSearch, handleSongUrl, normalizeLoginInfo, call, audioProxyHeadersFor } from './vendor/simple-music/server/lib/netease-client';

// Flow Cabin adapter: stored cookies are not proof of an authenticated account.
import { call as ncmCall, normalizeLoginInfo as normalizeNcmLogin, asObj } from './vendor/simple-music/server/lib/netease-client';
export async function getNeteaseLoginInfo(cookie: string) {
  if (!cookie) return { loggedIn: false };
  for (const endpoint of ['login_status', 'user_account']) {
    try {
      const response = await ncmCall(endpoint, { cookie, timestamp: Date.now() });
      const body = asObj(response.body), data = asObj(body.data || body);
      if (response.status >= 400 || (data.code != null && Number(data.code) !== 200) || (body.code != null && Number(body.code) !== 200)) continue;
      const info = normalizeNcmLogin(data.profile || body.profile, data.account || body.account, data);
      if (info.loggedIn) return info;
    } catch { /* No entitlement is inferred from an unavailable status endpoint. */ }
  }
  return { loggedIn: false };
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
