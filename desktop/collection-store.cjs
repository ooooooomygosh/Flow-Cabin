'use strict';
// The album collection on this computer: one JSON file in the user data
// directory. Earlier releases kept albums in an emulated Firestore file
// (`local/collection.json`); those are migrated once on first start.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const MAX_ITEMS = 2000;
const text = (value, max) => typeof value === 'string' || typeof value === 'number' ? String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max) : '';
const list = (value, max, limit) => Array.isArray(value) ? value.map((entry) => text(typeof entry === 'string' ? entry : entry?.title || entry?.name, max)).filter(Boolean).slice(0, limit) : [];
function link(value) {
  try { const url = new URL(String(value || '')); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 700 ? url.href : ''; } catch { return ''; }
}
// Catalog artwork (https), artwork from local files, or an inline image.
function cover(value) {
  const raw = String(value || '');
  if (/^\/desktop-music\/local\/cover\/[a-f\d]{16}$/.test(raw)) return raw;
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z\d+/=]+$/i.test(raw) && raw.length <= 400000) return raw;
  const url = link(raw); return url.startsWith('https:') ? url : '';
}

function normalizeItem(body = {}, previous = {}) {
  const title = text(body.title ?? previous.title, 160), artist = text(body.artist ?? previous.artist, 160);
  if (!title || !artist) throw new Error('请填写专辑名和歌手。');
  const value = { ...previous, ...body };
  // Playlists carry their own per-track artist and may run longer than an album.
  const type = ['song', 'playlist'].includes(value.type) ? value.type : 'album', trackLimit = type === 'playlist' ? 5000 : 100;
  const tracks = list(value.tracks, 160, trackLimit);
  const externalIds = value.externalIds && typeof value.externalIds === 'object' ? Object.fromEntries(Object.entries(value.externalIds).slice(0, 12).map(([key, id]) => [text(key, 40), text(id, 180)]).filter(([key, id]) => key && id)) : {};
  return {
    id: previous.id || text(body.id, 80) || 'album-' + crypto.randomBytes(8).toString('hex'),
    type,
    title, artist,
    albumTitle: text(value.albumTitle, 160),
    trackTimeMillis: Number.isFinite(Number(value.trackTimeMillis)) ? Math.max(0, Number(value.trackTimeMillis)) : 0,
    year: /^\d{4}$/.test(text(value.year, 16)) ? text(value.year, 4) : '',
    label: text(value.label, 120),
    cover: cover(value.cover),
    // Kept when the cover is replaced by a generated pixel cover, so it can be restored.
    originalCover: cover(value.originalCover),
    genre: text(value.genre || value.primaryGenreName, 60),
    tags: list(value.tags, 32, 12),
    tracks,
    trackDetails: Array.isArray(value.trackDetails) ? value.trackDetails.slice(0, trackLimit).map((track) => ({
      title: text(track?.title, 160), trackNumber: Number(track?.trackNumber) || 0, lengthMillis: Math.max(0, Number(track?.lengthMillis) || 0),
      source: text(track?.source, 40), providerId: text(track?.providerId, 64), mediaMid: text(track?.mediaMid, 64),
      ...(cover(track?.cover) ? { cover: cover(track.cover) } : {}),
      ...(text(track?.artist, 160) ? { artist: text(track.artist, 160) } : {}), ...(text(track?.album, 160) ? { album: text(track.album, 160) } : {})
    })).filter((track) => track.title) : [],
    externalIds,
    collectionId: text(value.collectionId, 60),
    platforms: list(value.platforms, 60, 6),
    collectionViewUrl: link(value.collectionViewUrl), trackViewUrl: link(value.trackViewUrl),
    notes: text(value.notes, 4000),
    source: text(value.source, 40) || 'manual',
    addedAt: previous.addedAt || new Date().toISOString()
  };
}
// Same album = same catalog id, QQ album, scanned local folder, or the same
// tagged album picked as files in the browser.
function identity(item) {
  return item.externalIds?.playlist ? 'playlist:' + item.externalIds.playlist : item.collectionId ? 'itunes:' + item.collectionId : item.externalIds?.qqAlbumMid ? 'qq:' + item.externalIds.qqAlbumMid : item.externalIds?.localAlbum ? 'local:' + item.externalIds.localAlbum : item.externalIds?.fileAlbum ? 'file:' + item.externalIds.fileAlbum : '';
}

const backupId = (value) => typeof value === 'string' && /^[\w.:-]{1,80}$/.test(value) ? value : '';
// Manual albums have no catalog identity: the same type, artist and title is the same album.
const manualKey = (item) => [item.type, item.artist.toLowerCase(), item.title.toLowerCase()].join('\n');

