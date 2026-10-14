'use strict';

const { app, BrowserWindow, WebContentsView, Menu, Tray, dialog, ipcMain, clipboard, shell, protocol, screen, net, safeStorage, nativeImage, powerSaveBlocker, globalShortcut, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SITE_ORIGIN, SHELL_URL, isSiteUrl, isShellUrl, isExternalUrl, safeSavedWindow, localDownloadType } = require('./policy.cjs');
const { createQQMusic } = require('./qq-music.cjs');
const { createSiteRouter } = require('./site-router.cjs');
const { DEFAULT_SETTINGS, normalizeSettings, appearanceScript, listSystemFonts, setSettingsVisibility } = require('./settings.cjs');
const { registerShellProtocol } = require('./shell-protocol.cjs');
const { createWallpaper } = require('./wallpaper.cjs');
const { createFullscreen } = require('./fullscreen.cjs');
const { createDesktopMode } = require('./desktop-mode.cjs');
const { createDesktopSink, migrateDesktopPreferences } = require('./desktop-sink.cjs');
const { createMiniPlayer } = require('./mini-player.cjs');
const { trayIconPath, createTrayPet } = require('./tray-icons.cjs');
const SINK_HOTKEY = 'CommandOrControl+Alt+D';
const { createCollectionStore } = require('./collection-store.cjs');
const { createMusicService } = require('./music-service.cjs');
const { openQQLogin, openNeteaseLogin, clearQQLogin, clearNeteaseLogin } = require('./music-login.cjs');
const { createPet } = require('./pet.cjs');
const { createNowPlaying } = require('./now-playing.cjs');
const { createAppleMusic } = require('./apple-music.cjs');
const { createLocalApps } = require('./local-app.cjs');
const { createUpdater, compareVersions } = require('./updater.cjs');
const { createMacUpdater } = require('./mac-updater.cjs');
const { createLocalMusic } = require('./local-music.cjs');
const { sendCompanionCommand } = require('./companion-sync.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'album-desktop', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('心流小屋');
// HTTP headers must be ASCII: keep the Chinese name out of the User-Agent.
app.userAgentFallback = app.userAgentFallback.replace(/[^\x20-\x7e]+(?=\/)/g, 'FlowCabin');
// Data stays in the folder used since the first release ("Album Circle").
if (!process.env.ALBUM_DESKTOP_TEST_PROFILE) app.setPath('userData', path.join(app.getPath('appData'), 'Album Circle'));
app.setAppUserModelId('com.albumcircle.desktop');

// Tests receive a separate storage directory. The distributed app cannot be configured to load another site.
if (process.env.ALBUM_DESKTOP_TEST_PROFILE) {
  app.setPath('userData', path.resolve(process.env.ALBUM_DESKTOP_TEST_PROFILE));
}

const icon = path.join(__dirname, 'assets', 'icon.png');
const toolbarHeight = 0;
let mainWindow;
let siteView;
let loadTimer;
let retryTimer;
let loading = false;
let currentError = '';
let documentHttpFailed = false;
let lastGoodUrl = `${SITE_ORIGIN}/`;
let startupComplete = false;
let preferences = {};
let appearance = { ...DEFAULT_SETTINGS };
let settingsOpen = false;
let systemFonts = [];
let wallpaper, desktopMode, desktopSink, miniPlayer, awakeBlocker = null;
const trayPet = createTrayPet({ getTray: () => companionTray, nativeImage });
const desktopHelperPath = () => app.isPackaged ? path.join(process.resourcesPath, 'native', 'DesktopHost.exe') : path.join(__dirname, 'native', 'bin', 'DesktopHost.exe');
let music;
let collection;
let catalog;
let companionTray;
let pet;
let localMusic;
let petState = { active: false };
let quitting = false;
let wallpaperState = { active: false, busy: false, error: '' };

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
// One tray icon while the wallpaper or the desktop pet keeps running.
function companionsActive() { return Boolean(wallpaperState.active || wallpaperState.busy || petState.active || desktopMode?.active || desktopSink?.active || desktopSink?.busy); }
function refreshTray() {
  if (companionsActive()) {
    if (!companionTray) {
      const image = nativeImage.createFromPath(trayIconPath(trayPet.petId));
      if (process.platform === 'darwin') image.setTemplateImage(true);
      companionTray = new Tray(image.isEmpty() ? path.join(__dirname, 'assets', 'tray.png') : image); companionTray.__petId = trayPet.petId;
      companionTray.on('double-click', () => desktopSink?.active ? desktopSink.exit() : restoreMainWindow());
    }
    companionTray.setToolTip('心流小屋');
    companionTray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开小屋', click: restoreMainWindow },
      { label: '小屋设置…', click: () => { restoreMainWindow(); sendCompanionCommand(siteView?.webContents, 'open-settings'); } },
      { label: '检查更新…', click: checkUpdatesFromMenu },
      { label: '开始 / 暂停专注', click: () => sendCompanionCommand(siteView?.webContents, 'focus-toggle') },
      { label: '开关小屋声音', click: () => sendCompanionCommand(siteView?.webContents, 'sound-toggle') },
      { type: 'separator' },
      petState.active ? { label: '让伙伴回家', click: () => pet.stop() } : { label: '伙伴出门（桌宠）', click: () => pet.start().catch((error) => writeLog('pet-error', error.message)) },
      desktopSink?.active || desktopSink?.busy ? { label: '浮出桌面（回到窗口）', accelerator: SINK_HOTKEY, click: () => desktopSink.exit() } : { label: '沉入桌面', accelerator: SINK_HOTKEY, click: () => desktopSink?.enter() },
      { type: 'separator' }, { label: '退出应用', click: () => app.quit() }
    ]));
  } else if (companionTray) {
    companionTray.destroy(); companionTray = null;
    if (!quitting && mainWindow && !mainWindow.isVisible()) restoreMainWindow();
  }
}
function petStatus(state) {
  petState = state; refreshTray();
  if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.executeJavaScript(`window.albumPetState = ${JSON.stringify(state)}; window.dispatchEvent(new CustomEvent('album-pet-state', {detail: window.albumPetState}));`).catch(() => {});
}
function wallpaperStatus(state) {
  wallpaperState = state;
  if (!state.active && !state.busy && state.error) desktopSink?.wallpaperLost(state.error);
  refreshTray();
  if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.executeJavaScript(`window.albumRoomWallpaperState = ${JSON.stringify(state)}; window.dispatchEvent(new CustomEvent('album-room-wallpaper', {detail: window.albumRoomWallpaperState}));`).catch(() => {});
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function currentDisplay() {
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  return { name: display.label || '显示器', width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor), scale: Math.round(display.scaleFactor * 100), refreshRate: display.displayFrequency };
}
async function applyAppearance() {
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.webContents.executeJavaScript(appearanceScript(appearance, { fonts: systemFonts })).catch(() => {});
  if (siteView && !siteView.webContents.isDestroyed() && isSiteUrl(siteView.webContents.getURL())) {
    siteView.webContents.setZoomFactor(appearance.zoom / 100);
    await siteView.webContents.executeJavaScript(appearanceScript(appearance, { fonts: systemFonts, platform: process.platform })).catch(() => {});
  }
  await wallpaper?.applyAppearance();
}
function toggleSettings(open = !settingsOpen) {
  settingsOpen = open;
  setSettingsVisibility(siteView, { open, loading, error: currentError });
  sendState();
}
async function saveAppearance(value) {
  const next = normalizeSettings(value);
  if (next.font !== 'bundled' && !(await listSystemFonts()).includes(next.font)) throw new Error('该字体未安装，请刷新本机字体列表后选择。');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath() + '.tmp', JSON.stringify(next));
  fs.renameSync(settingsPath() + '.tmp', settingsPath());
  appearance = next;
  await applyAppearance();
  sendState();
  return { settings: appearance, display: currentDisplay() };
}

