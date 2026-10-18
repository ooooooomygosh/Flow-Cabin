'use strict';

const { app, BrowserWindow, WebContentsView, Menu, Tray, dialog, ipcMain, clipboard, shell, protocol, screen, net, safeStorage, nativeImage, powerSaveBlocker, globalShortcut, powerMonitor, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SITE_ORIGIN, SHELL_URL, isSiteUrl, isShellUrl, isExternalUrl, safeSavedWindow } = require('./policy.cjs');
const { DEFAULT_SETTINGS, normalizeSettings, appearanceScript, listSystemFonts, setSettingsVisibility } = require('./settings.cjs');
const { registerShellProtocol } = require('./shell-protocol.cjs');
const { createWallpaper } = require('./wallpaper.cjs');
const { createFullscreen } = require('./fullscreen.cjs');
const { createDesktopMode } = require('./desktop-mode.cjs');
const { createDesktopSink, migrateDesktopPreferences } = require('./desktop-sink.cjs');
const { createMiniPlayer } = require('./mini-player.cjs');
const { trayIconPath, createTrayPet } = require('./tray-icons.cjs');
const { createTypingHook } = require('./typing-hook.cjs');
const { createCollectionStore } = require('./collection-store.cjs');
const { createMusicService } = require('./music-service.cjs');
const { openQQLogin, openNeteaseLogin, clearQQLogin, clearNeteaseLogin } = require('./music-login.cjs');
const { createPet } = require('./pet.cjs');
const { createNowPlaying } = require('./now-playing.cjs');
const { createAppleMusic } = require('./apple-music.cjs');
const { createLocalApps } = require('./local-app.cjs');
const { createLocalMusic } = require('./local-music.cjs');
const { sendCompanionCommand } = require('./companion-sync.cjs');
// The main process is split by concern: page commands, the page session, updates, menus, login item.
const { createSiteCommands } = require('./main/site-commands.cjs');
const { wireSiteSession } = require('./main/site-session.cjs');
const { createUpdates } = require('./main/updates.cjs');
const { appMenuTemplate, trayMenuTemplate, ABOUT_DETAIL, SINK_HOTKEY } = require('./main/menus.cjs');
const { createAutostart, autostartScript } = require('./main/autostart.cjs');
const { createWeather, weatherScript } = require('./weather.cjs');

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
    companionTray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate({
      restore: restoreMainWindow, companion: (command) => sendCompanionCommand(siteView?.webContents, command), checkUpdates: () => updates.checkFromMenu(),
      petActive: petState.active, petStart: () => pet.start().catch((error) => writeLog('pet-error', error.message)), petStop: () => pet.stop(),
      sinkActive: Boolean(desktopSink?.active || desktopSink?.busy), sinkEnter: () => desktopSink?.enter(), sinkExit: () => desktopSink.exit(), quit: () => app.quit()
    })));
  } else if (companionTray) {
    companionTray.destroy(); companionTray = null;
    if (!quitting && mainWindow && !mainWindow.isVisible()) restoreMainWindow();
  }
}
// 打字跟随: the global key-activity hook runs only while the setting is on AND the pet is out.
const typingHook = createTypingHook({ systemPreferences, onActivity: (at) => pet?.typing(at), log: (...args) => writeLog(...args) });
function syncTyping() { return typingHook.setEnabled(Boolean(appearance.typingFollow && petState.active)); }
function typingInfo() { return { status: appearance.typingFollow && !petState.active ? 'waiting-pet' : typingHook.status(), platform: process.platform }; }
function petStatus(state) {
  petState = state; syncTyping(); refreshTray();
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
  sendState(); syncTyping();
  return { settings: appearance, display: currentDisplay(), typing: typingInfo() };
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
    if (desktopMode) notifySite(`document.documentElement.dataset.desktopMode = '${desktopMode.active}'; window.dispatchEvent(new CustomEvent('album-desktop-mode', {detail: {active: ${Boolean(desktopMode.active)}}}));`);
    if (desktopSink) notifySinkStatus(desktopSink.status());
    updates.push(); autostart.publish(); weather.publish();
    siteView.setVisible(!settingsOpen);
    if (mainWindow && !mainWindow.isDestroyed() && !contents.isDestroyed() && (!mainWindow.isVisible() || mainWindow.isMinimized())) await contents.executeJavaScript("window.dispatchEvent(new Event('blur'));").catch(() => {});
    sendState();
    writeLog('page-ready');
    updates.confirmStartup();
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
  await wireSiteSession({ contents, net, webRoot: path.join(__dirname, 'web'), collection, catalog, music: () => music, getAppearance: () => ({ ...appearance, platform: process.platform }), downloads: () => app.getPath('downloads'), writeLog,
    onDocumentFailed: () => { documentHttpFailed = true; setImmediate(() => showFailure('小屋暂时没能打开，请重新载入。')); } });
}

