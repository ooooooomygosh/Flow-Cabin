'use strict';
// 键鼠跟随: tells the desktop pet when keyboard or mouse activity happens.
//
// Privacy contract (tested): event objects are never read, stored, logged or sent.
// Keydown and mousedown are reported as two fixed event kinds. No coordinates or
// key/button details are inspected. The consumer may count every input while the
// pet renderer applies its own pulse throttle (input volume must not reduce counts).
//
// macOS needs Accessibility (and, on newer systems, Input Monitoring) permission for a global
// hook. Without it we never load the native module and fall back to activity inside the cabin
// (the page reports its own keydown / pointerdown time in the companion snapshot).
//
// uiohook-napi (MIT, N-API prebuilds) is required lazily so a missing or broken native module
// only disables this feature.
function createTypingHook({ platform = process.platform, systemPreferences, load = () => require('uiohook-napi'), onActivity, now = Date.now, log = () => {} }) {
  let hook = null, keyListener = null, clickListener = null, active = false, wanted = false, failed = '', generation = 0;
  const trusted = (prompt = false) => platform !== 'darwin' || Boolean(systemPreferences?.isTrustedAccessibilityClient?.(prompt));
  function start() {
    if (hook || !wanted || !trusted(false)) return false;
    try {
      const { uIOhook } = load();
      hook = uIOhook;
      // Ignore all event arguments, including mouse buttons and coordinates. The
      // two listeners differ only by the fixed kind they report.
      const token = ++generation;
      const receive = (type) => { if (active && token === generation) onActivity({ type, at: now() }); };
      keyListener = () => receive('keyboard');
      clickListener = () => receive('click');
      uIOhook.on('keydown', keyListener); uIOhook.on('mousedown', clickListener);
      uIOhook.start(); active = true; failed = '';
      return true;
    } catch (error) { stop(); failed = 'unavailable'; log('typing-hook-error', String(error?.message || error).slice(0, 200)); return false; }
  }
  function stop() {
    const previous = hook, previousKey = keyListener, previousClick = clickListener;
    active = false; generation++; hook = null; keyListener = null; clickListener = null;
    if (!previous) return;
    for (const [name, listener] of [['keydown', previousKey], ['mousedown', previousClick]]) {
      try {
        if (previous.off) previous.off(name, listener);
        else previous.removeListener?.(name, listener);
      } catch {
        try { previous.removeListener?.(name, listener); } catch { /* continue cleaning up */ }
      }
    }
    try { previous.stop(); } catch { /* already stopped */ }
  }
  return {
    // 'off' | 'active' | 'needs-permission' (macOS, not trusted yet) | 'unavailable' (native module failed)
    status() { if (!wanted) return 'off'; if (hook) return 'active'; if (failed) return failed; return trusted(false) ? 'unavailable' : 'needs-permission'; },
    // Permission is independent of whether the pet is out or the hook has started.
    permission() { return platform !== 'darwin' || trusted(false) ? 'granted' : 'needs-permission'; },
    setEnabled(on) { wanted = Boolean(on); if (wanted) start(); else stop(); return this.status(); },
    // Opens the macOS prompt / System Settings. Permission is granted asynchronously, so callers retry().
    requestPermission() { if (platform === 'darwin') trusted(true); return this.retry(); },
    retry() { if (wanted && !hook) { failed = ''; start(); } return this.status(); },
    // Input Monitoring can be granted while the native hook is already loaded.
    // Rebuild it when returning from System Settings so events start flowing
    // without asking the user to toggle the switch or restart the app.
    restart() { if (!wanted) return this.status(); if (hook) stop(); failed = ''; start(); return this.status(); },
    stop() { wanted = false; stop(); }
  };
}
module.exports = { createTypingHook };
