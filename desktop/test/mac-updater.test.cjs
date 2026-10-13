'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createMacUpdater, parseMacUpdateInfo, zipName, INSTALL_SCRIPT } = require('../mac-updater.cjs');
const { createUpdater, updateMode } = require('../updater.cjs');

const RELEASES = 'https://github.com/ooooooomygosh/album-web/releases';
const sha = (buffer) => crypto.createHash('sha512').update(buffer).digest('base64');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-mac-'));
const yml = (version, files) => `version: ${version}\nfiles:\n${files.map((f) => `  - url: ${f.url}\n    sha512: ${f.sha512}\n    size: ${f.size}\n    blockMapSize: 9`).join('\n')}\npath: ${files[0].url}\nsha512: ${files[0].sha512}\nreleaseDate: '2026-10-13T12:00:00.000Z'\n`;

// A fake GitHub serving one release, a fake ditto that "unpacks" an Info.plist,
// a fake plutil that reads it, and a recorded spawn.
function harness({ version = '1.14.2', arch = 'arm64', zip = Buffer.from('zip-bytes-'.repeat(5000)), tamper = false, unpackedVersion = version, unpackedId = 'com.albumcircle.desktop', writable = true, bundlePath, executable = 'Cabin', signed = true, streamMode = '', shortWrites = false, corruptWrites = false } = {}) {
  const directory = tmp(), apps = tmp(), app = new EventEmitter(); app.quit = () => { app.quitCalled = true; };
  app.getVersion = () => '1.14.1';
  const bundle = bundlePath || path.join(apps, '心流小屋.app');
  fs.mkdirSync(path.join(bundle, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: '1.14.1', CFBundleIdentifier: 'com.albumcircle.desktop' }));
  const files = ['arm64', 'x64'].map((a) => ({ url: zipName(version, a), sha512: sha(zip), size: zip.length }));
  const requests = [], spawned = [], nativeCalls = []; let cancelled = false;
  const fetch = async (url) => {
    requests.push(String(url));
    if (url === `${RELEASES}/latest`) return new Response(JSON.stringify({ tag_name: `v${version}` }), { status: 200 });
    if (url === `${RELEASES}/download/v${version}/latest-mac.yml`) return new Response(yml(version, files), { status: 200 });
    if (url === `${RELEASES}.atom`) return new Response('', { status: 404 });
    if (url === `${RELEASES}/download/v${version}/${zipName(version, arch)}`) {
      if (streamMode) return new Response(new ReadableStream({ start(c) { c.enqueue(zip.subarray(0, 20)); }, pull(c) { if (streamMode === 'error') c.error(new Error('stream failed')); }, cancel() { cancelled = true; } }));
      return new Response(tamper ? Buffer.concat([zip, Buffer.from('x')]) : zip, { status: 200 });
    }
    return new Response('', { status: 404 });
  };
  const plistOf = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const execFileProcess = (file, args, options, done) => {
    nativeCalls.push([file, args]);
    if (file === '/usr/bin/ditto') { const copy = path.join(args[3], '心流小屋.app', 'Contents'); fs.mkdirSync(copy, { recursive: true }); fs.writeFileSync(path.join(copy, 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: unpackedVersion, CFBundleIdentifier: unpackedId, CFBundleExecutable: executable })); if (executable && !/[\\/]/.test(executable)) { fs.mkdirSync(path.join(copy,'MacOS')); fs.writeFileSync(path.join(copy,'MacOS',executable), 'fixture executable', { mode: 0o755 }); } return done(null, ''); }
    if (file === '/usr/bin/plutil') return done(null, String(plistOf(args[5])[args[1]] || ''));
    if (file === '/usr/bin/codesign') return done(signed ? null : new Error('invalid signature'), '');
    done(new Error('unexpected ' + file));
  };
  const execFileSyncProcess = (file, args) => String(plistOf(args[5])[args[1]] || '');
  let fsModule = writable ? fs : { ...fs, accessSync: () => { throw new Error('EACCES'); } };
  if (shortWrites || corruptWrites) fsModule = { ...fsModule, promises: { ...fs.promises, open: async (...args) => { const handle = await fs.promises.open(...args); return { close: () => handle.close(), write: chunk => handle.write(corruptWrites ? Buffer.alloc(chunk.length) : chunk.subarray(0, 100)) }; } } };
  const mac = createMacUpdater({ app, fetch, platform: 'darwin', arch, bundlePath: bundle, directory, pid: 4242, execFileProcess, execFileSyncProcess, fsModule, downloadTimeoutMs: streamMode === 'stall' ? 50 : 120000, spawnProcess: (file, args, options) => { spawned.push({ file, args, options }); return { unref() {} }; } });
  return { mac, app, bundle, directory, requests, spawned, files, nativeCalls, get cancelled() { return cancelled; } };
}

