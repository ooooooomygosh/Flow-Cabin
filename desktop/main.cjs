'use strict';
const { createLyricWindow } = require('./lyric-window.cjs');

const { app, BrowserWindow, WebContentsView, Menu, Tray, dialog, ipcMain, clipboard, shell, protocol, screen, net, safeStorage, nativeImage, powerSaveBlocker, globalShortcut, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { SITE_ORIGIN, SHELL_URL, isSiteUrl, isShellUrl, isExternalUrl, safeSavedWindow } = require('./policy.cjs');
const { DEFAULT_SETTINGS, normalizeSettings, appearanceScript, listSystemFonts, setSettingsVisibility } = require('./settings.cjs');
const { registerShellProtocol } = require('./shell-protocol.cjs');
const { createWallpaper } = require('./wallpaper.cjs');
const { createFullscreen } = require('./fullscreen.cjs');
const { createDesktopMode } = require('./desktop-mode.cjs');
const { createDesktopSink, migrateDesktopPreferences } = require('./desktop-sink.cjs');
const { createMiniPlayer } = require('./mini-player.cjs');
const { trayIconPath, createTrayPet } = require('./tray-icons.cjs');
const { createPetMenu } = require('./pet-menu.cjs');
const { createTypingHook } = require('./typing-hook.cjs');
const { createInputStats } = require('./input-stats.cjs');
const { createCollectionStore } = require('./collection-store.cjs');
const { createMusicService } = require('./music-service.cjs');
const { openQQLogin, openNeteaseLogin, clearQQLogin, clearNeteaseLogin } = require('./music-login.cjs');
const { createPet, prefsFromParams } = require('./pet.cjs');
const { createNowPlaying } = require('./now-playing.cjs');
const { createAppleMusic } = require('./apple-music.cjs');
const { createLocalApps } = require('./local-app.cjs');
const { createLocalMusic } = require('./local-music.cjs');
const { sendCompanionCommand, createCompanionPoller, readCompanion } = require('./companion-sync.cjs');
const { cleanCompanion } = require('./wallpaper-model.cjs');
const { statusFrom, statusIconPath, createStatusApplier } = require('./status-bar.cjs');
const { relayPlayerCommand } = require('./mini-player.cjs');
// The main process is split by concern: page commands, the page session, updates, menus, login item.
const { createSiteCommands } = require('./main/site-commands.cjs');
const { createLanService } = require('./lan-service.cjs');
const { createPetPackStore, createPetPackRoute } = require('./pet-pack.cjs');
const { createDshBridge } = require('./dsh-bridge.cjs');
const { wireSiteSession } = require('./main/site-session.cjs');
const { createUpdates } = require('./main/updates.cjs');
const { appMenuTemplate, trayMenuTemplate, ABOUT_DETAIL, SINK_HOTKEY } = require('./main/menus.cjs');
const { createAutostart, autostartScript } = require('./main/autostart.cjs');
const { createWeather, weatherScript } = require('./weather.cjs');
const { createWeatherApi } = require('./weather-api.cjs');
const { createLocation } = require('./location.cjs');
const { createAi, aiScript } = require('./ai.cjs');
// 2.2 focus: notifications, lock / sleep relay, close-to-tray while a round runs, global shortcuts.
const { FOCUS_HOTKEYS, parseNotice, createNotifier, keepAliveOnClose, createPowerRelay, powerScript } = require('./focus-shell.cjs');
const { Notification } = require('electron');

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
let lyricWindow, wallpaper, desktopMode, desktopSink, miniPlayer, awakeBlocker = null;
const trayPet = createTrayPet({ getTray: () => companionTray, getWindow: () => mainWindow, app, nativeImage, directory: app.getPath('userData') });
const desktopHelperPath = () => app.isPackaged ? path.join(process.resourcesPath, 'native', 'DesktopHost.exe') : path.join(__dirname, 'native', 'bin', 'DesktopHost.exe');
let music;
let lan, petPackRoute, dshBridge, dshSnapshot = { paused: true };
let collection;
let catalog;
let companionTray, petMenu, currentTrayMenu;
let lastCompanion = null;
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
// --- 2.2 focus (desktop/focus-shell.cjs) ---
const focusNotifier = createNotifier({ Notification, restore: () => restoreMainWindow(), command: (command) => sendCompanionCommand(siteView?.webContents, command), log: (...args) => writeLog(...args) });
let closedToTrayHint = false;
// Quitting from the tray / app menu while a round runs asks first; the window's close button only hides.
async function requestQuit() {
  if (!quitting && trayStatus.phase !== 'idle') {
    const options = { type: 'question', title: '退出心流小屋', message: trayStatus.phase === 'focus' ? '专注还在进行，确定退出吗？' : '休息计时还在进行，确定退出吗？', detail: '退出后，这一轮结束时小屋就没法提醒你了。关闭窗口则会留在托盘 / 菜单栏里继续计时。', buttons: ['继续计时', '退出'], defaultId: 0, cancelId: 0, noLink: true };
    const answer = await (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options));
    if (answer.response !== 1) return;
  }
  app.quit();
}
// --- end 2.2 focus ---
// One tray icon while the wallpaper or the desktop pet keeps running, while a focus round runs,
// and always in the macOS menu bar (status: remaining time as the title, state icon).
function companionsActive() { return Boolean(wallpaperState.active || wallpaperState.busy || petState.active || desktopMode?.active || desktopSink?.active || desktopSink?.busy); }
const statusBar = createStatusApplier({ getTray: () => companionTray, getWindow: () => mainWindow, app, nativeImage, getPetId: () => trayPet.petId, applyPetIcon: true });
let trayStatus = statusFrom(null);
function trayWanted() { return companionsActive() || process.platform === 'darwin' || trayStatus.phase !== 'idle'; }
function openJournal() { restoreMainWindow(); siteView?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('cabin:open-journal'))").catch(() => {}); }
function refreshTray() {
  if (trayWanted()) {
    if (!companionTray) {
      const image = nativeImage.createFromPath(trayIconPath(trayPet.petId));
      if (process.platform === 'darwin') image.setTemplateImage(false);
      companionTray = new Tray(image.isEmpty() ? path.join(__dirname, 'assets', 'tray.png') : image); companionTray.__statusIcon = trayStatus.icon;
      companionTray.on('click', () => { if (process.platform === 'darwin') petMenu?.toggle().catch(error => writeLog('pet-menu', error.message)); });
      companionTray.on('right-click', () => { if (process.platform === 'darwin' && currentTrayMenu) companionTray.popUpContextMenu(currentTrayMenu); });
      companionTray.on('double-click', () => desktopSink?.active ? desktopSink.exit() : restoreMainWindow());
    }
    const companion = (command) => sendCompanionCommand(siteView?.webContents, command);
    currentTrayMenu = Menu.buildFromTemplate(trayMenuTemplate({
      restore: restoreMainWindow, companion, checkUpdates: () => updates.checkFromMenu(),
      status: trayStatus, player: (action) => relayPlayerCommand(siteView?.webContents, action), openJournal,
      petActive: petState.active, petStart: () => pet.start().catch((error) => writeLog('pet-error', error.message)), petStop: () => pet.stop(),
      sinkActive: Boolean(desktopSink?.active || desktopSink?.busy), sinkEnter: () => desktopSink?.enter(), sinkExit: () => desktopSink.exit(), quit: () => requestQuit().catch((error) => writeLog('quit-error', error.message)),
      petHidden: Boolean(pet?.hiddenUntil), petShow: () => pet?.showNow()
    }));
    if (process.platform !== 'darwin') companionTray.setContextMenu(currentTrayMenu);
    trayPet.refresh();
    statusBar.apply(trayStatus);
  } else if (companionTray) {
    trayPet.stop(); companionTray.destroy(); companionTray = null;
    if (!quitting && mainWindow && !mainWindow.isVisible()) restoreMainWindow();
  }
}
// Status poll: every second while a round runs (the title counts down), slower otherwise.
// The menu is rebuilt only when what it shows changes; title / Dock / taskbar follow every tick.
let trayMenuKey = '';
const statusPoller = createCompanionPoller({ getSite: () => siteView?.webContents, clean: value => cleanCompanion(value?.companion),
  interval: (value) => dshBridge?.status().enabled ? 500 : value?.focus && value.focus.phase !== 'idle' ? 1000 : 3000,
  onValue: (value) => {
    const focusActive = value?.focus?.phase === 'focus' && !value.focus.paused;
    dshSnapshot = { pose: value?.pose || (focusActive ? 'focus' : Date.now() - (value?.typingAt || 0) < 900 ? 'typing' : value?.playing || value?.musicPlaying ? (value?.bpm && value?.beatAt ? 'groove' : 'listen') : 'idle'), quiet: appearance.reduceMotion === true, paused: loading || !siteView };
    lastCompanion = value; trayPet.setCompanion(value);
    trayStatus = statusFrom(value); petMenu?.publish();
    const key = [trayStatus.statusLine, trayStatus.playing, trayStatus.phase, trayStatus.paused, trayWanted()].join('|');
    if (key !== trayMenuKey || !companionTray) { trayMenuKey = key; refreshTray(); } else statusBar.apply(trayStatus);
  } });
