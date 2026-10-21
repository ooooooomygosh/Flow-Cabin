// Browser-only collection. One atomic JSON write; IDs match the existing backup format.
export const WEB_COLLECTION_KEY = 'flow-cabin-web-collection-v1';
const MAX_ITEMS = 2000, MAX_BYTES = 4 * 1024 * 1024;
const text = (v, n) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, n) : '';
const list = (v, n, limit) => Array.isArray(v) ? v.map(x => text(typeof x === 'string' ? x : x?.title || x?.name, n)).filter(Boolean).slice(0, limit) : [];
const number = v => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
const safeId = v => typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : '';
function link(v) { try { const u = new URL(String(v || '')); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && u.href.length <= 700 ? u.href : ''; } catch { return ''; } }
function cover(v) {
  const s = String(v || '');
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z\d+/=]+$/i.test(s) && s.length <= 400000) return s;
  if (/^\/desktop-music\/local\/cover\/[a-f\d]{16}$/.test(s)) return s;
  const u = link(s); return u.startsWith('https:') ? u : '';
}
const id = () => 'web-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
export function normalizeWebItem(body = {}, previous = {}) {
  const v = { ...previous, ...body }, title = text(v.title, 160), artist = text(v.artist, 160);
  if (!title || !artist) throw new Error('请填写专辑名和歌手。');
  const type = ['song', 'playlist'].includes(v.type) ? v.type : 'album', limit = type === 'playlist' ? 5000 : 100;
  return {
    id: previous.id || safeId(body.id) || id(), type, title, artist,
    albumTitle: text(v.albumTitle, 160), trackTimeMillis: number(v.trackTimeMillis),
    year: /^\d{4}$/.test(text(v.year, 16)) ? text(v.year, 4) : '', label: text(v.label, 120),
    cover: cover(v.cover), originalCover: cover(v.originalCover), genre: text(v.genre || v.primaryGenreName, 60), tags: list(v.tags, 32, 12),
    tracks: list(v.tracks, 160, limit),
    trackDetails: Array.isArray(v.trackDetails) ? v.trackDetails.slice(0, limit).map(t => ({ title: text(t?.title, 160), trackNumber: number(t?.trackNumber), lengthMillis: number(t?.lengthMillis), source: text(t?.source, 40), providerId: text(t?.providerId, 64), mediaMid: text(t?.mediaMid, 64), ...(cover(t?.cover) ? { cover: cover(t.cover) } : {}), ...(text(t?.artist, 160) ? { artist: text(t.artist, 160) } : {}), ...(text(t?.album, 160) ? { album: text(t.album, 160) } : {}) })).filter(t => t.title) : [],
    externalIds: v.externalIds && typeof v.externalIds === 'object' ? Object.fromEntries(Object.entries(v.externalIds).slice(0, 12).map(([k, x]) => [text(k, 40), text(x, 180)]).filter(([k, x]) => k && x)) : {},
    collectionId: text(v.collectionId, 60), platforms: list(v.platforms, 60, 6), collectionViewUrl: link(v.collectionViewUrl), trackViewUrl: link(v.trackViewUrl),
    notes: text(v.notes, 4000), source: text(v.source, 40) || 'manual', addedAt: previous.addedAt || new Date().toISOString()
  };
}
const identity = i => i.externalIds?.playlist ? 'playlist:' + i.externalIds.playlist : i.collectionId ? 'itunes:' + i.collectionId : i.externalIds?.qqAlbumMid ? 'qq:' + i.externalIds.qqAlbumMid : i.externalIds?.localAlbum ? 'local:' + i.externalIds.localAlbum : i.externalIds?.fileAlbum ? 'file:' + i.externalIds.fileAlbum : '';
const manual = i => [i.type, i.artist.toLowerCase(), i.title.toLowerCase()].join('\n');
export function browserCollectionRequest(path, { method = 'GET', body } = {}, storage = globalThis.localStorage) {
  let items;
  try {
    const raw = storage.getItem(WEB_COLLECTION_KEY), saved = raw ? JSON.parse(raw) : { items: [] };
    if (!Array.isArray(saved.items) || saved.items.length > MAX_ITEMS || saved.items.some(i => !safeId(i?.id))) throw new Error();
    items = saved.items.map(i => normalizeWebItem(i, i));
  } catch { throw new Error('无法读取浏览器里的唱片；原有数据未被覆盖，请先保留站点数据并检查浏览器存储。'); }
  const save = next => {
    const raw = JSON.stringify({ version: 1, items: next });
    if (raw.length > MAX_BYTES) throw new Error('浏览器唱片空间不足，请先导出备份并减少封面大小。原有唱片保持不变。');
    try { storage.setItem(WEB_COLLECTION_KEY, raw); } catch { throw new Error('唱片未能保存到浏览器，原有唱片保持不变。请检查站点存储空间。'); }
  };
  const url = new URL(path, 'https://cabin.invalid'), itemId = url.searchParams.get('id');
  if (url.pathname === '/api/items' && method === 'GET') return { items };
  if (url.pathname === '/api/items/import' && method === 'POST') {
    if (!Array.isArray(body?.items) || body.items.length > MAX_ITEMS) throw new Error(`一次最多导入 ${MAX_ITEMS} 张唱片，原有唱片保持不变。`);
    let added = 0; const ids = Object.create(null), next = [...items], now = Date.now();
    for (const value of body.items) {
      const at = Date.parse(value?.addedAt), item = normalizeWebItem(value, Number.isFinite(at) ? { addedAt: new Date(Math.min(now, at)).toISOString() } : {});
      const key = identity(item), existing = next.find(i => key ? identity(i) === key : !identity(i) && manual(i) === manual(item));
      if (existing) { if (safeId(value.id)) ids[value.id] = existing.id; continue; }
      if (next.length >= MAX_ITEMS) throw new Error(`唱片架最多放 ${MAX_ITEMS} 张唱片。`);
      if (next.some(i => i.id === item.id)) item.id = id();
      if (safeId(value.id)) ids[value.id] = item.id;
      next.push(item); added++;
    }
    save(next); return { added, total: next.length, ids };
  }
  if (url.pathname === '/api/items' && method === 'POST') {
    const item = normalizeWebItem({ ...body, id: undefined }), key = identity(item), existing = key && items.find(i => identity(i) === key);
    if (existing) return { item: existing, duplicate: true };
    if (items.length >= MAX_ITEMS) throw new Error(`唱片架最多放 ${MAX_ITEMS} 张唱片。`);
    save([item, ...items]); return { item };
  }
  const index = items.findIndex(i => i.id === itemId);
  if (index < 0) throw new Error('这张唱片已经不在唱片架上了。');
  if (method === 'PATCH') {
    const allowed = Object.fromEntries(Object.entries(body || {}).filter(([k]) => ['notes', 'title', 'artist', 'year', 'cover', 'originalCover', 'tracks', 'trackDetails', 'genre', 'tags', 'label'].includes(k)));
    const item = normalizeWebItem(allowed, items[index]); items[index] = item; save(items); return { item };
  }
  if (method === 'DELETE') { save(items.filter(i => i.id !== itemId)); return { ok: true }; }
  throw new Error('不支持这个唱片操作。');
}
