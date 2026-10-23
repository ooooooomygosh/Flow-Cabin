'use strict';
// The desktop pet: a small transparent, always-on-top window showing the room
// cat. It receives display-only companion state and can send a fixed set of
// commands back to the business page. It never holds credentials.
const { BrowserWindow, ipcMain, Menu, screen } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { createPetAtlasRoute }=require('./pet-atlas.cjs');
const { cleanCompanion } = require('./wallpaper-model.cjs');
const { createCompanionPoller, sendCompanionCommand } = require('./companion-sync.cjs');
const { createPetPhysics, floorOf, ceilingOf, walkArea, crispSize } = require('./pet-physics.cjs');
const { createFullscreenWatch } = require('./pet-fullscreen.cjs');
const URL = 'album-desktop://pet/pet.html';
const SIZES = { S: 128, M: 192, L: 256 };
const windowSize = (size) => ({ width: Math.max(240, Math.round(size * 1.5)), height: Math.round(size + 64) });
const PANEL_WIDTH = 264;
const panelWindowSize = (size) => {
  const base = windowSize(size);
  return { width: base.width + PANEL_WIDTH, height: Math.max(360, base.height) };
};
const ACCESSORIES = new Set(['', 'headphones', 'scarf', 'beanie', 'bow', 'sprout']);
const number = (value, max = 1e9) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.round(Number(value)))) : 0;
const HOUR = 3600000;

// Behaviour settings (pet.json, 设置 › 房间与桌宠 and the right-click menu). `enabled`: the pet was
// out when the app last closed, so it comes back out on the next launch.
const OPACITIES = [1, .8, .6, .4];
const PREF_FLAGS = { bubbles: true, walk: true, gravity: true, onTop: true, locked: false, clickThrough: false, autoHide: true };
function normalizePetPrefs(value = {}) {
  const v = value && typeof value === 'object' ? value : {}, out = { size: SIZES[v.size] ? v.size : 'M', enabled: v.enabled === true };
  for (const [key, fallback] of Object.entries(PREF_FLAGS)) out[key] = typeof v[key] === 'boolean' ? v[key] : fallback;
  const opacity = Number(v.opacity); out.opacity = Number.isFinite(opacity) ? Math.max(.3, Math.min(1, Math.round(opacity * 20) / 20)) : 1;
  if (Number.isFinite(v.x) && Number.isFinite(v.y)) { out.x = Math.round(v.x); out.y = Math.round(v.y); }
  const hidden = Number(v.hiddenUntil); if (Number.isFinite(hidden) && hidden > 0) out.hiddenUntil = Math.round(hidden);
  return out;
}
// What the page and the pet window may see of the preferences.
const publicPrefs = (prefs) => ({ bubbles: prefs.bubbles, walk: prefs.walk, gravity: prefs.gravity, onTop: prefs.onTop, locked: prefs.locked, clickThrough: prefs.clickThrough, autoHide: prefs.autoHide, opacity: prefs.opacity });
// The page's 设置 › 房间与桌宠 sends album-desktop://action/pet-prefs?bubbles=false&opacity=0.8 …
function prefsFromParams(params) {
  const get = (name) => typeof params?.get === 'function' ? params.get(name) : params?.[name], change = {};
  for (const key of Object.keys(PREF_FLAGS)) { const value = get(key); if (value === 'true' || value === true) change[key] = true; else if (value === 'false' || value === false) change[key] = false; }
  const opacity = Number(get('opacity')); if (get('opacity') !== null && get('opacity') !== undefined && Number.isFinite(opacity)) change.opacity = opacity;
  return change;
}

// Keeps the pet on the display it is over (or the nearest one after a display was unplugged), with
// the cat itself inside that display's work area: under the menu bar, above the Dock / taskbar.
function clampToWorkArea(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  return { ...bounds, x: Math.max(area.x - Math.round(bounds.width / 3), Math.min(area.x + area.width - Math.round(bounds.width * 2 / 3), bounds.x)), y: Math.max(ceilingOf(area), Math.min(floorOf(bounds, area), bounds.y)) };
}

