import test from 'node:test';
import assert from 'node:assert/strict';
import { groupShortcuts, isHelpKey, isTypingTarget, SCOPES } from './shortcut-sheet.mjs';
import { SHORTCUTS, shortcut } from '../shortcuts.mjs';

test('? and Ctrl/⌘+/ open the sheet; held keys and Alt combinations do not', () => {
  assert.equal(isHelpKey({ key: '?', shiftKey: true }), true);
  assert.equal(isHelpKey({ key: '/', ctrlKey: true }), true);
  assert.equal(isHelpKey({ key: '/', metaKey: true }), true);
  assert.equal(isHelpKey({ key: '÷', code: 'Slash', ctrlKey: true }), true, 'layouts that print another character on the slash key');
  assert.equal(isHelpKey({ key: '/' }), false);
  assert.equal(isHelpKey({ key: '?', repeat: true }), false);
  assert.equal(isHelpKey({ key: '?', altKey: true }), false);
  assert.equal(isHelpKey({ key: '?', ctrlKey: true }), false);
  assert.equal(isHelpKey(null), false);
});

test('typing into text fields never opens the sheet; buttons and checkboxes do not count as typing', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('every shortcut appears exactly once, grouped by where it works', () => {
  const groups = groupShortcuts();
  const listed = groups.flatMap((group) => group.entries.map((entry) => entry.id));
  assert.deepEqual([...listed].sort(), SHORTCUTS.map((entry) => entry.id).sort());
  assert.deepEqual(groups.map((group) => group.id), SCOPES.map((scope) => scope.id).filter((id) => SHORTCUTS.some((entry) => (entry.scope || 'room') === id)));
  assert.ok(shortcut('help'), 'the sheet lists its own key');
  const app = groupShortcuts(SHORTCUTS, { desktop: true }).find((group) => group.id === 'app');
  assert.equal(app.entries.find((entry) => entry.id === 'settings').action, '打开设置', 'inside the desktop app the 桌面版 note is noise');
  assert.match(groupShortcuts().find((group) => group.id === 'app').entries.find((entry) => entry.id === 'settings').action, /桌面版/);
});
