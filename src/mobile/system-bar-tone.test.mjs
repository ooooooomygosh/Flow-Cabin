import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_BAND, STATUS_BAND_LUMA, readHomeView, statusBarStyle, watchStatusBar } from './system-bar-tone.mjs';
import { THEMES } from '../home/spatial-layout.mjs';

test('every room and view has a measured band, and every current room keeps light icons', () => {
  for (const theme of THEMES) {
    assert.ok(STATUS_BAND_LUMA[theme.id], theme.id);
    for (const zone of ['all', 'music', 'work', 'life']) {
      assert.ok(STATUS_BAND_LUMA[theme.id][zone] > 0, `${theme.id} ${zone}`);
      assert.equal(statusBarStyle({ look: theme.id, zone }), 'DARK', `${theme.id} ${zone}`);
    }
  }
  assert.equal(statusBarStyle({ look: 'unknown' }), 'DARK');
});

test('the threshold sits well above every measured room', () => {
  const brightest = Math.max(...Object.values(STATUS_BAND_LUMA).flatMap((views) => Object.values(views)));
  assert.ok(brightest < LIGHT_BAND - 0.2, `brightest band ${brightest}`);
  assert.ok(LIGHT_BAND < 0.8);
});

const fakeDom = (className, zone) => {
  const home = { classList: className.split(' '), dataset: zone ? { zone } : {} };
  return { body: {}, querySelector: (selector) => selector === '.cabin-home' && className ? home : null, home };
};

test('the view is read from the home markup', () => {
  assert.deepEqual(readHomeView(fakeDom('cabin-home theme-seaside is-corner', 'work')), { look: 'seaside', zone: 'work' });
  assert.deepEqual(readHomeView(fakeDom('cabin-home', '')), { look: 'pixel', zone: 'all' });
  assert.equal(readHomeView(fakeDom('', '')), null, 'the classic home keeps the default style');
});

test('the watcher applies once per change and coalesces bursts', () => {
  const applied = [], timers = [];
  let notify;
  class Observer { constructor(fn) { notify = fn; } observe() {} disconnect() {} }
  const root = fakeDom('cabin-home theme-pixel', 'all');
  const stop = watchStatusBar((style) => applied.push(style), { root, Observer, setTimer: (fn) => timers.push(fn) });
  assert.deepEqual(applied, ['DARK']);
  notify(); notify(); notify();
  assert.equal(timers.length, 1, 'a burst schedules one check');
  timers.shift()();
  assert.deepEqual(applied, ['DARK'], 'an unchanged style is not re-sent');
  stop();
  assert.doesNotThrow(() => watchStatusBar(() => {}, { root: {}, Observer })());
});
