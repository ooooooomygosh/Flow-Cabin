// Where the 小猫 card goes, given the cat's box: right, else left, else above/below; never over the cat.
export function catPanelPlace(cat, panel, view, gap = 12, edge = 12) {
  const { w, h } = panel, x = cat.right + gap + w <= view.w - edge ? cat.right + gap : cat.left - gap - w >= edge ? cat.left - gap - w : null;
  if (x !== null) return { x, y: Math.max(edge, Math.min(cat.top - 40, view.h - edge - h)), maxH: view.h - edge * 2 };
  // No room beside the cat: above or below it, whichever has more room, and never over it — the
  // panel gets shorter (it scrolls) instead of covering the cat. Only a window too small for even
  // MIN_PANEL_H lets it overlap.
  const left = Math.max(edge, Math.min(cat.left + (cat.right - cat.left) / 2 - w / 2, view.w - edge - w));
  const above = cat.top - gap - edge, below = view.h - edge - (cat.bottom + gap);
  if (Math.max(above, below) < MIN_PANEL_H) return { x: left, y: Math.max(edge, view.h - edge - h), maxH: view.h - edge * 2 };
  if (above >= h || (above >= below && below < h)) { const height = Math.min(h, above); return { x: left, y: cat.top - gap - height, maxH: above }; }
  return { x: left, y: cat.bottom + gap, maxH: below };
}
export const MIN_PANEL_H = 180;

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
