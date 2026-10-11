'use strict';

// Native fullscreen is asynchronous on macOS. Keep the requested state apart
// from the state confirmed by Electron; quick toggles finish in the last state.
function createFullscreen({ window, getSink = () => null, onChange = () => {}, defer = setImmediate }) {
  let actual = window.isFullScreen(), desired = actual, pending = null;
  const valid = () => !window.isDestroyed();
  function apply() {
    if (!valid() || pending !== null || desired === actual) return;
    pending = desired;
    try { window.setFullScreen(desired); }
    catch (error) { pending = null; desired = actual; throw error; }
  }
  function completed(on) {
    const owned = pending !== null;
    actual = on; pending = null;
    if (!owned) desired = on; // green button / system window menu
    onChange(on);
    defer(apply); // Electron's getter can lag the native event.
  }
  window.on('enter-full-screen', () => completed(true));
  window.on('leave-full-screen', () => completed(false));
  return {
    get active() { return actual; },
    get requested() { return desired; },
    set(on) {
      if (!valid()) return;
      desired = Boolean(on);
      if (desired) {
        const sink = getSink();
        if (sink?.active || sink?.busy) sink.exit();
        if (window.isMinimized()) window.restore();
        window.show();
      }
      apply();
    },
    toggle() { this.set(!desired); }
  };
}
module.exports = { createFullscreen };
