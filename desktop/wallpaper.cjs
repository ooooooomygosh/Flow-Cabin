'use strict';
const { BrowserWindow, ipcMain, screen, session } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { cleanSnapshot } = require('./wallpaper-model.cjs');
const { readCompanion } = require('./companion-sync.cjs');
const URL = 'album-desktop://wallpaper/wallpaper.html';
function createWallpaper({ app, getMain, getSite, status, appearanceScript, getAppearance, log, registerProtocol }) {
  let window, snapshot, timer, healthTimer, startupTimer, startupAbort, polling = null, active = false, busy = false, generation = 0, lastJSON = '', handle, lastError = '', frameRate = 30;
  const helperPath = app.isPackaged ? path.join(process.resourcesPath, 'native', 'DesktopHost.exe') : path.join(__dirname, 'native', 'bin', 'DesktopHost.exe');
  const hwnd = (win) => win.getNativeWindowHandle().readBigUInt64LE().toString();
  const native = (command, target = handle, signal) => new Promise((resolve, reject) => {
    const args = [command, target, String(process.pid)]; if (command === 'attach') args.push(hwnd(getMain()));
    execFile(helperPath, args, { signal, windowsHide: true, timeout: 8000, maxBuffer: 16384, encoding: 'utf8' }, (error, out) => {
      if (error) return reject(new Error('Windows 桌面暂时无法挂载动态背景。请停止其他动态壁纸软件后重试。'));
      try { const value = JSON.parse(out); if (!value.behindIcons || !value.visible) throw new Error('unverified desktop layer'); resolve(value); } catch { reject(new Error('无法确认 Windows 桌面层的位置，已取消应用动态背景。')); }
    });
  });
  // webContents.setFrameRate only affects offscreen windows, so the cap is also pushed into the
  // renderer (frame-clock.mjs reads data-frame-cap). Not a preload key: the bridge stays minimal.
  const pushFrameCap = () => { if (window && !window.isDestroyed()) Promise.resolve(window.webContents.executeJavaScript(`document.documentElement.dataset.frameCap = ${JSON.stringify(String(frameRate))}`)).catch(() => {}); };
  const announce = (error = '') => status({ active, busy, error });
  function stop(error = '') {
    lastError = error;
    generation++; polling = null; active = false; busy = false; startupAbort?.abort(); startupAbort = null; clearInterval(timer); clearInterval(healthTimer); clearTimeout(startupTimer); timer = healthTimer = startupTimer = null;
    const old = window; window = null; handle = null; snapshot = null; lastJSON = '';
    if (old && !old.isDestroyed()) old.destroy(); announce(error); log('wallpaper-stopped');
  }
  const readRoom = () => readCompanion(getSite());
  async function sync() {
    if (!active || polling === generation) return; const token = generation; polling = token;
    try {
      const result = await readRoom(); if (token !== generation) return;
      const next = cleanSnapshot(result.room); // Other pages retain the last room until explicitly stopped.
      if (next) { const json = JSON.stringify(next); if (json !== lastJSON) { snapshot = next; lastJSON = json; window?.webContents.send('wallpaper:update', snapshot); } }
      else if (snapshot?.spinning) { snapshot = { ...snapshot, spinning: false, statusText: '旋转已暂停' }; lastJSON = JSON.stringify(snapshot); window?.webContents.send('wallpaper:update', snapshot); }
    } catch { /* A brief page reload leaves the last validated scene visible. */ }
    finally { if (polling === token) polling = null; }
  }
  async function start() {
    if (active || busy) return; busy = true; lastError = ''; announce(); const token = ++generation;
    const controller = new AbortController(); startupAbort = controller;
    startupTimer = setTimeout(() => { if (token === generation) stop('应用动态背景超时，请重试。'); }, 20000);
    try {
      if (!['win32', 'darwin'].includes(process.platform)) throw new Error('动态桌面支持 macOS 与 Windows。');
      const result = await readRoom(), first = cleanSnapshot(result?.room);
      if (!first) throw new Error('小屋还没准备好，请稍后再试。');
      if (token !== generation) return;
      snapshot = first; lastJSON = JSON.stringify(first);
      // Register on the actual isolated session before creating/loading the window.
      const wallpaperSession = session.fromPartition('album-circle-wallpaper');
      if (!(await wallpaperSession.protocol.isProtocolHandled('album-desktop'))) registerProtocol(wallpaperSession.protocol);
      const response = await wallpaperSession.fetch(URL, { signal: controller.signal });
      await response.body?.cancel();
      if (token !== generation) return;
      if (!response.ok) throw new Error('动态背景资源缺失，请重新安装完整客户端后重试。');
      const display = screen.getDisplayMatching(getMain().getBounds());
      const created = new BrowserWindow({ ...display.bounds, title: '心流小屋 · 动态桌面', ...(process.platform === 'darwin' ? { type: 'desktop', hiddenInMissionControl: true } : {}), frame: false, thickFrame: false, roundedCorners: false, show: false, skipTaskbar: true, focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: '#38200f',
        webPreferences: { preload: path.join(__dirname, 'wallpaper-preload.cjs'), partition: 'album-circle-wallpaper', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
      window = created; handle = process.platform === 'win32' ? hwnd(created) : null; created.webContents.setFrameRate(frameRate);
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      created.webContents.on('did-finish-load', pushFrameCap);
      created.webContents.on('will-navigate', (event) => event.preventDefault());
      created.webContents.on('will-frame-navigate', (event) => event.preventDefault());
      created.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      created.webContents.session.setPermissionCheckHandler(() => false);
      created.webContents.on('render-process-gone', () => { if (window === created) stop('动态背景意外停止，请重试。'); });
      created.on('closed', () => { if (window === created) stop('动态背景已停止，请重新应用。'); });
      await created.loadURL(URL);
      if (token !== generation) return;
      await created.webContents.executeJavaScript(appearanceScript(getAppearance()));
      if (token !== generation) return;
      pushFrameCap();
      // A loaded document may still be an empty React root. Wait for the actual
      // scene before attaching an opaque window to the user's desktop.
      const ready = await created.webContents.executeJavaScript(`new Promise((resolve) => {
        const deadline = Date.now() + 7000;
        const check = () => {
          const scene = document.querySelector('.room-scene'), image = document.querySelector('.cabin-scene-art');
          if (scene && image?.complete && image.naturalWidth > 0 && scene.clientWidth > 0 && scene.clientHeight > 0) return resolve(true);
          if (Date.now() >= deadline) return resolve(false);
          setTimeout(check, 40);
        }; check();
      })`);
      if (token !== generation) return;
      if (!ready) throw new Error('动态背景场景未能绘制，请重新安装完整客户端后重试。');
      let attached;
      if (process.platform === 'darwin') { created.setIgnoreMouseEvents(true); created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false }); created.showInactive(); attached = { parentClass: 'macOS desktop', visible: created.isVisible() }; if (!attached.visible) throw new Error('桌面背景未能显示。'); }
      else {
        await native('attach', handle, controller.signal);
        if (token !== generation) return;
        // Win32 showing alone does not activate Chromium's hidden compositor.
        created.showInactive();
        attached = await native('attach', handle, controller.signal);
        if (attached.hasFrame || attached.coversMonitor === false) throw new Error('桌面背景未覆盖显示器或仍带边框，已取消应用。');
      }
      if (token !== generation) return;
      clearTimeout(startupTimer); startupTimer = null; startupAbort = null;
      active = true; busy = false; announce(); log('wallpaper-attached', attached.parentClass);
      timer = setInterval(sync, 750);
      let healthBusy = false;
      if (process.platform === 'win32') healthTimer = setInterval(async () => { if (!active || healthBusy) return; healthBusy = true; const current = generation; try { await native('probe'); } catch (error) { if (current === generation) stop(error.message); } finally { healthBusy = false; } }, 10000);
    } catch (error) {
      if (token === generation) {
        log('wallpaper-start-failed', error.message);
        stop(/ERR_|loading ['"]|fetch failed/i.test(error.message) ? '动态背景加载失败，请重试；若仍失败，请重新安装完整客户端。' : error.message);
      }
    }
  }
  ipcMain.handle('wallpaper:snapshot', (event) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== URL) throw new Error('Unknown wallpaper sender');
    return snapshot;
  });
  return { start, stop, get active() { return active; }, get busy() { return busy; }, async reposition() { if (active) { const token = generation; try { if (process.platform === 'darwin') { window.setBounds(screen.getDisplayMatching(getMain().getBounds()).bounds); return; } await native('attach'); } catch (error) { if (token === generation) stop(error.message); } } }, async applyAppearance() { if (window && !window.isDestroyed()) await window.webContents.executeJavaScript(appearanceScript(getAppearance())).catch(() => {}); }, get window() { return window; }, get error() { return lastError; }, setFrameRate(value) { frameRate = value; if (window && !window.isDestroyed()) { window.webContents.setFrameRate(value); pushFrameCap(); } }, get handle() { return handle; } };
}
module.exports = { createWallpaper };
