import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, shortcutHelp, ariaKeys } from './shortcuts.mjs';

test('the shortcut table covers every handled key once and renders one help line', () => {
  const ids = SHORTCUTS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['play', 'seek', 'track', 'volume', 'mute', 'repeat', 'shuffle', 'shelf', 'load', 'zen', 'corner', 'back', 'fullscreen', 'desktop', 'settings']) assert.ok(ids.includes(id), id);
  const help = shortcutHelp();
  for (const part of ['空格 播放 / 暂停', 'Z 沉浸', 'T 唱机特写', 'Shift+← → 上一首 / 下一首', 'Esc 返回']) assert.ok(help.includes(part), part);
  assert.equal(ariaKeys('zen'), 'Z'); assert.equal(ariaKeys('nope'), undefined);
});