function readLegacy(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rooms = Object.entries(raw.collections || {}).filter(([key]) => /^albumCircleRooms\/[^/]+\/items$/.test(key));
    rooms.sort(([a], [b]) => (b.includes('/local-room/') ? 1 : 0) - (a.includes('/local-room/') ? 1 : 0));
    const seen = new Set(), items = [];
    for (const [, entries] of rooms) for (const [id, data] of entries) {
      if (seen.has(id) || !data || typeof data !== 'object') continue;
      try {
        const created = Number(data.createdAt) || 0;
        items.push(normalizeItem({ ...data, id, addedAt: data.addedAt || (created ? new Date(created).toISOString() : undefined) }, { id, addedAt: created ? new Date(created).toISOString() : new Date(0).toISOString() }));
        seen.add(id);
      } catch { /* Skip records without a title. */ }
    }
    return items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  } catch { return null; }
}

function createCollectionStore({ directory, legacyFile = path.join(directory, 'local', 'collection.json') }) {
  const file = path.join(directory, 'collection.json');
  let items = [];
  const save = () => { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 2, items })); fs.renameSync(file + '.tmp', file); };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    items = (Array.isArray(saved.items) ? saved.items : []).map((item) => { try { return normalizeItem(item, item); } catch { return null; } }).filter(Boolean);
  } catch {
    const migrated = readLegacy(legacyFile);
    if (migrated) { items = migrated; save(); }
  }
  return {
    list: () => items,
    add(body) {
      const item = normalizeItem({ ...body, id: undefined });
      const key = identity(item), existing = key && items.find((entry) => identity(entry) === key);
      if (existing) return { item: existing, duplicate: true };
      if (items.length >= MAX_ITEMS) throw new Error(`唱片架最多放 ${MAX_ITEMS} 张专辑。`);
      items = [item, ...items]; save(); return { item };
    },
    update(id, patch) {
      const index = items.findIndex((item) => item.id === id); if (index < 0) throw new Error('这张专辑已经不在唱片架上了。');
      const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => ['notes', 'title', 'artist', 'year', 'cover', 'originalCover', 'tracks', 'trackDetails', 'genre', 'tags', 'label'].includes(key)));
      items[index] = normalizeItem(allowed, items[index]); save(); return { item: items[index] };
    },
    remove(id) { const before = items.length; items = items.filter((item) => item.id !== id); if (items.length === before) throw new Error('这张专辑已经不在唱片架上了。'); save(); return { ok: true }; },
    // Restoring a backup keeps each album's id and addedAt, so record styles and
    // boxes (keyed by `item:<id>`) still find it and 「最近放上」 keeps its order.
    // `ids` maps backup ids to the shelf ids they landed on when those differ.
    importItems(values) {
      let added = 0; const ids = {}, used = new Set(items.map((item) => item.id)), now = Date.now();
      for (const value of (Array.isArray(values) ? values : []).slice(0, MAX_ITEMS)) {
        try {
          const wanted = backupId(value?.id), at = typeof value?.addedAt === 'string' ? Date.parse(value.addedAt) : NaN;
          const item = normalizeItem({ ...value, id: undefined, addedAt: undefined }, Number.isFinite(at) ? { addedAt: new Date(Math.min(at, now)).toISOString() } : {});
          const key = identity(item), manual = !key && manualKey(item);
          const existing = key ? items.find((entry) => identity(entry) === key) : items.find((entry) => entry.id === wanted && manualKey(entry) === manual) || items.find((entry) => !identity(entry) && manualKey(entry) === manual);
          if (existing) { if (wanted && existing.id !== wanted) ids[wanted] = existing.id; continue; }
          if (items.length >= MAX_ITEMS) break;
          if (wanted && !used.has(wanted)) item.id = wanted; else if (wanted) ids[wanted] = item.id;
          used.add(item.id); items.push(item); added++;
        } catch { /* Skip records without a title. */ }
      }
      if (added) { items.sort((a, b) => b.addedAt.localeCompare(a.addedAt)); save(); }
      return { added, total: items.length, ids };
    }
  };
}

// HTTP-style routes used by the business page through the site router.
async function routeCollection(store, request) {
  const url = new URL(request.url), id = url.searchParams.get('id') || '';
  const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (request.method === 'GET') return reply({ items: store.list() });
    const body = ['POST', 'PATCH'].includes(request.method) ? await request.json() : {};
    if (request.method === 'POST' && url.pathname === '/api/items/import') return reply(store.importItems(body.items));
    if (request.method === 'POST') { const result = store.add(body); return reply(result, result.duplicate ? 200 : 201); }
    if (request.method === 'PATCH') return reply(store.update(id, body));
    if (request.method === 'DELETE') return reply(store.remove(id));
    return reply({ error: 'Method not allowed' }, 405);
  } catch (error) { return reply({ error: error.message || '操作失败。' }, 400); }
}
module.exports = { createCollectionStore, routeCollection, normalizeItem, readLegacy, identity };
