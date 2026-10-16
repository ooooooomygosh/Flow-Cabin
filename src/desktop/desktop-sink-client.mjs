// Public renderer API for 沉入桌面 (see docs/desktop.md). Onboarding and the
// settings panel call these instead of sending shell commands themselves.
import { desktopCommand } from './desktop-command.mjs';
const EVENT = 'cabin:desktop-mode';
const isClient = () => typeof document !== 'undefined' && document.documentElement.dataset.desktopClient === 'true';
const send = (command, params) => desktopCommand(command, params);
export function getDesktopModeStatus() {
  const shell = typeof window !== 'undefined' ? window.cabinDesktopStatus : null;
  if (!isClient()) return { active: false, busy: false, supported: false, via: '', reason: '沉入桌面需要在心流小屋桌面客户端里使用。' };
  return { active: Boolean(shell?.active), busy: Boolean(shell?.busy), supported: shell ? shell.supported !== false : true, via: shell?.via || '', reason: shell?.reason || '' };
}
export function enterDesktopMode() { const status = getDesktopModeStatus(); if (status.supported && !status.active) send('desktop-sink-enter'); return status; }
export function exitDesktopMode() { const status = getDesktopModeStatus(); if (status.active || status.busy) send('desktop-sink-exit'); return status; }
export function onDesktopModeChange(callback) {
  const listener = (event) => callback({ ...getDesktopModeStatus(), ...(event.detail || {}) });
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
// The tray / menu-bar icon follows the room pet; the shell keeps it internal.
export function reportTrayPet(petId) { if (isClient()) send('tray-pet', { id: petId }); }
export function installDesktopApi(target = window) {
  target.cabinDesktop = Object.freeze({ enterDesktopMode, exitDesktopMode, getDesktopModeStatus, onDesktopModeChange, event: EVENT });
}
export const DESKTOP_MODE_EVENT = EVENT;
