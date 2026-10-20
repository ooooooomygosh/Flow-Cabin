// One pointer-drag policy for every movable cabin piece (the deck console, the
// desktop widgets): a 5 px threshold so a click never moves or saves anything,
// moves coalesced to one per animation frame (120 Hz+ mice send several per
// frame), a commit on release, and a cancel on pointercancel, lost capture or
// Escape that puts the piece back.
//
// The gesture is framework-free: the owner binds it to pointer events.
//   pointerdown   → gesture.down(event.pointerId, event.clientX, event.clientY, origin)
//   pointermove   → gesture.move(event.pointerId, event.clientX, event.clientY)
//   pointerup     → gesture.up(event.pointerId)
//   pointercancel → gesture.cancel(event.pointerId)   (also: lostpointercapture)
//   Escape        → gesture.cancel()
// A touch drag needs `touch-action: none` on the handle, or the page scrolls
// under the finger instead of the piece moving.
// Arrow keys are the keyboard equivalent of a drag: nudgeDelta() gives the step.
export const DRAG_THRESHOLD = 5;
export const NUDGE_PX = 16, NUDGE_FAST_PX = 64;
export const nudgeDelta = (key, fast = false) => { const step = fast ? NUDGE_FAST_PX : NUDGE_PX; return { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key] || null; };
export function createDragGesture({ threshold = DRAG_THRESHOLD, schedule = (fn) => requestAnimationFrame(fn), unschedule = (id) => cancelAnimationFrame(id), onStart, onMove, onCommit, onCancel } = {}) {
  let drag = null, frame = 0;
  const stopFrame = () => { if (frame) { unschedule(frame); frame = 0; } };
  const flush = () => { frame = 0; if (drag?.active) onMove?.(drag.origin, drag.dx, drag.dy); };
  const drop = (cancelled) => {
    const done = drag; drag = null; stopFrame();
    if (done?.active) { if (cancelled) onCancel?.(done.origin); else { onMove?.(done.origin, done.dx, done.dy); onCommit?.(done.origin, done.dx, done.dy); } }
    return Boolean(done?.active);
  };
  return {
    // A second pointer (a second finger, a mouse while a touch drags) must not
    // silently swallow the drag in flight: the piece would stay where it was
    // moved, with no cancel to put it back.
    down(id, x, y, origin) { stopFrame(); if (drag) drop(true); drag = { id, x, y, dx: 0, dy: 0, active: false, origin }; },
    move(id, x, y) {
      if (!drag || drag.id !== id) return false;
      drag.dx = x - drag.x; drag.dy = y - drag.y;
      if (!drag.active) { if (Math.hypot(drag.dx, drag.dy) < threshold) return false; drag.active = true; onStart?.(drag.origin); }
      if (!frame) frame = schedule(flush);
      return true;
    },
    // `id` may be left out to release whatever drag is pending.
    up(id) {
      if (!drag || (id !== undefined && drag.id !== id)) return false;
      return drop(false);
    },
    cancel(id) {
      if (!drag || (id !== undefined && drag.id !== id)) return false;
      return drop(true);
    },
    get pending() { return Boolean(drag); },
    get active() { return Boolean(drag?.active); }
  };
}