function createPet({ directory, getSite, getFocus, getInputStats, status, registerProtocol, restoreMain, helperPath = '', log = () => {} }) {
  const prefsPath = path.join(directory, 'pet.json');
  let window = null, latest = null, saveTimer, loop = null, idleTimer = null, lastStep = 0, motion = { mode: 'idle', facing: 1 }, panelOpen = false, quitting = false, hideTimer = null, fullscreenHidden = false;
  const physics = createPetPhysics();
  let prefs = normalizePetPrefs();
  try { prefs = normalizePetPrefs(JSON.parse(fs.readFileSync(prefsPath, 'utf8'))); } catch {}
  const wasOut = prefs.enabled;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(prefsPath, JSON.stringify(prefs)); } catch {} }, 300); };
  let typingAt = 0, clickAt = 0, pulseTimer = null, lastPulse = -Infinity;
  // The sprite size on the display the pet is on (whole device pixels per art pixel).
  const displayOf = (bounds) => { try { return screen.getDisplayMatching(bounds); } catch { return null; } };
  const petSize = (bounds = window && !window.isDestroyed() ? window.getBounds() : null) => crispSize(SIZES[prefs.size], (bounds && displayOf(bounds)?.scaleFactor) || screen.getPrimaryDisplay?.()?.scaleFactor || 1);
  // The desktop pet receives counts only. The store never keeps a key, button,
  // pointer coordinate, window title or application name.
  function inputSnapshot() {
    let value;
    try { value = getInputStats?.(); } catch { return null; }
    if (!value || typeof value !== 'object') return null;
    const week = Array.isArray(value.week) ? value.week.slice(-7).map((day) => ({
      key: /^\d{4}-\d{2}-\d{2}$/.test(day?.key || '') ? day.key : '',
      keyboard: number(day?.keyboard), click: number(day?.click), total: number(day?.total ?? number(day?.keyboard) + number(day?.click))
    })) : [];
    const today = value.today || {}, total = value.total || {};
    return {
      today: { keyboard: number(today.keyboard), click: number(today.click), total: number(today.total ?? number(today.keyboard) + number(today.click)) },
      total: { keyboard: number(total.keyboard), click: number(total.click), total: number(total.total ?? number(total.keyboard) + number(total.click)) },
      week, streak: number(value.streak, 10000), activeDays: number(value.activeDays, 10000),
      enabled: value.enabled === true, status: ['active', 'off', 'needs-permission', 'unavailable'].includes(value.status) ? value.status : 'off'
    };
  }
  const payload = () => ({ companion: latest, size: petSize(), motion, typingAt, clickAt, input: inputSnapshot(), prefs: publicPrefs(prefs) });
  const send = () => { if (window && !window.isDestroyed()) window.webContents.send('pet:update', payload()); };
  // ~8 Hz while music plays so the pet can sway with it; 750 ms otherwise.
  const poller = createCompanionPoller({ getSite, interval: (value) => value?.musicPlaying || Date.now() - Math.max(value?.typingAt || 0, value?.clickAt || 0) < 3000 ? 125 : 750, clean: (value) => cleanCompanion(value?.companion), onValue: (value) => { latest = value; send(); } });
  const announce = () => status({ active: Boolean(window), size: prefs.size, prefs: publicPrefs(prefs), hiddenUntil: prefs.hiddenUntil || 0, fullscreenHidden });
  const validSender = (event) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === URL;
  // Hidden for an hour (menu) or while a fullscreen app is in front (Windows, autoHide).
  const fullscreen = createFullscreenWatch({ helperPath, log, onChange: (on) => { fullscreenHidden = on; applyVisibility(); announce(); } });
  const hiddenNow = () => Boolean(prefs.hiddenUntil && prefs.hiddenUntil > Date.now()) || (prefs.autoHide && fullscreenHidden);
  function applyVisibility() {
    if (!window || window.isDestroyed()) return;
    if (hiddenNow()) { if (window.isVisible?.() !== false) window.hide?.(); }
    else if (window.isVisible?.() === false) window.showInactive();
  }
  function applyWindowPrefs() {
    if (!window || window.isDestroyed()) return;
    window.setAlwaysOnTop(prefs.onTop, 'floating');
    window.setOpacity?.(prefs.opacity);
    if (prefs.clickThrough) window.setIgnoreMouseEvents(true, { forward: true });
  }
  function scheduleShow() {
    clearTimeout(hideTimer); hideTimer = null;
    const left = (prefs.hiddenUntil || 0) - Date.now();
    if (left > 0) hideTimer = setTimeout(showNow, Math.min(left, 2 ** 31 - 1));
    else if (prefs.hiddenUntil) { delete prefs.hiddenUntil; save(); }
  }
  function hideFor(ms) { prefs = { ...prefs, hiddenUntil: Date.now() + ms }; save(); scheduleShow(); applyVisibility(); announce(); }
  function showNow() { clearTimeout(hideTimer); hideTimer = null; const { hiddenUntil, ...rest } = prefs; prefs = rest; save(); applyVisibility(); announce(); }

  function defaultBounds() {
    const { width, height } = windowSize(petSize(null));
    const owner = getSite?.();
    const area = (owner && !owner.isDestroyed?.() && owner.getBounds ? screen.getDisplayMatching(owner.getBounds()) : screen.getPrimaryDisplay()).workArea;
    if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) return clampToWorkArea({ x: prefs.x, y: prefs.y, width, height });
    return { x: area.x + area.width - width - 24, y: area.y + area.height - height + 10, width, height };
  }
  async function start() {
    if (!prefs.enabled) { prefs = { ...prefs, enabled: true }; save(); }
    if (window) { if (!hiddenNow()) window.showInactive(); return; }
    panelOpen = false;
    const created = new BrowserWindow({ ...defaultBounds(), title: '心流小屋 · 桌宠伙伴', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: prefs.onTop, show: false,
      // The pet is shown inactive: without this macOS swallows the first click (it only activates the
      // window), so a double-click right after the pet appears arrived as one click and never hopped.
      acceptFirstMouse: true,
      webPreferences: { preload: path.join(__dirname, 'pet-preload.cjs'), partition: 'album-circle-pet', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
    window = created;
    try {
      created.setAlwaysOnTop(prefs.onTop, 'floating'); created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
      if (!(await created.webContents.session.protocol.isProtocolHandled('album-desktop'))) registerProtocol(created.webContents.session.protocol);
      const petProtocol=created.webContents.session.protocol;
      if (!petProtocol.__cabinPetAtlas) {
        if(await petProtocol.isProtocolHandled('https'))petProtocol.unhandle('https');
        petProtocol.handle('https',createPetAtlasRoute({getSite}));
        petProtocol.__cabinPetAtlas=true;
      }
      if (window !== created || created.isDestroyed()) return;
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      created.webContents.on('will-navigate', (event) => event.preventDefault());
      created.webContents.on('will-frame-navigate', (event) => event.preventDefault());
      created.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      created.webContents.session.setPermissionCheckHandler(() => false);
      created.on('closed', () => { if (window === created) { window = null; clearTimeout(loop); loop = null; clearInterval(idleTimer); idleTimer = null; clearTimeout(pulseTimer); pulseTimer = null; poller.stop(); fullscreen.stop(); announce(); } });
      created.setIgnoreMouseEvents(true, { forward: true });
      applyWindowPrefs();
      await created.loadURL(URL);
      if (window !== created) return;
      scheduleShow();
      if (!hiddenNow()) created.showInactive();
      poller.start(); announce(); log('pet-started');
      try { const handle = created.getNativeWindowHandle?.(); if (handle) fullscreen.start(handle.readBigUInt64LE().toString()); } catch (error) { log('pet-fullscreen-error', error.message); }
      idleTimer = setInterval(wander, 2000);
      // Saved mid-air (or gravity just switched on): it lands first.
      if (prefs.gravity && !prefs.locked && !latest?.reduceMotion) { physics.drop(created.getBounds(), area()); if (physics.moving) animate(); }
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
  // Walking may continue onto a neighbouring display with the same floor.
  const strollArea = () => { const own = area(); if (flightArea || typeof screen.getAllDisplays !== 'function') return own; try { return walkArea(own, screen.getAllDisplays().map((display) => display.workArea)); } catch { return own; } };
  const allowWalk = () => prefs.walk && !prefs.locked && !latest?.reduceMotion && (!latest?.focus || latest.focus.phase === 'idle') && !latest?.musicPlaying && !latest?.playing;
  function publish(next) { if (next.mode !== motion.mode || next.facing !== motion.facing) { motion = { mode: next.mode, facing: next.facing }; send(); } }
  function resetMotion(bounds) {
    clearTimeout(loop); loop = null; lastStep = 0; flightArea = null;
    physics.reset(bounds); publish({ mode: 'idle', facing: physics.facing });
  }
  // After a move onto a display with another scaling, keep the sprite on whole device pixels.
  function fitSize() {
    if (!window || window.isDestroyed()) return;
    const bounds = window.getBounds(), size = petSize(bounds), wanted = panelOpen ? panelWindowSize(size) : windowSize(size);
    if (wanted.width === bounds.width && wanted.height === bounds.height) return;
    window.setBounds({ x: bounds.x + Math.round((bounds.width - wanted.width) / 2), y: bounds.y + bounds.height - wanted.height, ...wanted }); send();
  }
  function tick() {
    loop = null; if (!window || window.isDestroyed()) return;
    const time = Date.now(), dt = lastStep ? (time - lastStep) / 1000 : 1 / 60; lastStep = time;
    const bounds = window.getBounds();
    if (latest?.reduceMotion) { resetMotion(bounds); prefs = { ...prefs, x: bounds.x, y: bounds.y }; save(); return; }
    const next = physics.step(bounds, physics.mode === 'walk' ? strollArea() : area(), dt, { allowWalk: allowWalk() });
    if (next.x !== bounds.x || next.y !== bounds.y) window.setBounds({ ...bounds, x: next.x, y: next.y });
    publish(next);
    if (physics.moving) loop = setTimeout(tick, 16);
    else { lastStep = 0; flightArea = null; fitSize(); const { x, y } = window.getBounds(); prefs = { ...prefs, x, y }; save(); }
  }
  const animate = () => { if (!loop && window) { lastStep = 0; loop = setTimeout(tick, 16); } };
  function wander() { if (!window || physics.moving || physics.mode === 'drag' || hiddenNow()) return; physics.step(window.getBounds(), strollArea(), 0, { allowWalk: allowWalk() }); if (physics.moving) animate(); }
  function stop() {
    // A user sending the pet home is remembered; the app quitting is not.
    if (!quitting && prefs.enabled) { prefs = { ...prefs, enabled: false }; save(); }
    if (window && !window.isDestroyed()) resetMotion(window.getBounds()); clearTimeout(loop); loop = null; clearInterval(idleTimer); idleTimer = null; clearTimeout(pulseTimer); pulseTimer = null; clearTimeout(hideTimer); hideTimer = null; fullscreen.stop();
    const old = window; window = null; poller.stop(); if (old && !old.isDestroyed()) old.destroy(); announce();
  }
  function resize(size) {
    if (!SIZES[size]) return; prefs.size = size; save();
    if (window) { const bounds = window.getBounds(), next = panelOpen ? panelWindowSize(petSize(bounds)) : windowSize(petSize(bounds)); window.setBounds(clampToWorkArea({ x: bounds.x + Math.round((bounds.width - next.width) / 2), y: bounds.y + bounds.height - next.height, ...next })); resetMotion(window.getBounds()); send(); }
    announce();
  }
  function setPrefs(change = {}) {
    const before = prefs;
    prefs = normalizePetPrefs({ ...prefs, ...change, size: prefs.size, enabled: prefs.enabled, x: prefs.x, y: prefs.y, hiddenUntil: prefs.hiddenUntil });
    save(); applyWindowPrefs();
    if (window && !window.isDestroyed()) {
      if (before.clickThrough && !prefs.clickThrough) window.setIgnoreMouseEvents(true, { forward: true }); // the renderer takes hits again from the next pointer move
      if (before.autoHide !== prefs.autoHide) applyVisibility();
      if (prefs.gravity && !before.gravity && !prefs.locked) { physics.drop(window.getBounds(), area()); if (physics.moving) animate(); }
      if ((!prefs.walk || prefs.locked) && physics.mode === 'walk') resetMotion(window.getBounds());
    }
    send(); announce();
    return publicPrefs(prefs);
  }
  // The renderer's compact card lives to the left of the cat. Grow the
  // transparent window left/up and keep its bottom-right anchored, then restore
  // exactly on close. The pointer still passes through transparent pixels.
  function setPanel(open) {
    const next = open === true; panelOpen = next;
    if (!window || window.isDestroyed()) return;
    const bounds = window.getBounds(), wanted = next ? panelWindowSize(petSize(bounds)) : windowSize(petSize(bounds));
    const nextBounds = clampToWorkArea({ x: bounds.x + bounds.width - wanted.width, y: bounds.y + bounds.height - wanted.height, ...wanted });
    window.setBounds(nextBounds); resetMotion(nextBounds);
    prefs = { ...prefs, x: nextBounds.x, y: nextBounds.y }; save();
  }
  // Right-click menu: the current task, the focus actions that fit the phase, and the behaviour switches.
  function menu() {
    const focus = getFocus?.() || latest?.focus, phase = focus?.phase || 'idle', active = phase !== 'idle', inFocus = phase === 'focus', paused = Boolean(focus?.paused);
    const command = (name) => () => sendCompanionCommand(getSite(), name);
    const toggle = (key, label) => ({ label, type: 'checkbox', checked: Boolean(prefs[key]), click: () => setPrefs({ [key]: !prefs[key] }) });
    Menu.buildFromTemplate([
      ...(focus?.task ? [{ label: `当前任务：${String(focus.task).slice(0, 24)}`, enabled: false }, { type: 'separator' }] : []),
      // Same as the cat panel's 「喂一条」: 1 条小鱼干, the pet plays its eating frames.
      { label: '喂一条', click: command('cat-feed') },
      { type: 'separator' },
      !active ? { label: '开始专注', click: command('focus-start') }
        : paused ? { label: inFocus ? '继续专注' : '继续休息', click: command('focus-start') }
        : { label: inFocus ? '暂停专注' : '暂停休息', click: command('focus-pause') },
      ...(active ? [
        { label: '+5 分钟', click: command('focus-extend') },
        inFocus ? { label: focus.due ? '结束这一轮，去休息' : '提前结束本轮', click: command(focus.due ? 'focus-break' : 'focus-skip') } : { label: '跳过休息', click: command('focus-next') }
      ] : []),
      { label: '开关小屋声音', click: command('sound-toggle') },
      { type: 'separator' },
      toggle('bubbles', '显示气泡'), toggle('walk', '自己走动'), toggle('gravity', '落到底部'), toggle('onTop', '保持置顶'), toggle('locked', '锁定位置'),
      { label: '大小', submenu: Object.keys(SIZES).map((key) => ({ label: { S: '小', M: '中', L: '大' }[key], type: 'radio', checked: prefs.size === key, click: () => resize(key) })) },
      { label: '透明度', submenu: OPACITIES.map((value) => ({ label: `${Math.round(value * 100)}%`, type: 'radio', checked: Math.abs(prefs.opacity - value) < .01, click: () => setPrefs({ opacity: value }) })) },
      { type: 'separator' },
      { label: '隐藏 1 小时', click: () => hideFor(HOUR) },
      { label: '变成专注画面', click: () => companionFocusDisplay() },
      { label: '打开小屋', click: restoreMain },
      { label: '桌宠设置…', click: () => { restoreMain?.(); sendCompanionCommand(getSite(), 'open-settings'); } },
      { label: '让伙伴回家', click: stop }
    ]).popup({ window });
  }
  ipcMain.handle('pet:snapshot', (event) => { if (!validSender(event)) throw new Error('Unknown pet sender'); return payload(); });
  // Where the pointer is, relative to the pet window: lets a freshly loaded pet take clicks before
  // the first forwarded mousemove (a pointer already resting on the cat).
  ipcMain.handle('pet:cursor', (event) => { if (!validSender(event)) throw new Error('Unknown pet sender'); const p = screen.getCursorScreenPoint(), b = window.getBounds(); return { x: p.x - b.x, y: p.y - b.y }; });
  // 始终鼠标穿透: the window never takes the pointer (the tray and 设置 still reach the pet).
  ipcMain.on('pet:hit', (event, value) => { if (validSender(event)) window.setIgnoreMouseEvents(prefs.clickThrough || !value, { forward: true }); });
  ipcMain.on('pet:move', (event, dx, dy) => {
    if (!validSender(event) || prefs.locked || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) return;
    clearTimeout(loop); loop = null; flightArea = null; physics.drag(dx, dy); publish({ mode: 'drag', facing: motion.facing });
    const bounds = window.getBounds(); window.setBounds(clampToWorkArea({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }));
  });
  ipcMain.on('pet:drag-end', (event) => {
    if (!validSender(event) || prefs.locked) return;
    flightArea = null; const bounds = window.getBounds(); flightArea = area(); const mode = physics.release(bounds, flightArea, { reduceMotion: Boolean(latest?.reduceMotion), gravity: prefs.gravity });
    publish({ mode, facing: physics.facing });
    if (physics.moving) animate(); else { flightArea = null; fitSize(); prefs = { ...prefs, x: window.getBounds().x, y: window.getBounds().y }; save(); }
  });
  ipcMain.on('pet:menu', (event) => { if (validSender(event)) menu(); });
  ipcMain.on('pet:open', (event) => { if (validSender(event)) restoreMain(); });
  ipcMain.on('pet:panel', (event, value) => { if (validSender(event) && typeof value === 'boolean') setPanel(value); });
  ipcMain.on('pet:resize', (event, value) => { if (validSender(event) && SIZES[value]) resize(value); });
  ipcMain.on('pet:equip-accessory', (event, value) => {
    if (!validSender(event) || !ACCESSORIES.has(value)) return;
    const site = getSite?.();
    if (!site || site.isDestroyed?.()) return;
    site.executeJavaScript(`window.dispatchEvent(new CustomEvent('cabin:equip-accessory', { detail: { accessory: ${JSON.stringify(value)} } }));`).catch(() => {});
  });
  ipcMain.on('pet:focus-display', (event) => { if (validSender(event)) companionFocusDisplay(); });
  ipcMain.on('pet:command', (event, command) => { if (validSender(event)) sendCompanionCommand(getSite(), command); });
  function companionFocusDisplay() {
    const site = getSite?.();
    restoreMain?.();
    if (!site || site.isDestroyed?.()) return;
    site.executeJavaScript(`window.dispatchEvent(new CustomEvent('cabin-focus-display', { detail: { open: true } }));`).catch(() => {});
  }
  // A 小鱼干 is being dragged in the cabin: let the pet window take the drop (it plays the eat frames).
  function acceptDrops(on) { if (window && !window.isDestroyed()) window.setIgnoreMouseEvents(!on, { forward: true }); }
  // 键鼠跟随 (typing-hook.cjs): timestamps only. Counts happen in input-stats.cjs
  // before this point; the pet updates at most every 100 ms with a trailing pulse
  // so a single click is never lost inside a burst of typing.
  function pulse() {
    pulseTimer = null; lastPulse = Date.now(); send();
  }
  function input(type, at = Date.now()) {
    const time = Number(at);
    if (!Number.isFinite(time) || time <= 0) return;
    if (type === 'click') clickAt = time;
    else if (type === 'keyboard') typingAt = time;
    else return;
    const wait = 100 - (Date.now() - lastPulse);
    if (wait <= 0) pulse();
    else if (!pulseTimer) pulseTimer = setTimeout(pulse, wait);
  }
  function typing(at) { input('keyboard', at); }
  return { start, stop, resize, acceptDrops, input, typing, setPrefs, hideFor, showNow,
    quitting() { quitting = true; },
    get wasOut() { return wasOut; },
    get prefs() { return publicPrefs(prefs); },
    get hiddenUntil() { return prefs.hiddenUntil && prefs.hiddenUntil > Date.now() ? prefs.hiddenUntil : 0; },
    get active() { return Boolean(window); }, get window() { return window; }, get size() { return prefs.size; },
    reposition() { if (window) { const bounds = clampToWorkArea(window.getBounds()); resetMotion(bounds); window.setBounds(bounds); fitSize(); const { x, y } = window.getBounds(); prefs = { ...prefs, x, y }; save(); } } };
}
module.exports = { createPet, SIZES, windowSize, panelWindowSize, clampToWorkArea, normalizePetPrefs, prefsFromParams, publicPrefs };
