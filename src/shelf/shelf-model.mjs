// The record shelf as a bookcase: the pure rules behind it — which binders stand on the
// shelf, how the A–Z index book groups and ranks records, and how its highlight moves.
// No DOM here, so all of it is testable under node:test.
import { albumKey } from '../record-library.mjs';

// ── binders ───────────────────────────────────────────────────────────────────────
// DEsk's binders are oxblood calf and dark green buckram, standing in turns; the odd one is
// ink-brown. Each has its own height and width so the row does not look stamped.
export const BINDER_COLOURS = Object.freeze([
  { id: 'calf', spine: '#57201a', edge: '#3a1411', worn: '#74382c' },
  { id: 'buckram', spine: '#213021', edge: '#141f15', worn: '#35493a' },
  { id: 'umber', spine: '#3c2a1c', edge: '#271a10', worn: '#58402b' },
  { id: 'navy', spine: '#1f2a44', edge: '#131b2e', worn: '#33415f' }
]);
export const binderColour = (index) => BINDER_COLOURS[((index % BINDER_COLOURS.length) + BINDER_COLOURS.length) % BINDER_COLOURS.length];
// A stable 0..1 from a string, so the same binder is always the same size.
export function seedOf(text = '') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
// Width 76–94 px, height 88–100 % of the row, a hair of lean on the odd one.
export function binderShape(id) {
  const a = seedOf(`${id}:w`), b = seedOf(`${id}:h`), c = seedOf(`${id}:t`);
  return { width: Math.round(76 + a * 18), height: Math.round(88 + b * 12), tilt: c > 0.93 ? -1.4 : c < 0.05 ? 1.1 : 0 };
}

export const SYSTEM_BINDERS = Object.freeze([
  { id: 'records', view: 'records', label: '唱片' },
  { id: 'liked', view: 'liked', label: '我喜欢' },
  { id: 'recent', view: 'recent', label: '最近播放' }
]);
// Items that sit in a 唱片盒 (the box keeps album keys, not ids).
export const boxItems = (items, box) => {
  const keys = new Set(box?.keys || []);
  return (Array.isArray(items) ? items : []).filter((item) => keys.has(albumKey(item)));
};
// What stands on the shelf: the three system views first, then one binder per 唱片盒.
// `counts` is { records, liked, recent } so the label card can say how full each one is.
export function shelfBinders({ boxes = [], items = [], counts = {} } = {}) {
  const system = SYSTEM_BINDERS.map((binder, i) => ({ ...binder, kind: 'system', box: '', count: counts[binder.id] ?? 0, unit: binder.id === 'records' ? '张' : '首', colour: binderColour(i === 0 ? 0 : i === 1 ? 1 : 2) }));
  const boxed = (Array.isArray(boxes) ? boxes : []).map((box, i) => ({ id: `box:${box.id}`, kind: 'box', view: 'records', label: box.name, box: box.id, count: boxItems(items, box).length, unit: '张', colour: binderColour(i + 3) }));
  return [...system, ...boxed];
}
export const binderById = (binders, id) => binders.find((binder) => binder.id === id) || null;

