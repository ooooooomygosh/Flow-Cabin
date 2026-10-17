// Where the 小猫 card goes, given the cat's box: right, else left, else above/below; never over the cat.
export function catPanelPlace(cat, panel, view, gap = 12, edge = 12) {
  const { w, h } = panel, x = cat.right + gap + w <= view.w - edge ? cat.right + gap : cat.left - gap - w >= edge ? cat.left - gap - w : null;
  if (x !== null) return { x, y: Math.max(edge, Math.min(cat.top - 40, view.h - edge - h)) };
  const left = Math.max(edge, Math.min(cat.left + (cat.right - cat.left) / 2 - w / 2, view.w - edge - w));
  return cat.top - gap - h >= edge ? { x: left, y: cat.top - gap - h } : { x: left, y: Math.min(cat.bottom + gap, Math.max(edge, view.h - edge - h)) };
}

// Re-place the panel every frame for a while (the cat glides after a resize).
// track(ms) ignores non-numeric args such as a DOM Event, falling back to 1200ms.
export function createCatPanelTracker(place, { now = () => performance.now(), raf = requestAnimationFrame, caf = cancelAnimationFrame } = {}) {
  let frame = 0, until = 0;
  const follow = () => { place(); frame = now() < until ? raf(follow) : 0; };
  const track = (ms = 1200) => {
    const span = typeof ms === 'number' && Number.isFinite(ms) ? ms : 1200;
    until = Math.max(until, now() + span);
    if (!frame) frame = raf(follow);
  };
  const stop = () => { if (frame) caf(frame); frame = 0; };
  return { track, stop };
}
