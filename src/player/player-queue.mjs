// The turntable plays an album in order; a short "待播" stack of albums
// follows it. Pure functions so the rules are testable without a browser.
export const QUEUE_KEY = 'album-circle-player-queue-v1';
export const QUEUE_LIMIT = 50;
export const REPEAT_MODES = ['off', 'all', 'one'];

// Records in the collection normally carry string ids, but imported / older
// feeds can expose numbers. Queue identity is always the string form so 7 and
// "7" are the same record instead of two queue entries.
export const queueId = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value !== 'string') return '';
  return value.trim();
};

// 待播 holds whole records (their id: they play after the current record) and
// single songs (`track:<index>:<id>`: 下一首播放 / 加入队列 — they play right
// after the current song, then the record they interrupted carries on).
const TRACK_ENTRY = /^track:(\d{1,4}):(.+)$/;
export const trackEntry = (id, index) => { const value = queueId(id); return value && value.length <= 80 && !TRACK_ENTRY.test(value) && Number.isSafeInteger(index) && index >= 0 && index < 10000 ? `track:${index}:${value}` : ''; };
export function parseEntry(entry) {
  const value = queueId(entry), match = TRACK_ENTRY.exec(value);
  return match ? { id: match[2], index: Number(match[1]), track: true } : { id: value, index: 0, track: false };
}
export const isTrackEntry = (entry) => parseEntry(entry).track;
const validEntry = (id) => Boolean(id) && parseEntry(id).id.length <= 80;

export function normalizeQueue(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const ids = [];
  if (Array.isArray(raw.ids)) {
    const seen = new Set();
    for (const entry of raw.ids) {
      const id = queueId(entry);
      if (!validEntry(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= QUEUE_LIMIT) break;
    }
  }
  return { ids, repeat: REPEAT_MODES.includes(raw.repeat) ? raw.repeat : 'off', shuffle: Boolean(raw.shuffle) };
}
const normalized = (queue) => normalizeQueue(queue);
export const enqueue = (queue, id) => {
  const current = normalized(queue), value = queueId(id);
  if (!validEntry(value)) return current;
  return normalizeQueue({ ...current, ids: [...current.ids.filter((entry) => entry !== value), value] });
};
export const playNext = (queue, id) => {
  const current = normalized(queue), value = queueId(id);
  if (!validEntry(value)) return current;
  return normalizeQueue({ ...current, ids: [value, ...current.ids.filter((entry) => entry !== value)] });
};
// UI additions must report a full queue instead of silently dropping a record.
export function queueAddition(queue, id, first = false) {
  const current = normalizeQueue(queue), value = queueId(id), song = isTrackEntry(value);
  if (!validEntry(value)) return { error: song ? '这首歌无法加入待播。' : '这张唱片无法加入待播。' };
  if (!current.ids.includes(value) && current.ids.length >= QUEUE_LIMIT) return { error: `待播已满（${QUEUE_LIMIT} 项），请先移除一项。` };
  return { queue: first ? playNext(current, value) : enqueue(current, value) };
}

export const dequeue = (queue, id) => { const current = normalizeQueue(queue), value = queueId(id); return validEntry(value) ? normalizeQueue({ ...current, ids: current.ids.filter((entry) => entry !== value) }) : current; };
export const pruneQueue = (queue, existingIds) => {
  const set = new Set((Array.isArray(existingIds) ? existingIds : []).map(queueId).filter((id) => id && id.length <= 80));
  const current = normalizeQueue(queue);
  return normalizeQueue({ ...current, ids: current.ids.filter((id) => set.has(parseEntry(id).id)) });
};
// Drag-reorder in the 待播 panel: move one entry to another position.
export function moveEntry(queue, from, to) {
  const current = normalizeQueue(queue), ids = [...current.ids];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= ids.length) return current;
  const [entry] = ids.splice(from, 1); ids.splice(Math.max(0, Math.min(ids.length, to)), 0, entry);
  return normalizeQueue({ ...current, ids });
}
export const clearQueue = (queue) => normalizeQueue({ ...normalizeQueue(queue), ids: [] });
export const cycleRepeat = (queue) => normalizeQueue({ ...queue, repeat: REPEAT_MODES[(REPEAT_MODES.indexOf(queue.repeat) + 1) % REPEAT_MODES.length] });