// Window state and the renderer's immersive state are independent.
let fullscreenController;
function isFullscreen() { return Boolean(fullscreenController?.active); }
function setFullscreen(on) { fullscreenController?.set(on); }
const toggleFullscreen = () => fullscreenController?.toggle();
function syncFullscreen(fullscreen = isFullscreen()) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById('cabin-fullscreen');
  if (menuItem) menuItem.checked = fullscreen;
  // A fullscreen cabin is a screen to look at: keep the display awake meanwhile.
  if (fullscreen && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start('prevent-display-sleep');
  else if (!fullscreen && awakeBlocker !== null) { powerSaveBlocker.stop(awakeBlocker); awakeBlocker = null; }
  if (fullscreen && settingsOpen) toggleSettings(false);
  for (const contents of [mainWindow.webContents, siteView?.webContents]) {
    if (contents && !contents.isDestroyed()) contents.executeJavaScript(`document.documentElement.dataset.desktopFullscreen = '${fullscreen}'; window.dispatchEvent(new CustomEvent('album-desktop-fullscreen', {detail: ${fullscreen}}));`).catch(() => {});
  }
  resizeView();
}

function preferencesPath() { return path.join(app.getPath('userData'), 'window.json'); }
function writeLog(event, detail = '') {
  try {
    const logFile = path.join(app.getPath('userData'), 'desktop.log');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) fs.renameSync(logFile, `${logFile}.previous`);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${event} ${String(detail).replace(/[\r\n]/g, ' ').slice(0, 240)}\n`);
  } catch { /* A log failure must not prevent the client from opening. */ }
}

function sendState(extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const candidateContents = siteView?.webContents;
  const contents = candidateContents && !candidateContents.isDestroyed() ? candidateContents : null;
  const state = {
    loading,
    error: currentError,
    url: isSiteUrl(contents?.getURL()) ? contents.getURL() : lastGoodUrl,
    title: contents?.getTitle() || '心流小屋',
    canBack: Boolean(contents && !contents.isDestroyed() && contents.navigationHistory.canGoBack()),
    canForward: Boolean(contents && !contents.isDestroyed() && contents.navigationHistory.canGoForward()),
    version: app.getVersion(),
    settingsOpen, settings: appearance, display: currentDisplay(),
    ...extra
  };
  mainWindow.webContents.send('desktop:state', state);
}

function resizeView() {
  if (!mainWindow || mainWindow.isDestroyed() || !siteView) return;
  const [width, height] = mainWindow.getContentSize();
  siteView.setBounds({ x: 0, y: toolbarHeight, width, height: Math.max(0, height - toolbarHeight) });
}

function showFailure(message) {
  clearTimeout(loadTimer);
  loading = false;
  currentError = message;
  siteView?.setVisible(false);
  sendState();
  writeLog('connection-failed', message);
}

function openExternal(url) {
  if (!isExternalUrl(url)) return;
  shell.openExternal(url).catch(() => dialog.showMessageBox(mainWindow, {
    type: 'info', title: '无法打开浏览器', message: '请复制链接后，在系统浏览器中打开。'
  }));
}

function exitFullscreenOnEscape(event, input, renderer = false) {
  if (input.type === 'keyDown' && input.key === 'F11') { event.preventDefault(); if (!input.isAutoRepeat) toggleFullscreen(); return true; }
  if (input.type === 'keyDown' && input.key === 'Escape' && !renderer && !settingsOpen && isFullscreen()) {
    event.preventDefault();
    setFullscreen(false);
    return true;
  }
  if (input.type === 'keyDown' && input.key === 'Escape' && settingsOpen) { event.preventDefault(); toggleSettings(false); }
  return false;
}

async function navigate(url = lastGoodUrl) {
  if (!siteView || !isSiteUrl(url)) return;
  clearTimeout(loadTimer);
  clearTimeout(retryTimer);
  loading = true;
  currentError = '';
  documentHttpFailed = false;
  sendState();
  loadTimer = setTimeout(() => {
    if (loading) {
      siteView.webContents.stop();
      showFailure('连接等待时间较长，请检查网络后重试。');
    }
  }, 45000);
  try {
    await siteView.webContents.loadURL(url);
  } catch (error) {
    if (error.code !== 'ERR_ABORTED' && loading) { writeLog('load-error', error.code || error.message); showFailure('小屋暂时没能打开，请重新载入。'); }
  }
}

async function wireRemoteView() {
  const contents = siteView.webContents;
  contents.on('will-navigate', (event) => {
    const url = event.url;
    if (handleSiteCommand(url)) { event.preventDefault(); return; }
    if (!isSiteUrl(url)) { event.preventDefault(); openExternal(url); }
  });
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !isSiteUrl(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isSiteUrl(url)) { event.preventDefault(); showFailure('网站重定向到了其他地址，请在浏览器中检查。'); }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('album-desktop://action/')) { setImmediate(() => handleSiteCommand(url)); return { action: 'deny' }; }
    if (isSiteUrl(url)) setImmediate(() => navigate(url));
    else openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-start-loading', () => { loading = true; sendState(); });
  contents.on('did-finish-load', async () => {
    if (documentHttpFailed) { showFailure('小屋暂时没能打开，请重新载入。'); return; }
    // Chromium can finish rendering its internal error document after did-fail-load.
    if (currentError) { loading = false; sendState(); return; }
    clearTimeout(loadTimer);
    loading = false;
    currentError = '';
    if (isSiteUrl(contents.getURL())) lastGoodUrl = contents.getURL();
    await applyAppearance();
    syncFullscreen();
    wallpaperStatus(wallpaperState); petStatus(petState);
    if (desktopMode) notifySite(`document.documentElement.dataset.desktopMode = '${desktopMode.active}';`);
    if (desktopSink) notifySinkStatus(desktopSink.status());
    pushUpdateState();
    siteView.setVisible(!settingsOpen);
    if (mainWindow && !mainWindow.isDestroyed() && !contents.isDestroyed() && (!mainWindow.isVisible() || mainWindow.isMinimized())) await contents.executeJavaScript("window.dispatchEvent(new Event('blur'));").catch(() => {});
    sendState();
    writeLog('page-ready');
    confirmUpdatedCabinStartup();
  });
  contents.on('did-stop-loading', () => { if (!currentError) loading = false; sendState(); });
  contents.on('did-navigate-in-page', () => {
    if (isSiteUrl(contents.getURL())) lastGoodUrl = contents.getURL();
    sendState();
  });
  contents.on('page-title-updated', () => sendState());
  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) { writeLog('load-failed', `${errorCode} ${_description}`); showFailure('小屋暂时没能打开，请重新载入。'); }
  });
  contents.on('render-process-gone', (_event, details) => {
    showFailure('页面已暂停运行。点击重新连接即可恢复。');
    writeLog('renderer-exited', details.reason);
  });
  contents.on('before-input-event', (event, input) => {
    if (exitFullscreenOnEscape(event, input, true)) return;
    if (input.type !== 'keyDown') return;
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') { event.preventDefault(); navigate(); }
    if (input.alt && input.key === 'ArrowLeft' && contents.navigationHistory.canGoBack()) { event.preventDefault(); contents.navigationHistory.goBack(); }
    if (input.alt && input.key === 'ArrowRight' && contents.navigationHistory.canGoForward()) { event.preventDefault(); contents.navigationHistory.goForward(); }
  });
  const session = contents.session;
  const qq = createQQMusic((url, options) => net.fetch(url, { ...options, bypassCustomProtocolHandlers: true }));
  if (await session.protocol.isProtocolHandled('https')) session.protocol.unhandle('https');
  const route = createSiteRouter({
    webRoot: path.join(__dirname, 'web'),
    forward: (request) => session.fetch(request, { bypassCustomProtocolHandlers: true }),
    qq, collection, catalog, getAppearance: () => ({ ...appearance, platform: process.platform }),
    music: (request, pathname) => music.proxy(request, pathname, (url, options) => net.fetch(url, options))
  });
  session.protocol.handle('https', async (request) => {
    try { return await route(request); }
    catch (error) { writeLog('route-error', error.message); return new Response('Unavailable', { status: 502 }); }
  });
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Notifications announce the end of a focus round.
    callback(isSiteUrl(webContents.getURL()) && ['clipboard-sanitized-write', 'notifications'].includes(permission));
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isSiteUrl(requestingOrigin) && ['clipboard-sanitized-write', 'notifications'].includes(permission);
  });
  session.on('will-download', (event, item, source) => {
    const type = source === contents && isSiteUrl(contents.getURL()) && localDownloadType({ url:item.getURL(), filename:item.getFilename(), bytes:item.getTotalBytes(), mimeType:item.getMimeType() });
    if (!type) { event.preventDefault(); return; }
    item.setSaveDialogOptions({ title:type === 'tsv' ? '保存词书模板' : '保存专辑墙', defaultPath:path.join(app.getPath('downloads'), path.basename(item.getFilename())), filters:[{ name:type === 'tsv' ? '词书模板' : type === 'png' ? 'PNG 图片' : '专辑墙工程', extensions:[type] }] });
  });
  // Request URLs, tokens and room identifiers are intentionally not written to logs.
  session.webRequest.onHeadersReceived({ urls: [`${SITE_ORIGIN}/*`] }, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.statusCode >= 400) {
      documentHttpFailed = true;
      setImmediate(() => showFailure('小屋暂时没能打开，请重新载入。'));
    }
    const headers = { ...details.responseHeaders };
    if (details.resourceType === 'mainFrame' && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-security-policy')) {
      headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; media-src 'self' https: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'"];
    }
    callback({ responseHeaders: headers });
  });
}

function handleSiteCommand(value) {
  let url; try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'album-desktop:' || url.hostname !== 'action' || url.username || url.password || !isSiteUrl(siteView?.webContents.getURL())) return false;
  switch (url.pathname) {
    case '/settings': toggleSettings(true); break;
    case '/update-check': case '/update-download': case '/update-install': case '/update-relaunch': case '/update-open': case '/update-auto': case '/update-state': handleUpdateCommand(url.pathname, url.searchParams); break;
    case '/fullscreen': toggleFullscreen(); break;
    case '/fullscreen-exit': setFullscreen(false); break;
    // 沉入桌面. The old desktop-mode / wallpaper commands are kept as aliases.
    case '/desktop-sink': case '/desktop-mode': desktopSink.toggle(); break;
    case '/desktop-sink-enter': case '/wallpaper-start': desktopSink.enter(); break;
    case '/desktop-sink-exit': case '/desktop-mode-exit': case '/wallpaper-stop': desktopSink.exit(); break;
    case '/tray-pet': trayPet.setTrayPet(url.searchParams.get('id')); break;
    case '/minimize': mainWindow.minimize(); break;
    case '/maximize': if (desktopSink.active) desktopSink.exit(); else if (isFullscreen()) setFullscreen(false); else if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); break;
    case '/close': mainWindow.close(); break;
    case '/pet-start': pet.start().catch((error) => writeLog('pet-error', error.message)); break;
    case '/pet-stop': pet.stop(); break;
    case '/local-music-folder': chooseMusicFolder(); break;
    case '/music-login': if (['qq', 'netease'].includes(url.searchParams.get('provider'))) music.login(url.searchParams.get('provider')).then((result) => notifyMusic(result)).catch((error) => notifyMusic({ error: error.message })); break;
    case '/music-logout': if (['qq', 'netease'].includes(url.searchParams.get('provider'))) music.logout(url.searchParams.get('provider')).then(() => notifyMusic({ ok: true })).catch((error) => notifyMusic({ error: error.message })); break;
    case '/appearance': if (['true', 'false'].includes(url.searchParams.get('reduceMotion'))) saveAppearance({ ...appearance, reduceMotion: url.searchParams.get('reduceMotion') === 'true', ...(['cover', 'simple'].includes(url.searchParams.get('theme')) ? { theme: url.searchParams.get('theme') } : {}) }).catch(() => {}); break;
    default: return false;
  }
  return true;
}
async function chooseMusicFolder() {
  const result = await dialog.showOpenDialog(mainWindow, { title: '选择本地音乐文件夹', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) { notifyLocalMusic({ cancelled: true }); return; }
  notifyLocalMusic({ scanning: true });
  try { notifyLocalMusic({ ok: true, ...(await localMusic.addFolder(result.filePaths[0])) }); }
  catch (error) { notifyLocalMusic({ error: error.message || '无法读取这个文件夹。' }); }
}
function notifyLocalMusic(detail) {
  if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('album-local-music', {detail: ${JSON.stringify(detail)}}));`).catch(() => {});
}
function notifySinkStatus(state) {
  notifySite(`window.cabinDesktopStatus = ${JSON.stringify(state)}; document.documentElement.dataset.desktopSink = '${state.active}'; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', {detail: window.cabinDesktopStatus}));`);
}
// 检查更新 (desktop/updater.cjs). State reaches the page as
// window.cabinUpdateState + CustomEvent 'cabin:update-state'.
let updater = null, macUpdater = null;
async function confirmUpdatedCabinStartup() {
  const contents = siteView?.webContents;
  if (!macUpdater || !startupComplete || loading || currentError || documentHttpFailed || !contents || contents.isDestroyed() || !isSiteUrl(contents.getURL())) return;
  // A loaded Electron shell can still contain a failed/blank React page.
  const cabinReady = await contents.executeJavaScript(`new Promise(resolve => {
    const timer = setTimeout(() => { observer.disconnect(); resolve(false); }, 10000);
    const check = () => { if (!document.querySelector('.cabin-room')) return; observer.disconnect(); clearTimeout(timer); setTimeout(() => resolve(Boolean(document.querySelector('.cabin-room'))), 500); };
    const observer = new MutationObserver(check); observer.observe(document.documentElement, { childList: true, subtree: true }); check();
  })`).catch(() => false);
  if (cabinReady === true && contents === siteView?.webContents && !contents.isDestroyed() && !loading && !currentError && !documentHttpFailed) {
    macUpdater.confirmStartup({ cabinReady: true });
    if (macUpdater.startupWarning) { writeLog('update-recovery', macUpdater.startupWarning); if (macUpdater.listenerCount('error')) macUpdater.emit('error', new Error(macUpdater.startupWarning)); }
  }
}
function updateSettings() {
  const file = path.join(app.getPath('userData'), 'update.json');
  return { get: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).autoDownload !== false; } catch { return true; } }, set: (value) => { try { fs.writeFileSync(file, JSON.stringify({ autoDownload: Boolean(value) })); } catch {} } };
}
function pushUpdateState(state = updater?.state) {
  if (state) notifySite(`window.cabinUpdateState = ${JSON.stringify(state)}; window.dispatchEvent(new CustomEvent('cabin:update-state', { detail: window.cabinUpdateState }));`);
}
function startUpdater() {
  const { updateMode } = require('./updater.cjs');
  // macOS: ad-hoc builds update themselves (desktop/mac-updater.cjs). net.fetch
  // follows the system proxy settings.
  if (process.platform === 'darwin' && app.isPackaged) macUpdater = createMacUpdater({ app, fetch: (url, options) => net.fetch(url, options), bundlePath: path.resolve(process.execPath, '..', '..', '..'), directory: path.join(app.getPath('userData'), 'updates') });
  confirmUpdatedCabinStartup();
  const macUpdatable = macUpdater ? macUpdater.canSelfUpdate({ isPackaged: app.isPackaged }) : null;
  const native = updateMode({ isPackaged: app.isPackaged, macUpdatable }).mode === 'install';
  updater = createUpdater({ currentVersion: app.getVersion(), isPackaged: app.isPackaged, macUpdatable, autoUpdater: native ? macUpdater || require('electron-updater').autoUpdater : null, openExternal: (url) => shell.openExternal(url), installedVersion: () => macUpdater?.installedVersion() || '', relaunch: relaunchInstalledCopy, settings: updateSettings(), onState: (state) => pushUpdateState(state) });
  if (!process.env.ALBUM_DESKTOP_TEST_PROFILE) updater.start();
}
// The .app on disk was replaced (a DMG dragged over it) while this older
// process kept running in the background: start the installed copy instead.
function relaunchInstalledCopy() {
  if (macUpdater) macUpdater.autoInstallOnAppQuit = false; // the newer copy wins; never swap a staged older one over it
  app.relaunch(); app.quit(); return true;
}
// Reopening the app (Dock, Launchpad, Finder) while it only ran in the
// background starts the newer installed copy; with the window open the
// About row offers 「重启到新版本」 instead.
function newerCopyInstalled() {
  const installed = macUpdater?.installedVersion() || '';
  return Boolean(installed) && compareVersions(installed, app.getVersion()) > 0;
}
function checkUpdatesFromMenu() { restoreMainWindow(); sendCompanionCommand(siteView?.webContents, 'open-about'); updater?.check({ manual: true }); }
function handleUpdateCommand(pathname, params) {
  if (!updater) return;
  if (pathname === '/update-check') updater.check({ manual: true });
  else if (pathname === '/update-download') updater.download();
  else if (pathname === '/update-install') updater.install();
  else if (pathname === '/update-relaunch') updater.restart();
  else if (pathname === '/update-open') updater.openRelease();
  else if (pathname === '/update-auto' && ['true', 'false'].includes(params.get('enabled'))) updater.setAutoDownload(params.get('enabled') === 'true');
  else if (pathname === '/update-state') pushUpdateState();
}
function notifySite(script) {
  if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.executeJavaScript(script).catch(() => {});
}
function notifyMusic(result) {
  if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('album-music-account', {detail: ${JSON.stringify(result)}}));`).catch(() => {});
}


function showToolbarMenu() {
  const [width] = mainWindow.getContentSize();
  Menu.buildFromTemplate([
    { label: `心流小屋 · ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '设置', click: () => toggleSettings(true) },
    { label: '打开数据文件夹', click: () => shell.openPath(app.getPath('userData')) },
  ]).popup({ window: mainWindow, x: Math.max(0, width - 250), y: toolbarHeight });
}

function createMenus() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '应用', submenu: [
      { label: '小屋设置…', click: () => sendCompanionCommand(siteView?.webContents, 'open-settings') },
      { label: '显示与字体…', accelerator: 'CmdOrCtrl+,', click: () => toggleSettings(true) },
      { label: '重新引导', click: () => sendCompanionCommand(siteView?.webContents, 'open-onboarding') },
      { label: '检查更新…', click: checkUpdatesFromMenu },
      { label: '重新载入小屋', accelerator: 'CmdOrCtrl+R', click: () => navigate(`${SITE_ORIGIN}/`) },
      { type: 'separator' },
        { type: 'separator' },
      { role: 'quit', label: '退出' }
    ]},
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ]},
    { label: '查看', submenu: [
      { label: '放大', accelerator: 'CmdOrCtrl+Plus', click: () => saveAppearance({ ...appearance, zoom: appearance.zoom + 5 }).catch(() => {}) },
      { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => saveAppearance({ ...appearance, zoom: appearance.zoom - 5 }).catch(() => {}) },
      { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => saveAppearance({ ...appearance, zoom: 100 }).catch(() => {}) },
      { id: 'cabin-fullscreen', type: 'checkbox', checked: isFullscreen(), label: '交互全屏', accelerator: 'F11', click: toggleFullscreen },
      { label: '沉入桌面', accelerator: SINK_HOTKEY, registerAccelerator: false, click: () => desktopSink.toggle() }
    ]},
    { label: '帮助', submenu: [
      { label: '打开数据文件夹', click: () => shell.openPath(app.getPath('userData')) },
      { label: '关于心流小屋', click: () => dialog.showMessageBox(mainWindow, {
        type: 'info', title: '心流小屋', message: `心流小屋 ${app.getVersion()}`,
        detail: '像素 Lo-fi 小屋：收藏专辑、听歌和专注。\n所有收藏与专注记录保存在这台电脑。\n\n使用 HarmonyOS Sans SC 字体，Copyright 2021 Huawei Device Co., Ltd.，字体原文件与授权协议随应用打包。\nQQ / 网易云播放模块来自 Simple Music（GPL-3.0）；曲库搜索来自 iTunes Search 与 MusicBrainz。'
      }) }
    ]}
  ]));
}


function registerIpc() {
  ipcMain.handle('desktop:command', async (event, command) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isShellUrl(event.senderFrame.url)) throw new Error('Unknown sender');
    switch (command) {
      case 'ready': sendState(); break;
      case 'retry': await navigate(); break;
      case 'home': await navigate(`${SITE_ORIGIN}/`); break;
      case 'menu': showToolbarMenu(); break;
      case 'settings': toggleSettings(true); break;
      case 'settings-close': toggleSettings(false); break;
      case 'fit-display': mainWindow.maximize(); sendState(); break;
      case 'minimize': mainWindow.minimize(); break;
      case 'maximize': if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); break;
      case 'close': mainWindow.close(); break;
      default: throw new Error('Unknown command');
    }
    return true;
  });
  ipcMain.handle('desktop:settings', async (event, operation, value) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isShellUrl(event.senderFrame.url)) throw new Error('Unknown sender');
    if (operation === 'get') return { settings: appearance, fonts: await listSystemFonts(), display: currentDisplay() };
    if (operation === 'apply') return saveAppearance(value);
    if (operation === 'reset') return saveAppearance(DEFAULT_SETTINGS);
    throw new Error('Unknown settings operation');
  });
}

async function createWindow() {
  try { preferences = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')); } catch { preferences = {}; }
  preferences = migrateDesktopPreferences(preferences);
  try { appearance = normalizeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))); } catch { appearance = { ...DEFAULT_SETTINGS }; }
  if (appearance.font !== 'bundled' && !(await listSystemFonts()).includes(appearance.font)) appearance.font = 'bundled';
  const display = Number.isFinite(preferences.x) && Number.isFinite(preferences.y) ? screen.getDisplayMatching(preferences) : screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    ...safeSavedWindow(preferences, display.workArea), minWidth: Math.min(900, display.workArea.width), minHeight: Math.min(600, display.workArea.height),
    title: '心流小屋', icon, backgroundColor: '#24160f', show: false,
    // Keep the native resize style: removing it breaks real fullscreen on Windows.
    autoHideMenuBar: true, frame: false, thickFrame: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  siteView = new WebContentsView({
    // Not throttled: the focus timer, ambience and companion state keep running while hidden in the tray.
    webPreferences: { partition: 'persist:album-circle-v1', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, backgroundThrottling: false }
  });
  siteView.setBackgroundColor('#24160f');
  mainWindow.contentView.addChildView(siteView);
  siteView.setVisible(false);
  resizeView();
  await wireRemoteView();
  createMenus();
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('before-input-event', exitFullscreenOnEscape);
  fullscreenController = createFullscreen({ window: mainWindow, getSink: () => desktopSink, onChange: syncFullscreen });
  // Non-throttled child views retain Page Visibility/focus on host hide. Forward
  // standard DOM focus lifecycle for visual consumers; timers/audio stay live.
  // This exposes no new IPC channel or renderer method.
  for (const [nativeEvent, domEvent] of [['hide', 'blur'], ['minimize', 'blur'], ['show', 'focus'], ['restore', 'focus']]) {
    mainWindow.on(nativeEvent, () => {
      const contents = siteView?.webContents;
      if (contents && !contents.isDestroyed()) contents.executeJavaScript(`window.dispatchEvent(new Event('${domEvent}'));`).catch(() => {});
    });
  }
  mainWindow.on('resize', () => { resizeView(); setImmediate(resizeView); });
  mainWindow.on('maximize', () => setImmediate(resizeView));
  mainWindow.on('unmaximize', () => setImmediate(resizeView));
  mainWindow.on('move', () => { if (settingsOpen) sendState(); });
  mainWindow.on('close', (event) => {
    if ((desktopSink?.active || desktopSink?.busy || pet?.active) && !quitting) { event.preventDefault(); mainWindow.hide(); return; }
    // Closing while the cabin is the desktop leaves desktop mode; the next launch returns to it only if the app quit while in it.
    const wasDesktop = Boolean(desktopSink?.active);
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      if (wasDesktop) { const previous = (() => { try { return JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')); } catch { return {}; } })(); fs.writeFileSync(preferencesPath(), JSON.stringify({ ...migrateDesktopPreferences(previous), desktopSink: true, displayAdapted: true })); desktopSink.stop(); }
      else fs.writeFileSync(preferencesPath(), JSON.stringify({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized(), displayAdapted: true, desktopSink: false }));
    } catch { /* Keep the last successfully saved window state. */ }
    clearTimeout(loadTimer); clearTimeout(retryTimer);
    if (siteView && !siteView.webContents.isDestroyed()) siteView.webContents.close();
  });
  mainWindow.on('closed', () => { mainWindow = null; siteView = null; });
  await mainWindow.loadURL(SHELL_URL);
  await applyAppearance();
  syncFullscreen();
  if (preferences.maximized || !preferences.displayAdapted) mainWindow.maximize();
  mainWindow.show();
  resizeView();
  if (preferences.desktopSink) desktopSink.enter().catch((error) => writeLog('desktop-sink-error', error.message));
  listSystemFonts().then((fonts) => { systemFonts = fonts; return applyAppearance(); }).catch(() => {});
  startupComplete = true;
  await navigate();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    restoreMainWindow();
  });
  app.whenReady().then(async () => {
    screen.on('display-metrics-changed', () => { sendState(); wallpaper?.reposition(); pet?.reposition(); desktopMode?.refit(); miniPlayer?.reposition(); });
    screen.on('display-removed', () => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) mainWindow.setBounds(safeSavedWindow(mainWindow.getBounds(), screen.getDisplayMatching(mainWindow.getBounds()).workArea));
      sendState();
      wallpaper?.reposition(); pet?.reposition(); desktopMode?.refit(); miniPlayer?.reposition();
    });
    registerShellProtocol(); registerIpc();
    wallpaper = createWallpaper({ app, getMain: () => mainWindow, getSite: () => siteView?.webContents, status: wallpaperStatus, appearanceScript, getAppearance: () => appearance, log: writeLog, registerProtocol: registerShellProtocol });
    desktopMode = createDesktopMode({ getWindow: () => mainWindow, screen, leaveFullscreen: () => setFullscreen(false), helperPath: desktopHelperPath(), log: writeLog,
      onChange: (state) => { refreshTray(); notifySite(`document.documentElement.dataset.desktopMode = '${state.active}'; window.dispatchEvent(new CustomEvent('album-desktop-mode', {detail: ${JSON.stringify(state)}}));`); } });
    pet = createPet({ directory: app.getPath('userData'), getSite: () => siteView?.webContents, status: petStatus, registerProtocol: registerShellProtocol, restoreMain: restoreMainWindow, log: writeLog });
    miniPlayer = createMiniPlayer({ getSite: () => siteView?.webContents, getAnchor: () => mainWindow?.getBounds(), registerProtocol: registerShellProtocol, helperPath: desktopHelperPath(), onExit: () => desktopSink.exit(), log: writeLog });
    desktopSink = createDesktopSink({ wallpaper, legacy: desktopMode, pet, mini: miniPlayer, log: writeLog,
      hideMain: () => { if (mainWindow && !mainWindow.isDestroyed()) { setFullscreen(false); mainWindow.hide(); } },
      restoreMain: restoreMainWindow,
      setLowPower: (on) => wallpaper.setFrameRate(on ? 10 : 30),
      onChange: (state) => { refreshTray(); notifySinkStatus(state); } });
    // Exit is always one keystroke away, even with the window collapsed.
    try { globalShortcut.register(SINK_HOTKEY, () => desktopSink.toggle()); } catch (error) { writeLog('desktop-sink-hotkey', error.message); }
    // On battery the scene drops to 10 fps; on AC it returns to 30 fps.
    const power = () => desktopSink.setLowPower(powerMonitor.isOnBatteryPower?.() ?? powerMonitor.onBatteryPower);
    powerMonitor.on('on-battery', power); powerMonitor.on('on-ac', power);
    powerMonitor.on('lock-screen', () => desktopSink.setLowPower(true)); powerMonitor.on('unlock-screen', power);
    power();
    collection = createCollectionStore({ directory: app.getPath('userData') });
    const search = import('./catalog-search.mjs');
    catalog = async (params) => (await search).searchCatalog(params);
    localMusic = createLocalMusic({ directory: app.getPath('userData'), resizeCover: (buffer) => { const image = nativeImage.createFromBuffer(buffer); return image.isEmpty() ? null : image.resize({ width: Math.min(600, image.getSize().width), quality: 'good' }).toJPEG(86); } });
    const nowPlaying = createNowPlaying({ helperPath: app.isPackaged ? path.join(process.resourcesPath, 'native', 'NowPlaying.exe') : path.join(__dirname, 'native', 'bin', 'NowPlaying.exe') });
    music = createMusicService({ directory: app.getPath('userData'), safeStorage, nowPlaying, localMusic, appleMusic: createAppleMusic({ country: app.getLocaleCountryCode() }), localApps: createLocalApps({ openExternal: (url) => shell.openExternal(url), appForProtocol: (url) => app.getApplicationNameForProtocol(url) }), login: (provider) => provider === 'qq' ? openQQLogin(mainWindow) : openNeteaseLogin(mainWindow), logout: (provider) => provider === 'qq' ? clearQQLogin() : clearNeteaseLogin() });
    writeLog('started', app.getVersion()); await createWindow(); try { startUpdater(); } catch (error) { writeLog('updater-error', error.message); }
  }).catch((error) => {
    writeLog('startup-error', error.message);
    dialog.showErrorBox('心流小屋启动失败', '请关闭后重新打开应用。\n' + error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => {
    if (newerCopyInstalled()) {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) { writeLog('relaunch-installed', macUpdater.installedVersion()); relaunchInstalledCopy(); return; }
      updater?.checkInstalled();
    }
    if (mainWindow) restoreMainWindow(); else createWindow().catch((error) => writeLog('startup-error', error.message));
  });
  app.on('before-quit', () => { quitting = true; if (awakeBlocker !== null) { powerSaveBlocker.stop(awakeBlocker); awakeBlocker = null; } globalShortcut.unregisterAll(); desktopSink?.stop(); miniPlayer?.hide(); wallpaper?.stop(); pet?.stop(); music?.stop(); companionTray?.destroy(); companionTray = null; if (startupComplete) writeLog('closed'); });
}
