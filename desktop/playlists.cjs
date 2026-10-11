'use strict';
// "My playlists": read playlists from the user's own accounts and libraries
// and map them to one plain shape the cabin can put on the turntable.
//
//   QQ 音乐 / 网易云   signed-in account playlists, or any public share link
//   Apple Music        public music.apple.com links (track ids → iTunes Lookup),
//                      macOS Music.app playlists (JXA, the signed-in library),
//                      exported playlist files (Music/iTunes .xml plist, .m3u)
//
// Nothing here grants playback rights: Apple tracks play through the cabin's
// version-safe auto matching, the same way catalog albums do.
const { execFile } = require('node:child_process');

const TRACK_LIMIT = 500;
const clean = (value, max = 300) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const count = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0;
function httpsImage(value) {
  try { const url = new URL(String(value || '').replace(/^http:\/\//, 'https://')); return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 700 ? url.href : ''; } catch { return ''; }
}

function normalizeTrack(raw, source) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const title = clean(value.title || value.name, 160);
  if (!title) return null;
  const providerId = clean(value.providerId ?? value.mid ?? value.id, 64);
  const id = source === 'qq' ? (/^[a-z\d]{14}$/i.test(providerId) ? providerId : '') : source === 'netease' ? (/^\d{1,20}$/.test(providerId) ? providerId : '') : source === 'apple' ? (/^\d{1,20}$/.test(providerId) ? providerId : '') : '';
  return { ...(source === 'netease' && Number.isInteger(value.playlistIndex) && value.playlistIndex >= 0 && value.playlistIndex < 5000 ? { playlistIndex: value.playlistIndex } : {}), title, artist: clean(value.artist, 160), album: clean(value.album, 160), duration: count(value.duration), source, providerId: id,
    mediaMid: source === 'qq' && /^[a-z\d]{14}$/i.test(clean(value.mediaMid, 64)) ? clean(value.mediaMid, 64) : '', cover: httpsImage(value.cover), playable: value.playable !== false };
}
function normalizeSummary(raw, provider) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const id = clean(value.id, 80), name = clean(value.name || value.title, 160);
  if (!id || !name) return null;
  const kind = ['liked', 'created', 'collect'].includes(value.kind) ? value.kind : value.subscribed ? 'collect' : /^qq-liked:/.test(id) ? 'liked' : 'created';
  return { provider, id, name, cover: httpsImage(value.cover), trackCount: count(value.trackCount), creator: clean(value.creator, 80), kind };
}
function normalizeDetail(raw, provider) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const playlist = normalizeSummary({ ...value.playlist, id: value.playlist?.id || value.id }, provider);
  if (!playlist) throw new Error('没有读到歌单信息，请确认歌单仍然公开可见。');
  const seen = new Set(), tracks = [];
  for (const entry of Array.isArray(value.tracks) ? value.tracks : []) {
    const track = normalizeTrack(entry, provider === 'apple-local' || provider === 'file' ? 'apple' : provider);
    if (!track) continue;
    const key = track.providerId ? 'id:' + track.providerId : 'name:' + track.title.toLowerCase() + '|' + track.artist.toLowerCase();
    if (seen.has(key)) continue; seen.add(key); tracks.push(track);
    if (tracks.length >= TRACK_LIMIT) break;
  }
  if (!playlist.cover) playlist.cover = tracks.find((track) => track.cover)?.cover || '';
  return { playlist: { ...playlist, trackCount: Math.max(playlist.trackCount, tracks.length), description: clean(value.playlist?.description, 600) }, tracks, truncated: playlist.trackCount > tracks.length, ...(value.page ? { page: value.page } : {}), ...(!value.page && playlist.trackCount > tracks.length ? { limitReason: `此来源当前返回 ${tracks.length} / ${playlist.trackCount} 首，未提供已验证的继续读取方式；可导出歌单文件再导入。` } : {}) };
}

