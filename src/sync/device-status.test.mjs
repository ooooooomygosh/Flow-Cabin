import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceStatus, explainDeviceError, peerActivity } from './device-status.mjs';

test('platform network errors become a Chinese reason with a next step', () => {
  assert.match(explainDeviceError(new TypeError('Failed to fetch')), /本机同步服务/);
  assert.match(explainDeviceError('connect ECONNREFUSED 192.168.1.8:48321'), /没有开启接收/);
  assert.match(explainDeviceError('connect ETIMEDOUT'), /超时/);
  assert.match(explainDeviceError('实时连接超时'), /同一个 Wi-Fi/);
  assert.match(explainDeviceError('getaddrinfo ENOTFOUND cabin.local'), /找不到对方/);
  assert.match(explainDeviceError('证书指纹不匹配'), /重新配对/);
  assert.match(explainDeviceError('HTTP 403 Forbidden'), /撤销了对这台设备的信任/);
  assert.match(explainDeviceError('socket hang up'), /不会自动重放/);
  assert.match(explainDeviceError('对方尚未在线'), /不在线/);
});

test('service messages already in Chinese pass through; unknown English is wrapped, not shown bare', () => {
  assert.equal(explainDeviceError('对方尚未放上可播放的唱片'), '对方尚未放上可播放的唱片');
  assert.equal(explainDeviceError(Error('接收端已有计时')), '接收端已有计时');
  const odd = explainDeviceError('weird internal failure');
  assert.match(odd, /^操作没有完成（weird internal failure）/);
  assert.equal(explainDeviceError(''), '操作没有完成，请稍后再试。');
  assert.equal(explainDeviceError(null), '操作没有完成，请稍后再试。');
});

test('each connection state says what it means and what to do', () => {
  assert.deepEqual(deviceStatus({ online: true }).tone, 'ok');
  assert.equal(deviceStatus({ enabled: false, address: 'https://x' }).label, '未连接');
  assert.match(deviceStatus({ enabled: false, address: 'https://x' }).hint, /局域网接收/);
  assert.equal(deviceStatus({ enabled: true, address: '' }).label, '等待对方连接');
  assert.equal(deviceStatus({ enabled: true, address: 'https://x', autoReconnect: true }).label, '未连接 · 会自动重连');
  assert.equal(deviceStatus({ enabled: true, address: 'https://x', busy: true }).label, '正在连接…');
  for (const state of [{}, { online: true }, { enabled: true }, { enabled: true, address: 'a' }]) assert.ok(deviceStatus(state).hint);
});

test('the peer line reads as a sentence', () => {
  const clock = (ms) => `${Math.round(ms / 60000)}:00`;
  assert.equal(peerActivity({ focus: { phase: 'idle' } }, clock), '对方正在自由活动');
  assert.equal(peerActivity({ focus: { phase: 'focus', remaining: 600000, paused: true } }, clock), '对方专注中，还剩 10:00 · 已暂停');
  assert.equal(peerActivity({ focus: { phase: 'shortBreak', remaining: 300000 } }, clock), '对方休息中，还剩 5:00');
  assert.equal(peerActivity(null, clock), '对方正在自由活动');
});