test('latest-mac.yml: both architectures, quoted values, nothing else picked up', () => {
  const info = parseMacUpdateInfo("version: '1.14.2'\nfiles:\n  - url: FlowCabin-1.14.2-mac-arm64.zip\n    sha512: abc==\n    size: 10\n  - url: FlowCabin-1.14.2-mac-x64.zip\n    sha512: def==\n    size: '20'\npath: FlowCabin-1.14.2-mac-x64.zip\nsha512: def==\n");
  assert.equal(info.version, '1.14.2');
  assert.deepEqual(info.files, [{ url: 'FlowCabin-1.14.2-mac-arm64.zip', sha512: 'abc==', size: 10 }, { url: 'FlowCabin-1.14.2-mac-x64.zip', sha512: 'def==', size: 20 }]);
  assert.equal(zipName('1.14.2', 'arm64'), 'FlowCabin-1.14.2-mac-arm64.zip'); assert.equal(zipName('1.14.2', 'x64'), 'FlowCabin-1.14.2-mac-x64.zip');
});

test('only an installed, writable copy updates itself; the reason says what to do', () => {
  assert.equal(harness().mac.canSelfUpdate().ok, true);
  // macOS paths are always POSIX, also when this test runs on Windows CI.
  const translocated = createMacUpdater({ platform: 'darwin', bundlePath: '/private/var/folders/x/T/AppTranslocation/ABC/d/心流小屋.app', directory: tmp() });
  assert.match(translocated.canSelfUpdate().reason, /应用程序/);
  const dmg = createMacUpdater({ platform: 'darwin', bundlePath: '/Volumes/心流小屋/心流小屋.app', directory: tmp() });
  assert.match(dmg.canSelfUpdate().reason, /拖到「应用程序」/);
  assert.match(harness({ writable: false }).mac.canSelfUpdate().reason, /没有权限/);
  assert.match(harness().mac.canSelfUpdate({ isPackaged: false }).reason, /开发版/);
  assert.equal(createMacUpdater({ platform: 'win32', bundlePath: 'C:/x', directory: tmp() }).canSelfUpdate().ok, false);
  assert.equal(updateMode({ platform: 'darwin', isPackaged: true, macUpdatable: { ok: true } }).mode, 'install');
  assert.deepEqual(updateMode({ platform: 'darwin', isPackaged: true, macUpdatable: { ok: false, reason: 'why' } }), { mode: 'notify', reason: 'why' });
});

test('check → verified download → unpacked copy checked → install script spawned on click', async () => {
  const h = harness();
  const found = await h.mac.checkForUpdates();
  assert.equal(found.updateInfo.version, '1.14.2');
  const progress = []; h.mac.on('download-progress', (p) => progress.push(p.percent));
  let downloaded = null; h.mac.on('update-downloaded', (info) => { downloaded = info; });
  await h.mac.downloadUpdate();
  assert.deepEqual(downloaded, { version: '1.14.2' }); assert.equal(progress.at(-1), 100); assert.ok(progress.length >= 2);
  assert.deepEqual(fs.readdirSync(h.directory), ['staged-1.14.2'], 'the zip is removed once unpacked');
  assert.ok(h.requests.every((url) => url.startsWith('https://github.com/')), 'never the rate-limited API');
  h.mac.quitAndInstall();
  assert.equal(h.app.quitCalled, true);
  const [call] = h.spawned;
  assert.equal(call.file, '/bin/sh'); assert.equal(call.options.detached, true);
  assert.deepEqual(call.args.slice(1, 4), ['4242', h.bundle, path.join(h.directory, 'staged-1.14.2', '心流小屋.app')]);
  assert.match(path.basename(call.args[4]), /^\.心流小屋\.app\.previous-[a-f0-9]{24}$/);
  assert.deepEqual(call.args.slice(5), ['1', '/usr/bin/open', path.join(h.directory, 'install-status'), '1.14.1', '/usr/bin/plutil']);
  assert.ok(h.nativeCalls.some(([file,args]) => file === '/usr/bin/codesign' && args.slice(0,3).join(' ') === '--verify --deep --strict'));
  assert.equal(h.nativeCalls.some(([file]) => file === '/usr/bin/xattr'), false);
  assert.equal(fs.readFileSync(call.args[0], 'utf8'), INSTALL_SCRIPT, 'the script is fixed text; paths only arrive as arguments');
  h.app.emit('will-quit'); assert.equal(h.spawned.length, 1, 'quitting after 「重启安装」 does not start a second install');
});

