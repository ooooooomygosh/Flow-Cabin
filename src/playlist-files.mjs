// Playlist files people already have: Apple Music / iTunes "Export Playlist"
// (.xml property list), .m3u / .m3u8 from almost any player, and plain text
// ("歌名 - 歌手" per line, as copied from a web page or another app).
// Parsed in the renderer; nothing is uploaded. Pure functions for tests.
const LIMIT = 5000;
const clean = (value, max = 160) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const entity = (value) => String(value).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const decodePath = value => { try { return decodeURIComponent(value); } catch { return value; } };
const basename = (value) => String(value || '').split(/[\\/]/).pop().replace(/\.[a-z\d]{2,5}$/i, '');

// Minimal XML plist reader: dict / array / string / integer / real / true / false / date / data.
export function parsePlist(text) {
  const source = String(text || ''), tokens = /<(\/?)(dict|array|key|string|integer|real|date|data|true|false)(\s*\/)?>/g;
  const stack = [], root = { value: undefined };
  let key = null, match, contentStart = 0, open = null;
  const put = (value) => {
    const parent = stack.at(-1);
    if (!parent) { root.value ??= value; return; }
    if (Array.isArray(parent.value)) parent.value.push(value);
    else if (parent.key !== null) { parent.value[parent.key] = value; parent.key = null; }
  };
  while ((match = tokens.exec(source))) {
    const [, closing, tag, selfClosing] = match;
    if (tag === 'true' || tag === 'false') { if (!closing) put(tag === 'true'); continue; }
    if (tag === 'dict' || tag === 'array') {
      if (selfClosing) { put(tag === 'dict' ? {} : []); continue; }
      if (!closing) stack.push({ value: tag === 'dict' ? {} : [], key: null });
      else { const done = stack.pop(); if (done) put(done.value); }
      continue;
    }
    if (selfClosing) { if (tag === 'key') { if (stack.at(-1)) stack.at(-1).key = ''; } else put(tag === 'string' ? '' : 0); continue; }
    if (!closing) { open = tag; contentStart = tokens.lastIndex; continue; }
    if (open !== tag) continue;
    const raw = entity(source.slice(contentStart, match.index)); open = null;
    if (tag === 'key') { if (stack.at(-1)) stack.at(-1).key = raw; }
    else put(tag === 'integer' || tag === 'real' ? Number(raw) : raw);
  }
  return root.value;
}

// Apple Music / iTunes export: Tracks dict + Playlists array (the exported list
// is usually the only entry; a full library export carries many).
export function parseApplePlaylistXml(text) {
  const plist = parsePlist(text);
  if (!plist || typeof plist !== 'object' || !plist.Tracks) throw new Error('这不是 Apple Music / iTunes 导出的歌单文件。');
  const tracks = plist.Tracks, lists = Array.isArray(plist.Playlists) ? plist.Playlists : [];
  const chosen = lists.filter((list) => Array.isArray(list?.['Playlist Items']) && !list.Master && !list['Distinguished Kind'] && !list.Folder);
  const pick = chosen.length ? chosen : lists.filter((list) => Array.isArray(list?.['Playlist Items']));
  const toTrack = (id) => {
    const entry = tracks[String(id)];
    if (!entry || entry.Podcast || entry.Movie || entry['TV Show']) return null;
    return { title: clean(entry.Name), artist: clean(entry.Artist || entry['Album Artist']), album: clean(entry.Album), duration: Math.max(0, Number(entry['Total Time']) || 0), source: 'apple', providerId: '' };
  };
  const playlists = pick.map((list) => ({
    id: clean(list['Playlist Persistent ID'] || list['Playlist ID'] || list.Name, 80), name: clean(list.Name) || '导入的歌单',
    tracks: list['Playlist Items'].map((item) => toTrack(item?.['Track ID'])).filter((track) => track?.title)
  })).filter((list) => list.tracks.length);
  if (!playlists.length && Object.keys(tracks).length) playlists.push({ id: 'library', name: '导入的资料库', tracks: Object.keys(tracks).map(toTrack).filter((track) => track?.title) });
  if (!playlists.length) throw new Error('文件里没有可导入的歌曲。');
  return playlists.map(list => ({ ...list, trackCount: list.tracks.length, truncated: list.tracks.length > LIMIT, tracks: list.tracks.slice(0, LIMIT) }));
}

// "#EXTINF:215,Artist - Title" (or just paths: the file name becomes the title).
export function parseM3U(text, name = '') {
  const tracks = [];
  let pending = null;
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (/^#EXTINF:/i.test(value)) {
      const [, seconds = '0', label = ''] = value.match(/^#EXTINF:\s*(-?[\d.]+)[^,]*,(.*)$/i) || [];
      const [artist, ...title] = label.split(' - ');
      pending = title.length ? { artist: clean(artist), title: clean(title.join(' - ')) } : { artist: '', title: clean(label) };
      pending.duration = Math.max(0, Math.round(Number(seconds) * 1000) || 0);
      continue;
    }
    if (value.startsWith('#')) continue;
    const fromName = basename(decodePath(value.replace(/^file:\/\//i, '')));
    const guess = fromName.match(/^(?:\d{1,3}[\s.\-_]+)?(.+?)\s+-\s+(.+)$/);
    tracks.push(pending?.title ? pending : guess ? { artist: clean(guess[1]), title: clean(guess[2]), duration: 0 } : { artist: '', title: clean(fromName), duration: 0 });
    pending = null;
  }
  const list = tracks.filter((track) => track.title).map((track) => ({ ...track, album: '', source: 'apple', providerId: '' }));
  if (!list.length) throw new Error('M3U 文件里没有歌曲。');
  return [{ id: clean(name || 'm3u', 80), name: clean(basename(name)) || '导入的歌单', tracks: list.slice(0, LIMIT), trackCount: list.length, truncated: list.length > LIMIT }];
}

// One song per line: "歌名 - 歌手", "歌手 - 歌名" is ambiguous, so the cabin
// keeps the common "title - artist" order used by most exports and copy-paste.
export function parsePlainList(text, name = '') {
  const tracks = String(text || '').split(/\r?\n/).map((line) => line.replace(/^\s*(?:\d{1,3}[.)、]\s*|[-*•]\s+)/, '').trim()).filter((line) => line && !/^#/.test(line)).map((line) => {
    const parts = line.split(/\s+[-–—|]\s+|\t/);
    return parts.length >= 2 ? { title: clean(parts[0]), artist: clean(parts.slice(1).join(' / ')), album: '', duration: 0, source: 'apple', providerId: '' } : { title: clean(line), artist: '', album: '', duration: 0, source: 'apple', providerId: '' };
  }).filter((track) => track.title);
  if (!tracks.length) throw new Error('没有读到歌曲。每行写一首：歌名 - 歌手。');
  return [{ id: clean(name || 'text', 80), name: clean(basename(name)) || '导入的歌单', tracks: tracks.slice(0, LIMIT), trackCount: tracks.length, truncated: tracks.length > LIMIT }];
}

export function parsePlaylistFile(text, name = '') {
  const lower = String(name).toLowerCase(), body = String(text || '');
  if (lower.endsWith('.xml') || /^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE plist[^>]*>\s*)?<plist/i.test(body)) return parseApplePlaylistXml(body);
  if (/\.m3u8?$/.test(lower) || /^﻿?#EXTM3U/i.test(body)) return parseM3U(body, name);
  return parsePlainList(body, name);
}
