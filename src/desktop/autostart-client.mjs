// 开机时打开小屋: the shell owns the OS login item (Electron setLoginItemSettings) and
// publishes { supported, enabled } as window.cabinAutostart + the 'cabin:autostart' event.
import { desktopCommand } from './desktop-command.mjs';

export const AUTOSTART_EVENT = 'cabin:autostart';
const UNKNOWN = Object.freeze({ supported: false, enabled: false });
export const getAutostart = (win = globalThis) => win.cabinAutostart ? { supported: win.cabinAutostart.supported === true, enabled: win.cabinAutostart.enabled === true } : UNKNOWN;

// Resolves with the shell's answer, or { supported: false } when no shell answers.
export function setAutostart(enabled, { win = globalThis, command = desktopCommand, timeoutMs = 4000 } = {}) {
  if (typeof win.addEventListener !== 'function') return Promise.resolve(UNKNOWN);
  return new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); win.removeEventListener(AUTOSTART_EVENT, listener); resolve(value); };
    const listener = (event) => done({ supported: event.detail?.supported === true, enabled: event.detail?.enabled === true });
    const timer = setTimeout(() => done(UNKNOWN), timeoutMs);
    win.addEventListener(AUTOSTART_EVENT, listener);
    command('autostart', { enabled: Boolean(enabled) });
  });
}
export function onAutostartChange(callback, win = globalThis) {
  const listener = () => callback(getAutostart(win));
  win.addEventListener?.(AUTOSTART_EVENT, listener);
  return () => win.removeEventListener?.(AUTOSTART_EVENT, listener);
}
