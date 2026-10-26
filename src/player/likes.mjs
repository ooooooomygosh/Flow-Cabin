// 喜欢: a heart for the song on the deck. It stays on this device (no platform
// account is touched). A song is its record plus its title, so a playlist that
// was refreshed and reordered keeps its hearts.
import { queueId, trackEntry, QUEUE_LIMIT } from './player-queue.mjs';
import { trackNames } from '../room-model.mjs';

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

// 唱片架 › 我喜欢: each heart resolved back to its record on the shelf and the song's
// place in it. A refreshed / reordered playlist is found again by the song's title; a
// heart whose record left the shelf stays listed (greyed) and is never dropped.
const sameName = (a, b) => Boolean(text(a)) && text(a).toLowerCase() === text(b).toLowerCase();
export function resolveLike(like, items = []) {
  const id = queueId(like?.id), item = (Array.isArray(items) ? items : []).find((entry) => queueId(entry?.id) === id) || null;
  const base = { id, index: Number.isInteger(like?.index) && like.index >= 0 ? like.index : 0, title: text(like?.title), artist: text(like?.artist), at: Number.isFinite(like?.at) ? like.at : 0, key: likeKey(like?.id, like?.title) };
  if (!item) return { ...base, item: null, record: '', track: -1, available: false, reason: '这张唱片已不在唱片架上' };
  const names = trackNames(item), record = text(item.title);
  // The saved spot first (right unless the list moved), then the first song with that title.
  const track = sameName(names[base.index], base.title) ? base.index : names.findIndex((name) => sameName(name, base.title));
  if (track >= 0) return { ...base, item, record, track, available: true, reason: '' };
  // A single, or a record without a track list, is the song itself.
  if (!names.length && sameName(item.title, base.title)) return { ...base, item, record, track: 0, available: true, reason: '' };
  return { ...base, item, record, track: -1, available: false, reason: '这首歌已不在这张唱片里' };
}
// Newest heart first; unavailable hearts stay in the list so nothing seems to vanish.
export const likedSongs = (list, items = []) => normalizeLikes(list).map((like) => resolveLike(like, items)).sort((a, b) => b.at - a.at);
// 全部播放 / 随机播放: the playable hearts in order (shuffled once with `random`), at most
// `limit`: the first goes on the deck, the rest become 待播 songs (likeQueueEntries).
export function likePlayOrder(songs, { shuffle = false, random = Math.random, limit = QUEUE_LIMIT + 1 } = {}) {
  const order = (Array.isArray(songs) ? songs : []).filter((song) => song?.available && song.item && Number.isInteger(song.track) && song.track >= 0);
  if (shuffle) for (let index = order.length - 1; index > 0; index--) { const pick = Math.min(index, Math.floor(random() * (index + 1))); [order[index], order[pick]] = [order[pick], order[index]]; }
  return order.slice(0, Math.max(0, limit));
}
export const likeQueueEntries = (order) => (Array.isArray(order) ? order : []).slice(1).map((song) => trackEntry(song.id, song.track)).filter(Boolean);
// How many hearts each record holds (record id → count).
export function likesByRecord(list) {
  const counts = new Map();
  for (const like of normalizeLikes(list)) counts.set(like.id, (counts.get(like.id) || 0) + 1);
  return counts;
}
