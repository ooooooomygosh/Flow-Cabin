// 快捷键速查: which key opens the sheet, and the shortcut table grouped by
// where each key works. The table itself is src/shortcuts.mjs.
import { SHORTCUTS } from '../shortcuts.mjs';

export const SCOPES = Object.freeze([
  { id: 'app', label: '任何时候' },
  { id: 'room', label: '在小屋里' },
  { id: 'deck', label: '唱机上有唱片时' },
  { id: 'corner', label: '唱机特写' },
  { id: 'display', label: '沉浸画面' }
]);

// "?" (Shift+/ on most layouts) or Ctrl/⌘+/. Alt combinations stay free for the OS.
export function isHelpKey(event) {
  if (!event || event.altKey || event.repeat) return false;
  if (event.key === '?' && !event.ctrlKey && !event.metaKey) return true;
  return Boolean(event.ctrlKey || event.metaKey) && (event.key === '/' || event.code === 'Slash');
}

// Typing a "?" into a search box, a note or a lyric offset must not open anything.
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(String(target.type || 'text').toLowerCase());
}

// [{ id, label, entries }] in SCOPES order, skipping empty groups. With
// `desktop: true` the 桌面版 notes are dropped: in the app they just work.
export function groupShortcuts(list = SHORTCUTS, { desktop = false } = {}) {
  return SCOPES.map((scope) => ({
    ...scope,
    entries: list.filter((entry) => (entry.scope || 'room') === scope.id)
      .map((entry) => desktop && entry.desktop ? { ...entry, action: entry.action.replace(/（桌面版）$/, '') } : entry)
  })).filter((group) => group.entries.length);
}
