import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_STEPS, fallbackFollowUp, fallbackNotice, progressSteps } from './smart-progress.mjs';

const intent = { activity: { label: '学习' }, minutes: 50, autoplay: true };

test('steps before the current one are done, later ones are pending and say nothing yet', () => {
  const steps = progressSteps('ai', { intent, shelfCount: 12, elapsedMs: 2000 });
  assert.deepEqual(steps.map((step) => step.state), ['done', 'done', 'active', 'pending']);
  assert.equal(steps[0].detail, '学习 · 50 分钟');
  assert.equal(steps[1].detail, '唱片架上有 12 张，可作为参考');
  assert.equal(steps[2].detail, '已发送计划和唱片架摘要');
  assert.equal(steps[3].detail, '');
  assert.equal(PROGRESS_STEPS.length, steps.length);
});

test('a long wait says how long it has been and what is normal', () => {
  assert.equal(progressSteps('ai', { intent, elapsedMs: 12_400 })[2].detail, '已等待 12 秒，通常需要 10–30 秒');
  assert.equal(progressSteps('shelf', { intent, shelfCount: 0 })[1].detail, '唱片架还是空的，全部交给 AI 来挑');
  assert.equal(progressSteps('check', { intent }).filter((step) => step.state === 'done').length, 3);
  assert.equal(progressSteps('nope', { intent })[0].state, 'active');
});

test('every fallback has a title and a reason, and only fixable failures offer a retry', () => {
  assert.equal(fallbackNotice({ configured: false, enabled: false }).kind, 'off');
  assert.equal(fallbackNotice({ configured: false, enabled: true }).kind, 'setup');
  assert.equal(fallbackNotice({ reply: { ok: false, error: '连接超时：服务器没有及时回应，请稍后重试。' } }).kind, 'timeout');
  const auth = fallbackNotice({ reply: { ok: false, error: 'API Key 无效或没有权限（401）。' } });
  assert.equal(auth.kind, 'auth'); assert.equal(auth.canRetry, false);
  assert.match(auth.reason, /401/);
  assert.equal(fallbackNotice({ reply: { ok: false, error: '请求太频繁或余额不足（429）。' } }).kind, 'quota');
  assert.equal(fallbackNotice({ reply: { ok: false, kind: 'cancelled', error: '请求已取消。' } }).kind, 'cancelled');
  assert.equal(fallbackNotice({ invalid: true }).kind, 'invalid');
  assert.equal(fallbackNotice({ thrown: true }).canRetry, true);
  assert.equal(fallbackNotice({ reply: { ok: false } }).reason, '服务没有给出原因。');
  for (const notice of [fallbackNotice({ configured: false }), fallbackNotice({ invalid: true }), fallbackNotice({ reply: { ok: false, error: 'x' } })]) assert.ok(notice.title && notice.reason);
});

test('the follow-up says what the cabin did instead', () => {
  assert.equal(fallbackFollowUp({ albums: [{}, {}, {}] }), '所以先从你的唱片架里挑了 3 张，可以直接开始。');
  assert.match(fallbackFollowUp({ albums: [] }), /还没有唱片/);
});
