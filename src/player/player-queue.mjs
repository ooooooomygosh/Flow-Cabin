// The turntable plays an album in order; a short "待播" stack of albums
// follows it. Pure functions so the rules are testable without a browser.
export const QUEUE_KEY = 'album-circle-player-queue-v1';
export const QUEUE_LIMIT = 50;
export const REPEAT_MODES = ['off', 'all', 'one'];

export function normalizeQueue(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const ids = Array.isArray(raw.ids) ? [...new Set(raw.ids.filter((id) => typeof id === 'string' && id && id.length <= 80))].slice(0, QUEUE_LIMIT) : [];
  return { ids, repeat: REPEAT_MODES.includes(raw.repeat) ? raw.repeat : 'off', shuffle: Boolean(raw.shuffle) };
}
export const enqueue = (queue, id) => normalizeQueue({ ...queue, ids: [...queue.ids.filter((entry) => entry !== id), id] });
export const playNext = (queue, id) => normalizeQueue({ ...queue, ids: [id, ...queue.ids.filter((entry) => entry !== id)] });
// UI additions must report a full queue instead of silently dropping a record.
export function queueAddition(queue, id, first = false) {
  const current = normalizeQueue(queue);
  if (typeof id !== 'string' || !id || id.length > 80) return { error: '这张唱片无法加入待播。' };
  if (!current.ids.includes(id) && current.ids.length >= QUEUE_LIMIT) return { error: `待播已满（${QUEUE_LIMIT} 张），请先移除一张。` };
  return { queue: first ? playNext(current, id) : enqueue(current, id) };
}

export const dequeue = (queue, id) => normalizeQueue({ ...queue, ids: queue.ids.filter((entry) => entry !== id) });
export const pruneQueue = (queue, existingIds) => { const set = new Set(existingIds); return normalizeQueue({ ...queue, ids: queue.ids.filter((id) => set.has(id)) }); };
export const cycleRepeat = (queue) => normalizeQueue({ ...queue, repeat: REPEAT_MODES[(REPEAT_MODES.indexOf(queue.repeat) + 1) % REPEAT_MODES.length] });

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