test('without a click the update installs quietly when the app quits, and not at all when switched off', async () => {
  const h = harness(); await h.mac.checkForUpdates(); await h.mac.downloadUpdate();
  h.app.emit('will-quit');
  assert.equal(h.spawned.length, 1); assert.equal(h.spawned[0].args[5], '0', 'no relaunch on a normal quit');
  const off = harness(); await off.mac.checkForUpdates(); await off.mac.downloadUpdate();
  off.mac.autoInstallOnAppQuit = false; off.app.emit('will-quit'); assert.equal(off.spawned.length, 0);
  const none = harness(); none.app.emit('will-quit'); assert.equal(none.spawned.length, 0, 'nothing downloaded, nothing installed');
});

test('a tampered download, a wrong version or another app are refused and cleaned up', async () => {
  const tampered = harness({ tamper: true }); await tampered.mac.checkForUpdates();
  await assert.rejects(tampered.mac.downloadUpdate(), /校验失败/); assert.deepEqual(fs.readdirSync(tampered.directory), []);
  for (const options of [{ unpackedVersion: '1.14.1' }, { unpackedId: 'com.example.other' }]) {
    const h = harness(options); await h.mac.checkForUpdates();
    await assert.rejects(h.mac.downloadUpdate(), /不匹配/); assert.deepEqual(fs.readdirSync(h.directory), []);
    h.mac.quitAndInstall(); assert.equal(h.spawned.length, 0); assert.equal(h.app.quitCalled, undefined);
  }
  await assert.rejects(harness().mac.downloadUpdate(), /请先检查更新/);
});