// A recommendation starts a fresh session queue: the record already on the
// deck is never repeated in 待播, old queued records do not push the new picks
// to the end, and numeric / string forms of one id collapse together.
export function sessionQueue(queue, ids, currentId) {
  const current = normalizeQueue(queue), skip = queueId(currentId), next = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = queueId(raw);
    if (!id || id.length > 80 || id === skip || next.includes(id)) continue;
    next.push(id);
    if (next.length >= QUEUE_LIMIT) break;
  }
  return normalizeQueue({ ...current, ids: next });
}

// Shuffle is a bag per record: `played` lists the tracks heard since the record
// started (or since the bag last emptied); `playedBag` keeps it.
export function playedBag(bag, recordId, trackIndex, trackCount) {
  if (!bag || bag.id !== recordId || (bag.played.includes(trackIndex) && bag.played.length >= trackCount)) return { id: recordId, played: [trackIndex] };
  return bag.played.includes(trackIndex) ? bag : { id: recordId, played: [...bag.played, trackIndex] };
}
const range = (count) => Array.from({ length: count }, (_, index) => index);
const pickFrom = (list, random) => ({ type: 'track', index: list[Math.min(list.length - 1, Math.floor(random() * list.length))] });

// What happens after the current track. `manual` = the user pressed next, so
// "repeat one" does not trap them on the same song. Shuffle draws unplayed
// tracks; when the bag is empty it falls through to 待播 → repeat-all → stop.
//
// Queued songs (track entries) come first, right after the current song. While
// one of them plays (`solo`), the next step returns to `context` — where the
// interrupted record would have gone next — once no more queued songs wait.
export function nextStep({ trackIndex = 0, trackCount = 0, queue, manual = false, random = Math.random, played = [trackIndex], solo = false, context = null }) {
  const normalizedQueue = normalizeQueue(queue), { repeat, shuffle } = normalizedQueue;
  if (!manual && repeat === 'one' && trackCount > 0) return { type: 'restart' };
  const song = normalizedQueue.ids.find(isTrackEntry);
  if (song) return { type: 'album', id: song };
  const ids = normalizedQueue.ids;
  if (solo) {
    if (context?.id != null && Number.isInteger(context.index)) return { type: 'resume', id: queueId(context.id), index: context.index };
    return ids.length ? { type: 'album', id: ids[0] } : { type: 'stop' };
  }
  if (shuffle && trackCount > 1) {
    const seen = new Set(played), fresh = range(trackCount).filter((index) => index !== trackIndex && !seen.has(index));
    if (fresh.length) return pickFrom(fresh, random);
    if (ids.length) return { type: 'album', id: ids[0] };
    return repeat === 'all' ? pickFrom(range(trackCount).filter((index) => index !== trackIndex), random) : { type: 'stop' };
  }
  if (trackIndex < trackCount - 1) return { type: 'track', index: trackIndex + 1 };
  if (ids.length) return { type: 'album', id: ids[0] };
  if (repeat === 'all' && trackCount > 0) return trackCount === 1 ? { type: 'restart' } : { type: 'track', index: 0 };
  return { type: 'stop' };
}

// Same, but steps over tracks already known to be unplayable (`blocked(index)`
// is true when matching that track just failed), so the deck keeps playing
// instead of stopping on a dead track. When every other track is blocked the
// plain step is returned and the normal error / auto-skip path takes over.
export function nextPlayableStep({ trackIndex = 0, trackCount = 0, queue, manual = false, random = Math.random, played = [trackIndex], blocked = () => false }) {
  const first = nextStep({ trackIndex, trackCount, queue, manual, random, played });
  if (first.type !== 'track' || !blocked(first.index)) return first;
  const { shuffle } = normalizeQueue(queue);
  if (shuffle) {
    const seen = new Set(played), open = range(trackCount).filter((index) => index !== trackIndex && !blocked(index) && !seen.has(index));
    if (open.length) return pickFrom(open, random);
    const after = nextStep({ trackIndex, trackCount, queue, manual, random, played: range(trackCount) });
    if (after.type !== 'track') return after.type === 'stop' ? first : after;
    const rest = range(trackCount).filter((index) => index !== trackIndex && !blocked(index));
    return rest.length ? pickFrom(rest, random) : first;
  }
  let step = first;
  for (let hops = 0; hops < trackCount && step.type === 'track' && blocked(step.index); hops++) {
    const after = nextStep({ trackIndex: step.index, trackCount, queue, manual: true, random });
    if (after.type === 'track' && after.index === trackIndex) return first; // went all the way round
    step = after;
  }
  return step.type === 'stop' || (step.type === 'track' && blocked(step.index)) ? first : step;
}

