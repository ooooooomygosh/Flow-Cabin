import test from 'node:test';
import assert from 'node:assert/strict';
import { updateView } from './update-model.mjs';
test('update view: every status names what happens next', () => {
  assert.equal(updateView(null, { desktop: false }).label, '网页版总是最新的');
  assert.deepEqual(updateView({ status: 'idle', mode: 'install' }).actions, ['check']);
  assert.equal(updateView({ status: 'checking' }).label, '检查中…');
  assert.equal(updateView({ status: 'latest', checkedAt: 0 }).label, '已是最新');
  assert.deepEqual(updateView({ status: 'available', mode: 'install', latestVersion: '1.12.0', notes: 'x' }).actions, ['download', 'open-release']);
  const mac = updateView({ status: 'available', mode: 'notify', latestVersion: '1.12.0', reason: '没有 Apple 开发者签名', downloadUrl: 'https://github.com/x.dmg' });
  assert.equal(mac.label, '发现新版本 v1.12.0'); assert.deepEqual(mac.actions, ['open-download', 'open-release']); assert.match(mac.detail, /签名/);
  assert.equal(updateView({ status: 'downloading', percent: 41.6 }).label, '下载中 42%');
  const done = updateView({ status: 'downloaded', latestVersion: '1.12.0' });
  assert.equal(done.label, 'v1.12.0 已下载，重启安装'); assert.deepEqual(done.actions, ['install']);
  assert.deepEqual(updateView({ status: 'error', error: '无法连接' }).actions, ['check', 'open-release']);
});
test('update view: a newer copy installed while the old one still runs', async () => {
  const { ACTION_LABELS, ACTION_COMMANDS } = await import('./update-model.mjs');
  const view = updateView({ status: 'restart', mode: 'install', latestVersion: '1.14.1' });
  assert.equal(view.label, '已安装 v1.14.1，重启后生效'); assert.deepEqual(view.actions, ['relaunch']);
  assert.equal(ACTION_LABELS.relaunch, '重启到新版本'); assert.equal(ACTION_COMMANDS.relaunch, 'update-relaunch');
});
