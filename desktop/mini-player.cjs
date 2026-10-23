'use strict';
// The mini player: a small pixel deck window. Two owners can ask for it:
//   'sink' — 沉入桌面 shows it at desktop level (below app windows, above the icons);
//   'user' — the tray / 控制 menu / settings toggle shows it as a normal floating
//            window, optionally always on top, anywhere outside 沉入桌面 too.
// It can be dragged (its position is remembered per launch), shows the real cover,
// artist, progress, volume and the current lyric line, and only sends whitelisted
// companion and player commands. Double-click returns to the cabin window.
const { BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { cleanCompanion } = require('./wallpaper-model.cjs');
const { createCompanionPoller, sendCompanionCommand } = require('./companion-sync.cjs');
const URL = 'album-desktop://mini/mini.html';
const WIDTH = 380, HEIGHT = 92, MARGIN = 16;
const MINI_COMMANDS = new Set(['sound-toggle', 'focus-toggle']);
// Player relay: IPC channel 'cabin:player-command' → DOM event 'cabin:player-command' {detail:{action, value?}} in the cabin page.
const PLAYER_CHANNEL = 'cabin:player-command';
const PLAYER_ACTIONS = new Set(['toggle', 'play', 'pause', 'stop', 'next', 'previous', 'volume-up', 'volume-down', 'set-volume', 'seek', 'seek-by']);
const VALUE_ACTIONS = new Set(['set-volume', 'seek', 'seek-by']);
function relayPlayerCommand(site, action, value) {
  if (!PLAYER_ACTIONS.has(action) || !site || site.isDestroyed()) return false;
  const number = Number(value);
  if (VALUE_ACTIONS.has(action) && (!Number.isFinite(number) || Math.abs(number) > 24 * 3600)) return false;
  const detail = VALUE_ACTIONS.has(action) ? `{ action: ${JSON.stringify(action)}, value: ${JSON.stringify(Math.round(number * 1000) / 1000)} }` : `{ action: ${JSON.stringify(action)} }`;
  site.executeJavaScript(`window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: ${detail} }));`).catch(() => {});
  return true;
}

// Saved choices: where it was dragged to, always-on-top, and whether the user keeps it shown.
function cleanMiniPrefs(value) {
  const v = value && typeof value === 'object' ? value : {};
  const point = Number.isSafeInteger(v.x) && Number.isSafeInteger(v.y) && Math.abs(v.x) < 100000 && Math.abs(v.y) < 100000 ? { x: v.x, y: v.y } : {};
  return { ...point, alwaysOnTop: v.alwaysOnTop === true, shown: v.shown === true };
}
// The saved spot when it is still on that screen (fully inside the work area), else bottom-left.
function miniBounds(workArea, saved = {}) {
  const fits = Number.isFinite(saved?.x) && Number.isFinite(saved?.y) && saved.x >= workArea.x && saved.y >= workArea.y && saved.x + WIDTH <= workArea.x + workArea.width && saved.y + HEIGHT <= workArea.y + workArea.height;
  return fits ? { x: saved.x, y: saved.y, width: WIDTH, height: HEIGHT } : { x: workArea.x + MARGIN, y: workArea.y + workArea.height - HEIGHT - MARGIN, width: WIDTH, height: HEIGHT };
}
// A drag keeps at least a corner of the window on some screen.
function dragTarget(origin, dx, dy, areas) {
  const x = Math.round(origin.x + (Number(dx) || 0)), y = Math.round(origin.y + (Number(dy) || 0));
  const area = areas.find((a) => x + WIDTH > a.x + 24 && x < a.x + a.width - 24 && y + HEIGHT > a.y && y < a.y + a.height - 24) || areas[0];
  if (!area) return { x, y };
  return { x: Math.max(area.x - WIDTH + 48, Math.min(area.x + area.width - 48, x)), y: Math.max(area.y, Math.min(area.y + area.height - 32, y)) };
}

function createMiniPlayer({ getSite, getAnchor, registerProtocol, helperPath, onExit, onRestore = onExit, directory = '', onChange = () => {}, log = () => {} }) {
  let window = null, keeper = null, latest = null, opening = null, dragOrigin = null;
  const reasons = new Set(), file = directory ? path.join(directory, 'mini-player.json') : '';
  let prefs = (() => { try { return cleanMiniPrefs(file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}); } catch { return cleanMiniPrefs({}); } })();
  const save = () => { if (!file) return; try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(prefs)); fs.renameSync(file + '.tmp', file); } catch (error) { log('mini-prefs', error.message); } };
  const mode = () => reasons.has('user') ? 'user' : 'sink';
  const state = () => ({ shown: reasons.has('user'), sink: reasons.has('sink'), alwaysOnTop: prefs.alwaysOnTop, active: Boolean(window) });
  const payload = () => latest ? { ...latest, mini: { mode: mode(), alwaysOnTop: prefs.alwaysOnTop } } : { mini: { mode: mode(), alwaysOnTop: prefs.alwaysOnTop } };
  const push = () => { if (window && !window.isDestroyed()) window.webContents.send('mini:update', payload()); };
  const poller = createCompanionPoller({ getSite, interval: 750, clean: (value) => cleanCompanion(value?.companion), onValue: (value) => { latest = value; push(); } });
  const valid = (event) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame?.url === URL;
  ipcMain.handle('mini:snapshot', (event) => { if (!valid(event)) throw new Error('Unknown mini sender'); return payload(); });
  ipcMain.on('mini:command', (event, command) => { if (valid(event) && MINI_COMMANDS.has(command)) sendCompanionCommand(getSite(), command); });
  ipcMain.on(PLAYER_CHANNEL, (event, action, value) => { if (valid(event)) relayPlayerCommand(getSite(), action, value); });
  ipcMain.on('mini:exit', (event) => { if (!valid(event)) return; if (mode() === 'sink') onExit(); else onRestore(); });
  ipcMain.on('mini:pin', (event, on) => { if (valid(event) && typeof on === 'boolean') setAlwaysOnTop(on); });
  ipcMain.on('mini:drag', (event, phase, dx, dy) => {
    if (!valid(event)) return;
    if (phase === 'start') { const [x, y] = window.getPosition(); dragOrigin = { x, y }; }
    else if (phase === 'move' && dragOrigin && Number.isFinite(dx) && Number.isFinite(dy)) { const to = dragTarget(dragOrigin, dx, dy, screen.getAllDisplays().map((display) => display.workArea)); window.setPosition(to.x, to.y); }
    else if (phase === 'end' && dragOrigin) { dragOrigin = null; const [x, y] = window.getPosition(); prefs = { ...prefs, x, y }; save(); }
  });
  function stopKeeper() { try { keeper?.stdin?.end(); keeper?.kill(); } catch {} keeper = null; }
  // Windows: only the 沉入桌面 deck is pinned under app windows; the user's floating one never is.
  function placeLayer() {
    if (!window || window.isDestroyed()) return;
    const desktopLevel = mode() === 'sink' && !prefs.alwaysOnTop;
    if (process.platform === 'darwin') { if (desktopLevel) window.setAlwaysOnTop(true, 'normal', -1); else window.setAlwaysOnTop(prefs.alwaysOnTop, 'floating'); window.setVisibleOnAllWorkspaces(desktopLevel || prefs.alwaysOnTop, { visibleOnFullScreen: false }); }
    else window.setAlwaysOnTop(prefs.alwaysOnTop, 'floating');
    if (desktopLevel && !keeper) keepBottom(window); else if (!desktopLevel) stopKeeper();
  }
  function keepBottom(created) {
    if (process.platform !== 'win32' || !helperPath) return;
    try {
      const hwnd = created.getNativeWindowHandle().readBigUInt64LE().toString();
      keeper = spawn(helperPath, ['keep-bottom', hwnd, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      keeper.on('error', () => { keeper = null; });
    } catch (error) { log('mini-keeper', error.message); }
  }
  async function open() {
    if (window) { window.showInactive(); placeLayer(); push(); return; }
    if (opening) return opening;
    opening = (async () => {
      const anchor = getAnchor?.(); const area = (anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()).workArea;
      const saved = Number.isFinite(prefs.x) ? screen.getDisplayMatching({ x: prefs.x, y: prefs.y, width: WIDTH, height: HEIGHT }).workArea : area;
      const created = new BrowserWindow({ ...miniBounds(saved, prefs), title: '心流小屋 · 迷你唱机', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, focusable: true, show: false,
        webPreferences: { preload: path.join(__dirname, 'mini-preload.cjs'), partition: 'album-circle-mini', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
      window = created;
      if (!(await created.webContents.session.protocol.isProtocolHandled('album-desktop'))) registerProtocol(created.webContents.session.protocol);
      if (window !== created || created.isDestroyed()) return;
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      created.webContents.on('will-navigate', (event) => event.preventDefault());
      created.webContents.session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
      created.on('closed', () => { if (window === created) { window = null; poller.stop(); stopKeeper(); reasons.clear(); onChange(state()); } });
      if (process.platform === 'darwin') created.setHiddenInMissionControl?.(true);
      await created.loadURL(URL);
      if (window !== created) return;
      created.showInactive(); placeLayer(); poller.start(); push();
    })().finally(() => { opening = null; });
    return opening;
  }
  function close() {
    poller.stop(); stopKeeper(); dragOrigin = null;
    const old = window; window = null; if (old && !old.isDestroyed()) old.destroy();
  }
  async function show(reason = 'sink') { reasons.add(reason); if (reason === 'user' && !prefs.shown) { prefs = { ...prefs, shown: true }; save(); } await open(); onChange(state()); }
  function hide(reason = 'sink') {
    reasons.delete(reason);
    if (reason === 'user' && prefs.shown) { prefs = { ...prefs, shown: false }; save(); }
    if (!reasons.size) close(); else { placeLayer(); push(); }
    onChange(state());
  }
  function setAlwaysOnTop(on) { prefs = { ...prefs, alwaysOnTop: Boolean(on) }; save(); placeLayer(); push(); onChange(state()); return state(); }
  return {
    show, hide, setAlwaysOnTop, state,
    toggle() { return reasons.has('user') ? hide('user') : show('user'); },
    // Shown at the last launch: comes back with the app.
    restore() { if (prefs.shown) return show('user'); return Promise.resolve(); },
    reposition() { if (window && !window.isDestroyed()) { const bounds = window.getBounds(), area = screen.getDisplayMatching(bounds).workArea; window.setBounds(miniBounds(area, prefs)); } },
    get active() { return Boolean(window); }
  };
}
const miniScript = (value) => `window.cabinMiniPlayer = ${JSON.stringify({ shown: value?.shown === true, alwaysOnTop: value?.alwaysOnTop === true, supported: true })}; window.dispatchEvent(new CustomEvent('cabin:mini-player', { detail: window.cabinMiniPlayer }));`;
module.exports = { createMiniPlayer, miniBounds, dragTarget, cleanMiniPrefs, miniScript, MINI_COMMANDS, PLAYER_CHANNEL, PLAYER_ACTIONS, relayPlayerCommand, WIDTH, HEIGHT };