// ── the index: initials ──────────────────────────────────────────────────────────
export const INITIALS = Object.freeze([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']);

// Pinyin initials without a table: the first hanzi of each letter, and a pinyin collator
// that sorts a character between them. If the platform has no pinyin collation the check
// below fails and every hanzi title is filed under # instead.
const BOUNDS = [['A', '阿'], ['B', '八'], ['C', '嚓'], ['D', '哒'], ['E', '妸'], ['F', '发'], ['G', '旮'], ['H', '哈'], ['J', '丌'], ['K', '咔'], ['L', '垃'], ['M', '妈'], ['N', '拿'], ['O', '噢'], ['P', '啪'], ['Q', '七'], ['R', '然'], ['S', '撒'], ['T', '塌'], ['W', '挖'], ['X', '昔'], ['Y', '压'], ['Z', '匝']];
let collator = null, pinyin = null;
function pinyinCollator() {
  if (pinyin !== null) return pinyin ? collator : null;
  try {
    const c = new Intl.Collator('zh-Hans-u-co-pinyin');
    pinyin = c.compare('阿', '八') < 0 && c.compare('八', '嚓') < 0 && c.compare('妈', '拿') < 0 && c.compare('塌', '挖') < 0 && c.compare('挖', '匝') < 0 && c.compare('晴', '雨') < 0;
    collator = c;
  } catch { pinyin = false; }
  return pinyin ? collator : null;
}
export const hasPinyin = () => Boolean(pinyinCollator());

const HAN = /\p{Script=Han}/u, LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
// A–Z, or # for digits, symbols, kana and anything else.
export function initialFor(title) {
  const text = String(title ?? '').normalize('NFKC');
  for (const ch of text) {
    if (!LETTER_OR_DIGIT.test(ch)) continue;
    if (HAN.test(ch)) {
      const c = pinyinCollator();
      if (!c || c.compare(ch, BOUNDS[0][1]) < 0) return '#';
      let letter = BOUNDS[0][0];
      for (const [initial, first] of BOUNDS) { if (c.compare(ch, first) >= 0) letter = initial; else break; }
      return letter;
    }
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    return /^[A-Za-z]$/.test(base) ? base.toUpperCase() : '#';
  }
  return '#';
}

const compareTitles = (a, b) => {
  const c = pinyinCollator();
  const x = String(a ?? ''), y = String(b ?? '');
  return c ? c.compare(x, y) : x.localeCompare(y, 'zh');
};
export const byTitle = (a, b) => compareTitles(a?.title, b?.title) || compareTitles(a?.artist, b?.artist);

// A–Z, # last; only the letters that have a record. Titles inside a letter are in book order.
export function groupByInitial(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const letter = initialFor(item?.title);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(item);
  }
  return INITIALS.filter((letter) => groups.has(letter)).map((letter) => ({ letter, items: groups.get(letter).sort(byTitle) }));
}
// The letters that have something under them (the thumb tabs that are not blank).
export const lettersWith = (items) => new Set(groupByInitial(items).map((group) => group.letter));
// Index order flattened: what ↑/↓ walks when nothing is typed.
export const indexOrder = (items) => groupByInitial(items).flatMap((group) => group.items);

// ── the index: search ────────────────────────────────────────────────────────────
const norm = (text) => String(text ?? '').normalize('NFKC').toLocaleLowerCase().trim();
const SPLIT = /[\s\-_/\\·•.,:;&|()（）《》〈〉「」『』【】[\]"'‘’“”!?！？、，。…]+/u;
const words = (text) => norm(text).split(SPLIT).filter(Boolean);
const VIA_ORDER = ['', 'artist', 'tag', 'track'];
export const TIERS = Object.freeze({ nameStarts: 0, wordStarts: 1, nameContains: 2, related: 3 });

// What a record says about itself apart from its name: artist, tags and genres, and the
// tracks on it. `tagsOf(item)` supplies the tags (the shelf passes the record library's
// genres, which also fold in the item's own tags).
function related(item, tagsOf) {
  const out = [];
  if (item?.artist) out.push(['artist', item.artist]);
  for (const tag of (tagsOf ? tagsOf(item) : [item?.genre, ...(Array.isArray(item?.tags) ? item.tags : [])]) || []) if (tag) out.push(['tag', tag]);
  for (const track of Array.isArray(item?.tracks) ? item.tracks : []) if (track) out.push(['track', typeof track === 'string' ? track : track?.title]);
  return out;
}

// Rank records for a query: name starts with it → one of the words in the name starts with it →
// the name contains it → the artist, then a tag, then a track name matches (every word of a
// multi-word query must be found somewhere). Same tier: book order. Returns
// [{ item, tier, via }] where `via` says what matched in the last tier. An empty query ranks
// nothing; use `indexOrder` for the plain A–Z walk.
export function rankRecords(items, query, { tagsOf } = {}) {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const ranked = [];
  for (const item of Array.isArray(items) ? items : []) {
    const title = norm(item?.title);
    let tier = -1, via = '';
    if (title.startsWith(q)) tier = TIERS.nameStarts;
    else if (words(title).some((word) => word.startsWith(q))) tier = TIERS.wordStarts;
    else if (title.includes(q)) tier = TIERS.nameContains;
    else {
      const facts = related(item, tagsOf), hay = [title, ...facts.map(([, text]) => norm(text))];
      if (tokens.every((token) => hay.some((text) => text.includes(token)))) {
        tier = TIERS.related;
        const hit = ['artist', 'tag', 'track'].map((kind) => facts.find(([k, text]) => k === kind && tokens.some((token) => norm(text).includes(token)))).find(Boolean);
        via = hit ? hit[0] : '';
      }
    }
    if (tier >= 0) ranked.push({ item, tier, via });
  }
  return ranked.sort((a, b) => a.tier - b.tier || VIA_ORDER.indexOf(a.via) - VIA_ORDER.indexOf(b.via) || byTitle(a.item, b.item));
}
export const VIA_LABEL = Object.freeze({ artist: '音乐人', tag: '标签', track: '曲目' });

// ── the highlight ────────────────────────────────────────────────────────────────
// ↑/↓ move it and wrap round the ends; Home/End jump; anything else leaves it. With no
// results it stays at -1. `current` may be stale after the list shrank.
export function moveHighlight(current, key, length) {
  if (!(length > 0)) return -1;
  const at = Number.isInteger(current) && current >= 0 && current < length ? current : -1;
  if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % length;
  if (key === 'ArrowUp') return at < 0 ? length - 1 : (at - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return at < 0 ? 0 : at;
}
// The highlight that survives a new result list: stay on the same record if it is still there.
export function keepHighlight(previousId, results) {
  if (!results.length) return -1;
  const at = results.findIndex((entry) => String(entry.id ?? entry.item?.id) === String(previousId));
  return at >= 0 ? at : 0;
}

// The number printed at the top of the right-hand page: "014 / 057".
export const cardCode = (index, total) => `${String(index + 1).padStart(3, '0')} / ${String(total).padStart(3, '0')}`;
