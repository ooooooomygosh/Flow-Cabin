// Imported playlists become ordinary shelf records of type "playlist": the
// turntable plays them track by track, each track keeping its own artist,
// album and platform id so the exact recording is tried first.
export const PLAYLIST_SOURCES = {
  netease: { label: '网易云音乐', short: '网易云', tone: 'netease' },
  qq: { label: 'QQ 音乐', short: 'QQ', tone: 'qq' },
  apple: { label: 'Apple Music', short: 'Apple', tone: 'apple' },
  'apple-local': { label: 'Apple Music', short: '音乐 App', tone: 'apple' },
  file: { label: '歌单文件', short: '文件', tone: 'file' }
};
export const PLAYLIST_TRACK_LIMIT = 5000;
const clean = (value, max = 160) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function formatDuration(millis) {
  const total = Math.max(0, Math.round((Number(millis) || 0) / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
export function totalDuration(tracks) {
  const millis = (tracks || []).reduce((sum, track) => sum + (Number(track?.duration) || 0), 0);
  if (!millis) return '';
  const minutes = Math.round(millis / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}
// Stable identity for de-duplication on the shelf ("netease:123", "apple:pl.x").
export function playlistKey(provider, id) {
  const source = provider === 'apple-local' ? 'apple-local' : provider;
  const value = clean(id, 120);
  return value.includes(':') && /^(apple|qq-liked)/.test(value) ? value : `${source}:${value}`;
}
export function playlistItem(detail, provider, { cover = '' } = {}) {
  const playlist = detail?.playlist || {};
  const source = PLAYLIST_SOURCES[provider] || PLAYLIST_SOURCES.file;
  const tracks = (Array.isArray(detail?.tracks) ? detail.tracks : []).filter((track) => clean(track?.title)).slice(0, PLAYLIST_TRACK_LIMIT);
  return {
    type: 'playlist',
    title: clean(playlist.name) || '未命名歌单',
    artist: clean(playlist.creator, 160) || source.label,
    cover: playlist.cover || cover,
    label: '歌单',
    platforms: [source.label],
    source: 'playlist',
    notes: clean(playlist.description, 600),
    tracks: tracks.map((track) => clean(track.title)),
    trackDetails: tracks.map((track, index) => ({
      title: clean(track.title), trackNumber: index + 1, lengthMillis: Math.max(0, Number(track.duration) || 0),
      source: ['qq', 'netease', 'apple', 'local'].includes(track.source) ? track.source : 'apple',
      providerId: clean(track.providerId, 64), mediaMid: clean(track.mediaMid, 64), artist: clean(track.artist), album: clean(track.album),
      ...(/^https:\/\//.test(track.cover || '') ? { cover: String(track.cover).slice(0, 700) } : {})
    })),
    externalIds: { playlist: playlistKey(provider, playlist.id || `${Date.now()}`) }
  };
}
export const isPlaylist = (item) => item?.type === 'playlist';
// Search inside a long playlist: title, artist and album, ignoring case/width.
const fold = (value) => String(value || '').normalize('NFKC').toLowerCase();
export function filterTracks(tracks, query) {
  const needle = fold(query).trim();
  if (!needle) return tracks.map((track, index) => ({ track, index }));
  return tracks.map((track, index) => ({ track, index })).filter(({ track }) => [track.title, track.artist, track.album].some((value) => fold(value).includes(needle)));
}

// Refresh source metadata without replacing the listener's notes or styling.
export function playlistRefreshPatch(item, incoming, { incomplete = false } = {}) {
  if (incomplete && (item?.tracks?.length || 0) > incoming.tracks.length) throw new Error('当前只读取了部分歌曲，不能覆盖已有的完整歌单；请继续读取后再同步。');
  const patch = {};
  for (const key of ['title', 'artist', 'tracks', 'trackDetails']) {
    if (JSON.stringify(item?.[key]) !== JSON.stringify(incoming[key])) patch[key] = incoming[key];
  }
  return patch;
}


// Merge only the expected page of the same source snapshot. No state mutates on failure.
export function mergePlaylistPage(current, incoming) {
  if (current.provider !== incoming.provider || playlistKey(current.provider, current.playlist.id) !== playlistKey(incoming.provider, incoming.playlist.id)) throw new Error('歌单来源已改变，请重新打开歌单。');
  const retry = current.page?.missingPages?.some(page => page.offset === incoming.page?.offset);
  if (!current.page || !incoming.page || (!retry && (current.page.nextOffset !== incoming.page.offset || incoming.page.offset <= current.page.offset))) throw new Error('收到重复或乱序的歌单页，请重试。');
  if (current.revision !== incoming.revision || current.page.snapshot !== incoming.page.snapshot) throw new Error('账号或歌单内容已改变，请重新打开歌单。');
  const key = track => track.providerId ? `${track.source}:${track.providerId}` : JSON.stringify([track.source, track.title, track.artist, track.album]);
  const seen = new Set(current.tracks.map(key)), tracks = [...current.tracks];
  for (const track of incoming.tracks || []) if (track.title && !seen.has(key(track))) { seen.add(key(track)); tracks.push(track); }
  if (!retry && tracks.length === current.tracks.length) throw new Error('平台返回了重复页或空页，已读取的歌曲仍保留，请重试。');
  if (tracks.length > PLAYLIST_TRACK_LIMIT) throw new Error(`单个歌单最多导入 ${PLAYLIST_TRACK_LIMIT} 首。`);
  if (tracks.every(track => Number.isInteger(track.playlistIndex))) tracks.sort((a, b) => a.playlistIndex - b.playlistIndex);
  const knownIds = new Set(tracks.map(track => track.providerId));
  const missingPages = [...(current.page.missingPages || []).filter(page => page.offset !== incoming.page.offset), ...(incoming.page.missingPages || [])].map(page => ({ ...page, ids: page.ids.filter(id => !knownIds.has(id)) })).filter(page => page.ids.length);
  const page = { ...(retry ? current.page : incoming.page), missingPages };
  return { ...current, tracks, page, truncated: tracks.length < Math.max(incoming.playlist.trackCount || 0, tracks.length) };
}
