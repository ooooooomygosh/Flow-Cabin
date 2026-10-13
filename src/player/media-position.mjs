// Metadata may already have arrived while this element was the standby deck.
// A deferred seek belongs to one source/owner only; cancellation must remove it
// before the same element is reused for a different song.
export function seekWhenReady(element, seconds, { signal, isCurrent = () => true } = {}) {
  const source = element.getAttribute('src');
  const cancel = () => { element.removeEventListener('loadedmetadata', seek); signal?.removeEventListener('abort', cancel); };
  const seek = () => {
    cancel();
    if (signal?.aborted || !isCurrent() || element.getAttribute('src') !== source || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(Math.max(0, seconds), Math.max(0, element.duration - 1));
  };
  if (signal?.aborted) return cancel;
  element.addEventListener('loadedmetadata', seek);
  signal?.addEventListener('abort', cancel, { once: true });
  if (element.readyState >= 1) seek();
  return cancel;
}