test('installation rejects downloads superseded by a manually installed copy', async () => {
  for (const installed of ['1.14.2', '1.14.3', '']) for (const click of [false, true]) {
    const h = harness(); await h.mac.checkForUpdates(); await h.mac.downloadUpdate();
    const info = path.join(h.bundle, 'Contents', 'Info.plist');
    fs.writeFileSync(info, JSON.stringify({ CFBundleShortVersionString: installed, CFBundleIdentifier: 'com.albumcircle.desktop' }));
    if (click) assert.equal(h.mac.quitAndInstall(), false); else h.app.emit('will-quit');
    assert.equal(h.spawned.length, 0); assert.equal(h.app.quitCalled, undefined);
    assert.equal(fs.existsSync(path.join(h.directory,'staged-1.14.2')), false);
    assert.equal(JSON.parse(fs.readFileSync(info)).CFBundleShortVersionString, installed);
  }
});
test('incomplete executables and broken signatures never become installable', async () => {
  for (const options of [{ executable: '' }, { executable: '../outside' }, { signed: false }]) {
    const h = harness(options); await h.mac.checkForUpdates(); await assert.rejects(h.mac.downloadUpdate());
    assert.equal(h.mac.quitAndInstall(), false); assert.equal(h.spawned.length, 0); assert.deepEqual(fs.readdirSync(h.directory), []);
  }
});
test('stream errors and timeouts clean partial downloads; partial writes are completed and stored bytes verified', async () => {
  for (const streamMode of ['error', 'stall']) {
    const h = harness({ streamMode }); await h.mac.checkForUpdates(); await assert.rejects(h.mac.downloadUpdate(), /stream failed|超时/);
    assert.deepEqual(fs.readdirSync(h.directory), []); if (streamMode === 'stall') assert.equal(h.cancelled, true);
  }
  const short = harness({ shortWrites: true }); await short.mac.checkForUpdates(); await short.mac.downloadUpdate();
  assert.equal(short.mac.quitAndInstall(), true);
  const corrupt = harness({ corruptWrites: true }); await corrupt.mac.checkForUpdates(); await assert.rejects(corrupt.mac.downloadUpdate(), /校验失败/);
  assert.deepEqual(fs.readdirSync(corrupt.directory), []);
});
test('backup survives until the new process confirms successful startup', async () => {
  const h = harness(); await h.mac.checkForUpdates(); await h.mac.downloadUpdate(); h.mac.quitAndInstall();
  const receiptPath = path.join(h.directory, 'install-receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptPath));
  fs.mkdirSync(receipt.backup); fs.writeFileSync(path.join(receipt.backup,'old'), 'recoverable');
  fs.writeFileSync(path.join(h.directory,'install-status'), 'installed');
  assert.equal(h.mac.confirmStartup(), false); assert.equal(fs.existsSync(receipt.backup), true);
  h.app.getVersion = () => '1.14.2';
  fs.writeFileSync(path.join(h.bundle,'Contents','Info.plist'), JSON.stringify({ CFBundleShortVersionString: '1.14.2' }));
  assert.equal(h.mac.confirmStartup(), true); assert.equal(fs.existsSync(receipt.backup), false); assert.equal(fs.existsSync(receiptPath), false);
});
test('rollback is reported and unrelated backup paths are never deleted', async () => {
  const h = harness(); await h.mac.checkForUpdates(); await h.mac.downloadUpdate(); h.mac.quitAndInstall();
  const receiptPath = path.join(h.directory,'install-receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptPath));
  const unrelated = path.join(h.directory,'personal'); fs.mkdirSync(unrelated); fs.writeFileSync(path.join(unrelated,'keep'),'keep');
  fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, backup: unrelated })); fs.writeFileSync(path.join(h.directory,'install-status'),'installed');
  h.app.getVersion = () => '1.14.2'; assert.equal(h.mac.confirmStartup(), false); assert.equal(fs.existsSync(unrelated),true);
  fs.writeFileSync(receiptPath,JSON.stringify(receipt)); fs.writeFileSync(path.join(h.directory,'install-status'),'rolled-back');
  assert.equal(h.mac.confirmStartup(), false); assert.match(h.mac.startupWarning,/已恢复原版本/); assert.equal(fs.existsSync(receiptPath),false);
});

test('the copy on disk can be newer than the running process', () => {
  const h = harness();
  assert.equal(h.mac.installedVersion(), '1.14.1');
  const states = [];
  const up = createUpdater({ currentVersion: '1.14.0', platform: 'darwin', isPackaged: true, macUpdatable: { ok: true }, autoUpdater: h.mac, installedVersion: h.mac.installedVersion, relaunch: () => { states.push('relaunch'); return true; }, onState: (s) => states.push(s.status) });
  assert.equal(up.checkInstalled(), true); assert.equal(up.state.status, 'restart'); assert.equal(up.state.latestVersion, '1.14.1');
  assert.equal(up.restart(), true); assert.deepEqual(states, ['restart', 'relaunch']);
  const same = createUpdater({ currentVersion: '1.14.1', platform: 'darwin', isPackaged: true, installedVersion: () => '1.14.1' });
  assert.equal(same.checkInstalled(), false); assert.equal(same.restart(), false);
});

