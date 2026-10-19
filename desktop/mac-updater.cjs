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
// Releases use one stable self-signed code-signing requirement. A stable
// certificate keeps TCC grants (Input Monitoring / Automation) across updates;
// ad-hoc builds were tied to a changing CDHash and asked again every time.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { latestTag, latestNotes, httpError, parseVersion, compareVersions, RELEASES_URL } = require('./updater.cjs');

// Public certificate SHA-1 only. The private key lives in GitHub Actions
// secrets and the maintainer's login keychain, never in the repository.
const SIGNING_FINGERPRINT = String(process.env.FLOW_CABIN_SIGNING_FINGERPRINT || 'df8fb879881e5465c5e323137be7aef259ebb787').toLowerCase();

// Waits for the old process, swaps the bundle, restores it on failure.
// Every value arrives as a positional argument; nothing is interpolated.
const INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; app="$2"; staged="$3"; backup="$4"; relaunch="$5"; opener="$6"; status="$7"; expected="$8"; plist="$9"
result() { [ -z "$status" ] || printf '%s' "$1" > "$status"; }
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 600 ] && { result wait-timeout; exit 1; }
  sleep 0.1
done
current=$("$plist" -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist") || { result version-unavailable; exit 1; }
[ "$current" = "$expected" ] || { result disk-version-changed; exit 1; }
[ ! -e "$backup" ] || { result backup-exists; exit 1; }
mv "$app" "$backup" || { result backup-failed; exit 1; }
restore() {
  if ! rm -rf "$app" || [ -e "$app" ] || [ -L "$app" ]; then result rollback-failed; return 1; fi
  if mv "$backup" "$app"; then result rolled-back; else result rollback-failed; fi
}
if mv "$staged" "$app" 2>/dev/null || ditto "$staged" "$app" 2>/dev/null; then
  rm -rf "$staged"
else
  restore; exit 1
fi
result installed
if [ "$relaunch" = 1 ] && ! "$opener" "$app"; then restore; exit 1; fi
# LaunchServices accepting open is not startup confirmation. The new process
# removes its exact backup only after the cabin window has initialized.
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

function createMacUpdater({ app, fetch = globalThis.fetch, platform = process.platform, arch = process.arch, bundlePath, directory, pid = process.pid, execFileProcess = execFile, execFileSyncProcess = execFileSync, spawnProcess = spawn, fsModule = fs, downloadTimeoutMs = 120000 } = {}) {
  const updater = new EventEmitter();
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  let pending = null, staged = null, installing = false;
  const receiptPath = path.join(directory, 'install-receipt.json'), statusPath = path.join(directory, 'install-status');

  const run = (file, args) => new Promise((resolve, reject) => execFileProcess(file, args, { timeout: 120000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => error ? reject(error) : resolve(String(stdout || '').trim() || String(stderr || '').trim())));
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

  function clean(keep = ['install-receipt.json', 'install-status']) {
    try { for (const name of fsModule.readdirSync(directory)) if (!keep.includes(name)) fsModule.rmSync(path.join(directory, name), { recursive: true, force: true }); } catch {}
  }

  updater.downloadUpdate = async () => {
    if (!pending) throw new Error('请先检查更新。');
    if (fsModule.existsSync(receiptPath)) throw new Error('上一次更新尚未确认完成，已保留旧版本，请先重新打开小屋。');
    const { tag, version, file } = pending;
    if (staged?.version === version) { updater.emit('update-downloaded', { version }); return [staged.app]; }
    fsModule.mkdirSync(directory, { recursive: true });
    const stage = `staged-${version}`, zip = path.join(directory, file.url), part = zip + '.part';
    staged = null; clean();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('更新包下载超时，请重试。')), downloadTimeoutMs);
    let handle, reader, received = 0, total = 0, shown = -1;
    const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
    try {
      const response = await Promise.race([fetch(`${RELEASES_URL}/download/${encodeURIComponent(tag)}/${encodeURIComponent(file.url)}`, { headers: { 'User-Agent': 'FlowCabin-Updater' }, signal: controller.signal }), aborted]);
      if (!response.ok || !response.body) throw httpError(response.status || 0);
      total = Number(file.size) || Number(response.headers?.get?.('content-length')) || 0;
      handle = await fsModule.promises.open(part, 'w');
      reader = response.body.getReader();
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        const chunk = Buffer.from(value);
        for (let offset = 0; offset < chunk.length;) {
          controller.signal.throwIfAborted();
          const { bytesWritten } = await handle.write(chunk.subarray(offset));
          if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) throw new Error('更新包写入失败。');
          offset += bytesWritten;
        }
        received += chunk.length;
        const percent = total ? Math.min(99, Math.floor(received / total * 100)) : 0;
        if (percent !== shown) { shown = percent; updater.emit('download-progress', { percent, transferred: received, total }); }
      }
      await handle.close(); handle = null;
      const hash = crypto.createHash('sha512');
      for await (const chunk of fsModule.createReadStream(part)) { controller.signal.throwIfAborted(); hash.update(chunk); }
      if (hash.digest('base64') !== file.sha512 || fsModule.statSync(part).size !== received || (file.size && received !== file.size)) throw new Error('下载的更新包校验失败，已删除，请稍后重试。');
    } catch (error) {
      reader?.cancel().catch(() => {}); await handle?.close().catch(() => {}); handle = null;
      fsModule.rmSync(part, { force: true }); throw error;
    } finally { clearTimeout(timer); }
    fsModule.renameSync(part, zip);
    const target = path.join(directory, stage);
    fsModule.mkdirSync(target, { recursive: true });
    try {
      await run('/usr/bin/ditto', ['-x', '-k', zip, target]);
      const apps = fsModule.readdirSync(target).filter((name) => name.endsWith('.app'));
      if (apps.length !== 1) throw new Error('更新包内容不完整。');
      const copy = path.join(target, apps[0]);
      const [newVersion, newId, ownId, executable] = await Promise.all([plist(copy, 'CFBundleShortVersionString'), plist(copy, 'CFBundleIdentifier'), plist(bundlePath, 'CFBundleIdentifier'), plist(copy, 'CFBundleExecutable')]);
      if (newVersion !== version || !newId || newId !== ownId) throw new Error('更新包与这个应用不匹配。');
      if (!executable || executable === '.' || executable === '..' || /[\\/\x00-\x1f]/.test(executable)) throw new Error('更新包没有有效的主程序。');
      const binary = path.join(copy, 'Contents', 'MacOS', executable);
      if (!fsModule.lstatSync(binary).isFile()) throw new Error('更新包没有有效的主程序。');
      if (!fsModule.realpathSync(binary).startsWith(fsModule.realpathSync(copy) + path.sep)) throw new Error('更新包主程序不在应用目录内。');
      fsModule.accessSync(binary, fsModule.constants.X_OK);
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', copy]);
      const requirement = await run('/usr/bin/codesign', ['--display', '--requirements', '-', copy]);
      const root = /certificate root = H"([a-f0-9]{40})"/i.exec(requirement)?.[1]?.toLowerCase() || '';
      if (!SIGNING_FINGERPRINT || root !== SIGNING_FINGERPRINT) {
        throw new Error('更新包的签名身份与心流小屋不一致，已停止安装。请从发布页重新下载。');
      }
      staged = { version, app: copy };
    } catch (error) { clean(); throw error; }
    fsModule.rmSync(zip, { force: true });
    updater.emit('download-progress', { percent: 100, transferred: received, total });
    updater.emit('update-downloaded', { version });
    return [staged.app];
  };

  function startInstaller(relaunch) {
    if (!staged || installing) return false;
    // A manually installed copy always wins over an older cached download.
    const installed = updater.installedVersion();
    if (!installed || compareVersions(staged.version, installed) <= 0) {
      fsModule.rmSync(path.dirname(staged.app), { recursive: true, force: true }); staged = null;
      return false;
    }
    if (!updater.canSelfUpdate().ok || fsModule.existsSync(receiptPath)) return false;
    installing = true;
    const script = path.join(directory, 'install.sh');
    fsModule.writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 });
    const backup = path.join(path.dirname(bundlePath), `.${path.basename(bundlePath)}.previous-${crypto.randomBytes(12).toString('hex')}`);
    fsModule.writeFileSync(receiptPath, JSON.stringify({ bundle: bundlePath, backup, version: staged.version }), { mode: 0o600 });
    fsModule.writeFileSync(statusPath, 'pending', { mode: 0o600 });
    const child = spawnProcess('/bin/sh', [script, String(pid), bundlePath, staged.app, backup, relaunch ? '1' : '0', '/usr/bin/open', statusPath, installed, '/usr/bin/plutil'], { detached: true, stdio: 'ignore' });
    child.once?.('error', () => { fsModule.writeFileSync(statusPath, 'spawn-failed'); });
    child.unref?.();
    return true;
  }
  // 「重启安装」: install now and open the new version.
  updater.quitAndInstall = () => { const started = startInstaller(true); if (started) app.quit(); return started; };
  updater.confirmStartup = ({ cabinReady = false } = {}) => {
    if (!cabinReady) return false;
    // Called after createWindow succeeds, never by the outgoing process.
    try {
      const receipt = JSON.parse(fsModule.readFileSync(receiptPath, 'utf8'));
      const status = fsModule.readFileSync(statusPath, 'utf8');
      const prefix = `.${path.basename(bundlePath)}.previous-`;
      if (receipt.bundle !== bundlePath || path.dirname(receipt.backup) !== path.dirname(bundlePath)
        || !path.basename(receipt.backup).startsWith(prefix) || !/^[a-f0-9]{24}$/.test(path.basename(receipt.backup).slice(prefix.length))) return false;
      if (status === 'installed' && receipt.version === app.getVersion() && receipt.version === updater.installedVersion()) {
        fsModule.rmSync(receipt.backup, { recursive: true, force: true });
        fsModule.rmSync(receiptPath, { force: true }); fsModule.rmSync(statusPath, { force: true }); return true;
      }
      const beforeSwap = ['disk-version-changed', 'version-unavailable', 'backup-exists', 'backup-failed', 'spawn-failed', 'wait-timeout'].includes(status);
      if (status === 'rolled-back' || beforeSwap) {
        updater.startupWarning = status === 'rolled-back' ? '上次更新安装或打开失败，已恢复原版本。' : '上次更新已安全取消，原应用未被替换，可以重新检查并下载。';
        // Only our version-named staging is discarded. A backup mentioned by
        // a cancelled attempt is preserved, including backup-exists failures.
        if (/^\d+\.\d+\.\d+$/.test(receipt.version)) fsModule.rmSync(path.join(directory, `staged-${receipt.version}`), { recursive: true, force: true });
        fsModule.rmSync(receiptPath, { force: true }); fsModule.rmSync(statusPath, { force: true });
      } else updater.startupWarning = '上次更新尚未确认完成，已保留原版本备份，请检查更新状态后再试。';
      return false;
    } catch { return false; }
  };
  // Otherwise the update goes in quietly the next time the app quits.
  app?.on?.('will-quit', () => { if (updater.autoInstallOnAppQuit) startInstaller(false); });
  return updater;
}

module.exports = { createMacUpdater, parseMacUpdateInfo, zipName, INSTALL_SCRIPT };
