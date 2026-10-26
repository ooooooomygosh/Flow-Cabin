// 听 · the now-playing bar and the 唱片架 page (docs/design/3.0-design.md §6.2): pure
// rules, so they are testable without a browser. Storage keys stay those of v2.2.
import { queueId } from '../player/player-queue.mjs';

// 唱片少于 12 张时不显示「筛选」: a short shelf is easier to scan than to filter.
export const FILTER_MIN_RECORDS = 12;
export const filtersShown = (count) => Number(count) >= FILTER_MIN_RECORDS;
export const SHELF_VIEWS = Object.freeze([{ id: 'records', label: '唱片' }, { id: 'liked', label: '我喜欢' }, { id: 'recent', label: '最近播放' }]);
export const isShelfView = (id) => SHELF_VIEWS.some((view) => view.id === id);
const DEFAULTS = { sort: 'recent', type: 'all', box: 'all', genre: 'all', decade: 'all', provider: 'all' };
// How many filters differ from 全部 (the sort order is not a filter).
export const activeFilterCount = (filters) => Object.keys(DEFAULTS).filter((key) => key !== 'sort' && filters?.[key] !== undefined && filters[key] !== DEFAULTS[key]).length;
const byRecent = (a, b) => String(b?.addedAt || '').localeCompare(String(a?.addedAt || ''));
// The records the 唱片 view shows: the filtered list when 筛选 is available, otherwise
// the whole shelf, newest first — a saved filter must never hide records behind a button
// that is not there.
export function shelfRecords(items, filtered, query = '') {
  const all = Array.isArray(items) ? items : [], base = filtersShown(all.length) ? (Array.isArray(filtered) ? filtered : all) : [...all].sort(byRecent);
  const needle = String(query || '').trim().toLocaleLowerCase();
  return needle ? base.filter((item) => `${item?.title || ''} ${item?.artist || ''}`.toLocaleLowerCase().includes(needle)) : base;
}

const find = (items, id) => (Array.isArray(items) ? items : []).find((item) => queueId(item?.id) === queueId(id)) || null;
// 最近播放 (flow-cabin-listen-history-v1, newest first) resolved against the shelf.
export const recentSongs = (listens, items) => (Array.isArray(listens) ? listens : []).map((entry) => { const item = find(items, entry?.id); return { ...entry, item, record: item?.title || '', available: Boolean(item) }; });
// The empty bar's one-click resume: the last few different records still on the shelf.
export function recentRecords(listens, items, limit = 3) {
  const seen = new Set(), out = [];
  for (const entry of recentSongs(listens, items)) {
    const id = queueId(entry.id);
    if (!entry.available || seen.has(id)) continue;
    seen.add(id); out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

// 加入时间 / 播放时间: 今天 21:05 · 昨天 · 10月3日 · 2025年10月3日.
export function shortDay(at, now = Date.now()) {
  if (!Number.isFinite(at) || at <= 0) return '';
  const day = new Date(at), today = new Date(now), start = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((start(today) - start(day)) / 86400000);
  const time = `${String(day.getHours()).padStart(2, '0')}:${String(day.getMinutes()).padStart(2, '0')}`;
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  return day.getFullYear() === today.getFullYear() ? `${day.getMonth() + 1}月${day.getDate()}日` : `${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`;
}

// The bar's quiet second line: the current lyric, else the album (or the playlist) —
// never an empty line while a record is on the deck.
export function nowLine({ lyric = '', album = '', record = '', status = '' } = {}) {
  const pick = [lyric, album, record, status].map((value) => typeof value === 'string' ? value.trim() : '').find(Boolean);
  return pick || '';
}
