// Monotonic playback anchor. Consumers sample this independently of React renders.
export function createPlaybackTimeline({ now = () => performance.now() } = {}) {
  let value = Object.freeze({ trackId: '', source: '', playing: false, position: null, duration: null, rate: 1, anchoredAt: now(), capabilities: Object.freeze({ progress: false, audio: false, seek: false, control: false }) });
  const listeners = new Set();
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  return {
    getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update(input = {}) {
      const position = finite(input.position) && input.position >= 0 ? input.position : null;
      const duration = finite(input.duration) && input.duration > 0 ? input.duration : null;
      value = Object.freeze({ trackId: String(input.trackId || ''), source: String(input.source || ''), playing: input.playing === true,
        position, duration, rate: finite(input.rate) && input.rate > 0 ? input.rate : 1, anchoredAt: now(),
        capabilities: Object.freeze({ audio: false, seek: false, control: false, ...input.capabilities, progress: position !== null }) });
      for (const fn of listeners) fn();
      return value;
    },
    position(at = now()) {
      if (value.position === null) return null;
      const elapsed = value.playing ? Math.max(0, at - value.anchoredAt) * value.rate / 1000 : 0;
      return Math.min(value.duration ?? Infinity, value.position + elapsed);
    }
  };
}
export const systemPlaybackTimeline = createPlaybackTimeline();
