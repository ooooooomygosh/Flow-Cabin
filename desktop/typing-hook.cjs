'use strict';
// 键鼠跟随: tells the desktop pet when keyboard or mouse activity happens.
//
// Privacy contract (tested): only the fixed kinds "keyboard" and "click" plus
// an aggregate count leave the native layer. No key code, character, mouse
// button, coordinate, window title or application name is stored, logged or
// sent. The consumer may count every event; the pet renderer applies its own
// pulse throttle so input volume never reduces counts.
//
// macOS uses a small in-process N-API tap (native/mac-input.mm):
//   kCGHIDEventTap + kCGHeadInsertEventTap + listen-only
// This follows the reliability boundary documented by BongoCat. The session
// tap supplied by uiohook-napi can miss ordinary key-down / modifier events
// and previously forced an unrelated Accessibility grant. Windows keeps the
// existing uiohook-napi prebuild.
const path = require('node:path');
const fs = require('node:fs');

function createTypingHook({
  platform = process.platform,
  loadWindows = () => require('uiohook-napi'),
  loadMac = () => require(path.join(__dirname, 'native', 'mac-input.node')),
  onActivity,
  now = Date.now,
  log = () => {},
  drainMs = 80,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  exists = fs.existsSync
} = {}) {
  let hook = null, keyListener = null, clickListener = null, active = false;
  let wanted = false, failed = '', generation = 0, drainTimer = null, mac = null;

  const macAvailable = () => platform !== 'darwin' || exists(path.join(__dirname, 'native', 'mac-input.node'));
  const macPermission = () => {
    if (platform !== 'darwin' || !mac) return false;
    try { return Boolean(mac.preflight()); } catch { return false; }
  };
  const receive = (type, count = 1) => {
    if (!active || !['keyboard', 'click'].includes(type)) return;
    const times = Math.max(0, Math.min(10000, Math.round(Number(count) || 0)));
    for (let index = 0; index < times; index++) onActivity({ type, at: now() });
  };
  const drain = () => {
    if (!active || !mac) return;
    try {
      const value = mac.drain();
      // keyboard and click are exhaustive fixed categories. Anything else the
      // native layer might return in future is ignored rather than guessed.
      receive('keyboard', value?.keyboard);
      receive('click', value?.click);
    } catch (error) {
      failed = 'unavailable';
      log('typing-hook-drain-error', String(error?.message || error).slice(0, 200));
      stop();
    }
  };

  function startWindows() {
    try {
      const native = loadWindows();
      hook = native.uIOhook;
      const token = ++generation;
      const accepted = (type) => { if (active && token === generation) receive(type); };
      keyListener = () => accepted('keyboard');
      clickListener = () => accepted('click');
      hook.on('keydown', keyListener);
      hook.on('mousedown', clickListener);
      hook.start();
      active = true;
      failed = '';
      return true;
    } catch (error) {
      stop();
      failed = 'unavailable';
      log('typing-hook-error', String(error?.message || error).slice(0, 200));
      return false;
    }
  }

  function startMac() {
    try {
      if (!mac) mac = loadMac();
      if (!mac?.preflight?.()) return false;
      mac.reset?.();
      if (!mac.start?.()) return false;
      active = true;
      failed = '';
      drainTimer = setIntervalFn(drain, drainMs);
      return true;
    } catch (error) {
      stop();
      failed = 'unavailable';
      log('typing-hook-error', String(error?.message || error).slice(0, 200));
      return false;
    }
  }

  function start() {
    if (active && (platform === 'darwin' ? mac?.status?.().running : hook)) return true;
    if (!wanted) return false;
    if (platform === 'darwin') return startMac();
    return startWindows();
  }

  function stop() {
    const previous = hook, previousKey = keyListener, previousClick = clickListener;
    active = false;
    generation++;
    hook = null;
    keyListener = null;
    clickListener = null;
    if (drainTimer !== null) { clearIntervalFn(drainTimer); drainTimer = null; }
    if (platform === 'darwin') {
      try { mac?.stop?.(); } catch { /* already stopped */ }
      return;
    }
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
    // 'off' | 'active' | 'needs-permission' | 'unavailable'
    status() {
      if (!wanted) return 'off';
      if (failed === 'unavailable') return 'unavailable';
      if (platform === 'darwin') {
        if (!macAvailable()) return 'unavailable';
        if (!macPermission()) return 'needs-permission';
        return active && mac?.status?.().running !== false ? 'active' : 'unavailable';
      }
      return active && hook ? 'active' : 'unavailable';
    },
    // Permission is independent of whether the pet is out or the hook started.
    permission() {
      if (platform !== 'darwin') return 'granted';
      if (!macAvailable()) return 'needs-permission';
      try {
        if (!mac) mac = loadMac();
        return mac.preflight() ? 'granted' : 'needs-permission';
      } catch {
        return 'needs-permission';
      }
    },
    setEnabled(on) {
      wanted = Boolean(on);
      if (wanted) start();
      else stop();
      return this.status();
    },
    // Opens the native Input Monitoring request. This is only called after an
    // explicit user action; it never resets or loops the TCC prompt.
    requestPermission() {
      if (platform === 'darwin') {
        try {
          if (!mac) mac = loadMac();
          mac.request();
        } catch (error) {
          log('typing-permission-error', String(error?.message || error).slice(0, 200));
        }
      }
      return this.retry();
    },
    retry() {
      if (wanted && !active) {
        failed = '';
        start();
      } else if (wanted && active && platform === 'darwin' && !mac?.status?.().running) {
        stop();
        failed = '';
        start();
      }
      return this.status();
    },
    // Rebuild after returning from System Settings so events flow without a
    // toggle or app restart. Safe when no hook is running.
    restart() {
      if (!wanted) return this.status();
      stop();
      failed = '';
      start();
      return this.status();
    },
    drain,
    stop() {
      wanted = false;
      stop();
    }
  };
}

module.exports = { createTypingHook };
