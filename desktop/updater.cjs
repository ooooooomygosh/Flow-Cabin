'use strict';
// 检查更新. GitHub Releases of ooooooomygosh/album-web are the only source.
//
// Every check goes through github.com itself, never api.github.com: the API
// allows 60 anonymous requests an hour per IP, which a shared network (school,
// office, proxy) uses up long before this app asks. electron-updater avoids
// the API for the same reason.
//
// Platform honesty:
//   Windows 安装版 (NSIS)  electron-updater downloads latest.yml + the setup
//                          exe (blockmap delta) and installs on the next quit or
//                          when the user clicks 「重启安装」. Never forced.
//   Windows 便携版         cannot replace itself: we only notify and open the
//                          release page.
//   macOS                  Squirrel.Mac refuses to install an update that is not
//                          signed with an Apple Developer ID. Our builds use an
//                          ad-hoc identity ("-"), so we notify and offer the DMG
//                          for this Mac's architecture. Flip MAC_SIGNED when the
//                          release workflow signs + notarises.
//   Development / Linux    check only (notify).
const MAC_SIGNED = false;
const OWNER = 'ooooooomygosh', REPO = 'album-web';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;
const STARTUP_DELAY_MS = 20 * 1000, INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value || '').trim());
  return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] || '' } : null;
}
// > 0 when a is newer than b. A pre-release sorts before its release.
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1; if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

// How this copy can update itself.
function updateMode({ platform = process.platform, isPackaged = false, env = process.env } = {}) {
  if (!isPackaged) return { mode: 'notify', reason: '开发版只检查新版本，不会自动安装。' };
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_DIR ? { mode: 'notify', reason: '便携版无法自动替换自己，请下载新版本后替换。' } : { mode: 'install', reason: '' };
  if (platform === 'darwin') return MAC_SIGNED ? { mode: 'install', reason: '' } : { mode: 'notify', reason: '这个 macOS 版本没有 Apple 开发者签名，系统不允许自动安装更新。请下载新的 DMG 手动替换。' };
  return { mode: 'notify', reason: '此系统只检查新版本。' };
}

