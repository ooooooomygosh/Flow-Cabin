// Desktop pet/wallpaper windows intentionally stay animated without keyboard
// focus. All surfaces still stop work while hidden or explicitly disabled.
//
// The reduced-motion flag is the shared one (the OS preference OR the desktop
// app's own switch, html[data-desktop-reduce-motion]) — the same source the CSS
// kill switch reads, so JS and CSS never disagree about what "still" means.
//
// The background flag comes from the shared frame clock: an Electron window
// that is minimized stays "visible" to the DOM (backgroundThrottling is off),
// so document.hidden alone never stops the sprite loop — a minimized cabin
// would keep repainting its 32×32 cat. The wallpaper and the pet window are
// exempt there: they are meant to keep living on the desktop.
import { onReducedMotionChange, reducedMotion as reducedFlag } from '../motion-preference.mjs';
import { inBackground, onBackgroundChange } from '../frame-clock.mjs';

export function petMotionState({ hidden = false, focused = true, desktop = false, reduced = false, background = false } = {}) {
  return { visible: !hidden && !background && (desktop || focused), reduced: Boolean(reduced) };
}

// The music hop is counted in art pixels: the cat's sprite is 32 art px wide
// (cat-sprites.mjs SIZE), so one art pixel is 100%/32 of the element. A hop
// that landed between two pixels would resample the sprite, so the height is
// always a whole number of art pixels.
export const HOP_ART_PIXELS = 3;
export const hopArtPixels = (energy) => {
  const value = Math.max(0, Math.min(1, Number(energy) || 0));
  if (value <= 0) return 0;
  return Math.max(1, Math.min(HOP_ART_PIXELS, Math.round(value * HOP_ART_PIXELS)));
};
// The half-way keyframe has to land on the grid too: half the hop, rounded down.
export const hopDownArtPixels = (hop) => Math.max(0, Math.floor((Number(hop) || 0) / 2));
export function readPetMotion(win = globalThis.window, doc = globalThis.document, background = inBackground()) {
  return petMotionState({
    hidden: Boolean(doc?.hidden), focused: doc?.hasFocus?.() ?? true,
    desktop: Boolean(win?.albumWallpaper || win?.albumPet), reduced: reducedFlag(win), background
  });
}
export function subscribePetMotion(apply, win = globalThis.window, doc = globalThis.document) {
  let focused = doc?.hasFocus?.() ?? true, background = false;
  const update = (event) => {
    if (event?.type === 'blur') focused = false;
    if (event?.type === 'focus') focused = true;
    apply(petMotionState({ hidden: Boolean(doc?.hidden), focused, desktop: Boolean(win?.albumWallpaper || win?.albumPet), reduced: reducedFlag(win), background }));
  };
  // Both shared watchers call back immediately on subscribe; that first call is
  // the current state, not a change. The explicit update() below publishes it.
  let ready = false;
  const changed = () => { if (ready) update(); };
  const offReduced = onReducedMotionChange(changed, win);
  const offBackground = onBackgroundChange((value) => { background = value; changed(); });
  win?.addEventListener?.('blur', update); win?.addEventListener?.('focus', update);
  doc?.addEventListener?.('visibilitychange', update);
  ready = true;
  update();
  return () => {
    offReduced(); offBackground();
    win?.removeEventListener?.('blur', update); win?.removeEventListener?.('focus', update);
    doc?.removeEventListener?.('visibilitychange', update);
  };
}
