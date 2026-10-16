import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './onboarding-model.mjs';
import { createPlayerAdapter, createDesktopAdapter, DESKTOP_MODE_EVENT } from './onboarding-adapter.mjs';

const memory = (seed = {}) => { const data = { ...seed }; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data, get length() { return Object.keys(data).length; }, ...Object.fromEntries(Object.entries(data)) }; };

test('brand-new cabin opens the wizard; legacy or returning cabins do not', () => {
  assert.equal(m.isNewCabin(memory()), true);
  assert.equal(m.isNewCabin(memory({ 'flow-cabin-welcome-v1': 'seen' })), false);
  const legacy = m.readOnboarding(memory({ 'flow-cabin-welcome-v1': 'seen' }));
  assert.equal(legacy.status, 'done');
  assert.equal(m.shouldAutoOpen(legacy, { isNew: true }), false);
  assert.equal(m.shouldAutoOpen(m.initialState(), { isNew: true }), true);
  assert.equal(m.shouldAutoOpen(m.initialState(), { isNew: false }), false);
});

test('progress persists and resumes; skip and done never auto-open', () => {
  const store = memory();
  let s = m.next(m.start(m.initialState()));
  s = m.chooseSource(s, 'qq');
  m.writeOnboarding(store, s, 5);
  const back = m.readOnboarding(store);
  assert.deepEqual([back.status, back.step, back.source, back.updatedAt], ['active', 'source', 'qq', 5]);
  assert.equal(m.shouldAutoOpen(back), true);
  assert.equal(m.shouldAutoOpen(m.skip(back)), false);
  assert.equal(m.shouldAutoOpen(m.complete(back)), false);
  const again = m.reopen(m.complete(back));
  assert.deepEqual([again.status, again.step, again.source], ['active', 'welcome', 'qq']);
});

test('step navigation is clamped and visits every step in order', () => {
  let s = m.start(m.initialState()); const seen = [s.step];
  for (let i = 0; i < 10; i++) { s = m.next(s); if (seen.at(-1) !== s.step) seen.push(s.step); }
  assert.deepEqual(seen, m.STEPS);
  assert.equal(m.back(m.goTo(s, 'welcome')).step, 'welcome');
  assert.equal(m.goTo(s, 'nope'), s);
});

test('corrupt or hostile stored state is normalized', () => {
  const s = m.readOnboarding(memory({ [m.ONBOARDING_KEY]: '{"status":"x","step":"evil","source":"spotify","permissions":{"notifications":"granted","x":"yes"},"tested":"maybe"}' }));
  assert.deepEqual([s.status, s.step, s.source, s.permissions, s.tested], ['new', 'welcome', '', { notifications: 'granted' }, '']);
  assert.equal(m.readOnboarding(memory({ [m.ONBOARDING_KEY]: '{bad' })).status, 'new');
  const broken = { getItem() { throw new Error('denied'); } };
  assert.equal(m.readOnboarding(broken).status, 'skipped');
  assert.equal(m.isNewCabin(broken), false);
});

test('sources and permissions follow web / desktop / mac', () => {
  const web = m.sourceOptions({ desktop: false, mac: true });
  assert.deepEqual(web.filter((s) => s.available).map((s) => s.id), ['local']);
  assert.ok(web.find((s) => s.id === 'qq').reason.includes('桌面版'));
  assert.equal(m.sourceOptions({ desktop: true, mac: false }).some((s) => s.id === 'appleMusic'), false);
  assert.equal(m.sourceOptions({ desktop: true, mac: true }).find((s) => s.id === 'appleMusic').available, true);
  assert.deepEqual(m.permissionItems({ notifications: true }).map((p) => p.id), ['notifications']);
  assert.deepEqual(m.permissionItems({ notifications: true, desktop: true, mac: true }, 'appleMusic').map((p) => p.id), ['notifications', 'appleMusic', 'autostart']);
  assert.equal(m.providerFor('appleMusic'), 'appleMusic', 'Apple Music switches the deck to its own provider');
  assert.equal(m.sourceOptions({ desktop: true, mac: true }).find((s) => s.id === 'netease').label, '网易云音乐', 'names come from the provider table');
});

