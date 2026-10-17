import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, ariaKeys } from './shortcuts.mjs';

test('the shortcut table covers every handled key once and pairs each key with its action', () => {
  const ids = SHORTCUTS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['play', 'seek', 'track', 'volume', 'mute', 'repeat', 'shuffle', 'shelf', 'load', 'zen', 'tools', 'corner', 'back', 'fullscreen', 'desktop', 'settings']) assert.ok(ids.includes(id), id);
  const pairs = SHORTCUTS.map((entry) => `${entry.label} ${entry.action}`);
  for (const part of ['空格 播放 / 暂停', 'Z 沉浸', 'T 唱机特写', 'H 收起 / 恢复工具', 'Shift+← → 上一首 / 下一首', 'Esc 返回 / 退出沉浸']) assert.ok(pairs.includes(part), part);
  for (const entry of SHORTCUTS) assert.ok(entry.label && entry.action && entry.keys, entry.id);
  assert.equal(ariaKeys('zen'), 'Z'); assert.equal(ariaKeys('nope'), undefined);
});
