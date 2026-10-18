'use strict';
// 键鼠跟随: tells the desktop pet when keyboard or mouse activity happens.
//
// Privacy contract (tested): event objects are never read, stored, logged or sent.
// Keydown and mousedown share a timestamp-only throttle; no coordinates or key/button
// details are inspected. 「键鼠跟随」 uses the existing switch (default off).
//
// macOS needs Accessibility (and, on newer systems, Input Monitoring) permission for a global
// hook. Without it we never load the native module and fall back to activity inside the cabin
// (the page reports its own keydown / pointerdown time in the companion snapshot).
//
// uiohook-napi (MIT, N-API prebuilds) is required lazily so a missing or broken native module
// only disables this feature.
const THROTTLE_MS = 120;

function createTypingHook({ platform = process.platform, systemPreferences, load = () => require('uiohook-napi'), onActivity, now = Date.now, log = () => {} }) {
  let hook = null, listener = null, active = false, wanted = false, failed = '', last = -Infinity;
  const trusted = (prompt = false) => platform !== 'darwin' || Boolean(systemPreferences?.isTrustedAccessibilityClient?.(prompt));
  function start() {
    if (hook || !wanted || !trusted(false)) return false;
    try {
      const { uIOhook } = load();
      hook = uIOhook;
      // Ignore all event arguments, including mouse buttons and coordinates.
      const receive = () => { if (!active || listener !== receive) return; const at = now(); if (at - last >= THROTTLE_MS) { last = at; onActivity(at); } };
      listener = receive;
      uIOhook.on('keydown', listener); uIOhook.on('mousedown', listener);
      uIOhook.start(); active = true; failed = '';
      return true;
    } catch (error) { stop(); failed = 'unavailable'; log('typing-hook-error', String(error?.message || error).slice(0, 200)); return false; }
  }
  function stop() {
    const previous = hook, previousListener = listener;
    active = false; hook = null; listener = null; last = -Infinity;
    if (!previous) return;
    for (const name of ['keydown', 'mousedown']) {
      try {
        if (previous.off) previous.off(name, previousListener);
        else previous.removeListener?.(name, previousListener);
      } catch {
        try { previous.removeListener?.(name, previousListener); } catch { /* continue cleaning up */ }
      }
    }
    try { previous.stop(); } catch { /* already stopped */ }
  }
  return {
    // 'off' | 'active' | 'needs-permission' (macOS, not trusted yet) | 'unavailable' (native module failed)
    status() { if (!wanted) return 'off'; if (hook) return 'active'; if (failed) return failed; return trusted(false) ? 'unavailable' : 'needs-permission'; },
    setEnabled(on) { wanted = Boolean(on); if (wanted) start(); else stop(); return this.status(); },
    // Opens the macOS prompt / System Settings. Permission is granted asynchronously, so callers retry().
    requestPermission() { if (platform === 'darwin') trusted(true); return this.retry(); },
    retry() { if (wanted && !hook) { failed = ''; start(); } return this.status(); },
    stop() { wanted = false; stop(); }
  };
}
module.exports = { createTypingHook, THROTTLE_MS };