// 键鼠跟随: the global hook runs whenever the setting is on, independently of
// whether the pet is out. It reports only a fixed kind and a timestamp. Counts
// are stored per local day; the pet window gets a throttled pulse for animation.
const inputStats = createInputStats({ directory: app.getPath('userData') });
let inputStatsTimer = null, lastInputStatsPayload = '', restartTypingOnFocus = false;
const typingHook = createTypingHook({
  onActivity: ({ type, at } = {}) => {
    if (!['keyboard', 'click'].includes(type) || !Number.isFinite(at)) return;
    inputStats.record(type, at);
    pet?.input(type, at);
    if (!inputStatsTimer) inputStatsTimer = setTimeout(() => { inputStatsTimer = null; publishInputStats(); }, 700);
  },
  log: (...args) => writeLog(...args)
});
function inputStatsPayload() {
  const typing = typingInfo();
  return { ...inputStats.snapshot(), ...typing, tracking: typing.status === 'active', platform: process.platform };
}
function publishInputStats(force = false) {
  if (!siteView || siteView.webContents.isDestroyed() || !isSiteUrl(siteView.webContents.getURL())) return false;
  const payload = inputStatsPayload(), json = JSON.stringify(payload);
  if (!force && json === lastInputStatsPayload) return false;
  lastInputStatsPayload = json;
  siteView.webContents.executeJavaScript(`window.albumInputStats = ${json}; window.dispatchEvent(new CustomEvent('album-input-stats', { detail: window.albumInputStats }));`).catch(() => {});
  return true;
}
function syncTyping() { const status = typingHook.setEnabled(Boolean(appearance.typingFollow)); publishInputStats(true); return status; }
function typingInfo() {
  return {
    enabled: Boolean(appearance.typingFollow),
    status: typingHook.status(),
    permission: typingHook.permission(),
    platform: process.platform
  };
}
function openInputMonitoringSetting() {
  if (process.platform === 'darwin') {
    restartTypingOnFocus = true;
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent').catch(() => {});
  }
  publishInputStats(true);
}
// The system request only works from an explicit user gesture. If macOS has
// already recorded a denial it returns false, so bring the user to the exact
// pane as a fallback. No reset is performed here.
function requestTypingPermission() {
  typingHook.requestPermission();
  if (process.platform === 'darwin' && typingHook.permission() !== 'granted') openInputMonitoringSetting();
  else { restartTypingOnFocus = true; typingHook.restart(); publishInputStats(true); }
  return typingInfo();
}
// One-time repair for cabins upgraded from an ad-hoc build whose TCC record was
// tied to an old CDHash. It runs only after a confirmation and only when the
// user asks; the normal launch path never clears permissions.
async function repairTypingPermission() {
  if (process.platform !== 'darwin') return typingInfo();
  const answer = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '修复输入监控授权',
    message: '只在键鼠一直没有反应时使用。',
    detail: '这会先移除心流小屋旧的「输入监控」授权，再重新询问一次。你的键盘记录和统计不会被删除。',
    buttons: ['取消', '修复并重新授权'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (answer.response !== 1) return typingInfo();
  await new Promise((resolve) => execFile('/usr/bin/tccutil', ['reset', 'ListenEvent', 'com.albumcircle.desktop'], { timeout: 5000 }, () => resolve()));
  restartTypingOnFocus = true;
  typingHook.restart();
  typingHook.requestPermission();
  openInputMonitoringSetting();
  publishInputStats(true);
  return typingInfo();
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
    publishInputStats(true);
    wallpaperStatus(wallpaperState); petStatus(petState);
    if (desktopMode) notifySite(`document.documentElement.dataset.desktopMode = '${desktopMode.active}'; window.dispatchEvent(new CustomEvent('album-desktop-mode', {detail: {active: ${Boolean(desktopMode.active)}}}));`);
    if (desktopSink) notifySinkStatus(desktopSink.status());
    updates.push(); autostart.publish(); weather.publish(); ai().publishKey();
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
  await wireSiteSession({ contents, net, webRoot: path.join(__dirname, 'web'), collection, catalog, music: () => music, lan, weatherApi, pets: request => petPackRoute ? petPackRoute(request) : new Response('Unavailable', { status: 503 }), getAppearance: () => ({ ...appearance, platform: process.platform, lanSync: true, petPacks: true }), downloads: () => app.getPath('downloads'), writeLog,
    onDocumentFailed: () => { documentHttpFailed = true; setImmediate(() => showFailure('小屋暂时没能打开，请重新载入。')); } });
}

const siteCommands = createSiteCommands({
  restartInterface: async () => { await siteView?.webContents.session.flushStorageData(); app.relaunch(); app.quit(); },
  openLyrics: () => lyricWindow?.open().catch(error=>writeLog('lyric-window', error.message)),
  isSitePage: () => isSiteUrl(siteView?.webContents.getURL()), mainWindow: () => mainWindow, desktopSink: () => desktopSink, pet: () => pet, music: () => music, appearance: () => appearance, trayPet,
  toggleSettings, toggleFullscreen, setFullscreen, isFullscreen, chooseMusicFolder, notifyMusic, saveAppearance, writeLog,
  typing: {
    check: () => { typingHook.retry(); publishInputStats(true); },
    permission: () => requestTypingPermission(),
    inputMonitoring: openInputMonitoringSetting,
    repair: () => repairTypingPermission()
  },
  handleUpdateCommand: (pathname, params) => updates.handle(pathname, params),
  notify: (params) => focusNotifier.show(parseNotice(params)),
  petPrefs: (params) => prefsFromParams(params),
  get autostart() { return autostart; },
  get weather() { return weather; },
  get ai() { return ai(); }
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
let aiRelay = null;
// Created lazily: userData is only final once the app is ready.
const ai = () => aiRelay || (aiRelay = createAi({ directory: app.getPath('userData'), safeStorage, fetch: (url, options) => net.fetch(url, options), publish: (detail) => notifySite(aiScript(detail)), writeLog }));
const weather = createWeather({ directory: app.getPath('userData'), safeStorage, fetch: (url, options) => net.fetch(url, options), publish: (state) => notifySite(weatherScript(state)), writeLog });
const weatherApi = createWeatherApi({ fetch: (url, options) => net.fetch(url, options), weather, location: createLocation({ packaged: app.isPackaged }) });
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
    quit: () => requestQuit().catch((error) => writeLog('quit-error', error.message)),
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
    if (operation === 'get') { typingHook.retry(); publishInputStats(true); return { settings: appearance, fonts: await listSystemFonts(), display: currentDisplay(), typing: typingInfo() }; }
    if (operation === 'typing-permission') return { typing: requestTypingPermission() };
    if (operation === 'typing-repair-permission') return { typing: await repairTypingPermission() };
    if (operation === 'typing-input-permission') { openInputMonitoringSetting(); return { typing: typingInfo() }; }
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
  // Start global counting as soon as the saved preference is known. It must
  // not wait for the pet to go out: the counters are useful even when the
  // desktop companion is hidden, and the pet only controls how it reacts.
  syncTyping();
  const display = Number.isFinite(preferences.x) && Number.isFinite(preferences.y) ? screen.getDisplayMatching(preferences) : screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    ...safeSavedWindow(preferences, display.workArea), minWidth: Math.min(900, display.workArea.width), minHeight: Math.min(600, display.workArea.height),
    title: '心流小屋', icon, backgroundColor: '#24160f', show: false,
    // Keep the native resize style: removing it breaks real fullscreen on Windows.
    autoHideMenuBar: true, frame: false, thickFrame: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  trayPet.setTrayPet(trayPet.petId);
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
  let closeChecked = false; // set once the page confirmed no focus round runs (see 'close')
  mainWindow.on('close', (event) => {
    if ((desktopSink?.active || desktopSink?.busy || pet?.active) && !quitting) { event.preventDefault(); mainWindow.hide(); return; }
    // A running (or paused) focus round keeps the page alive in the tray / menu bar.
    const hideToTray = () => {
      setFullscreen(false); mainWindow.hide(); refreshTray();
      if (!closedToTrayHint) { closedToTrayHint = true; focusNotifier.show({ title: '小屋还在计时', body: process.platform === 'darwin' ? '专注会继续，点菜单栏里的伙伴回来。' : '专注会继续，双击托盘里的伙伴回来。', silent: true, actions: [] }); }
    };
    if (keepAliveOnClose({ phase: trayStatus.phase, quitting })) { event.preventDefault(); hideToTray(); return; }
    // The tray poll runs every few seconds while idle: a round started a moment ago may not be in
    // trayStatus yet, so ask the page once (bounded) before really closing.
    if (!quitting && !closeChecked) {
      event.preventDefault();
      Promise.race([readCompanion(siteView?.webContents).catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), 800))]).then((value) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const companion = cleanCompanion(value?.companion);
        if (keepAliveOnClose({ phase: companion?.focus?.phase, quitting })) { trayStatus = statusFrom(companion); hideToTray(); return; }
        closeChecked = true; mainWindow.close();
      });
      return;
    }
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
    try { lan = createLanService({ directory: path.join(app.getPath('userData'), 'lan-sync') }); } catch (error) { writeLog('lan-unavailable', error.message); }
    dshBridge = createDshBridge({ directory: app.getPath('userData'), getSnapshot: () => dshSnapshot });
    petPackRoute = createPetPackRoute({ store: createPetPackStore({ directory: path.join(app.getPath('userData'), 'pet-packs') }), bridge: dshBridge });
    registerShellProtocol(); registerIpc();
    lyricWindow = createLyricWindow({getSite:()=>siteView?.webContents,registerProtocol:registerShellProtocol});
    petMenu = createPetMenu({ getTray: () => companionTray, registerProtocol: registerShellProtocol, getState: () => ({ status: trayStatus, track: lastCompanion?.track || '', avatar: trayPet.avatar }), command: action => { if (action === 'home') restoreMainWindow(); else if (action === 'focus') sendCompanionCommand(siteView?.webContents, trayStatus.phase === 'idle' ? 'focus-start' : 'focus-toggle'); else relayPlayerCommand(siteView?.webContents, action); } });
    wallpaper = createWallpaper({ app, getMain: () => mainWindow, getSite: () => siteView?.webContents, status: wallpaperStatus, appearanceScript, getAppearance: () => appearance, log: writeLog, registerProtocol: registerShellProtocol });
    desktopMode = createDesktopMode({ getWindow: () => mainWindow, screen, leaveFullscreen: () => setFullscreen(false), helperPath: desktopHelperPath(), log: writeLog,
      onChange: (state) => { refreshTray(); notifySite(`document.documentElement.dataset.desktopMode = '${state.active}'; window.dispatchEvent(new CustomEvent('album-desktop-mode', {detail: ${JSON.stringify(state)}}));`); } });
    pet = createPet({ directory: app.getPath('userData'), helperPath: desktopHelperPath(), getSite: () => siteView?.webContents, getInputStats: () => ({ ...inputStats.snapshot(), ...typingInfo() }), status: petStatus, registerProtocol: registerShellProtocol, restoreMain: restoreMainWindow, log: writeLog });
    // The page's 设置 › 房间与桌宠 shows the saved pet behaviour even before the pet goes out.
    petState = { active: false, size: pet.size, prefs: pet.prefs, hiddenUntil: pet.hiddenUntil };
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
    // --- 2.2 focus: lock / sleep reach the page; global focus shortcuts ---
    createPowerRelay({ powerMonitor, send: (detail) => notifySite(powerScript(detail)) });
    const focusHotkey = (accelerator, run) => { try { if (!globalShortcut.register(accelerator, run)) writeLog('focus-hotkey', `${accelerator} is taken`); } catch (error) { writeLog('focus-hotkey', error.message); } };
    focusHotkey(FOCUS_HOTKEYS.toggle, () => sendCompanionCommand(siteView?.webContents, trayStatus.phase === 'idle' ? 'focus-start' : 'focus-toggle'));
    focusHotkey(FOCUS_HOTKEYS.skip, () => { if (trayStatus.phase !== 'idle') sendCompanionCommand(siteView?.webContents, 'focus-skip'); });
    // --- end 2.2 focus ---
    collection = createCollectionStore({ directory: app.getPath('userData') });
    const search = import('./catalog-search.mjs');
    catalog = async (params) => (await search).searchCatalog(params);
    localMusic = createLocalMusic({ directory: app.getPath('userData'), resizeCover: (buffer) => { const image = nativeImage.createFromBuffer(buffer); return image.isEmpty() ? null : image.resize({ width: Math.min(600, image.getSize().width), quality: 'good' }).toJPEG(86); } });
    const nowPlaying = createNowPlaying({ helperPath: app.isPackaged ? path.join(process.resourcesPath, 'native', 'NowPlaying.exe') : path.join(__dirname, 'native', 'bin', 'NowPlaying.exe') });
    music = createMusicService({ directory: app.getPath('userData'), safeStorage, nowPlaying, localMusic, appleMusic: createAppleMusic({ country: app.getLocaleCountryCode() }), localApps: createLocalApps({ openExternal: (url) => shell.openExternal(url), appForProtocol: (url) => app.getApplicationNameForProtocol(url) }), login: (provider) => provider === 'qq' ? openQQLogin(mainWindow) : openNeteaseLogin(mainWindow), logout: (provider) => provider === 'qq' ? clearQQLogin() : clearNeteaseLogin() });
    writeLog('started', app.getVersion()); await createWindow(); statusPoller.start(); refreshTray(); try { updates.start(); } catch (error) { writeLog('updater-error', error.message); }
    // The desktop pet comes back out if it was out when the app last closed.
    if (pet.wasOut) pet.start().catch((error) => writeLog('pet-error', error.message));
  }).catch((error) => {
    writeLog('startup-error', error.message);
    dialog.showErrorBox('心流小屋启动失败', '请关闭后重新打开应用。\n' + error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  // Coming back from System Settings after granting permission starts the hook without a restart.
  app.on('browser-window-focus', () => {
    // Permission changes happen in System Settings, outside this app. `retry()`
    // is cheap and idempotent: after a grant it starts the hook without asking
    // the user to toggle the setting or restart.
    if (restartTypingOnFocus) { typingHook.restart(); restartTypingOnFocus = false; }
    else typingHook.retry();
    publishInputStats(true);
  });
  app.on('activate', () => {
    if (updates.newerCopyInstalled()) {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) { writeLog('relaunch-installed', updates.installedVersion()); updates.relaunchInstalledCopy(); return; }
      updates.checkInstalled();
    }
    if (mainWindow) restoreMainWindow(); else createWindow().catch((error) => writeLog('startup-error', error.message));
  });
  app.on('before-quit', (event) => { if (!quitting && dshBridge?.status().enabled) { event.preventDefault(); quitting = true; Promise.race([dshBridge.stop(), new Promise(resolve=>setTimeout(resolve,4500))]).finally(()=>app.quit()); return; } quitting = true; focusNotifier.dispose(); pet?.quitting(); lyricWindow?.dispose(); petMenu?.dispose(); trayPet.stop(); dshBridge?.stop(); lan?.stop(); aiRelay?.dispose(); aiRelay = null; statusPoller.stop(); typingHook.stop(); clearTimeout(inputStatsTimer); inputStatsTimer = null; inputStats.dispose(); if (awakeBlocker !== null) { powerSaveBlocker.stop(awakeBlocker); awakeBlocker = null; } globalShortcut.unregisterAll(); desktopSink?.stop(); miniPlayer?.hide(); wallpaper?.stop(); pet?.stop(); weather.dispose(); music?.stop(); companionTray?.destroy(); companionTray = null; if (startupComplete) writeLog('closed'); });
}
