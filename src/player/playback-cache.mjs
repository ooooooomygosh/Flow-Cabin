import { matchKey } from './auto-match.mjs';

// Seamless playback helpers. Matching a track (search + resolve) is the slow
// part of starting a song, so the deck resolves the *next* track while the
// current one plays and keeps the answer for a few minutes. Pure / injectable
// so the timing rules are testable without a browser.
export const PREFETCH_TTL_MS = 8 * 60 * 1000;
export const PREFETCH_LIMIT = 12;
export const PREFETCH_PROVIDERS = new Set(['auto', 'qq', 'netease', 'local']);

export const resolutionKey = (provider, item, index) => { const key = matchKey(item, index); return key ? JSON.stringify([provider, key]) : ''; };

export function createResolutionCache({ now = () => Date.now(), ttl = PREFETCH_TTL_MS, limit = PREFETCH_LIMIT } = {}) {
  const entries = new Map();
  const prune = () => { const time = now(); for (const [key, entry] of entries) if (time - entry.at > ttl) entries.delete(key); while (entries.size > limit) entries.delete(entries.keys().next().value); };
  return {
    put(key, candidate, result) { if (!key || !result?.audioPath || result.remote) return; entries.delete(key); entries.set(key, { candidate, result, at: now() }); prune(); },
    // A prefetched stream is used once: a second play resolves afresh.
    take(key) { prune(); const entry = entries.get(key); if (entry) entries.delete(key); return entry || null; },
    has(key) { prune(); return entries.has(key); },
    clear() { entries.clear(); },
    get size() { prune(); return entries.size; }
  };
}

// Volume ramps (no clicks on play / pause / track start). `apply` receives the
// gain 0…1; the caller multiplies it with the listener's volume.
export function createFader({ apply, frame = (fn) => requestAnimationFrame(fn), cancel = (id) => cancelAnimationFrame(id), clock = () => performance.now() }) {
  let gain = 1, handle = 0, settle = null;
  const stop = () => { if (handle) cancel(handle); handle = 0; const done = settle; settle = null; done?.(); };
  return {
    get gain() { return gain; },
    set(value) { stop(); gain = Math.max(0, Math.min(1, value)); apply(gain); },
    to(target, duration) {
      stop();
      const from = gain, end = Math.max(0, Math.min(1, target)), start = clock();
      if (duration <= 0 || from === end) { gain = end; apply(gain); return Promise.resolve(); }
      return new Promise((resolve) => {
        settle = resolve;
        const step = () => {
          const t = Math.min(1, (clock() - start) / duration);
          gain = from + (end - from) * (t * t * (3 - 2 * t)); apply(gain); // smoothstep: soft at both ends
          if (t < 1) handle = frame(step); else { handle = 0; settle = null; resolve(); }
        };
        handle = frame(step);
      });
    },
    stop
  };
}

// A playlist with a few region-locked or removed songs should keep playing.
// After an unplayable track the deck moves on, but never loops forever.
export const AUTO_SKIP_LIMIT = 5;
export const AUTO_SKIP_DELAY_MS = 2200;
export function shouldAutoSkip({ error = '', status, consecutive = 0, canNext = false }) {
  if (status !== 'error' || !canNext || consecutive >= AUTO_SKIP_LIMIT) return false;
  // A browser gesture block or a missing source setup is not the track's fault.
  return !/请点击播放|音源设置|Music Assistant|选择.*播放器|重新打开小屋|原始资料没有曲目/.test(error);
}

// Browser media errors carry English messages; say what to do instead.
export function playbackErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError') return '请点击播放按钮开始播放。';
  if (name === 'NotSupportedError') return '音源地址已失效或格式不受支持，可以重试或换一个音源。';
  if (name === 'AbortError') return '';
  return String(error?.message || '音频加载失败。');
}