// Share links people actually paste: desktop, mobile and short forms.
function parsePlaylistLink(input) {
  const text = clean(input, 1200);
  const found = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || text;
  let url; try { url = new URL(found); } catch { throw new Error('请粘贴完整的歌单链接，例如 https://music.163.com/playlist?id=…'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('只支持网页歌单链接。');
  const host = url.hostname.toLowerCase(), full = url.href.replace('/#/', '/');
  if (host === 'music.163.com' || host.endsWith('.music.163.com') || host === '163cn.tv') {
    const id = new URL(full).searchParams.get('id') || full.match(/playlist\/(\d+)/)?.[1];
    if (!/^\d{1,20}$/.test(id || '')) throw new Error('没有在链接里找到网易云歌单 ID。短链接请先在浏览器打开，再复制完整地址。');
    return { provider: 'netease', id };
  }
  if (host === 'y.qq.com' || host.endsWith('.y.qq.com') || host === 'c.y.qq.com') {
    const id = url.searchParams.get('id') || url.searchParams.get('disstid') || url.pathname.match(/playlist\/(\d+)/)?.[1];
    if (!/^\d{1,20}$/.test(id || '')) throw new Error('没有在链接里找到 QQ 音乐歌单 ID。');
    return { provider: 'qq', id };
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const kind = parts.find((part) => ['playlist', 'album'].includes(part));
    const last = parts.at(-1) || '';
    if (kind === 'album') { const id = (last.match(/^(?:id)?(\d{1,20})$/) || [])[1]; if (id) return { provider: 'apple', kind: 'album', id, country: /^[a-z]{2}$/.test(parts[0]) ? parts[0] : 'us', url: url.href }; }
    if (kind === 'playlist' && /^pl\.[\w-]{6,80}$/.test(last)) return { provider: 'apple', kind: 'playlist', id: last, country: /^[a-z]{2}$/.test(parts[0]) ? parts[0] : 'us', url: `https://music.apple.com${url.pathname}` };
    throw new Error('请粘贴 Apple Music 的歌单或专辑链接（music.apple.com/…/playlist/…）。');
  }
  throw new Error('支持网易云、QQ 音乐与 Apple Music 的歌单链接。');
}

// ---------- Apple Music ----------
const ISO_DURATION = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/;
const isoMillis = (value) => { const match = ISO_DURATION.exec(String(value || '')); return match ? Math.round(((Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0)) * 1000) : 0; };
const songId = (url) => { const value = String(url || ''); return value.match(/[?&]i=(\d{1,20})/)?.[1] || value.match(/\/song\/[^/]*\/(\d{1,20})/)?.[1] || value.match(/\/(\d{1,20})(?:\?|$)/)?.[1] || ''; };
const decodeEntities = (value) => String(value).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function readJsonScripts(html) {
  const blocks = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { blocks.push(JSON.parse(match[1])); } catch { try { blocks.push(JSON.parse(decodeEntities(match[1]))); } catch {} }
  }
  return blocks;
}
// The page carries a schema.org MusicPlaylist block; newer pages also embed the
// rendered list (title + artistName) in serialized server data. Both are read
// defensively, then catalog metadata is completed through iTunes Lookup.
function parseApplePlaylistPage(html) {
  const blocks = readJsonScripts(html);
  const schema = blocks.flatMap((block) => Array.isArray(block) ? block : [block]).find((block) => block && /MusicPlaylist|MusicAlbum/.test(String(block['@type'])));
  const tracks = [], byId = new Map();
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 14) return;
    if (Array.isArray(node)) { for (const entry of node) visit(entry, depth + 1); return; }
    const id = clean(node.contentDescriptor?.identifiers?.storeAdamID || node.id, 20);
    if (typeof node.title === 'string' && typeof node.artistName === 'string' && /^\d{1,20}$/.test(id) && !byId.has(id)) byId.set(id, { title: node.title, artist: node.artistName, album: node.tertiaryLinks?.[0]?.title || '', duration: count(node.duration), providerId: id });
    for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, depth + 1);
  };
  for (const block of blocks) if (block !== schema) visit(block);
  for (const entry of Array.isArray(schema?.track) ? schema.track : []) {
    const id = songId(entry?.url), known = byId.get(id);
    tracks.push({ title: entry?.name || known?.title, artist: known?.artist || entry?.byArtist?.name || entry?.audio?.byArtist?.[0]?.name || '', album: known?.album || entry?.inAlbum?.name || '', duration: known?.duration || isoMillis(entry?.duration), providerId: id });
  }
  if (!tracks.length) tracks.push(...byId.values());
  const image = Array.isArray(schema?.image) ? schema.image[0] : schema?.image;
  const title = schema?.name || (String(html).match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1] || '';
  return { name: decodeEntities(title).replace(/\s+[-–—]\s+Apple\s+Music$/i, '').replace(/ on Apple Music$/i, ''), cover: typeof image === 'string' ? image : image?.url || (String(html).match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i) || [])[1] || '', description: schema?.description || '', creator: schema?.author?.name || 'Apple Music', tracks };
}
function lookupTrack(entry) {
  if (!entry || entry.wrapperType !== 'track' || entry.kind !== 'song') return null;
  return { title: entry.trackName, artist: entry.artistName, album: entry.collectionName, duration: entry.trackTimeMillis, providerId: String(entry.trackId || ''), cover: String(entry.artworkUrl100 || '').replace('100x100bb', '300x300bb') };
}