// Where the interrupted record goes once a queued song has played: its own next
// step with the queued songs ignored (records in 待播 still wait their turn).
export function contextAfter({ recordId, trackIndex = 0, trackCount = 0, queue, played = [trackIndex], random = Math.random }) {
  const current = normalizeQueue(queue), step = nextStep({ trackIndex, trackCount, queue: { ...current, ids: current.ids.filter((id) => !isTrackEntry(id)) }, manual: true, played, random });
  if (step.type === 'track') return { id: queueId(recordId), index: step.index };
  return null;
}

// Like most players: past 3 s "previous" restarts the song. In shuffle (and
// after a queued song) "previous" is the song really heard before this one,
// from `history` (oldest first, the current song last).
export function previousStep({ trackIndex = 0, position = 0, history = [], useHistory = false }) {
  if (position > 3) return { type: 'restart' };
  const back = useHistory && Array.isArray(history) && history.length > 1 ? history[history.length - 2] : null;
  if (back && queueId(back.id) && Number.isInteger(back.index)) return { type: 'history', id: queueId(back.id), index: back.index };
  if (trackIndex <= 0) return { type: 'restart' };
  return { type: 'track', index: trackIndex - 1 };
}

// The heard-songs trail behind 上一首: one entry per song start, newest last.
export const HISTORY_TRAIL_LIMIT = 100;
const sameSpot = (a, b) => Boolean(a && b) && queueId(a.id) === queueId(b.id) && a.index === b.index;
export function pushHistory(trail, entry, limit = HISTORY_TRAIL_LIMIT) {
  const list = Array.isArray(trail) ? trail : [], id = queueId(entry?.id);
  if (!id || !Number.isInteger(entry?.index) || entry.index < 0) return list;
  if (sameSpot(list.at(-1), entry)) return list;
  return [...list, { id, index: entry.index }].slice(-limit);
}
// Stepping back: the current song leaves the trail, the one before it is the target.
export const rewindHistory = (trail) => { const list = Array.isArray(trail) ? trail : []; return { target: list.length > 1 ? list[list.length - 2] : null, trail: list.slice(0, -1) }; };

// 最近播放: a short persisted list of songs that really played (newest first).
export const LISTEN_HISTORY_KEY = 'flow-cabin-listen-history-v1';
export const LISTEN_HISTORY_LIMIT = 50;
const historyText = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
export function normalizeListenHistory(value) {
  const list = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const id = queueId(entry?.id);
    if (!id || id.length > 80 || !Number.isInteger(entry?.index) || entry.index < 0 || !Number.isFinite(entry?.at)) continue;
    list.push({ id, index: entry.index, title: historyText(entry.title), artist: historyText(entry.artist), at: entry.at });
    if (list.length >= LISTEN_HISTORY_LIMIT) break;
  }
  return list;
}
export function recordListen(list, entry, limit = LISTEN_HISTORY_LIMIT) {
  const current = normalizeListenHistory(list), id = queueId(entry?.id);
  if (!id || id.length > 80 || !Number.isInteger(entry?.index) || entry.index < 0) return current;
  const item = { id, index: entry.index, title: historyText(entry.title), artist: historyText(entry.artist), at: Number.isFinite(entry.at) ? entry.at : Date.now() };
  // The same song again (a pause, a reload) moves to the top instead of repeating.
  return [item, ...current.filter((old) => !sameSpot(old, item))].slice(0, limit);
}
