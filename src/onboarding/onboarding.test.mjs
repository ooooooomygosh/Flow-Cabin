import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as m from './onboarding-model.mjs';
import { createPlayerAdapter } from './onboarding-adapter.mjs';
import { RELEASES, compareVersions, releasesBetween } from './releases.mjs';
import { inputTotal, typingPermissionVerdict } from './input-companion.mjs';
import { normalizeInputStats } from '../desktop/useInputStats.js';

const memory = (seed = {}) => { const data = { ...seed }; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data, get length() { return Object.keys(data).length; }, ...Object.fromEntries(Object.entries(data)) }; };

test('brand-new cabin opens the full guide; same-version cabins stay closed', () => {
  assert.equal(m.isNewCabin(memory()), true);
  assert.equal(m.isNewCabin(memory({ 'flow-cabin-welcome-v1': 'seen' })), false);
  const legacy = m.readOnboarding(memory({ 'flow-cabin-welcome-v1': 'seen' }));
  assert.equal(legacy.status, 'done');
  assert.equal(m.launchPlan(legacy, { isNew: true, currentVersion: '1.17.0' }).open, false);
  assert.equal(m.launchPlan(legacy, { isNew: true, currentVersion: '1.20.0' }).open, true);
  assert.equal(m.launchPlan(m.initialState(), { isNew: true, currentVersion: '1.21.0' }).mode, 'first-run');
  assert.equal(m.launchPlan(m.initialState(), { isNew: false, currentVersion: '1.21.0' }).open, false);
  const seen = { ...m.initialState(), status: 'done', step: 'done', seenVersion: '1.21.0' };
  assert.equal(m.launchPlan(seen, { currentVersion: '1.21.0' }).open, false);
  assert.equal(m.launchPlan(seen, { currentVersion: '1.22.0' }).mode, 'update');
});

test('progress persists and resumes; skip and done never auto-open', () => {
  const store = memory();
  let s = m.next(m.start(m.initialState()));
  s = m.chooseSource(s, 'qq');
  m.writeOnboarding(store, s, 5);
  const back = m.readOnboarding(store);
  assert.deepEqual([back.status, back.step, back.source, back.updatedAt], ['active', 'room', 'qq', 5]);
  assert.equal(m.shouldAutoOpen(back), true);
  assert.equal(m.launchPlan(back, { currentVersion: '1.21.0' }).mode, 'resume');
  assert.equal(m.shouldAutoOpen(m.skip(back, '1.21.0'), { currentVersion: '1.21.0' }), false);
  assert.equal(m.shouldAutoOpen(m.complete(back, '1.21.0'), { currentVersion: '1.21.0' }), false);
  const again = m.reopen(m.complete(back, '1.21.0'));
  assert.deepEqual([again.status, again.step, again.source], ['active', 'source', 'qq']);
});

test('the first-run guide is three steps and its last step is the finish line', () => {
  assert.deepEqual(m.STEPS, ['source', 'room', 'test']);
  assert.deepEqual(m.STEPS.map((id) => m.STEP_LABELS[id]), ['音源', '房间与伙伴', '试听']);
  assert.equal(m.initialState().step, 'source');
  assert.equal(m.isLastStep('test'), true);
  assert.equal(m.isLastStep('room'), false);
  assert.equal(m.complete(m.start(m.initialState()), '2.2.0').step, 'test');
});

test('steps saved by the six-step guide resume at the closest three-step step', () => {
  const read = (step, extra = {}) => m.readOnboarding(memory({ [m.ONBOARDING_KEY]: JSON.stringify({ version: 2, status: 'active', step, ...extra }) }));
  assert.equal(read('welcome').step, 'source');
  assert.equal(read('updates').step, 'source');
  assert.equal(read('permissions').step, 'room');
  assert.equal(read('done').step, 'test');
  assert.equal(read('room').step, 'room');
});

