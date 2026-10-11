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

// What happens after the current track. `manual` = the user pressed next, so
// "repeat one" does not trap them on the same song.
export function nextStep({ trackIndex = 0, trackCount = 0, queue, manual = false, random = Math.random }) {
  const { ids, repeat, shuffle } = normalizeQueue(queue);
  if (!manual && repeat === 'one' && trackCount > 0) return { type: 'restart' };
  if (shuffle && trackCount > 1) {
    const pick = Math.floor(random() * (trackCount - 1));
    return { type: 'track', index: pick >= trackIndex ? pick + 1 : pick };
  }
  if (trackIndex < trackCount - 1) return { type: 'track', index: trackIndex + 1 };
  if (ids.length) return { type: 'album', id: ids[0] };
  if (repeat === 'all' && trackCount > 0) return { type: 'track', index: 0 };
  return { type: 'stop' };
}

// Like most players: past 3 s "previous" restarts the song.
export function previousStep({ trackIndex = 0, position = 0 }) {
  if (position > 3 || trackIndex <= 0) return { type: 'restart' };
  return { type: 'track', index: trackIndex - 1 };
}
