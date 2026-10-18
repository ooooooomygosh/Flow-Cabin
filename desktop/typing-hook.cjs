'use strict';
// 打字跟随: tells the desktop pet *that* the user is typing anywhere, never *what*.
//
// Privacy contract (tested): only the fact that a key went down is used — the keydown event
// object (keycode, modifiers) is never read, stored, logged or sent. Mouse events are not
// subscribed. The hook only starts when the user turns 「桌宠跟随打字」 on (default off).
//
// macOS needs Accessibility (and, on newer systems, Input Monitoring) permission for a global
// hook. Without it we never load the native module and fall back to typing inside the cabin
// (the page reports its own keydown time in the companion snapshot).
//
// uiohook-napi (MIT, N-API prebuilds) is required lazily so a missing or broken native module
// only disables this feature.
const THROTTLE_MS = 120;

function createTypingHook({ platform = process.platform, systemPreferences, load = () => require('uiohook-napi'), onActivity, now = Date.now, log = () => {} }) {
  let hook = null, listener = null, wanted = false, failed = '', last = 0;
  const trusted = (prompt = false) => platform !== 'darwin' || Boolean(systemPreferences?.isTrustedAccessibilityClient?.(prompt));
  function start() {
    if (hook || !wanted || !trusted(false)) return false;
    try {
      const { uIOhook } = load();
      // Arguments are deliberately ignored: the key itself is none of our business.
      listener = () => { const at = now(); if (at - last >= THROTTLE_MS) { last = at; onActivity(at); } };
      uIOhook.on('keydown', listener); uIOhook.start(); hook = uIOhook; failed = '';
      return true;
    } catch (error) { failed = 'unavailable'; hook = null; listener = null; log('typing-hook-error', String(error?.message || error).slice(0, 200)); return false; }
  }
  function stop() {
    if (!hook) return;
    try { hook.off?.('keydown', listener); hook.removeListener?.('keydown', listener); hook.stop(); } catch { /* already stopped */ }
    hook = null; listener = null;
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
