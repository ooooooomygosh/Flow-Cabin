import test from 'node:test';
import assert from 'node:assert/strict';
import { browserEnv, browserExecutable, isUtf8Locale, pinHome } from './launch-browser.mjs';

test('browser launcher forces a UTF-8 locale only when the shell has none', () => {
  assert.equal(isUtf8Locale({}), false);
  assert.equal(isUtf8Locale({ LANG: 'C' }), false);
  assert.equal(isUtf8Locale({ LANG: 'en_US.UTF-8' }), true);
  assert.equal(isUtf8Locale({ LANG: 'C', LC_ALL: 'zh_CN.utf8' }), true);
  assert.deepEqual(browserEnv({ PATH: '/bin' }), { PATH: '/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' });
  assert.deepEqual(browserEnv({ LANG: 'de_DE.UTF-8' }), { LANG: 'de_DE.UTF-8' });
});

test('browser launcher resolves one executable the same way for every script', () => {
  assert.equal(browserExecutable({ BROWSER_EXECUTABLE: '/x/chrome' }, () => true), '/x/chrome');
  assert.equal(browserExecutable({}, file => file === '/usr/bin/chromium'), '/usr/bin/chromium');
  assert.notEqual(browserExecutable({ CI: '1' }, () => true), '/usr/bin/chromium');
  assert.notEqual(browserExecutable({}, () => false), '/usr/bin/chromium');
});

test('browser contexts start on the classic shelf unless a script asks for the real default home', () => {
  assert.equal(pinHome(null), '');
  const store = new Map(), localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  new Function('localStorage', pinHome('classic'))(localStorage);
  assert.equal(store.get('flow-cabin-interface-v1'), 'classic');
  store.set('flow-cabin-interface-v1', 'beta');
  new Function('localStorage', pinHome('classic'))(localStorage);
  assert.equal(store.get('flow-cabin-interface-v1'), 'beta', 'an explicit choice already stored is kept');
});