test('player adapter never pretends: missing or failing calls report honestly', async () => {
  const empty = createPlayerAdapter({ api: {}, env: { desktop: true } });
  assert.deepEqual(await empty.connectSource('qq'), { ok: false, error: '未知音源' });
  assert.deepEqual(await empty.getSourceStatus('qq'), { connected: false, detail: '暂时读不到状态' });
  assert.equal(await empty.requestPermission('appleMusic'), 'unsupported');
  assert.equal((await empty.testPlayback()).ok, false);
  assert.equal(await empty.qualities(), null, 'no request function, no quality list');
  assert.equal((await empty.listSources()).length, m.sourceOptions({ desktop: true }).length, 'falls back to the local table');
  const web = createPlayerAdapter({ api: {}, env: { desktop: false } });
  assert.equal((await web.connectSource('local')).fallback, 'add-album');
  assert.equal((await web.connectSource('netease')).ok, false);
  assert.equal(await web.requestPermission('autostart'), 'unsupported');
});

test('autostart asks the shell and maps its answer', async () => {
  const asked = [];
  const adapter = (answer) => createPlayerAdapter({ api: {}, env: { desktop: true }, autostart: async (enabled) => { asked.push(enabled); return answer; } });
  assert.equal(await adapter({ supported: true, enabled: true }).requestPermission('autostart'), 'granted');
  assert.equal(await adapter({ supported: true, enabled: false }).requestPermission('autostart'), 'denied');
  assert.equal(await adapter({ supported: false, enabled: false }).requestPermission('autostart'), 'unsupported');
  assert.deepEqual(asked, [true, true, true]);
});

test('autostart client sends the command and resolves with the shell event', async () => {
  const { setAutostart, getAutostart, AUTOSTART_EVENT } = await import('../desktop/autostart-client.mjs');
  const win = new EventTarget(), sent = [];
  const pending = setAutostart(false, { win, command: (name, params) => { sent.push([name, params]); win.cabinAutostart = { supported: true, enabled: false }; win.dispatchEvent(Object.assign(new Event(AUTOSTART_EVENT), { detail: win.cabinAutostart })); } });
  assert.deepEqual(await pending, { supported: true, enabled: false }); assert.deepEqual(sent, [['autostart', { enabled: false }]]);
  assert.deepEqual(getAutostart(win), { supported: true, enabled: false }); assert.deepEqual(getAutostart({}), { supported: false, enabled: false });
  assert.deepEqual(await setAutostart(true, { win: new EventTarget(), command: () => {}, timeoutMs: 5 }), { supported: false, enabled: false }, 'no shell answer reads as unsupported');
});

