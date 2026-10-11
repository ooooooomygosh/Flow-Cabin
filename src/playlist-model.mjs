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
export const PLAYLIST_TRACK_LIMIT = 500;
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
      providerId: clean(track.providerId, 64), mediaMid: clean(track.mediaMid, 64), artist: clean(track.artist), album: clean(track.album)
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
export function playlistRefreshPatch(item, incoming) {
  const patch = {};
  for (const key of ['title', 'artist', 'tracks', 'trackDetails']) {
    if (JSON.stringify(item?.[key]) !== JSON.stringify(incoming[key])) patch[key] = incoming[key];
  }
  return patch;
}