function createPlaylistLibrary({ upstream, cookies, fetch = globalThis.fetch, platform = process.platform, execFileProcess = execFile }) {
  async function getText(url, { max = 4 * 1024 * 1024, accept = 'text/html' } = {}) {
    const allowed = (value) => {
      const target = new URL(value);
      if (target.protocol !== 'https:' || target.username || target.password || target.port || !['music.apple.com', 'itunes.apple.com'].includes(target.hostname)) throw new Error('Apple Music 链接跳转到了未知地址，已停止读取。');
      return target.href;
    };
    let current = allowed(url);
    const signal = AbortSignal.timeout(15000);
    for (let hop = 0; hop <= 4; hop++) {
      const response = await fetch(current, { redirect: 'manual', signal, headers: { Accept: accept, 'User-Agent': 'FlowCabin/1.12 playlist metadata' } });
      if (response.url) allowed(response.url);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers?.get('location');
        if (!location || hop === 4) throw new Error('Apple Music 链接跳转过多，已停止读取。');
        current = allowed(new URL(location, current).href);
        continue;
      }
      if (response.status === 404) { await response.body?.cancel(); throw new Error('找不到这个 Apple Music 歌单，可能未公开分享或已删除。'); }
      if (!response.ok) { await response.body?.cancel(); throw new Error('Apple Music 暂时无法访问，请稍后再试。'); }
      if (Number(response.headers?.get('content-length')) > max) { await response.body?.cancel(); throw new Error('Apple Music 页面过大，无法读取。'); }
      if (!response.body?.getReader) {
        const text = await response.text(); if (Buffer.byteLength(text) > max) throw new Error('Apple Music 页面过大，无法读取。'); return text;
      }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > max) { await reader.cancel(); throw new Error('Apple Music 页面过大，无法读取。'); }
          chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks).toString('utf8');
      } finally { reader.releaseLock(); }
    }
  }

  async function lookup(ids, country) {
    const tracks = new Map();
    for (let index = 0; index < ids.length; index += 150) {
      const batch = ids.slice(index, index + 150);
      try {
        const data = JSON.parse(await getText(`https://itunes.apple.com/lookup?id=${batch.join(',')}&entity=song&country=${country}&limit=200`, { accept: 'application/json', max: 6 * 1024 * 1024 }));
        for (const entry of data.results || []) { const track = lookupTrack(entry); if (track) tracks.set(track.providerId, track); }
      } catch { /* Keep whatever the page itself described. */ }
    }
    return tracks;
  }
  async function appleLink(link) {
    if (link.kind === 'album') {
      const data = JSON.parse(await getText(`https://itunes.apple.com/lookup?id=${link.id}&entity=song&country=${link.country}&limit=200`, { accept: 'application/json', max: 6 * 1024 * 1024 }));
      const album = (data.results || []).find((entry) => entry.wrapperType === 'collection');
      if (!album) throw new Error('没有在 Apple 曲库里找到这张专辑。');
      return normalizeDetail({ playlist: { id: 'apple-album:' + link.id, name: album.collectionName, cover: String(album.artworkUrl100 || '').replace('100x100bb', '600x600bb'), creator: album.artistName, trackCount: album.trackCount }, tracks: (data.results || []).map(lookupTrack).filter(Boolean) }, 'apple');
    }
    const page = parseApplePlaylistPage(await getText(link.url));
    if (!page.tracks.length) throw new Error('这个 Apple Music 歌单没有可读取的曲目。请确认它已公开分享（歌单页面 › 分享 › 拷贝链接）。');
    const ids = page.tracks.map((track) => track.providerId).filter((id) => /^\d{1,20}$/.test(id));
    const found = ids.length ? await lookup([...new Set(ids)].slice(0, TRACK_LIMIT), link.country) : new Map();
    const tracks = page.tracks.map((track) => ({ ...track, ...(found.get(track.providerId) || {}), title: found.get(track.providerId)?.title || track.title }));
    return normalizeDetail({ playlist: { id: 'apple:' + link.id, name: page.name || 'Apple Music 歌单', cover: page.cover, creator: page.creator, description: page.description, trackCount: tracks.length }, tracks }, 'apple');
  }

  // macOS Music.app: the library the user is signed in to. Bulk property reads
  // keep a 1000-track playlist to a handful of Apple events.
  const MUSIC_SCRIPT = `function run(argv) {
    const Music = Application('Music');
    if (argv[0] === 'list') {
      const lists = Music.userPlaylists, ids = lists.persistentID(), names = lists.name(), kinds = lists.specialKind();
      return JSON.stringify(ids.map((id, index) => ({ id: id, name: names[index], kind: String(kinds[index]), trackCount: kinds[index] === 'folder' ? 0 : lists[index].tracks.length })).filter((entry) => entry.kind !== 'folder'));
    }
    const list = Music.userPlaylists.whose({ persistentID: argv[1] })[0], tracks = list.tracks;
    const n = tracks.name(), a = tracks.artist(), al = tracks.album(), d = tracks.duration();
    return JSON.stringify({ name: list.name(), trackCount: n.length, tracks: n.slice(0, ${TRACK_LIMIT}).map((title, index) => ({ title: title, artist: a[index], album: al[index], duration: Math.round((Number(d[index]) || 0) * 1000) })) });
  }`;
  const musicApp = (args) => new Promise((resolve, reject) => {
    if (platform !== 'darwin') return reject(new Error('读取「音乐」App 歌单需要 macOS。Windows 可在 iTunes / Apple Music 中导出歌单文件后导入。'));
    execFileProcess('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MUSIC_SCRIPT, ...args], { timeout: 30000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, out) => {
      if (error) return reject(new Error(/-1743|not authori[sz]ed/i.test(String(error.message)) ? '没有权限读取「音乐」App。请在 系统设置 › 隐私与安全性 › 自动化 中允许心流小屋控制「音乐」。' : '无法读取「音乐」App 的歌单，请确认已登录 Apple Music 或资料库可用。'));
      try { resolve(JSON.parse(out)); } catch { reject(new Error('「音乐」App 返回了无法识别的歌单数据。')); }
    });
  });

  return {
    parsePlaylistLink,
    async list(provider) {
      if (provider === 'qq') {
        const cookie = cookies('qq'); if (!cookie) return { loggedIn: false, provider, playlists: [] };
        const result = await upstream.handleQQUserPlaylists(cookie);
        return { loggedIn: Boolean(result?.loggedIn), provider, warning: clean(result?.warning, 300), playlists: (result?.playlists || []).map((entry) => normalizeSummary(entry, 'qq')).filter(Boolean) };
      }
      if (provider === 'netease') {
        const cookie = cookies('netease'); if (!cookie) return { loggedIn: false, provider, playlists: [] };
        const result = await upstream.neteaseUserPlaylists(cookie);
        return { loggedIn: Boolean(result?.loggedIn), provider, user: clean(result?.user, 80), playlists: (result?.playlists || []).map((entry) => normalizeSummary(entry, 'netease')).filter(Boolean) };
      }
      if (provider === 'apple-local') {
        const lists = await musicApp(['list']);
        return { loggedIn: true, provider, playlists: (Array.isArray(lists) ? lists : []).filter((entry) => /^[A-F\d]{16}$/i.test(entry?.id || '')).map((entry) => normalizeSummary({ ...entry, kind: /^(Music|Library)$/.test(entry.kind) ? 'liked' : 'created', creator: '音乐 App' }, 'apple-local')).filter(Boolean) };
      }
      throw new Error('不支持此歌单来源。');
    },
    async tracks(provider, id, { offset = 0 } = {}) {
      if (!Number.isInteger(offset) || offset < 0 || offset >= 5000 || (offset && provider !== 'netease')) throw new Error('此来源不支持这个分页位置。');
      const value = clean(id, 80);
      if (provider === 'qq') {
        if (!/^(qq-liked:201|\d{1,20})$/.test(value)) throw new Error('QQ 音乐歌单 ID 无效。');
        const result = await upstream.handleQQPlaylistTracks(cookies('qq'), value);
        if (result?.error) throw new Error('QQ 音乐歌单读取失败，请稍后再试。');
        return normalizeDetail({ playlist: { ...result?.playlist, id: result?.playlist?.id || value }, tracks: (result?.tracks || []).map((track) => ({ ...track, id: track.mid })) }, 'qq');
      }
      if (provider === 'netease') return normalizeDetail(await upstream.neteasePlaylistTracks(cookies('netease'), value, { offset }), 'netease');
      if (provider === 'apple-local') {
        if (!/^[A-F\d]{16}$/i.test(value)) throw new Error('「音乐」App 歌单 ID 无效。');
        const result = await musicApp(['tracks', value]);
        return normalizeDetail({ playlist: { id: value, name: result?.name, trackCount: result?.trackCount, creator: '音乐 App' }, tracks: result?.tracks }, 'apple-local');
      }
      throw new Error('不支持此歌单来源。');
    },
    async link(input) {
      const link = parsePlaylistLink(input);
      if (link.provider === 'apple') return { ...(await appleLink(link)), provider: 'apple' };
      return { ...(await this.tracks(link.provider, link.id)), provider: link.provider };
    }
  };
}

// ---------- exported playlist files (parsed in the renderer and here for tests) ----------
module.exports = { createPlaylistLibrary, parsePlaylistLink, parseApplePlaylistPage, normalizeDetail, normalizeTrack, isoMillis, TRACK_LIMIT };