test('player adapter matches PR #15 sources.mjs shapes', async () => {
  const calls = [];
  // Shapes copied from docs/player.md 「音源接口」 on feat/seamless-playback.
  const api = {
    listSources: ({ mac }) => [{ id: 'qq', label: 'QQ 音乐', kind: 'account', login: true, supported: true }, { id: 'local', label: '本地音乐', kind: 'folder', login: false, supported: true }, { id: 'appleMusic', label: '系统 Apple Music', kind: 'system-app', login: false, platform: 'darwin', supported: mac }, { id: 'ma', label: 'Music Assistant', kind: 'server', supported: true }],
    connectSource: async (id) => { calls.push(['connect', id]); return { ok: false, cancelled: true, error: '' }; },
    getSourceStatus: async (id) => ({ id, supported: true, connected: true, detail: '已允许控制“音乐”App', needsPermission: false }),
    requestPermission: async () => ({ granted: true, needsPermission: false, available: true, error: '' }),
    testPlayback: async ({ provider }) => { calls.push(['test', provider]); return { ok: true, provider: 'qq', quality: '320k', title: '晴天' }; }
  };
  const real = createPlayerAdapter({ api, env: { desktop: true, mac: false }, request: async (path, body) => { calls.push([path, body]); return { quality: 'high', qualities: ['standard', 'high', 'lossless'] }; } });
  assert.deepEqual((await real.listSources()).map((s) => s.id), ['qq', 'local'], 'unsupported and Music Assistant are hidden');
  assert.deepEqual(await real.connectSource('qq'), { ok: false, cancelled: true, error: '已取消。' });
  assert.deepEqual(await real.connectSource('appleMusic'), { ok: true });
  assert.equal((await real.getSourceStatus('appleMusic')).connected, true);
  assert.equal(await real.requestPermission('appleMusic'), 'granted');
  const played = await real.testPlayback('qq');
  assert.equal(played.kind, 'track'); assert.equal(played.title, '晴天');
  assert.deepEqual(await real.qualities(), { options: [{ id: 'standard', label: 'standard' }, { id: 'high', label: 'high' }, { id: 'lossless', label: 'lossless' }], current: 'high' });
  assert.equal(await real.setQuality('lossless'), true);
  assert.deepEqual(calls.filter((c) => c[0] !== '/config'), [['connect', 'qq'], ['test', 'qq'], ['/quality', { quality: 'lossless' }]]);
  const mac = createPlayerAdapter({ api, env: { desktop: true, mac: true } });
  assert.equal((await mac.listSources()).find((s) => s.id === 'appleMusic').provider, 'appleMusic');
  const denied = createPlayerAdapter({ api: { requestPermission: async () => ({ granted: false, available: false }) }, env: { desktop: true } });
  assert.equal(await denied.requestPermission('appleMusic'), 'unsupported');
  const failing = createPlayerAdapter({ api: { connectSource: () => { throw new Error('网络错误'); } }, env: { desktop: true } });
  assert.deepEqual(await failing.connectSource('qq'), { ok: false, error: '网络错误' });
});

test('notification permission maps browser answers', async () => {
  const ask = (answer, permission = 'default') => createPlayerAdapter({ win: { Notification: { permission, requestPermission: async () => answer } } }).requestPermission('notifications');
  assert.equal(await ask('granted'), 'granted'); assert.equal(await ask('default'), 'skipped'); assert.equal(await ask('x', 'denied'), 'denied');
  assert.equal(await createPlayerAdapter({ win: {} }).requestPermission('notifications'), 'unsupported');
});

test('desktop adapter wraps the 沉入桌面 module and reports an unsupported reason', async () => {
  const calls = [], api = { getDesktopModeStatus: () => ({ active: false, supported: false, reason: '需要 macOS 13+' }), enterDesktopMode: () => calls.push('enter'), exitDesktopMode: () => { throw new Error('busy'); } };
  const real = createDesktopAdapter({ api });
  assert.deepEqual(await real.status(), { active: false, busy: false, supported: false, via: '', reason: '需要 macOS 13+' });
  assert.equal(await real.enter(), true); assert.deepEqual(calls, ['enter']); assert.equal(await real.exit(), false);
  assert.equal(typeof real.subscribe(() => {}), 'function', 'no change source still returns an unsubscribe');
  assert.equal(DESKTOP_MODE_EVENT, 'cabin:desktop-mode');
});

test('desktop adapter passes busy/via and prefers onDesktopModeChange', async () => {
  let cb, offed = false;
  const api = { getDesktopModeStatus: () => ({ active: true, busy: true, supported: true, via: 'wallpaper', reason: '' }), onDesktopModeChange: (f) => { cb = f; return () => { offed = true; }; } };
  const a = createDesktopAdapter({ api });
  assert.deepEqual(await a.status(), { active: true, busy: true, supported: true, via: 'wallpaper', reason: '' });
  let got; const off = a.subscribe((d) => { got = d; }); cb({ active: false }); assert.deepEqual(got, { active: false }); off(); assert.equal(offed, true);
});
