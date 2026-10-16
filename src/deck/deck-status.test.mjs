import test from 'node:test';
import assert from 'node:assert/strict';
import { readVolume, writeVolume, deckStatusText, mediaErrorMessage, accountChangeEffect } from './deck-status.mjs';

const memory = (value) => { const data = new Map(value === undefined ? [] : [['album-circle-player-volume-v1', value]]); return { getItem: (key) => data.get(key) ?? null, setItem: (key, v) => data.set(key, v) }; };
test('volume is read clamped, with safe defaults, and round-trips', () => {
  assert.deepEqual(readVolume(memory()), { volume: .65, muted: false });
  assert.deepEqual(readVolume(memory('{"volume":3,"muted":1}')), { volume: 1, muted: true });
  assert.deepEqual(readVolume(memory('not json')), { volume: .65, muted: false });
  const storage = memory(); writeVolume({ volume: .2, muted: false }, storage); assert.deepEqual(readVolume(storage), { volume: .2, muted: false });
});
test('status text keeps the existing wording', () => {
  assert.equal(deckStatusText({ status: 'playing', quality: '标准', trial: true }, 'qq'), '正在播放 · 试听片段 · 标准');
  assert.equal(deckStatusText({ status: 'playing', quality: '标准' }, 'local'), '正在播放本地文件');
  assert.equal(deckStatusText({ status: 'waiting' }, 'appleMusic'), '等待“音乐”App');
  assert.equal(deckStatusText({ status: 'error', error: '没有找到' }, 'qq', true), '没有找到 稍后自动播放下一首…');
  assert.equal(deckStatusText({ status: 'nope' }, 'qq'), '待播放');
  assert.match(mediaErrorMessage(2), /网络中断/); assert.match(mediaErrorMessage(99), /音频加载失败/);
});
test('a cancelled or failed login never restarts the song; only a struggling deck re-resolves', () => {
  const base = { provider: 'qq', status: 'playing', trial: false, hasRecord: true };
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { ok: false, cancelled: true, error: '' } }), 'ignore');
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { error: '登录失败' } }), 'ignore');
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { ok: true } }), 'clear');
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { ok: true }, trial: true }), 'reload');
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { ok: true }, status: 'error' }), 'reload');
  assert.equal(accountChangeEffect({ ...base, type: 'settings' }), 'clear', 'a quality change applies from the next track');
  assert.equal(accountChangeEffect({ ...base, type: 'settings', provider: 'ma' }), 'reload');
  assert.equal(accountChangeEffect({ ...base, type: 'account', detail: { ok: true }, provider: 'visual', status: 'error' }), 'clear');
});
