import { normalizeRoomSceneId } from './scene-catalog.mjs';
import { normalizePetId } from './pet/pet-catalog.mjs';
// Local personal preferences. This module never writes to the shared room API.
export const LIBRARY_PREFIX = 'album-circle-library-v1-';
export const MAX_LIBRARY_BYTES = 768000;
export const DEFAULT_RECORD_STYLE = Object.freeze({ base: '#16191d', opacity: 100, splatter: false, splashes: Object.freeze(['#dba746', '#efe3c1', '#9f3d2e']) });
const hex = /^#[0-9a-f]{6}$/i;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// “没有这个值”和“这个值是 0”是两回事：null / '' / 布尔值都算缺失，落回默认值。
const numeric = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
};
export function albumKey(item = {}) {
  if (item.externalIds?.qqAlbumMid) return `qq:${item.externalIds.qqAlbumMid}`;
  if (item.collectionId) return `itunes:${item.collectionId}`;
  if (item.id) return `item:${item.id}`;
  return `name:${String(item.artist || '').slice(0, 100)}:${String(item.title || '').slice(0, 140)}`;
}
export function normalizeStyle(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const colours = Array.isArray(value.splashes) ? value.splashes.slice(0, 3) : hex.test(value.splash) ? [value.splash] : DEFAULT_RECORD_STYLE.splashes;
  const opacity = numeric(value.opacity);
  return {
    ...(value.autoBase === true ? { autoBase: true } : {}),
    base: hex.test(value.base) ? value.base.toLowerCase() : DEFAULT_RECORD_STYLE.base,
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : 100,
    splatter: value.splatter === true,
    splashes: colours.length ? colours.map((colour, index) => hex.test(colour) ? colour.toLowerCase() : DEFAULT_RECORD_STYLE.splashes[index]) : [...DEFAULT_RECORD_STYLE.splashes]
  };
}
// Legacy saved styles remain manual. Only an explicit flag follows cover colour.
// Resolved display styles omit the flag so snapshots/read-only renderers use
// the sampled colour directly without starting their own artwork request.
export function resolveRecordStyle(value, coverBase = DEFAULT_RECORD_STYLE.base) {
  const automatic = !value || value.autoBase === true;
  return normalizeStyle({ ...value, ...(automatic ? { base: coverBase } : {}), autoBase: false });
}
export function genreList(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，;；、\n]/) : [];
  return [...new Set(list.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 32)).filter(Boolean))].slice(0, 12);
}
export function genresFor(item, data) {
  const key = albumKey(item), saved = data?.genres;
  if (own(saved || {}, key)) return saved[key];
  const source = [...genreList(item.genres), ...genreList(item.genre), ...genreList(item.primaryGenreName), ...genreList(item.tags)];
  return genreList(source.filter((tag) => !/^(album|song|qq|itunes|apple music|专辑|单曲|QQ 音乐|链接精确定位|name search)$/i.test(tag)));
}
export function normalizeLibrary(value = {}) {
  const out = { version: 1, styles: {}, genres: {}, rooms: {} };
  if (!value || typeof value !== 'object') return out;
  for (const [key, record] of Object.entries(value.styles || {}).slice(0, 2000)) {
    if (/^(qq|itunes|item|name):/.test(key) && key.length <= 260 && record && typeof record === 'object') out.styles[key] = normalizeStyle(record);
  }
  for (const [key, genres] of Object.entries(value.genres || {}).slice(0, 2000)) {
    if (/^(qq|itunes|item|name):/.test(key) && key.length <= 260) out.genres[key] = genreList(genres);
  }
  for (const [roomId, raw] of Object.entries(value.rooms || {}).slice(0, 100)) {
    if (!/^[\w.-]{1,160}$/.test(roomId) || ['__proto__', 'constructor', 'prototype'].includes(roomId)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const ids = new Set(), names = new Set();
    const boxes = (Array.isArray(raw.boxes) ? raw.boxes : []).slice(0, 64).flatMap((box) => {
      if (!box || !/^[\w-]{1,80}$/.test(box.id) || ids.has(box.id)) return [];
      const name = typeof box.name === 'string' ? box.name.trim().slice(0, 40) : '';
      if (!name || names.has(name.toLowerCase())) return [];
      ids.add(box.id); names.add(name.toLowerCase());
      return [{ id: box.id, name, keys: [...new Set((Array.isArray(box.keys) ? box.keys : []).filter((key) => typeof key === 'string' && /^(qq|itunes|item|name):/.test(key) && key.length <= 260))].slice(0, 2000) }];
    });
    out.rooms[roomId] = { boxes, look: normalizeRoomSceneId(raw.look), petId: normalizePetId(raw.petId) };
    if (Number.isFinite(raw.turntable?.x) && Number.isFinite(raw.turntable?.y)) out.rooms[roomId].turntable = { x: Math.max(0, Math.min(1, raw.turntable.x)), y: Math.max(0, Math.min(1, raw.turntable.y)) };
  }
  return out;
}
export function readLibrary(storage, userId) {
  try {
    const raw = storage.getItem(LIBRARY_PREFIX + userId);
    if (!raw || raw.length > MAX_LIBRARY_BYTES) return normalizeLibrary();
    return normalizeLibrary(JSON.parse(raw));
  } catch { return normalizeLibrary(); }
}
export function matchesLibraryFilters(item, data, roomId, filters = {}) {
  const key = albumKey(item), boxes = data?.rooms?.[roomId]?.boxes || [];
  if (filters.box === 'unfiled' && boxes.some((box) => box.keys.includes(key))) return false;
  if (filters.box && !['all', 'unfiled'].includes(filters.box) && !boxes.find((box) => box.id === filters.box)?.keys.includes(key)) return false;
  const genres = genresFor(item, data);
  if (filters.genre === 'unmarked' && genres.length) return false;
  if (filters.genre && !['all', 'unmarked'].includes(filters.genre) && !genres.includes(filters.genre)) return false;
  const year = Number(item.year);
  if (filters.decade === 'unknown' && Number.isFinite(year) && year >= 1900) return false;
  if (filters.decade && !['all', 'unknown'].includes(filters.decade) && Math.floor(year / 10) * 10 !== Number(filters.decade)) return false;
  if (filters.provider && filters.provider !== 'all' && (item.externalIds?.qqAlbumMid ? 'qq' : item.collectionId ? 'itunes' : 'other') !== filters.provider) return false;
  return true;
}