test('updater.cjs drives the mac updater like electron-updater: auto download, then 重启安装', async () => {
  const h = harness(), states = [];
  const up = createUpdater({ currentVersion: '1.14.1', platform: 'darwin', arch: 'arm64', isPackaged: true, macUpdatable: { ok: true }, autoUpdater: h.mac, installedVersion: () => '1.14.1', onState: (s) => states.push(s.status) });
  assert.equal(up.state.mode, 'install');
  await up.check({ manual: true });
  for (let i = 0; i < 50 && up.state.status !== 'downloaded'; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(up.state.status, 'downloaded'); assert.ok(states.includes('downloading'));
  assert.equal(up.install(), true); assert.equal(h.spawned[0].args[5], '1');
});
test('checking a downloaded update notices a newer manual installation first', async () => {
  const h = harness();
  const up = createUpdater({ currentVersion: '1.14.1', platform: 'darwin', isPackaged: true, macUpdatable: { ok: true }, autoUpdater: h.mac, installedVersion: h.mac.installedVersion });
  await up.check(); for (let i=0; i<50 && up.state.status !== 'downloaded'; i++) await new Promise(r=>setTimeout(r,10));
  assert.equal(up.state.status,'downloaded');
  fs.writeFileSync(path.join(h.bundle,'Contents','Info.plist'), JSON.stringify({ CFBundleShortVersionString:'1.14.3' }));
  await up.check(); assert.equal(up.state.status,'restart'); assert.equal(up.state.latestVersion,'1.14.3');
  assert.equal(up.install(),false); h.app.emit('will-quit'); assert.equal(h.spawned.length,0);
});

// The real script, run by sh against throwaway folders.
function runScript(prepare) {
  const root = tmp(), app = path.join(root, 'Apps', 'Cabin.app'), staged = path.join(root, 'updates', 'staged', 'Cabin.app'), backup = path.join(root, 'Apps', '.Cabin.app.previous'), opened = path.join(root, 'opened');
  fs.mkdirSync(app, { recursive: true }); fs.writeFileSync(path.join(app, 'version'), 'old');
  fs.mkdirSync(path.join(app, 'Contents')); fs.writeFileSync(path.join(app,'Contents','Info.plist'), 'old');
  fs.mkdirSync(staged, { recursive: true }); fs.writeFileSync(path.join(staged, 'version'), 'new');
  prepare?.({ app, staged });
  const script = path.join(root, 'install.sh'); fs.writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 });
  const opener = path.join(root, 'opener.sh'); fs.writeFileSync(opener, `#!/bin/sh\necho "$1" > "${opened}"\n`, { mode: 0o700 });
  const plist = path.join(root,'plist.sh'); fs.writeFileSync(plist, '#!/bin/sh\ncat "$6"\n', { mode: 0o700 });
  return { root, app, staged, backup, opened, script, opener, plist, status: path.join(root,'status') };
}
test('install script: waits for the old process, swaps the bundle, opens it', { skip: process.platform === 'win32' }, async () => {
  const s = runScript();
  const sleeper = spawn('sleep', ['0.4']);
  const started = Date.now();
  // Asynchronous, so Node can reap the finished sleeper (as launchd reaps the app).
  const status = await new Promise((resolve) => spawn('/bin/sh', [s.script, String(sleeper.pid), s.app, s.staged, s.backup, '1', s.opener, s.status, 'old', s.plist], { stdio: 'ignore' }).on('exit', resolve));
  assert.equal(status, 0);
  assert.ok(Date.now() - started >= 300, 'it waited for the running app to exit');
  assert.equal(fs.readFileSync(path.join(s.app, 'version'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(s.backup, 'version'), 'utf8'), 'old'); assert.equal(fs.existsSync(s.staged), false);
  assert.equal(fs.readFileSync(s.opened, 'utf8').trim(), s.app);
});
test('install script: a failed swap puts the old app back', { skip: process.platform === 'win32' }, () => {
  const s = runScript(({ staged }) => fs.rmSync(staged, { recursive: true }));
  const result = spawnSync('/bin/sh', [s.script, '999999', s.app, s.staged, s.backup, '0', s.opener, s.status, 'old', s.plist], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(fs.readFileSync(path.join(s.app, 'version'), 'utf8'), 'old');
  assert.equal(fs.existsSync(s.backup), false); assert.equal(fs.existsSync(s.opened), false, 'no relaunch requested');
});
test('install script restores on open failure and refuses disk changes during shutdown', { skip: process.platform === 'win32' }, () => {
  for (const mode of ['open-failure', 'newer-disk']) {
    const s = runScript();
    if (mode === 'open-failure') fs.writeFileSync(s.opener, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    else fs.writeFileSync(path.join(s.app,'Contents','Info.plist'), 'newer');
    const result = spawnSync('/bin/sh', [s.script, '999999', s.app, s.staged, s.backup, '1', s.opener, s.status, 'old', s.plist], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 1); assert.equal(fs.readFileSync(path.join(s.app,'version'),'utf8'), 'old');
    assert.equal(fs.readFileSync(s.status,'utf8'), mode === 'open-failure' ? 'rolled-back' : 'disk-version-changed');
  }
});
