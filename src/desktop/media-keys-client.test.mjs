import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorFromEvent, acceleratorLabel, setMediaKey, setMiniPlayer, getMediaKeys, onDesktopState } from './media-keys-client.mjs';
import { toggleLike, isLiked, normalizeLikes, likeKey, LIKES_LIMIT } from '../player/likes.mjs';

test('hotkey recorder: a pressed combination becomes an Electron accelerator', () => {
  const press = (key, mods = {}, code = '') => acceleratorFromEvent({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  assert.equal(press('p', { ctrlKey: true, altKey: true }, 'KeyP'), 'CommandOrControl+Alt+P');
  assert.equal(press('π', { altKey: true, metaKey: true }, 'KeyP') && acceleratorFromEvent({ key: 'π', code: 'KeyP', metaKey: true, altKey: true }, { mac: true }), 'CommandOrControl+Alt+P', 'macOS ⌥ letters use the physical key');
  assert.equal(press('ArrowLeft', { ctrlKey: true, altKey: true }), 'CommandOrControl+Alt+Left');
  assert.equal(press('F7', { altKey: true }), 'Alt+F7');
  assert.equal(press('Control', { ctrlKey: true }), '', 'still choosing modifiers');
  assert.equal(press('p'), null, 'a bare letter would steal typing');
  assert.equal(press('P', { shiftKey: true }, 'KeyP'), null);
  assert.equal(press('MediaPlayPause'), 'MediaPlayPause');
  assert.equal(press('Dead', { altKey: true }), null);
  assert.equal(acceleratorLabel('CommandOrControl+Alt+Left'), 'Ctrl+Alt+←');
  assert.equal(acceleratorLabel('CommandOrControl+Alt+Left', { mac: true }), '⌘⌥←');
  assert.equal(acceleratorLabel(''), '未设置');
});

test('desktop commands for hotkeys and the mini player carry only their fields', () => {
  const sent = [], command = (name, params) => sent.push([name, params]);
  setMediaKey('next', 'CommandOrControl+Alt+Right', command); setMediaKey('next', '', command);
  setMiniPlayer({ shown: true }, command); setMiniPlayer({ alwaysOnTop: false }, command);
  assert.deepEqual(sent, [['media-keys', { action: 'next', accelerator: 'CommandOrControl+Alt+Right' }], ['media-keys', { action: 'next', accelerator: '' }], ['mini-player', { shown: true }], ['mini-player', { top: false }]]);
  const listeners = {}, win = { cabinMediaKeys: { supported: true, enabled: true }, addEventListener: (event, fn) => { listeners[event] = fn; }, removeEventListener: (event) => { delete listeners[event]; } };
  const seen = [], off = onDesktopState('cabin:media-keys', getMediaKeys, (value) => seen.push(value), win);
  listeners['cabin:media-keys'](); assert.equal(seen[0].enabled, true); off(); assert.equal(listeners['cabin:media-keys'], undefined);
  assert.equal(getMediaKeys({}), null);
});

test('喜欢: per song on this device, survives a reordered playlist', () => {
  let likes = toggleLike([], { id: 'list', index: 3, title: '晴天', artist: '周杰伦' }, 10);
  assert.equal(isLiked(likes, 'list', '晴天'), true);
  assert.equal(isLiked(likes, 'list', ' 晴天 '), true, 'the same title after a refresh');
  assert.equal(isLiked(likes, 'other', '晴天'), false);
  likes = toggleLike(likes, { id: 'list', index: 9, title: '晴天' });
  assert.deepEqual(likes, [], 'a second press removes the heart');
  assert.equal(likeKey('', 'x'), ''); assert.deepEqual(toggleLike([], { id: 'a', title: '' }), []);
  const many = Array.from({ length: LIKES_LIMIT + 3 }, (_, i) => ({ id: 'r', index: i, title: `t${i}` }));
  assert.equal(normalizeLikes(many).length, LIKES_LIMIT);
  assert.deepEqual(normalizeLikes('x'), []);
});
