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

export function normalizeQueue(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const ids = [];
  if (Array.isArray(raw.ids)) {
    const seen = new Set();
    for (const entry of raw.ids) {
      const id = queueId(entry);
      if (!id || id.length > 80 || seen.has(id)) continue;
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
  if (!value || value.length > 80) return current;
  return normalizeQueue({ ...current, ids: [...current.ids.filter((entry) => entry !== value), value] });
};
export const playNext = (queue, id) => {
  const current = normalized(queue), value = queueId(id);
  if (!value || value.length > 80) return current;
  return normalizeQueue({ ...current, ids: [value, ...current.ids.filter((entry) => entry !== value)] });
};
// UI additions must report a full queue instead of silently dropping a record.
export function queueAddition(queue, id, first = false) {
  const current = normalizeQueue(queue), value = queueId(id);
  if (!value || value.length > 80) return { error: '这张唱片无法加入待播。' };
  if (!current.ids.includes(value) && current.ids.length >= QUEUE_LIMIT) return { error: `待播已满（${QUEUE_LIMIT} 张），请先移除一张。` };
  return { queue: first ? playNext(current, value) : enqueue(current, value) };
}

export const dequeue = (queue, id) => { const current = normalizeQueue(queue), value = queueId(id); return value && value.length <= 80 ? normalizeQueue({ ...current, ids: current.ids.filter((entry) => entry !== value) }) : current; };
export const pruneQueue = (queue, existingIds) => {
  const set = new Set((Array.isArray(existingIds) ? existingIds : []).map(queueId).filter((id) => id && id.length <= 80));
  const current = normalizeQueue(queue);
  return normalizeQueue({ ...current, ids: current.ids.filter((id) => set.has(id)) });
};
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
export function nextStep({ trackIndex = 0, trackCount = 0, queue, manual = false, random = Math.random, played = [trackIndex] }) {
  const { ids, repeat, shuffle } = normalizeQueue(queue);
  if (!manual && repeat === 'one' && trackCount > 0) return { type: 'restart' };
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

// Like most players: past 3 s "previous" restarts the song.
export function previousStep({ trackIndex = 0, position = 0 }) {
  if (position > 3 || trackIndex <= 0) return { type: 'restart' };
  return { type: 'track', index: trackIndex - 1 };
}
