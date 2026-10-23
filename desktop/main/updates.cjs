'use strict';
// 检查更新 (desktop/updater.cjs, desktop/mac-updater.cjs). State reaches the page as
// window.cabinUpdateState + CustomEvent 'cabin:update-state'.
const fs = require('node:fs');
const path = require('node:path');
const { createUpdater, compareVersions, updateMode } = require('../updater.cjs');
const { createMacUpdater } = require('../mac-updater.cjs');

// ctx: { app, net, shell, notifySite, writeLog, getContents, pageReady, openAbout }
function createUpdates(ctx) {
  const { app } = ctx;
  let updater = null, macUpdater = null;
  function settings() {
    const file = path.join(app.getPath('userData'), 'update.json');
    return { get: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).autoDownload !== false; } catch { return true; } }, set: (value) => { try { fs.writeFileSync(file, JSON.stringify({ autoDownload: Boolean(value) })); } catch {} } };
  }
  function push(state = updater?.state) {
    if (state) ctx.notifySite(`window.cabinUpdateState = ${JSON.stringify(state)}; window.dispatchEvent(new CustomEvent('cabin:update-state', { detail: window.cabinUpdateState }));`);
  }
  // An updated macOS build confirms it started only once the cabin page really rendered.
  async function confirmStartup() {
    const contents = ctx.getContents();
    if (!macUpdater || !ctx.pageReady() || !contents || contents.isDestroyed()) return;
    // A loaded Electron shell can still contain a failed/blank React page.
    const cabinReady = await contents.executeJavaScript(`new Promise(resolve => {
      const timer = setTimeout(() => { observer.disconnect(); resolve(false); }, 10000);
      const check = () => { if (!document.querySelector('.cabin-home,.cabin-room')) return; observer.disconnect(); clearTimeout(timer); setTimeout(() => resolve(Boolean(document.querySelector('.cabin-home,.cabin-room'))), 500); };
      const observer = new MutationObserver(check); observer.observe(document.documentElement, { childList: true, subtree: true }); check();
    })`).catch(() => false);
    if (cabinReady === true && contents === ctx.getContents() && !contents.isDestroyed() && ctx.pageReady()) {
      macUpdater.confirmStartup({ cabinReady: true });
      if (macUpdater.startupWarning) { ctx.writeLog('update-recovery', macUpdater.startupWarning); if (macUpdater.listenerCount('error')) macUpdater.emit('error', new Error(macUpdater.startupWarning)); }
    }
  }
  // The .app on disk was replaced (a DMG dragged over it) while this older
  // process kept running in the background: start the installed copy instead.
  function relaunchInstalledCopy() {
    if (macUpdater) macUpdater.autoInstallOnAppQuit = false; // the newer copy wins; never swap a staged older one over it
    app.relaunch(); app.quit(); return true;
  }
  function start() {
    // macOS: ad-hoc builds update themselves (desktop/mac-updater.cjs). net.fetch follows the system proxy settings.
    if (process.platform === 'darwin' && app.isPackaged) macUpdater = createMacUpdater({ app, fetch: (url, options) => ctx.net.fetch(url, options), bundlePath: path.resolve(process.execPath, '..', '..', '..'), directory: path.join(app.getPath('userData'), 'updates') });
    confirmStartup();
    const macUpdatable = macUpdater ? macUpdater.canSelfUpdate({ isPackaged: app.isPackaged }) : null;
    const native = updateMode({ isPackaged: app.isPackaged, macUpdatable }).mode === 'install';
    updater = createUpdater({ currentVersion: app.getVersion(), isPackaged: app.isPackaged, macUpdatable, autoUpdater: native ? macUpdater || require('electron-updater').autoUpdater : null, openExternal: (url) => ctx.shell.openExternal(url), installedVersion: () => macUpdater?.installedVersion() || '', relaunch: relaunchInstalledCopy, settings: settings(), onState: (state) => push(state) });
    if (!process.env.ALBUM_DESKTOP_TEST_PROFILE) updater.start();
  }
  const actions = {
    '/update-check': () => updater.check({ manual: true }), '/update-download': () => updater.download(), '/update-install': () => updater.install(),
    '/update-relaunch': () => updater.restart(), '/update-open': () => updater.openRelease(), '/update-state': () => push(),
    '/update-auto': (params) => { if (['true', 'false'].includes(params.get('enabled'))) updater.setAutoDownload(params.get('enabled') === 'true'); }
  };
  return {
    start, push, confirmStartup, relaunchInstalledCopy,
    handle(pathname, params) { if (updater && Object.prototype.hasOwnProperty.call(actions, pathname)) actions[pathname](params); },
    checkFromMenu() { ctx.openAbout(); updater?.check({ manual: true }); },
    checkInstalled() { updater?.checkInstalled(); },
    installedVersion: () => macUpdater?.installedVersion() || '',
    // Reopening the app (Dock, Launchpad, Finder) while it only ran in the background starts the newer
    // installed copy; with the window open the About row offers 「重启到新版本」 instead.
    newerCopyInstalled() { const installed = macUpdater?.installedVersion() || ''; return Boolean(installed) && compareVersions(installed, app.getVersion()) > 0; }
  };
}
module.exports = { createUpdates };
