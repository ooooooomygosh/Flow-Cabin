// PlaybackSession: confirmed listening segments, independent of focus timers.
// Backup contract: a JSON array under PLAYBACK_LOG_KEY; read through readPlaybackSessions.
export const PLAYBACK_LOG_KEY = 'flow-cabin-playback-sessions-v1';
export const PLAYBACK_LOG_LIMIT = 5000;
export const MAX_PLAYBACK_GAP_MS = 5000;
const CHECKPOINT_MS = 15000;
const REMOTE_QUANTUM_MS = 1000;
export const REMOTE_POLL_MS = 1500, REMOTE_BACKGROUND_POLL_MS = 3000;
const REASONS = new Set(['pause', 'track', 'ended', 'waiting', 'seeking', 'error', 'emptied', 'pagehide', 'unmount', 'gap', 'checkpoint']);
const storageDefault = () => { try { return globalThis.localStorage; } catch { return null; } };
const text = (value) => typeof value === 'string' && !/(?:https?:\/\/|blob:|data:|file:|(?:token|authorization|api[_-]?key|signature)\s*[=:])/i.test(value) ? value.slice(0, 300) : '';
const safeId = (value) => typeof value === 'string' && /^[\p{L}\p{N}_.:-]{1,160}$/u.test(value) ? text(value) : '';
const snapshotTrack = (track) => track && ({
  id: safeId(track.id), index: Number.isSafeInteger(track.index) && track.index >= 0 ? track.index : 0,
  title: text(track.title), artist: text(track.artist), album: text(track.album)
});
const identity = (track) => JSON.stringify(track);

/**
 * @typedef {Object} PlaybackSession
 * @property {string} id
 * @property {number} start Epoch milliseconds at confirmation.
 * @property {number} end Last observation / closing time (not listening duration).
 * @property {number} durationMs Verified listening time; never end minus start.
 * @property {string} reason
 * @property {{index: number, title: string, artist: string}} track
 * @property {{id: string, title: string, artist: string}} album
 */
function cleanSession(value) {
  if (!value || !safeId(value.id) || !Number.isFinite(value.start) || value.start < 0
    || !Number.isFinite(value.end) || value.end < value.start
    || !Number.isFinite(value.durationMs) || value.durationMs <= 0 || value.durationMs > value.end - value.start) return null;
  const track = snapshotTrack({ ...value.track, id: value.album?.id, album: value.album?.title });
  if (!track) return null;
  return {
    id: safeId(value.id), start: value.start, end: value.end, durationMs: Math.floor(value.durationMs),
    reason: REASONS.has(value.reason) ? value.reason : 'checkpoint',
    track: { index: track.index, title: track.title, artist: track.artist },
    album: { id: track.id, title: track.album, artist: text(value.album?.artist) }
  };
}

/** @returns {PlaybackSession[]} Oldest first; corrupt storage returns an empty array. */
export function readPlaybackSessions(storage = storageDefault()) {
  try {
    const raw = JSON.parse(storage?.getItem(PLAYBACK_LOG_KEY));
    if (!Array.isArray(raw)) return [];
    const records = new Map();
    for (const value of raw.slice(-PLAYBACK_LOG_LIMIT)) {
      const record = cleanSession(value);
      if (record && record.durationMs > 0) records.set(record.id, record);
    }
    return [...records.values()].sort((a, b) => a.start - b.start);
  } catch { return []; }
}

