import test from 'node:test';
import assert from 'node:assert/strict';
const opened = [], listeners = {};
globalThis.document = { documentElement: { dataset: { desktopClient: 'true' } } };
globalThis.window = { open: (url) => opened.push(url), addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
const api = await import('./desktop-sink-client.mjs');

test('enter / exit send the shell commands and status reflects the shell', () => {
  assert.deepEqual(api.getDesktopModeStatus(), { active: false, busy: false, supported: true, via: '', reason: '' });
  api.enterDesktopMode(); assert.equal(opened.at(-1), 'album-desktop://action/desktop-sink-enter');
  window.cabinDesktopStatus = { active: true, supported: true, via: 'wallpaper' };
  api.enterDesktopMode(); assert.equal(opened.length, 1, 'no duplicate enter');
  api.exitDesktopMode(); assert.equal(opened.at(-1), 'album-desktop://action/desktop-sink-exit');
});
test('change events and the installed window API', () => {
  let seen; const off = api.onDesktopModeChange((s) => { seen = s; });
  listeners['cabin:desktop-mode']({ detail: { active: false, reason: 'x' } }); assert.equal(seen.reason, 'x'); off();
  const target = {}; api.installDesktopApi(target); assert.equal(typeof target.cabinDesktop.getDesktopModeStatus, 'function'); assert.equal(target.cabinDesktop.event, 'cabin:desktop-mode');
});
test('browser preview is unsupported with a reason', () => {
  document.documentElement.dataset.desktopClient = 'false';
  const s = api.getDesktopModeStatus(); assert.equal(s.supported, false); assert.ok(s.reason);
});
test('every desktop command goes through one URL builder', async () => {
  const { desktopCommandUrl } = await import('./desktop-command.mjs');
  assert.equal(desktopCommandUrl('music-login', { provider: 'qq' }), 'album-desktop://action/music-login?provider=qq');
  document.documentElement.dataset.desktopClient = 'true'; api.reportTrayPet('fox'); assert.equal(opened.at(-1), 'album-desktop://action/tray-pet?id=fox');
});
