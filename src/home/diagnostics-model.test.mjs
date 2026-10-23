import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_TEXT, LOCATION_TEXT, diagnosticRows, formatStamp } from './diagnostics-model.mjs';

const at = (text) => new Date(text).getTime();

test('timestamps read like a person would say them, in zh-CN', () => {
  const now = at('2026-10-23T16:30:00');
  assert.equal(formatStamp(at('2026-10-23T09:05:00'), now), '今天 09:05');
  assert.equal(formatStamp(at('2026-10-22T23:59:00'), now), '昨天 23:59');
  assert.equal(formatStamp(at('2026-10-02T08:00:00'), now), '10月2日 08:00');
  assert.equal(formatStamp(at('2025-03-01T08:00:00'), now), '2025年3月1日 08:00');
  assert.equal(formatStamp(0, now), '');
  assert.equal(formatStamp('nope', now), '');
});

test('internal values never reach the screen as raw identifiers', () => {
  const now = at('2026-10-23T16:30:00');
  const rows = diagnosticRows({ platform: 'desktop', provider: 'netease', accounts: { qq: 'expired', netease: 'storage-error' }, location: 'denied', phase: 'shortBreak', paused: true, weatherOn: true, weatherAt: at('2026-10-23T16:00:00') }, now);
  const text = rows.map((row) => `${row.label} ${row.value} ${row.hint}`).join('\n');
  for (const raw of ['expired', 'storage-error', 'denied', 'shortBreak', 'netease', 'desktop']) assert.ok(!new RegExp(`\\b${raw}\\b`).test(text), `${raw} leaked: ${text}`);
  const row = (id) => rows.find((entry) => entry.id === id);
  assert.equal(row('account-qq').value, '登录已过期');
  assert.equal(row('account-qq').tone, 'warn');
  assert.match(row('account-qq').hint, /重新登录/);
  assert.equal(row('account-netease').value, '登录凭据无法读取');
  assert.equal(row('location').value, '未允许定位');
  assert.equal(row('focus').value, '短休息（已暂停）');
  assert.equal(row('provider').value, '网易云音乐');
  assert.equal(row('weather').value, '上次更新 今天 16:00');
  assert.equal(row('platform').value, '桌面版');
});

test('the web build says what needs the desktop app; warnings carry a next step', () => {
  const rows = diagnosticRows({ platform: 'web', provider: 'visual', accounts: { status: 'unavailable' }, location: 'timeout', syncError: '对方拒绝了配对', weatherOn: true, weatherAt: at('2026-10-23T08:00:00') }, at('2026-10-23T16:30:00'));
  const row = (id) => rows.find((entry) => entry.id === id);
  assert.equal(row('accounts').value, '需要桌面版');
  assert.equal(row('provider').tone, 'warn');
  assert.match(row('provider').hint, /设置 › 音源/);
  assert.equal(row('devices').value, '连接出了问题');
  assert.equal(row('devices').hint, '对方拒绝了配对');
  assert.match(row('weather').hint, /三小时/);
  for (const entry of rows.filter((item) => item.tone === 'warn')) assert.ok(entry.hint, `${entry.id} warns without saying what to do`);
  assert.equal(rows.some((entry) => entry.id === 'storage'), false, 'storage is an Android row');
  assert.equal(diagnosticRows({ platform: 'android', storage: { error: true } }).find((entry) => entry.id === 'storage').tone, 'warn');
});

test('every status table entry has words, a hint and a tone', () => {
  for (const table of [ACCOUNT_TEXT, LOCATION_TEXT]) for (const [key, [value, hint, tone]] of Object.entries(table)) {
    assert.ok(value && hint, key);
    assert.ok(['ok', 'warn', 'info'].includes(tone), key);
  }
  assert.equal(diagnosticRows({ accounts: { qq: 'mystery' } }).find((row) => row.id === 'account-qq').value, 'mystery', 'an unknown status is shown as-is rather than hidden');
});
