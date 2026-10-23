// 喜欢: a heart for the song on the deck. It stays on this device (no platform
// account is touched). A song is its record plus its title, so a playlist that
// was refreshed and reordered keeps its hearts.
import { queueId } from './player-queue.mjs';

export const LIKES_KEY = 'flow-cabin-liked-songs-v1';
export const LIKES_LIMIT = 1000;
export const LIKES_EVENT = 'flow-cabin-likes';
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const likeKey = (id, title) => { const record = queueId(id), name = text(title).toLowerCase(); return record && name ? `${record}\u0001${name}` : ''; };
export function normalizeLikes(value) {
  const seen = new Set(), list = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const key = likeKey(entry?.id, entry?.title);
    if (!key || seen.has(key)) continue;
    seen.add(key); list.push({ id: queueId(entry.id), index: Number.isInteger(entry.index) && entry.index >= 0 ? entry.index : 0, title: text(entry.title), artist: text(entry.artist), at: Number.isFinite(entry.at) ? entry.at : 0 });
    if (list.length >= LIKES_LIMIT) break;
  }
  return list;
}
export const isLiked = (list, id, title) => { const key = likeKey(id, title); return Boolean(key) && normalizeLikes(list).some((entry) => likeKey(entry.id, entry.title) === key); };
export function toggleLike(list, song, at = Date.now()) {
  const current = normalizeLikes(list), key = likeKey(song?.id, song?.title);
  if (!key) return current;
  if (current.some((entry) => likeKey(entry.id, entry.title) === key)) return current.filter((entry) => likeKey(entry.id, entry.title) !== key);
  return normalizeLikes([{ ...song, at }, ...current]);
}
export function readLikes(storage = globalThis.localStorage) { try { return normalizeLikes(JSON.parse(storage?.getItem(LIKES_KEY))); } catch { return []; } }
export function writeLikes(list, storage = globalThis.localStorage) { try { storage?.setItem(LIKES_KEY, JSON.stringify(normalizeLikes(list))); return true; } catch { return false; } }
