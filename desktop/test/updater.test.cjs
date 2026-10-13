'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
const { createUpdater, compareVersions, updateMode, assetName, cleanNotes, notesFromFeed } = require('../updater.cjs');
const pkg = require('../package.json');

test('version compare', () => {
  assert.equal(compareVersions('1.12.0', '1.11.0'), 1); assert.equal(compareVersions('v1.11.0', '1.11.0'), 0);
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1, 'numeric, not string');
  assert.equal(compareVersions('2.0.0-beta.1', '2.0.0'), -1); assert.equal(compareVersions('2.0.0', '2.0.0-beta.1'), 1);
  assert.equal(compareVersions('garbage', '1.0.0'), 0);
});
test('platform modes are honest', () => {
  assert.equal(updateMode({ platform: 'win32', isPackaged: true, env: {} }).mode, 'install');
  assert.match(updateMode({ platform: 'win32', isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'D:\\x' } }).reason, /便携版/);
  const mac = updateMode({ platform: 'darwin', isPackaged: true, env: {} });
  assert.equal(mac.mode, 'notify'); assert.match(mac.reason, /签名/);
  assert.equal(updateMode({ platform: 'win32', isPackaged: false }).mode, 'notify');
});
test('download names match what the release workflow builds', () => {
  const fill = (template, arch, ext) => template.replace('${version}', '1.12.0').replace('${arch}', arch).replace('${ext}', ext);
  assert.equal(assetName('1.12.0', { platform: 'darwin', arch: 'arm64' }), fill(pkg.build.mac.artifactName, 'arm64', 'dmg'));
  assert.equal(assetName('1.12.0', { platform: 'darwin', arch: 'x64' }), fill(pkg.build.mac.artifactName, 'x64', 'dmg'));
  assert.equal(assetName('1.12.0', { platform: 'win32' }), fill(pkg.build.win.artifactName, 'x64', 'exe'));
  assert.equal(assetName('1.12.0', { platform: 'win32', portable: true }), fill(pkg.build.portable.artifactName, 'x64', 'exe'));
  assert.deepEqual(pkg.build.win.target.map((t) => t.arch), [['x64'], ['x64']], 'Windows builds are x64 only');
  assert.equal(assetName('1.12.0', { platform: 'linux' }), '');
});
test('build config publishes to GitHub so update info is generated', () => {
  assert.deepEqual(pkg.build.publish, [{ provider: 'github', owner: 'ooooooomygosh', repo: 'album-web', releaseType: 'release' }]);
  assert.ok(pkg.build.mac.target.includes('zip'), 'Squirrel.Mac / latest-mac.yml need the zip');
  assert.ok(pkg.build.files.includes('updater.cjs')); assert.ok(pkg.dependencies['electron-updater']);
});