test('a version gap opens the 新功能 sheet once and lists every skipped release', () => {
  const old = { ...m.initialState(), status: 'done', step: 'test', seenVersion: '1.18.0' };
  const plan = m.launchPlan(old, { currentVersion: '1.21.0' });
  assert.deepEqual(plan, { open: true, mode: 'update' });
  let state = m.applyLaunchPlan(old, plan, '1.21.0');
  assert.deepEqual([state.status, state.fromVersion, state.seenVersion], ['done', '1.18.0', '1.18.0'], 'an update is not a walkthrough: the guide stays finished');
  assert.deepEqual(m.updateContext(state, '1.21.0').releases.map((release) => release.version), ['1.21.0', '1.20.0', '1.19.0']);
  assert.deepEqual(m.launchPlan(state, { currentVersion: '1.21.0' }), { open: true, mode: 'update' }, 'quitting before 知道了 shows the same sheet next time');
  assert.equal(m.applyLaunchPlan(state, plan, '1.21.0').fromVersion, '1.18.0', 'the second showing compares against the same version');
  state = m.dismissUpdate(state, '1.21.0');
  assert.deepEqual([state.status, state.fromVersion, state.seenVersion], ['done', '', '1.21.0']);
  assert.equal(m.launchPlan(state, { currentVersion: '1.21.0' }).open, false);

  const skipped = m.dismissUpdate(m.startUpdate({ ...old, status: 'skipped' }, '1.22.0'), '1.22.0');
  assert.deepEqual([skipped.status, skipped.seenVersion], ['skipped', '1.22.0'], 'a skipped guide stays skipped');
  assert.deepEqual(m.updateContext({ ...old, seenVersion: '1.17.0' }, '1.21.0').releases.map((release) => release.version), ['1.21.0', '1.20.0', '1.19.0', '1.18.0']);
});

test('a 2.1 update walkthrough closed half-way becomes the 新功能 sheet', () => {
  const interrupted = m.readOnboarding(memory({ [m.ONBOARDING_KEY]: JSON.stringify({ version: 2, status: 'active', step: 'permissions', fromVersion: '1.18.0', seenVersion: '1.18.0' }) }));
  const plan = m.launchPlan(interrupted, { currentVersion: '1.21.0' });
  assert.deepEqual(plan, { open: true, mode: 'update' });
  const state = m.applyLaunchPlan(interrupted, plan, '1.21.0');
  assert.deepEqual([state.status, state.fromVersion], ['done', '1.18.0']);
  assert.equal(m.launchPlan(m.dismissUpdate(state, '1.21.0'), { currentVersion: '1.21.0' }).open, false);
});

test('one completed version never auto-opens again; the next version opens once', () => {
  const latest = RELEASES[0].version;
  let state = m.complete({ ...m.initialState(), status: 'active', step: 'test', seenVersion: '1.18.0' }, latest);
  for (let launch = 0; launch < 3; launch++) assert.equal(m.launchPlan(state, { currentVersion: latest }).open, false);
  const plan = m.launchPlan(state, { currentVersion: '9.9.9' });
  assert.deepEqual(plan, { open: true, mode: 'update' });
  const opened = m.applyLaunchPlan(state, plan, '9.9.9');
  assert.deepEqual([opened.status, opened.fromVersion, opened.seenVersion], ['done', latest, latest]);
  assert.equal(m.updateContext(opened, '9.9.9').releases.length, 0, 'no release card exists yet for an unreleased version');
  assert.equal(m.dismissUpdate(opened, 'v9.9.9').seenVersion, '9.9.9', 'stored versions drop the leading v');
  assert.equal(m.complete(opened, 'v9.9.9').seenVersion, '9.9.9');
});

test('a completed pre-versioning cabin sees the full companion arc from 1.18', () => {
  const legacy = m.readOnboarding(memory({ 'flow-cabin-welcome-v1': 'seen' }));
  assert.equal(legacy.seenVersion, '1.17.0');
  const plan = m.launchPlan(legacy, { currentVersion: '1.21.0' });
  assert.equal(plan.mode, 'update');
  const state = m.startUpdate(legacy, '1.21.0');
  assert.deepEqual(m.updateContext(state, '1.21.0').releases.map((release) => release.version), ['1.21.0', '1.20.0', '1.19.0', '1.18.0']);
});

