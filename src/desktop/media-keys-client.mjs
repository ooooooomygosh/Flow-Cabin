// 全局媒体快捷键 and the floating 迷你唱机: the desktop shell owns both (desktop/media-keys.cjs,
// desktop/mini-player.cjs) and publishes window.cabinMediaKeys / window.cabinMiniPlayer with
// the 'cabin:media-keys' / 'cabin:mini-player' events. The page only asks through desktop commands.
import { desktopCommand } from './desktop-command.mjs';

export const MEDIA_KEYS_EVENT = 'cabin:media-keys', MINI_PLAYER_EVENT = 'cabin:mini-player';
export const MEDIA_KEY_ACTIONS = Object.freeze([['toggle', '播放 / 暂停'], ['previous', '上一首'], ['next', '下一首'], ['volume-up', '音量 +'], ['volume-down', '音量 −'], ['lyrics-toggle', '桌面歌词']]);
export const getMediaKeys = (win = globalThis) => win.cabinMediaKeys?.supported ? win.cabinMediaKeys : null;
export const getMiniPlayer = (win = globalThis) => win.cabinMiniPlayer?.supported ? win.cabinMiniPlayer : null;
export const setMediaKeysEnabled = (enabled, command = desktopCommand) => command('media-keys', { enabled: Boolean(enabled) });
export const setMediaKey = (action, accelerator, command = desktopCommand) => command('media-keys', { action, accelerator: accelerator || '' });
export const resetMediaKeys = (command = desktopCommand) => command('media-keys', { reset: true });
export const requestMediaKeys = (command = desktopCommand) => command('media-keys');
export const setMiniPlayer = (patch, command = desktopCommand) => command('mini-player', { ...(patch.shown !== undefined ? { shown: Boolean(patch.shown) } : {}), ...(patch.alwaysOnTop !== undefined ? { top: Boolean(patch.alwaysOnTop) } : {}) });
export function onDesktopState(event, read, callback, win = globalThis) {
  const listener = () => callback(read(win));
  win.addEventListener?.(event, listener);
  return () => win.removeEventListener?.(event, listener);
}

// A pressed combination as an Electron accelerator ('' while only modifiers are down,
// null for a key that cannot be bound). Ctrl on Windows / Linux and ⌘ on macOS are
// both CommandOrControl, so a saved binding works on either.
const NAMED = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Enter: 'Return', Escape: 'Esc', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Tab: 'Tab', '+': 'Plus', MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack' };
export function acceleratorFromEvent(event, { mac = false } = {}) {
  const key = event?.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return '';
  if (/^Media/.test(key)) return NAMED[key] || null;
  const code = /^Key([A-Z])$/.exec(event.code || '')?.[1] || /^Digit(\d)$/.exec(event.code || '')?.[1];
  const name = NAMED[key] || code || (/^F([1-9]|1\d|2[0-4])$/.test(key) ? key : /^[a-z0-9]$/i.test(key) ? key.toUpperCase() : /^[,./;'\[\]\\`=-]$/.test(key) ? key : null);
  if (!name) return null;
  const command = mac ? event.metaKey : event.ctrlKey, mods = [command && 'CommandOrControl', mac && event.ctrlKey && 'Control', !mac && event.metaKey && 'Super', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
  if (!mods.some((mod) => mod !== 'Shift')) return null;
  return [...mods, name].join('+');
}
// For people: CommandOrControl+Alt+Left → Ctrl+Alt+← (⌘⌥← on a Mac).
export function acceleratorLabel(accelerator, { mac = false } = {}) {
  if (!accelerator) return '未设置';
  const names = mac ? { CommandOrControl: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘' } : { CommandOrControl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win' };
  const keys = { Left: '←', Right: '→', Up: '↑', Down: '↓', Plus: '+', Space: '空格', Return: '回车', MediaPlayPause: '播放键', MediaNextTrack: '下一曲键', MediaPreviousTrack: '上一曲键' };
  return accelerator.split('+').map((part) => names[part] || keys[part] || part).join(mac ? '' : '+');
}