// The release workflow publishes these names (build.*.artifactName in package.json).
function assetName(version, { platform = process.platform, arch = process.arch, portable = false } = {}) {
  if (platform === 'darwin') return `FlowCabin-${version}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  if (platform === 'win32') return `FlowCabin-${version}-x64-${portable ? 'portable' : 'setup'}.exe`;
  return '';
}
const cleanNotes = (value) => String(Array.isArray(value) ? value.map((n) => n?.note || '').join('\n') : value || '').replace(/<[^>]+>/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, 4000);
const decodeEntities = (text) => text.replace(/&(lt|gt|quot|apos|#39|#x27|#\d+|amp);/g, (entity, name) => ({ lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", amp: '&' })[name] ?? String.fromCodePoint(Number(name.slice(1)) || 32));
// Release notes of `tag` from the releases Atom feed (escaped HTML in <content>).
function notesFromFeed(xml, tag) {
  for (const entry of String(xml || '').split(/<entry\b/).slice(1)) {
    const href = /<link\b[^>]*\bhref="([^"]+)"/.exec(entry)?.[1] || '';
    if (!href.endsWith(`/releases/tag/${tag}`)) continue;
    const html = decodeEntities(/<content\b[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] || '');
    return cleanNotes(decodeEntities(html.replace(/<br\s*\/?>|<\/(p|li|h[1-6]|pre)>/gi, '\n').replace(/<li\b[^>]*>/gi, '- ').replace(/<[^>]+>/g, ''))).replace(/\n{3,}/g, '\n\n');
  }
  return '';
}
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { statusCode: status });

// status: idle | checking | latest | available | downloading | downloaded | error
function createUpdater({ currentVersion, platform = process.platform, arch = process.arch, isPackaged = false, env = process.env, autoUpdater = null, fetch = globalThis.fetch, openExternal = async () => {}, settings = { get: () => true, set: () => {} }, onState = () => {}, timers = { setTimeout, clearTimeout, setInterval, clearInterval } } = {}) {
  const { mode, reason } = updateMode({ platform, isPackaged, env });
  const portable = platform === 'win32' && Boolean(env.PORTABLE_EXECUTABLE_DIR);
  let state = { status: 'idle', currentVersion, mode, reason, autoDownload: settings.get() !== false, latestVersion: '', notes: '', percent: 0, error: '', releaseUrl: RELEASES_URL, downloadUrl: '', checkedAt: 0, platform };
  let pending = null, startTimer = null, intervalTimer = null;
  const set = (patch) => { state = { ...state, ...patch }; onState(state); return state; };
  const useNative = mode === 'install' && autoUpdater;
  if (useNative) {
    autoUpdater.autoDownload = false; // we decide, from the user's setting
    autoUpdater.autoInstallOnAppQuit = true; // installs when the user quits; never forced
    autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(Number(p?.percent) || 0))) }));
    autoUpdater.on('update-downloaded', (info) => set({ status: 'downloaded', percent: 100, latestVersion: String(info?.version || state.latestVersion) }));
    autoUpdater.on('error', (error) => set({ status: 'error', error: friendly(error) }));
  }
  function friendly(error) {
    const text = String(error?.message || error || '');
    // Our own requests carry statusCode; electron-updater puts "HttpError: 429" in the message.
    const status = Number(error?.statusCode) || Number(/HttpError: (\d{3})\b/.exec(text)?.[1]) || 0;
    if (/ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|TimeoutError|network|fetch failed/i.test(text)) return '无法连接 GitHub，请检查网络后重试。';
    if (status === 403 || status === 429 || /rate limit/i.test(text)) return 'GitHub 暂时限制了请求次数，请稍后再试，或先打开发布页下载。';
    if (status === 404 || /latest(-mac)?\.yml/i.test(text)) return '这个版本的更新信息还没发布，请稍后再试或打开发布页。';
    return '检查更新失败：' + text.slice(0, 160);
  }
  async function checkNative() {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo || {};
    const latest = String(info.version || '');
    if (!latest || compareVersions(latest, currentVersion) <= 0) return set({ status: 'latest', latestVersion: latest || currentVersion, checkedAt: Date.now() });
    set({ status: 'available', latestVersion: latest, notes: cleanNotes(info.releaseNotes), releaseUrl: `${RELEASES_URL}/tag/v${latest}`, checkedAt: Date.now() });
    if (state.autoDownload) download().catch(() => {});
    return state;
  }
  const web = (url, accept) => fetch(url, { headers: { Accept: accept, 'User-Agent': 'FlowCabin-Updater' }, signal: AbortSignal.timeout(15000) });
  // github.com answers /releases/latest with {"tag_name": ...} for JSON clients
  // and otherwise redirects to /releases/tag/<tag>.
  async function latestTag() {
    const response = await web(`${RELEASES_URL}/latest`, 'application/json');
    if (!response.ok) throw httpError(response.status);
    let tag = '';
    try { tag = String((await response.json())?.tag_name || ''); } catch {}
    return tag || decodeURIComponent(/\/releases\/tag\/([^/?#]+)$/.exec(String(response.url || ''))?.[1] || '');
  }
  // Notes are a courtesy: a failed feed never fails the check.
  async function latestNotes(tag) {
    try { const response = await web(`${RELEASES_URL}.atom`, 'application/atom+xml'); return response.ok ? notesFromFeed(await response.text(), tag) : ''; } catch { return ''; }
  }
  async function checkRelease() {
    const tag = await latestTag();
    const latest = tag.replace(/^v/, '');
    if (!parseVersion(latest) || compareVersions(latest, currentVersion) <= 0) return set({ status: 'latest', latestVersion: latest || currentVersion, checkedAt: Date.now() });
    const name = assetName(latest, { platform, arch, portable });
    const base = `${RELEASES_URL}/download/${encodeURIComponent(tag)}/`;
    return set({ status: 'available', latestVersion: latest, notes: await latestNotes(tag), releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`, downloadUrl: name ? base + name : '', checkedAt: Date.now() });
  }
  async function check({ manual = false } = {}) {
    if (pending) return pending;
    if (['downloading', 'downloaded'].includes(state.status)) return state; // keep the download; nothing to re-check
    set({ status: 'checking', error: '', manual });
    pending = (useNative ? checkNative() : checkRelease()).catch((error) => set({ status: 'error', error: friendly(error) })).finally(() => { pending = null; });
    return pending;
  }
  async function download() {
    if (state.status !== 'available') return state;
    if (!useNative) { await openExternal(state.downloadUrl || state.releaseUrl); return set({ opened: true }); }
    set({ status: 'downloading', percent: 0 });
    try { await autoUpdater.downloadUpdate(); } catch (error) { set({ status: 'error', error: friendly(error) }); }
    return state;
  }
  // Only on an explicit click. The app restarts into the installer.
  function install() { if (!useNative || state.status !== 'downloaded') return false; autoUpdater.quitAndInstall(false, true); return true; }
  async function openRelease() { await openExternal(state.releaseUrl || RELEASES_URL); return true; }
  function setAutoDownload(value) { settings.set(Boolean(value)); set({ autoDownload: Boolean(value) }); if (value && state.status === 'available' && useNative) download().catch(() => {}); return state; }
  function start() {
    if (startTimer) return;
    startTimer = timers.setTimeout(() => check(), STARTUP_DELAY_MS);
    intervalTimer = timers.setInterval(() => check(), INTERVAL_MS);
    startTimer?.unref?.(); intervalTimer?.unref?.();
  }
  function stop() { if (startTimer) timers.clearTimeout(startTimer); if (intervalTimer) timers.clearInterval(intervalTimer); startTimer = intervalTimer = null; }
  return { check, download, install, openRelease, setAutoDownload, start, stop, get state() { return state; } };
}

module.exports = { createUpdater, compareVersions, parseVersion, updateMode, assetName, cleanNotes, notesFromFeed, MAC_SIGNED, STARTUP_DELAY_MS, INTERVAL_MS, RELEASES_URL };