// Both wall and monotonic clocks must stay close and observations must be recent.
// Media progress corroborates elapsed time; it never supplies duration by itself.
export function createPlaybackLog({
  storage = storageDefault(), wallNow = () => Date.now(), now = () => performance.now(),
  makeId = () => globalThis.crypto.randomUUID()
} = {}) {
  let active = null, previous = null, mediaOwner = null, mediaTrack = null, seeking = false, remoteSpan = null;
  let pending = new Map(), lastCheckpoint = 0;
  const stamp = () => ({ wall: wallNow(), mono: now() });
  const persist = () => {
    if (!pending.size) return true;
    try {
      if (!storage?.setItem) return false;
      const records = new Map(readPlaybackSessions(storage).map((record) => [record.id, record]));
      for (const [id, record] of pending) records.set(id, record);
      storage.setItem(PLAYBACK_LOG_KEY, JSON.stringify([...records.values()].sort((a, b) => a.start - b.start).slice(-PLAYBACK_LOG_LIMIT)));
      pending.clear();
      return true;
    } catch { return false; }
  };
  const save = (reason) => {
    if (active?.durationMs >= 1) {
      const { key, ...record } = active;
      pending.set(record.id, { ...record, durationMs: Math.floor(record.durationMs), reason });
      if (pending.size > PLAYBACK_LOG_LIMIT) pending.delete(pending.keys().next().value);
    }
    return persist();
  };
  const flush = (reason = 'pause') => {
    const saved = save(REASONS.has(reason) ? reason : 'pause');
    active = null; previous = null; seeking = false; remoteSpan = null;
    return saved;
  };
  const observe = ({ track, position, rate = 1, confirmed = false, closing = '', remote = false }) => {
    const at = stamp(), metadata = snapshotTrack(track);
    const valid = metadata && Number.isFinite(position) && position >= 0 && Number.isFinite(rate) && rate > 0;
    if (!valid) { flush(closing || 'waiting'); return; }
    const key = identity(metadata);
    if (active && active.key !== key) flush('track');
    if (active && previous) {
      const elapsed = at.mono - previous.mono, wallElapsed = at.wall - previous.wall;
      if (elapsed < 0 || wallElapsed < 0 || elapsed > MAX_PLAYBACK_GAP_MS || wallElapsed > MAX_PLAYBACK_GAP_MS || Math.abs(elapsed - wallElapsed) > 1000) {
        flush('gap');
      } else {
        const progress = (position - previous.position) * 1000 / rate;
        if (remote) {
          // Whole-second clocks alternate 1 s / 2 s advances at a 1.5 s poll.
          // Verify a continuous span, withholding one second of uncertainty,
          // rather than discarding every 2 s step. Never carry that uncertainty
          // across a stop, stalled sample, seek, or missing observation.
          if (elapsed > 0 || progress !== 0) {
            if (progress <= 0 || progress > elapsed + REMOTE_QUANTUM_MS) remoteSpan = null;
            else {
              const span = remoteSpan || { elapsed: 0, progress: 0, credited: 0 };
              span.elapsed += Math.min(elapsed, wallElapsed); span.progress += progress;
              if (Math.abs(span.progress - span.elapsed) > REMOTE_QUANTUM_MS) remoteSpan = null;
              else {
                const verified = Math.max(0, Math.min(span.elapsed, span.progress - REMOTE_QUANTUM_MS));
                active.durationMs += Math.max(0, verified - span.credited);
                span.credited = verified; remoteSpan = span;
              }
            }
          }
        } else if (rate === previous.rate && progress >= 0 && progress <= elapsed + 250) {
          active.durationMs += Math.min(elapsed, wallElapsed, progress);
        }
        active.end = Math.max(active.end, at.wall);
      }
    }
    if (!active && confirmed && !closing) {
      active = {
        id: `p-${makeId()}`, start: at.wall, end: at.wall, durationMs: 0, key,
        track: { index: metadata.index, title: metadata.title, artist: metadata.artist },
        album: { id: metadata.id, title: metadata.album, artist: metadata.artist }
      };
      lastCheckpoint = at.mono;
    }
    previous = active ? { ...at, position, rate } : null;
    if (closing) flush(closing);
    else if (active && at.mono - lastCheckpoint >= CHECKPOINT_MS) { save('checkpoint'); lastCheckpoint = at.mono; }
  };
  const mediaSample = (media, track) => ({ track, position: media?.currentTime, rate: media?.playbackRate || 1 });
  const mediaEvent = (type, { media, track } = {}) => {
    if (!media) return;
    if (type === 'playing') {
      if (media.paused || media.ended || media.seeking || media.readyState < 2) return;
      if (mediaOwner && mediaOwner !== media) flush('track');
      mediaOwner = media; mediaTrack = snapshotTrack(track); seeking = false;
      observe({ ...mediaSample(media, track), confirmed: true });
    } else if (media === mediaOwner) {
      if (type === 'seeking') { const resume = seeking || Boolean(active); flush('seeking'); seeking = resume; }
      else if (type === 'seeked') {
        if (seeking && !media.paused && !media.ended && !media.seeking && media.readyState >= 3) {
          observe({ ...mediaSample(media, track), confirmed: true });
        }
        seeking = false;
      } else if (type === 'timeupdate') {
        if (!active || media.seeking || media.paused || media.ended) return;
        if (media.readyState < 2) { flush('waiting'); return; }
        observe({ ...mediaSample(media, track), confirmed: true });
      } else if (['pause', 'ended', 'waiting', 'error', 'emptied'].includes(type)) {
        // Native media emits pause before ended at the end of a track.
        const reason = type === 'pause' && media.ended ? 'ended' : type;
        if (active && !media.seeking) observe({ ...mediaSample(media, track), closing: reason });
        else flush(reason);
        seeking = false;
      } else if (type === 'ratechange') {
        // A mixed-rate interval cannot be attributed safely.
        if (previous) previous = { ...stamp(), position: media.currentTime, rate: media.playbackRate };
      }
    }
  };
  const remoteSample = ({ playing, track, position }) => {
    mediaOwner = null; mediaTrack = null; seeking = false;
    // A paused result does not tell us when playback stopped between polls.
    // Close at the last playing observation, without recovering deferred time.
    if (playing !== true) { flush('pause'); return; }
    observe({ track, position, confirmed: true, remote: true });
  };
  const listen = (target) => {
    const hide = () => {
      if (active && mediaOwner && !mediaOwner.seeking) observe({ ...mediaSample(mediaOwner, mediaTrack), closing: 'pagehide' });
      else flush('pagehide');
      seeking = false;
    };
    const show = (event) => {
      if (event.persisted && mediaOwner) mediaEvent('playing', { media: mediaOwner, track: mediaTrack });
    };
    target?.addEventListener('pagehide', hide);
    target?.addEventListener('pageshow', show);
    return () => { target?.removeEventListener('pagehide', hide); target?.removeEventListener('pageshow', show); flush('unmount'); mediaOwner = null; mediaTrack = null; seeking = false; };
  };
  return { mediaEvent, remoteSample, flush, listen };
}

// Foreground controls keep observing remote state; hidden windows only verify
// an already-playing session. Explicit play/pause commands can wake an idle
// observer. Completion schedules the next poll, so slow requests never overlap.
export function createRemotePlaybackPoller({ poll, isActive, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null, busy = false, disposed = false, background = false, playing = false, rerun = false;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const schedule = () => {
    clear();
    if (!disposed && !busy && isActive() && (!background || playing)) {
      timer = setTimer(run, background ? REMOTE_BACKGROUND_POLL_MS : REMOTE_POLL_MS);
    }
  };
  async function run() {
    clear();
    if (disposed || !isActive()) return;
    if (busy) { rerun = true; return; }
    busy = true;
    try { playing = (await poll()) === true; }
    catch { playing = false; }
    finally {
      busy = false;
      if (rerun && !disposed) { rerun = false; void run(); }
      else schedule();
    }
  }
  return {
    wake: run,
    setBackground(value) {
      const wasBackground = background; background = Boolean(value);
      if (wasBackground && !background) void run();
      else schedule();
    },
    dispose() { disposed = true; rerun = false; clear(); }
  };
}