const siteCommands = createSiteCommands({
  isSitePage: () => isSiteUrl(siteView?.webContents.getURL()), mainWindow: () => mainWindow, desktopSink: () => desktopSink, pet: () => pet, music: () => music, appearance: () => appearance, trayPet,
  toggleSettings, toggleFullscreen, setFullscreen, isFullscreen, chooseMusicFolder, notifyMusic, saveAppearance, writeLog,
  handleUpdateCommand: (pathname, params) => updates.handle(pathname, params),
  get autostart() { return autostart; },
  get weather() { return weather; }
});
const handleSiteCommand = (value) => siteCommands.handle(value);
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
const updates = createUpdates({ app, net, shell, writeLog, notifySite: (script) => notifySite(script), getContents: () => siteView?.webContents,
  pageReady: () => startupComplete && !loading && !currentError && !documentHttpFailed && isSiteUrl(siteView?.webContents.getURL()),
  openAbout: () => { restoreMainWindow(); sendCompanionCommand(siteView?.webContents, 'open-about'); } });
const autostart = createAutostart({ app, publish: (state) => notifySite(autostartScript(state)) });
const weather = createWeather({ fetch: (url, options) => net.fetch(url, options), publish: (state) => notifySite(weatherScript(state)), writeLog });
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
    { label: '显示与字体…', click: () => toggleSettings(true) },
    { label: '打开数据文件夹', click: () => shell.openPath(app.getPath('userData')) },
  ]).popup({ window: mainWindow, x: Math.max(0, width - 250), y: toolbarHeight });
}

function createMenus() {
  const zoom = (step) => saveAppearance({ ...appearance, zoom: step ? appearance.zoom + step : 100 }).catch(() => {});
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate({
    companion: (command) => sendCompanionCommand(siteView?.webContents, command), toggleSettings, checkUpdates: () => updates.checkFromMenu(),
    reload: () => navigate(`${SITE_ORIGIN}/`), zoom, fullscreen: isFullscreen(), toggleFullscreen, toggleSink: () => desktopSink.toggle(),
    openData: () => shell.openPath(app.getPath('userData')),
    about: () => dialog.showMessageBox(mainWindow, { type: 'info', title: '心流小屋', message: `心流小屋 ${app.getVersion()}`, detail: ABOUT_DETAIL })
  })));
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
    if (operation === 'get') { typingHook.retry(); return { settings: appearance, fonts: await listSystemFonts(), display: currentDisplay(), typing: typingInfo() }; }
    if (operation === 'typing-permission') { typingHook.requestPermission(); return { typing: typingInfo() }; }
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
    writeLog('started', app.getVersion()); await createWindow(); try { updates.start(); } catch (error) { writeLog('updater-error', error.message); }
  }).catch((error) => {
    writeLog('startup-error', error.message);
    dialog.showErrorBox('心流小屋启动失败', '请关闭后重新打开应用。\n' + error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  // Coming back from System Settings after granting permission starts the hook without a restart.
  app.on('browser-window-focus', () => { if (typingHook.status() === 'needs-permission') typingHook.retry(); });
  app.on('activate', () => {
    if (updates.newerCopyInstalled()) {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) { writeLog('relaunch-installed', updates.installedVersion()); updates.relaunchInstalledCopy(); return; }
      updates.checkInstalled();
    }
    if (mainWindow) restoreMainWindow(); else createWindow().catch((error) => writeLog('startup-error', error.message));
  });
  app.on('before-quit', () => { quitting = true; typingHook.stop(); if (awakeBlocker !== null) { powerSaveBlocker.stop(awakeBlocker); awakeBlocker = null; } globalShortcut.unregisterAll(); desktopSink?.stop(); miniPlayer?.hide(); wallpaper?.stop(); pet?.stop(); weather.dispose(); music?.stop(); companionTray?.destroy(); companionTray = null; if (startupComplete) writeLog('closed'); });
}
