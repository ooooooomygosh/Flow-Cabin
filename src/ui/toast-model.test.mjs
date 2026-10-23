import test from 'node:test';
import assert from 'node:assert/strict';
import { addToast, removeToast, durationFor, MAX_VISIBLE } from './toast-model.mjs';

test('toasts queue instead of replacing, and a repeat refreshes the existing one', () => {
  let list = addToast([], '已保存', { at: 1 });
  list = addToast(list, '已移除', { at: 2 });
  assert.deepEqual(list.map(t => t.text), ['已保存', '已移除']);
  list = addToast(list, '已保存', { at: 3 });
  assert.equal(list.length, 2); assert.equal(list[0].at, 3);
  assert.equal(addToast(list, '  ').length, 2);
  assert.deepEqual(removeToast(list, list[0].id).map(t => t.text), ['已移除']);
});

test('errors outlive confirmations when the stack overflows, and actions get time', () => {
  let list = addToast([], '网络错误', { tone: 'error' });
  for (const text of ['一', '二', '三']) list = addToast(list, text);
  assert.equal(list.length, MAX_VISIBLE);
  assert.equal(list[0].text, '网络错误');
  assert.equal(durationFor({ tone: 'error' }), 6000);
  assert.equal(durationFor({ action: { run() {} } }), 6000);
  assert.equal(durationFor(), 3200);
  const undo = addToast([], '已移除', { action: { run() {} } })[0];
  assert.equal(undo.action.label, '撤销');
  assert.equal(addToast([], 'x', { action: { label: 'bad' } })[0].action, null);
});
