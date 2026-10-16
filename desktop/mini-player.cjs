'use strict';
// The 沉入桌面 mini player: a tiny pixel bar at desktop level (below every app
// window, above the desktop icons). Hover reveals the buttons; double-click
// returns to the cabin window. It only sends whitelisted companion commands.
const { BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { cleanCompanion } = require('./wallpaper-model.cjs');
const { createCompanionPoller, sendCompanionCommand } = require('./companion-sync.cjs');
const URL = 'album-desktop://mini/mini.html';
const WIDTH = 300, HEIGHT = 64;
const MINI_COMMANDS = new Set(['sound-toggle', 'focus-toggle']);
// Player relay: IPC channel 'cabin:player-command' → DOM event 'cabin:player-command' {detail:{action}} in the cabin page.
const PLAYER_CHANNEL = 'cabin:player-command';
const PLAYER_ACTIONS = new Set(['toggle', 'play', 'pause', 'next', 'previous']);
function relayPlayerCommand(site, action) {
  if (!PLAYER_ACTIONS.has(action) || !site || site.isDestroyed()) return false;
  site.executeJavaScript(`window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: ${JSON.stringify(action)} } }));`).catch(() => {});
  return true;
}

function miniBounds(workArea) { return { x: workArea.x + 16, y: workArea.y + workArea.height - HEIGHT - 16, width: WIDTH, height: HEIGHT }; }

function createMiniPlayer({ getSite, getAnchor, registerProtocol, helperPath, onExit, log = () => {} }) {
  let window = null, keeper = null, latest = null;
  const poller = createCompanionPoller({ getSite, interval: 750, clean: (value) => cleanCompanion(value?.companion), onValue: (value) => { latest = value; window?.webContents.send('mini:update', latest); } });
  const valid = (event) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame?.url === URL;
  ipcMain.handle('mini:snapshot', (event) => { if (!valid(event)) throw new Error('Unknown mini sender'); return latest; });
  ipcMain.on('mini:command', (event, command) => { if (valid(event) && MINI_COMMANDS.has(command)) sendCompanionCommand(getSite(), command); });
  ipcMain.on(PLAYER_CHANNEL, (event, action) => { if (valid(event)) relayPlayerCommand(getSite(), action); });
  ipcMain.on('mini:exit', (event) => { if (valid(event)) onExit(); });
  function keepBottom(created) {
    if (process.platform !== 'win32' || !helperPath) return;
    try {
      const hwnd = created.getNativeWindowHandle().readBigUInt64LE().toString();
      keeper = spawn(helperPath, ['keep-bottom', hwnd, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      keeper.on('error', () => { keeper = null; });
    } catch (error) { log('mini-keeper', error.message); }
  }
  async function show() {
    if (window) { window.showInactive(); return; }
    const anchor = getAnchor?.(); const area = (anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()).workArea;
    const created = new BrowserWindow({ ...miniBounds(area), title: '心流小屋 · 迷你唱机', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, focusable: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'mini-preload.cjs'), partition: 'album-circle-mini', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
    window = created;
    if (!(await created.webContents.session.protocol.isProtocolHandled('album-desktop'))) registerProtocol(created.webContents.session.protocol);
    if (window !== created || created.isDestroyed()) return;
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', (event) => event.preventDefault());
    created.webContents.session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
    created.on('closed', () => { if (window === created) { window = null; poller.stop(); } });
    if (process.platform === 'darwin') { created.setAlwaysOnTop(true, 'normal', -1); created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false }); created.setHiddenInMissionControl?.(true); }
    await created.loadURL(URL);
    if (window !== created) return;
    created.showInactive(); keepBottom(created); poller.start();
  }
  function hide() {
    poller.stop(); try { keeper?.stdin?.end(); keeper?.kill(); } catch {} keeper = null;
    const old = window; window = null; if (old && !old.isDestroyed()) old.destroy();
  }
  return { show, hide, reposition() { if (window && !window.isDestroyed()) { const anchor = getAnchor?.(); window.setBounds(miniBounds((anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()).workArea)); } }, get active() { return Boolean(window); } };
}
module.exports = { createMiniPlayer, miniBounds, MINI_COMMANDS, PLAYER_CHANNEL, PLAYER_ACTIONS, relayPlayerCommand };
