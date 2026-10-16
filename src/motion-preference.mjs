// One reduced-motion switch for every JS-driven animation: the operating
// system preference OR the desktop app's own setting (html[data-desktop-reduce-motion]).
// CSS reads the same two sources (fonts.css), so JS and CSS never disagree.
const QUERY = '(prefers-reduced-motion: reduce)';
export const reducedMotionFrom = ({ media = false, desktop = false } = {}) => Boolean(media || desktop);

export function reducedMotion(win = globalThis.window) {
  if (!win) return false;
  return reducedMotionFrom({ media: Boolean(win.matchMedia?.(QUERY).matches), desktop: win.document?.documentElement?.dataset.desktopReduceMotion === 'true' });
}

// Calls cb(reduced) now and whenever either source changes; returns an unsubscribe.
// One MediaQueryList listener and one MutationObserver are shared by all callers.
const watchers = new Set();
let detach = null, last = null;
function attach(win) {
  const media = win.matchMedia?.(QUERY), root = win.document?.documentElement;
  const update = () => { const value = reducedMotion(win); if (value === last) return; last = value; for (const cb of [...watchers]) cb(value); };
  media?.addEventListener?.('change', update);
  const observer = root && typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null;
  observer?.observe(root, { attributes: true, attributeFilter: ['data-desktop-reduce-motion'] });
  last = reducedMotion(win);
  return () => { media?.removeEventListener?.('change', update); observer?.disconnect(); last = null; };
}
export function onReducedMotionChange(cb, win = globalThis.window) {
  if (!win) { cb(false); return () => {}; }
  if (!detach) detach = attach(win);
  watchers.add(cb); cb(last);
  return () => { watchers.delete(cb); if (!watchers.size && detach) { detach(); detach = null; } };
}
