'use strict';
// 自动更新 for the macOS build. Squirrel.Mac (electron-updater) only installs
// updates signed with an Apple Developer ID; our releases are ad-hoc signed,
// so this module does the same job itself and plugs into desktop/updater.cjs
// as its `autoUpdater` (checkForUpdates / downloadUpdate / quitAndInstall).
//
//   check     github.com /releases/latest → latest-mac.yml of that tag → the
//             zip for this Mac's architecture and its sha512.
//   download  streams the zip into userData/updates, refuses it unless the
//             sha512 matches, unpacks it with ditto and checks the unpacked
//             app is that version with this app's bundle identifier.
//   install   on 「重启安装」 or when the app quits: a small script waits for
//             this process to exit, moves the old .app aside, moves the new
//             one into place (restoring the old one on any failure) and, after
//             「重启安装」, opens it again.
//
// Ad-hoc signatures change with every build, so macOS may ask again for the
// Automation permission (controlling 「音乐」) after an update.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { latestTag, latestNotes, httpError, parseVersion, RELEASES_URL } = require('./updater.cjs');

// Waits for the old process, swaps the bundle, restores it on failure.
// Every value arrives as a positional argument; nothing is interpolated.
const INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; app="$2"; staged="$3"; backup="$4"; relaunch="$5"; opener="$6"
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 600 ] && exit 1
  sleep 0.1
done
rm -rf "$backup"
mv "$app" "$backup" || exit 1
if mv "$staged" "$app" 2>/dev/null || ditto "$staged" "$app" 2>/dev/null; then
  rm -rf "$backup" "$staged"
else
  rm -rf "$app"; mv "$backup" "$app"
