import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, ariaKeys, shortcut } from './shortcuts.mjs';

test('the shortcut table covers every handled key once and pairs each key with its action', () => {
  const ids = SHORTCUTS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['play', 'seek', 'track', 'volume', 'mute', 'repeat', 'shuffle', 'shelf', 'load', 'zen', 'tools', 'corner', 'back', 'fullscreen', 'desktop', 'settings']) assert.ok(ids.includes(id), id);
  const pairs = SHORTCUTS.map((entry) => `${entry.label} ${entry.action}`);
  for (const part of ['空格 播放 / 暂停', 'Z 沉浸', 'T 唱机特写', 'H 收起 / 恢复工具', 'Shift+← → 上一首 / 下一首', 'Esc 返回 / 退出沉浸']) assert.ok(pairs.includes(part), part);
  for (const entry of SHORTCUTS) assert.ok(entry.label && entry.action && entry.keys, entry.id);
  assert.equal(ariaKeys('zen'), 'Z'); assert.equal(ariaKeys('nope'), undefined);
});
test('the shortcuts the desktop shell owns say so: the browser build cannot run them', () => {
  // Ctrl/⌘+Alt+D and Ctrl/⌘+, live in the Electron menu (desktop/main/menus.cjs),
  // not in the page: in the browser build they do nothing, so the table says so.
  for (const id of ['desktop', 'settings']) {
    const entry = shortcut(id);
    assert.equal(entry.desktop, true, id);
    assert.match(entry.action, /桌面版/, id);
    assert.ok(entry.keys.includes('Meta+') && entry.keys.includes('Control+'), `${id} needs both ⌘ and Ctrl`);
  }
  assert.equal(shortcut('zen').desktop, undefined);
});
test('the printed label never hides a key the entry really has', () => {
  // 设置 › 快捷键 prints `label`; the shelf row also answers to Home and End.
  const shelf = shortcut('shelf');
  assert.match(shelf.keys, /Home/); assert.match(shelf.keys, /End/);
  assert.match(shelf.label, /Home/); assert.match(shelf.label, /End/);
});
test('the modifiers are written in the ARIA order: Control → Alt → Shift → Meta', () => {
  // aria-keyshortcuts 会被读屏和自动化按字面比对。规范说修饰键顺序不影响语义，
  // 但同时给出了推荐顺序；按推荐顺序写，两边都不会错位。
  const order = ['Control', 'Alt', 'Shift', 'Meta'];
  for (const entry of SHORTCUTS) {
    for (const combo of entry.keys.split(' ')) {
      const parts = combo.split('+'), modifiers = parts.slice(0, -1);
      const positions = modifiers.map((name) => order.indexOf(name));
      assert.ok(positions.every((at) => at >= 0), `${entry.id}: ${combo} 用了表里没有的修饰键`);
      assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${entry.id}: ${combo} 的修饰键顺序不是 Control → Alt → Shift → Meta`);
    }
  }
});