test('release notes are ordered, unique, and cover the build version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(RELEASES[0].version, pkg.version, 'the newest release card matches the app version');
  assert.equal(new Set(RELEASES.map((release) => release.version)).size, RELEASES.length);
  for (let i = 1; i < RELEASES.length; i++) assert.ok(compareVersions(RELEASES[i - 1].version, RELEASES[i].version) > 0);
  assert.deepEqual(releasesBetween('1.21.0', '1.21.0'), []);
  assert.deepEqual(releasesBetween('1.22.0', '1.21.0'), []);
});

test('step navigation is clamped and visits every step in order', () => {
  let s = m.start(m.initialState()); const seen = [s.step];
  for (let i = 0; i < 10; i++) { s = m.next(s); if (seen.at(-1) !== s.step) seen.push(s.step); }
  assert.deepEqual(seen, m.STEPS);
  assert.equal(m.back(m.goTo(s, 'source')).step, 'source');
  assert.equal(m.goTo(s, 'welcome'), s, 'retired steps are not navigable');
  assert.equal(m.goTo(s, 'nope'), s);
});

test('corrupt or hostile stored state is normalized', () => {
  const s = m.readOnboarding(memory({ [m.ONBOARDING_KEY]: '{"status":"x","step":"evil","source":"spotify","permissions":{"notifications":"granted","x":"yes"},"tested":"maybe"}' }));
  assert.deepEqual([s.status, s.step, s.source, s.permissions, s.tested], ['new', 'source', '', { notifications: 'granted' }, '']);
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
  assert.deepEqual(m.permissionItems({ notifications: true, desktop: true, mac: true }, 'appleMusic').map((p) => p.id), ['typing', 'notifications', 'appleMusic', 'autostart']);
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

test('typing companion talks to the shell and reads only the published counters', async () => {
  const win = new EventTarget(), sent = [];
  win.albumInputStats = { enabled: false, status: 'off', permission: 'needs-permission', today: { keyboard: 0, click: 0, total: 0 } };
  const command = (name, params) => {
    sent.push([name, params]);
    setTimeout(() => {
      if (name === 'typing-follow') win.albumInputStats = { ...win.albumInputStats, enabled: params.enabled, status: params.enabled ? 'needs-permission' : 'off' };
      if (name === 'typing-permission') win.albumInputStats = { ...win.albumInputStats, enabled: true, status: 'active', permission: 'granted', today: { keyboard: 1, click: 0, total: 1 } };
    }, 0);
  };
  const mac = createPlayerAdapter({ api: {}, env: { desktop: true, mac: true }, win, command });
  assert.equal(mac.typingStatus().enabled, false);
  assert.equal((await mac.setTypingFollow(true)).enabled, true);
  assert.equal(await mac.requestPermission('typing'), 'granted');
  assert.deepEqual(sent, [['typing-follow', { enabled: true }], ['typing-permission', undefined]]);
  assert.equal(mac.typingStatus().today.keyboard, 1);

  const web = createPlayerAdapter({ api: {}, env: { desktop: false }, win, command: (name) => sent.push([name]) });
  assert.equal(await web.requestPermission('typing'), 'unsupported');
  assert.equal(await web.setTypingFollow(true), null);
});

test('published keyboard and click counters normalize into the shape the UI reads', () => {
  const stats = normalizeInputStats({
    enabled: true, status: 'active', permission: 'granted', platform: 'darwin',
    today: { keyboard: 123, click: '45' },
    total: { keyboard: 1234, click: 456, total: 1690 },
    week: [
      { key: '2026-10-12', keyboard: 1, click: 2 },
      { key: '2026-10-13', keyboard: 3, click: 4 },
      { key: '2026-10-14', keyboard: 5, click: 6 },
      { key: '2026-10-15', keyboard: 7, click: 8 },
      { key: '2026-10-16', keyboard: 9, click: 10 },
      { key: '2026-10-17', keyboard: 11, click: 12 },
      { key: '2026-10-18', keyboard: 13, click: 14 },
      { key: '2026-10-19', keyboard: 15, click: 16 }
    ],
    activeDays: 7, streak: 4
  });
  assert.deepEqual(stats.today, { keyboard: 123, click: 45, total: 168 });
  assert.deepEqual(stats.total, { keyboard: 1234, click: 456, total: 1690 });
  assert.equal(stats.week.length, 7, 'the chart keeps the latest seven days');
  assert.deepEqual(stats.week.at(-1), { key: '2026-10-19', keyboard: 15, click: 16, total: 31 });
  assert.deepEqual([stats.activeDays, stats.streak, stats.status, stats.permission], [7, 4, 'active', 'granted']);
  assert.equal(normalizeInputStats(null), null);
  assert.equal(normalizeInputStats({ status: 'off' }), null);
  assert.deepEqual(normalizeInputStats({ today: { keyboard: -1, click: 2.6 } }).today, { keyboard: 0, click: 3, total: 3 });
});

test('macOS permission confirmation stays pending until an input is actually heard', () => {
  const mac = { mac: true }, win = { mac: false };
  assert.equal(typingPermissionVerdict({ status: 'needs-permission', today: { keyboard: 0, click: 0 } }, { enabled: true, env: mac }), 'pending');
  assert.equal(typingPermissionVerdict({ status: 'active', today: { keyboard: 0, click: 0 } }, { enabled: true, env: mac }), 'pending');
  assert.equal(typingPermissionVerdict({ status: 'active', today: { keyboard: 1, click: 0 } }, { enabled: true, env: mac }), 'granted');
  assert.equal(typingPermissionVerdict({ status: 'active', today: { keyboard: 0, click: 0 } }, { enabled: true, env: mac, heard: 2 }), 'granted');
  assert.equal(typingPermissionVerdict({ status: 'active', today: { keyboard: 0, click: 0 } }, { enabled: true, env: win }), 'granted');
  assert.equal(typingPermissionVerdict(null, { enabled: false, env: mac }), 'skipped');
  assert.equal(inputTotal({ today: { keyboard: 2, click: 3 } }), 5, 'a missing total falls back to keyboard + click');
  assert.equal(inputTotal({ today: { keyboard: 2, click: 3, total: 0 } }), 5, 'a zero stale total does not hide real counts');
});

test('重新检测 waits for the shell\'s fresh permission answer', async () => {
  const win = new EventTarget();
  win.albumInputStats = { enabled: true, status: 'needs-permission', permission: 'needs-permission', today: { keyboard: 0, click: 0, total: 0 } };
  const adapter = createPlayerAdapter({
    api: {}, env: { desktop: true, mac: true }, win,
    command: (name) => {
      if (name !== 'typing-check') return;
      setTimeout(() => { win.albumInputStats = { ...win.albumInputStats, status: 'active', permission: 'granted' }; }, 120);
    }
  });
  const value = await adapter.checkTypingPermission();
  assert.equal(value.status, 'active');
  assert.equal(value.permission, 'granted');
});

// Settings › 显示与桌面 drives 沉入桌面 with the room's own sink state; there is no adapter for it any more.
test('quality: one path that tells the deck, and the standard tiers when the server lists none', async () => {
  const win = new EventTarget(), heard = [], sent = [];
  win.addEventListener('album-music-settings', () => heard.push('settings'));
  const adapter = createPlayerAdapter({ api: {}, env: { desktop: true }, win, request: async (path, body) => { sent.push([path, body]); if (path === '/quality' && body.quality === 'bad') throw new Error('no'); return { quality: '', qualities: [] }; } });
  assert.deepEqual((await adapter.qualities()).options.map((q) => q.id), ['standard', 'exhigh', 'lossless']);
  assert.equal(await adapter.setQuality('lossless'), true); assert.deepEqual(heard, ['settings'], 'a saved tier reaches the deck');
  assert.equal(await adapter.setQuality('bad'), false); assert.deepEqual(heard, ['settings'], 'a refused tier changes nothing');
  assert.equal(await createPlayerAdapter({ api: {}, env: { desktop: true } }).setQuality('lossless'), false, 'no music server, no change');
  assert.equal(await createPlayerAdapter({ api: {}, env: { desktop: false }, request: async () => ({ qualities: ['x'] }) }).qualities(), null, 'web has no quality choice');
});
