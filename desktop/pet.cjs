'use strict';
// The desktop pet: a small transparent, always-on-top window showing the room
// cat. It receives display-only companion state and can send a fixed set of
// commands back to the business page. It never holds credentials.
const { BrowserWindow, ipcMain, Menu, screen } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { cleanCompanion } = require('./wallpaper-model.cjs');
const { createCompanionPoller, sendCompanionCommand } = require('./companion-sync.cjs');
const { createPetPhysics, floorOf, ceilingOf } = require('./pet-physics.cjs');
const URL = 'album-desktop://pet/pet.html';
const SIZES = { S: 128, M: 192, L: 256 };
const windowSize = (size) => ({ width: Math.max(240, Math.round(size * 1.5)), height: size + 64 });

// Keeps the pet on the display it is over (or the nearest one after a display was unplugged), with
// the cat itself inside that display's work area: under the menu bar, above the Dock / taskbar.
function clampToWorkArea(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  return { ...bounds, x: Math.max(area.x - Math.round(bounds.width / 3), Math.min(area.x + area.width - Math.round(bounds.width * 2 / 3), bounds.x)), y: Math.max(ceilingOf(area), Math.min(floorOf(bounds, area), bounds.y)) };
}

function createPet({ directory, getSite, getFocus, status, registerProtocol, restoreMain, log = () => {} }) {
  const prefsPath = path.join(directory, 'pet.json');
  let window = null, prefs = { size: 'M' }, latest = null, saveTimer, loop = null, idleTimer = null, lastStep = 0, motion = { mode: 'idle', facing: 1 };
  const physics = createPetPhysics();
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsPath, 'utf8')) }; } catch {}
  if (!SIZES[prefs.size]) prefs.size = 'M';
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(prefsPath, JSON.stringify(prefs)); } catch {} }, 300); };
  const payload = () => ({ companion: latest, size: SIZES[prefs.size], motion });
  // ~8 Hz while music plays so the pet can sway with it; 750 ms otherwise.
  const poller = createCompanionPoller({ getSite, interval: (value) => value?.musicPlaying ? 125 : 750, clean: (value) => cleanCompanion(value?.companion), onValue: (value) => { latest = value; window?.webContents.send('pet:update', payload()); } });
  const announce = () => status({ active: Boolean(window), size: prefs.size });
  const validSender = (event) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === URL;

  function defaultBounds() {
    const { width, height } = windowSize(SIZES[prefs.size]);
    const owner = getSite?.();
    const area = (owner && !owner.isDestroyed?.() && owner.getBounds ? screen.getDisplayMatching(owner.getBounds()) : screen.getPrimaryDisplay()).workArea;
    if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) return clampToWorkArea({ x: prefs.x, y: prefs.y, width, height });
    return { x: area.x + area.width - width - 24, y: area.y + area.height - height + 10, width, height };
  }
  async function start() {
    if (window) { window.showInactive(); return; }
    const created = new BrowserWindow({ ...defaultBounds(), title: '心流小屋 · 桌宠伙伴', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'pet-preload.cjs'), partition: 'album-circle-pet', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
    window = created;
    try {
      created.setAlwaysOnTop(true, 'floating'); created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
      if (!(await created.webContents.session.protocol.isProtocolHandled('album-desktop'))) registerProtocol(created.webContents.session.protocol);
      if (window !== created || created.isDestroyed()) return;
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      created.webContents.on('will-navigate', (event) => event.preventDefault());
      created.webContents.on('will-frame-navigate', (event) => event.preventDefault());
      created.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      created.webContents.session.setPermissionCheckHandler(() => false);
      created.on('closed', () => { if (window === created) { window = null; clearTimeout(loop); loop = null; clearInterval(idleTimer); idleTimer = null; poller.stop(); announce(); } });
      created.setIgnoreMouseEvents(true, { forward: true });
      await created.loadURL(URL);
      if (window !== created) return;
      created.showInactive(); poller.start(); announce(); log('pet-started');
      idleTimer = setInterval(wander, 2000);
    } catch (error) {
      log('pet-load-failed', error.message);
      if (window === created) stop();
      throw error;
    }
  }
  // Falling, landing and strolling move the window itself, ~60 frames a second,
  // only while something moves. A quiet pet costs nothing.
  // A thrown pet stays on the display it was thrown on (stacked monitors must not swap floors mid-air).
  let flightArea = null;
  const area = () => flightArea || screen.getDisplayMatching(window.getBounds()).workArea;
  const allowWalk = () => !latest?.reduceMotion && (!latest?.focus || latest.focus.phase === 'idle') && !latest?.musicPlaying && !latest?.playing;
  function publish(next) { if (next.mode !== motion.mode || next.facing !== motion.facing) { motion = { mode: next.mode, facing: next.facing }; window?.webContents.send('pet:update', payload()); } }
  function resetMotion(bounds) {
    clearTimeout(loop); loop = null; lastStep = 0; flightArea = null;
    physics.reset(bounds); publish({ mode: 'idle', facing: physics.facing });
  }
  function tick() {
    loop = null; if (!window || window.isDestroyed()) return;
    const time = Date.now(), dt = lastStep ? (time - lastStep) / 1000 : 1 / 60; lastStep = time;
    const bounds = window.getBounds();
    if (latest?.reduceMotion) { resetMotion(bounds); prefs = { ...prefs, x: bounds.x, y: bounds.y }; save(); return; }
    const next = physics.step(bounds, area(), dt, { allowWalk: allowWalk() });
    if (next.x !== bounds.x || next.y !== bounds.y) window.setBounds({ ...bounds, x: next.x, y: next.y });
    publish(next);
    if (physics.moving) loop = setTimeout(tick, 16);
    else { lastStep = 0; flightArea = null; const { x, y } = window.getBounds(); prefs = { ...prefs, x, y }; save(); }
  }
  const animate = () => { if (!loop && window) { lastStep = 0; loop = setTimeout(tick, 16); } };
  function wander() { if (!window || physics.moving || physics.mode === 'drag') return; physics.step(window.getBounds(), area(), 0, { allowWalk: allowWalk() }); if (physics.moving) animate(); }
  function stop() { if (window && !window.isDestroyed()) resetMotion(window.getBounds()); clearTimeout(loop); loop = null; clearInterval(idleTimer); idleTimer = null; const old = window; window = null; poller.stop(); if (old && !old.isDestroyed()) old.destroy(); announce(); }
  function resize(size) {
    if (!SIZES[size]) return; prefs.size = size; save();
    if (window) { const bounds = window.getBounds(), next = windowSize(SIZES[size]); window.setBounds(clampToWorkArea({ x: bounds.x + Math.round((bounds.width - next.width) / 2), y: bounds.y + bounds.height - next.height, ...next })); resetMotion(window.getBounds()); window.webContents.send('pet:update', payload()); }
    announce();
  }
  function menu() {
    const focus = getFocus?.() || latest?.focus, running = focus && focus.phase !== 'idle' && !focus.paused;
    Menu.buildFromTemplate([
      // Same as the cat panel's 「喂一条」: 1 条小鱼干, the pet plays its eating frames.
      { label: '喂一条', click: () => sendCompanionCommand(getSite(), 'cat-feed') },
      { type: 'separator' },
      { label: running ? '暂停专注' : focus?.phase && focus.phase !== 'idle' ? '继续专注' : '开始专注', click: () => sendCompanionCommand(getSite(), running ? 'focus-pause' : 'focus-start') },
      ...(focus && focus.phase !== 'idle' ? [{ label: focus.phase === 'focus' ? '提前结束本轮' : '跳过休息', click: () => sendCompanionCommand(getSite(), 'focus-skip') }] : []),
      { label: '开关小屋声音', click: () => sendCompanionCommand(getSite(), 'sound-toggle') },
      { type: 'separator' },
      { label: '大小', submenu: Object.keys(SIZES).map((key) => ({ label: { S: '小', M: '中', L: '大' }[key], type: 'radio', checked: prefs.size === key, click: () => resize(key) })) },
      { label: '打开小屋', click: restoreMain },
      { label: '让伙伴回家', click: stop }
    ]).popup({ window });
  }
  ipcMain.handle('pet:snapshot', (event) => { if (!validSender(event)) throw new Error('Unknown pet sender'); return payload(); });
  ipcMain.on('pet:hit', (event, value) => { if (validSender(event)) window.setIgnoreMouseEvents(!value, { forward: true }); });
  ipcMain.on('pet:move', (event, dx, dy) => {
    if (!validSender(event) || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) return;
    clearTimeout(loop); loop = null; flightArea = null; physics.drag(dx, dy); publish({ mode: 'drag', facing: motion.facing });
    const bounds = window.getBounds(); window.setBounds(clampToWorkArea({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }));
  });
  ipcMain.on('pet:drag-end', (event) => {
    if (!validSender(event)) return;
    flightArea = null; const bounds = window.getBounds(); flightArea = area(); const mode = physics.release(bounds, flightArea, { reduceMotion: Boolean(latest?.reduceMotion) });
    publish({ mode, facing: physics.facing });
    if (physics.moving) animate(); else { prefs = { ...prefs, x: bounds.x, y: bounds.y }; save(); }
  });
  ipcMain.on('pet:menu', (event) => { if (validSender(event)) menu(); });
  ipcMain.on('pet:open', (event) => { if (validSender(event)) restoreMain(); });
  ipcMain.on('pet:command', (event, command) => { if (validSender(event)) sendCompanionCommand(getSite(), command); });
  // A 小鱼干 is being dragged in the cabin: let the pet window take the drop (it plays the eat frames).
  function acceptDrops(on) { if (window && !window.isDestroyed()) window.setIgnoreMouseEvents(!on, { forward: true }); }
  return { start, stop, resize, acceptDrops, get active() { return Boolean(window); }, get window() { return window; }, get size() { return prefs.size; }, reposition() { if (window) { const bounds = clampToWorkArea(window.getBounds()); resetMotion(bounds); window.setBounds(bounds); prefs = { ...prefs, x: bounds.x, y: bounds.y }; save(); } } };
}
module.exports = { createPet, SIZES, windowSize, clampToWorkArea };