function fakeAutoUpdater(version, { fail = false } = {}) {
  const u = new EventEmitter(); u.calls = [];
  u.checkForUpdates = async () => { u.calls.push('check'); if (fail) throw new Error('getaddrinfo ENOTFOUND github.com'); return { updateInfo: { version, releaseNotes: '<p>新功能</p>' } }; };
  u.downloadUpdate = async () => { u.calls.push('download'); u.emit('download-progress', { percent: 42.4 }); u.emit('update-downloaded', { version }); };
  u.quitAndInstall = () => u.calls.push('install');
  return u;
}
const store = (value = true) => { let v = value; return { get: () => v, set: (x) => { v = x; } }; };
test('Windows installer: check → available → auto download → downloaded; install only on click', async () => {
  const states = [], u = fakeAutoUpdater('1.12.0');
  const up = createUpdater({ currentVersion: '1.11.0', platform: 'win32', isPackaged: true, env: {}, autoUpdater: u, settings: store(true), onState: (s) => states.push(s.status) });
  assert.equal(u.autoDownload, false); assert.equal(u.autoInstallOnAppQuit, true);
  await up.check({ manual: true }); await new Promise((r) => setImmediate(r));
  assert.equal(up.state.status, 'downloaded'); assert.equal(up.state.notes, '新功能');
  assert.deepEqual([...new Set(states)], ['checking', 'available', 'downloading', 'downloaded']);
  assert.ok(!u.calls.includes('install'), 'never restarts on its own');
  assert.equal(up.install(), true); assert.deepEqual(u.calls, ['check', 'download', 'install']);
});
test('automatic download off: waits for the user', async () => {
  const u = fakeAutoUpdater('1.12.0'), settings = store(false);
  const up = createUpdater({ currentVersion: '1.11.0', platform: 'win32', isPackaged: true, env: {}, autoUpdater: u, settings });
  await up.check(); assert.equal(up.state.status, 'available'); assert.deepEqual(u.calls, ['check']);
  await up.download(); assert.equal(up.state.status, 'downloaded');
  up.setAutoDownload(true); assert.equal(settings.get(), true);
});
test('latest and network errors', async () => {
  const same = createUpdater({ currentVersion: '1.12.0', platform: 'win32', isPackaged: true, env: {}, autoUpdater: fakeAutoUpdater('1.12.0') });
  assert.equal((await same.check()).status, 'latest');
  const down = createUpdater({ currentVersion: '1.11.0', platform: 'win32', isPackaged: true, env: {}, autoUpdater: fakeAutoUpdater('1.12.0', { fail: true }) });
  const s = await down.check(); assert.equal(s.status, 'error'); assert.match(s.error, /无法连接 GitHub/);
});
const RELEASES = 'https://github.com/ooooooomygosh/album-web/releases';
const feed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Release notes from album-web</title>
  <entry><id>tag:github.com,2008:Repository/1/v1.12.0</id><link rel="alternate" type="text/html" href="${RELEASES}/tag/v1.12.0"/><title>v1.12.0</title>
    <content type="html">&lt;h2&gt;新版本&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;唱片 &amp;amp; 小猫&lt;/li&gt;&lt;li&gt;修复&lt;/li&gt;&lt;/ul&gt;</content></entry>
  <entry><id>tag:github.com,2008:Repository/1/v1.11.0</id><link rel="alternate" type="text/html" href="${RELEASES}/tag/v1.11.0"/><content type="html">&lt;p&gt;旧&lt;/p&gt;</content></entry></feed>`;
// github.com only: /releases/latest (JSON) and the releases feed. Never api.github.com.
function fakeGitHub({ latest = { status: 200, body: { tag_name: 'v1.12.0' } }, atom = { status: 200, body: feed } } = {}) {
  const urls = [];
  const fetch = async (url, options) => {
    urls.push(String(url));
    if (url === `${RELEASES}/latest`) { assert.equal(options.headers.Accept, 'application/json'); return typeof latest === 'function' ? latest() : new Response(JSON.stringify(latest.body), { status: latest.status }); }
    if (url === `${RELEASES}.atom`) return new Response(atom.body, { status: atom.status });
    throw new Error('unexpected ' + url);
  };
  return { fetch, urls };
}
test('unsigned macOS and portable: notify + open the right download, never install', async () => {
  const opened = [], gh = fakeGitHub();
  const up = createUpdater({ currentVersion: '1.11.0', platform: 'darwin', arch: 'arm64', isPackaged: true, env: {}, autoUpdater: fakeAutoUpdater('9.9.9'), fetch: gh.fetch, openExternal: async (url) => opened.push(url) });
  const s = await up.check(); assert.equal(s.status, 'available'); assert.equal(s.mode, 'notify');
  assert.equal(s.downloadUrl, `${RELEASES}/download/v1.12.0/FlowCabin-1.12.0-mac-arm64.dmg`);
  assert.equal(s.releaseUrl, `${RELEASES}/tag/v1.12.0`); assert.equal(s.notes, '新版本\n- 唱片 & 小猫\n- 修复');
  await up.download(); assert.deepEqual(opened, [s.downloadUrl]); assert.equal(up.install(), false);
  const portable = createUpdater({ currentVersion: '1.11.0', platform: 'win32', isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'D:\\x' }, fetch: fakeGitHub().fetch });
  assert.equal((await portable.check()).downloadUrl, `${RELEASES}/download/v1.12.0/FlowCabin-1.12.0-x64-portable.exe`);
  assert.ok(gh.urls.every((url) => url.startsWith('https://github.com/')), 'never the rate-limited API');
});
test('the check survives a missing feed, falls back to the redirect, and reports limits plainly', async () => {
  const noFeed = createUpdater({ currentVersion: '1.11.0', platform: 'darwin', arch: 'x64', isPackaged: true, env: {}, fetch: fakeGitHub({ atom: { status: 429, body: '' } }).fetch });
  const s = await noFeed.check(); assert.equal(s.status, 'available'); assert.equal(s.notes, ''); assert.match(s.downloadUrl, /mac-x64\.dmg$/);
  const redirected = { ok: true, status: 200, url: `${RELEASES}/tag/v1.13.0`, json: async () => { throw new SyntaxError('HTML'); } };
  const viaUrl = createUpdater({ currentVersion: '1.11.0', platform: 'darwin', arch: 'arm64', isPackaged: true, env: {}, fetch: fakeGitHub({ latest: () => redirected }).fetch });
  assert.equal((await viaUrl.check()).latestVersion, '1.13.0');
  const same = createUpdater({ currentVersion: '1.12.0', platform: 'darwin', isPackaged: true, env: {}, fetch: fakeGitHub().fetch });
  assert.equal((await same.check()).status, 'latest');
  for (const status of [403, 429]) {
    const limited = createUpdater({ currentVersion: '1.11.0', platform: 'darwin', isPackaged: true, env: {}, fetch: fakeGitHub({ latest: { status, body: {} } }).fetch });
    assert.match((await limited.check()).error, /限制了请求次数/);
  }
  const missing = createUpdater({ currentVersion: '1.11.0', platform: 'darwin', isPackaged: true, env: {}, fetch: fakeGitHub({ latest: { status: 404, body: {} } }).fetch });
  assert.match((await missing.check()).error, /还没发布/);
});
test('electron-updater errors are classified by status, not by stray digits', async () => {
  const failing = (message) => { const u = fakeAutoUpdater('1.12.0'); u.checkForUpdates = async () => { throw new Error(message); }; return createUpdater({ currentVersion: '1.11.0', platform: 'win32', isPackaged: true, env: {}, autoUpdater: u }); };
  assert.match((await failing('Unable to find latest version on GitHub (https://github.com/o/r/releases/latest), please ensure a production release exists: HttpError: 429 Too Many Requests').check()).error, /限制了请求次数/);
  assert.match((await failing('Cannot parse releases feed: content-length: 14030').check()).error, /^检查更新失败/);
  assert.equal(notesFromFeed(feed, 'v1.11.0'), '旧'); assert.equal(notesFromFeed(feed, 'v9.0.0'), ''); assert.equal(notesFromFeed('<html>', 'v1.12.0'), '');
});
test('startup check is delayed, then every 6 hours; notes are plain text', () => {
  const calls = [];
  const timers = { setTimeout: (fn, ms) => { calls.push(['timeout', ms]); return 1; }, setInterval: (fn, ms) => { calls.push(['interval', ms]); return 2; }, clearTimeout() {}, clearInterval() {} };
  createUpdater({ currentVersion: '1.0.0', timers }).start();
  assert.deepEqual(calls, [['timeout', 20000], ['interval', 6 * 60 * 60 * 1000]]);
  assert.equal(cleanNotes([{ note: '<b>a</b>' }, { note: 'b' }]), 'a\nb');
});
test('macOS update info from both arch jobs merges into one latest-mac.yml', async () => {
  const { parseUpdateInfo, mergeUpdateInfo, stringifyUpdateInfo } = await import('../../scripts/merge-mac-update-info.mjs');
  const yml = (arch) => `version: 1.12.0\nfiles:\n  - url: FlowCabin-1.12.0-mac-${arch}.zip\n    sha512: abc${arch}+/=\n    size: 100\n    blockMapSize: 9\n  - url: FlowCabin-1.12.0-mac-${arch}.dmg\n    sha512: def\n    size: 200\npath: FlowCabin-1.12.0-mac-${arch}.zip\nsha512: abc${arch}+/=\nreleaseDate: '2026-10-10T10:0${arch === 'x64' ? 1 : 0}:00.000Z'\n`;
  const merged = mergeUpdateInfo([parseUpdateInfo(yml('arm64')), parseUpdateInfo(yml('x64'))]);
  assert.equal(merged.files.length, 4); assert.equal(merged.path, 'FlowCabin-1.12.0-mac-x64.zip');
  const again = parseUpdateInfo(stringifyUpdateInfo(merged));
  assert.deepEqual(again.files.map((f) => f.url), merged.files.map((f) => f.url)); assert.equal(again.releaseDate, '2026-10-10T10:01:00.000Z'); assert.equal(again.files[0].size, '100');
  assert.throws(() => mergeUpdateInfo([parseUpdateInfo(yml('arm64'))]), /both/);
  assert.throws(() => mergeUpdateInfo([parseUpdateInfo(yml('arm64')), parseUpdateInfo(yml('x64').replace('1.12.0', '1.12.1'))]), /differ/);
});