fi
if [ "$relaunch" = 1 ]; then "$opener" "$app"; fi
exit 0
`;

// latest-mac.yml as electron-builder (and scripts/merge-mac-update-info.mjs) write it.
function parseMacUpdateInfo(text) {
  const info = { version: '', files: [] }, unquote = (value) => value.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
  let file = null, match;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if ((match = /^version:\s*(\S+)$/.exec(line))) { info.version = unquote(match[1]); file = null; }
    else if ((match = /^\s*-\s+url:\s*(\S+)$/.exec(line))) info.files.push(file = { url: unquote(match[1]) });
    else if (file && (match = /^\s+(sha512|size):\s*(\S+)$/.exec(line))) file[match[1]] = match[1] === 'size' ? Number(unquote(match[2])) : unquote(match[2]);
    else if (/^\S/.test(line)) file = null;
  }
  return info;
}
const zipName = (version, arch) => `FlowCabin-${version}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`;

function createMacUpdater({ app, fetch = globalThis.fetch, platform = process.platform, arch = process.arch, bundlePath, directory, pid = process.pid, execFileProcess = execFile, execFileSyncProcess = execFileSync, spawnProcess = spawn, fsModule = fs } = {}) {
  const updater = new EventEmitter();
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  let pending = null, staged = null, installing = false;

  const run = (file, args) => new Promise((resolve, reject) => execFileProcess(file, args, { timeout: 120000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(String(stdout || '').trim())));
  const plist = (bundle, key) => run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')]);

  // Whether this copy can replace itself, with the reason shown when it cannot.
  updater.canSelfUpdate = ({ isPackaged = true } = {}) => {
    if (platform !== 'darwin') return { ok: false, reason: '' };
    if (!isPackaged) return { ok: false, reason: '开发版只检查新版本，不会自动安装。' };
    const where = String(bundlePath || '');
    if (!where.endsWith('.app') || where.includes('/AppTranslocation/') || where.startsWith('/Volumes/')) return { ok: false, reason: '请先把心流小屋拖到「应用程序」文件夹，并从那里打开，之后就能自动更新。' };
    try { fsModule.accessSync(path.dirname(where), fsModule.constants.W_OK); fsModule.accessSync(where, fsModule.constants.W_OK); }
    catch { return { ok: false, reason: '没有权限替换「应用程序」里的心流小屋，请下载新的 DMG 手动替换。' }; }
    return { ok: true, reason: '' };
  };

  // Version of the .app on disk, which can be newer than this running process.
  updater.installedVersion = () => {
    if (platform !== 'darwin' || !bundlePath) return '';
    try { const value = String(execFileSyncProcess('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(bundlePath, 'Contents', 'Info.plist')], { encoding: 'utf8', timeout: 5000 })).trim(); return parseVersion(value) ? value : ''; }
    catch { return ''; }
  };

  updater.checkForUpdates = async () => {
    const tag = await latestTag(fetch), version = tag.replace(/^v/, '');
    if (!parseVersion(version)) throw new Error('发布页没有可用的版本号。');
    const response = await fetch(`${RELEASES_URL}/download/${encodeURIComponent(tag)}/latest-mac.yml`, { headers: { 'User-Agent': 'FlowCabin-Updater' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw httpError(response.status);
    const info = parseMacUpdateInfo(await response.text());
    if (info.version !== version) throw new Error('latest-mac.yml 与发布版本不一致。');
    const file = info.files.find((entry) => entry.url === zipName(version, arch));
    if (!file || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512 || '')) throw new Error('latest-mac.yml 中没有这台 Mac 的更新包。');
    const notes = await latestNotes(fetch, tag);
    pending = { tag, version, file, notes };
    return { updateInfo: { version, releaseNotes: notes } };
  };

  function clean(keep = []) {
    try { for (const name of fsModule.readdirSync(directory)) if (!keep.includes(name)) fsModule.rmSync(path.join(directory, name), { recursive: true, force: true }); } catch {}
  }

  updater.downloadUpdate = async () => {
    if (!pending) throw new Error('请先检查更新。');
    const { tag, version, file } = pending;
    if (staged?.version === version) { updater.emit('update-downloaded', { version }); return [staged.app]; }
    fsModule.mkdirSync(directory, { recursive: true });
    const stage = `staged-${version}`, zip = path.join(directory, file.url), part = zip + '.part';
    clean();
    const response = await fetch(`${RELEASES_URL}/download/${encodeURIComponent(tag)}/${encodeURIComponent(file.url)}`, { headers: { 'User-Agent': 'FlowCabin-Updater' } });
    if (!response.ok || !response.body) throw httpError(response.status || 0);
    const total = Number(file.size) || Number(response.headers?.get?.('content-length')) || 0;
    const hash = crypto.createHash('sha512'), handle = await fsModule.promises.open(part, 'w');
    let received = 0, shown = -1;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        hash.update(chunk); await handle.write(chunk); received += chunk.length;
        const percent = total ? Math.min(99, Math.floor(received / total * 100)) : 0;
        if (percent !== shown) { shown = percent; updater.emit('download-progress', { percent, transferred: received, total }); }
      }
    } finally { await handle.close(); }
    if (hash.digest('base64') !== file.sha512 || (file.size && received !== file.size)) { fsModule.rmSync(part, { force: true }); throw new Error('下载的更新包校验失败，已删除，请稍后重试。'); }
    fsModule.renameSync(part, zip);
    const target = path.join(directory, stage);
    fsModule.mkdirSync(target, { recursive: true });
    try {
      await run('/usr/bin/ditto', ['-x', '-k', zip, target]);
      const apps = fsModule.readdirSync(target).filter((name) => name.endsWith('.app'));
      if (apps.length !== 1) throw new Error('更新包内容不完整。');
      const copy = path.join(target, apps[0]);
      const [newVersion, newId, ownId] = await Promise.all([plist(copy, 'CFBundleShortVersionString'), plist(copy, 'CFBundleIdentifier'), plist(bundlePath, 'CFBundleIdentifier')]);
      if (newVersion !== version || !newId || newId !== ownId) throw new Error('更新包与这个应用不匹配。');
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', copy]).catch(() => {});
      staged = { version, app: copy };
    } catch (error) { clean(); throw error; }
    fsModule.rmSync(zip, { force: true });
    updater.emit('download-progress', { percent: 100, transferred: received, total });
    updater.emit('update-downloaded', { version });
    return [staged.app];
  };

  function startInstaller(relaunch) {
    if (!staged || installing) return false;
    installing = true;
    const script = path.join(directory, 'install.sh');
    fsModule.writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 });
    const backup = path.join(path.dirname(bundlePath), `.${path.basename(bundlePath)}.previous`);
    const child = spawnProcess('/bin/sh', [script, String(pid), bundlePath, staged.app, backup, relaunch ? '1' : '0', '/usr/bin/open'], { detached: true, stdio: 'ignore' });
    child.unref?.();
    return true;
  }
  // 「重启安装」: install now and open the new version.
  updater.quitAndInstall = () => { if (startInstaller(true)) app.quit(); };
  // Otherwise the update goes in quietly the next time the app quits.
  app?.on?.('will-quit', () => { if (updater.autoInstallOnAppQuit) startInstaller(false); });
  return updater;
}

module.exports = { createMacUpdater, parseMacUpdateInfo, zipName, INSTALL_SCRIPT };
