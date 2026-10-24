'use strict';
// 桌面歌词: a transparent, always-on-top lyric bar in the style of 网易云 / QQ 音乐.
// The cabin page has no IPC, so the shell reads its lyric feed (window.cabinLyricFeed,
// src/lyrics/lyric-feed.mjs) a few times a second: the whole song only when it changed,
// otherwise a wall-clock anchor. The bar animates word fills on its own clock.
// Locked, the bar lets every click through to the apps underneath; hovering its small
// lock button (mouse moves are still forwarded) makes only that button clickable again.
const fs = require('node:fs');
const path = require('node:path');
const PAGE = 'album-desktop://lyrics/lyrics.html';
const POLL_MS = 250, MAX_FEED_BYTES = 2 * 1024 * 1024;
const PLAYER = new Set(['toggle', 'next', 'previous']);
const PREF_KEYS = new Set(['translation', 'romanization', 'deskLayout', 'deskSkin', 'deskSize', 'deskPet', 'deskHideWhenPaused']);
const MIN = { width: 360, height: 96 };
// On Windows, Electron treats 'floating' (and the other macOS panel levels) as "behind the
// taskbar" and re-stacks the window there, which loses its topmost flag; 'pop-up-menu' stays on top.
const TOP_LEVEL = process.platform === 'win32' ? 'pop-up-menu' : 'floating';

// Where the bar opens on a display it has not been placed on: low and centred.
function defaultBounds(workArea) {
  const width = Math.round(Math.min(960, Math.max(MIN.width, workArea.width * .62))), height = 168;
  return { x: Math.round(workArea.x + (workArea.width - width) / 2), y: Math.round(workArea.y + workArea.height - height - 56), width, height };
}
// A saved position is reused only if it still lies mostly on that display's work area.
function restoreBounds(saved, workArea) {
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return defaultBounds(workArea);
  const width = Math.max(MIN.width, Math.min(saved.width, workArea.width)), height = Math.max(MIN.height, Math.min(saved.height, workArea.height));
  const x = Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - width), y = Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
// Only plain, bounded data crosses from the page to the bar; the bar validates lyrics again.
function cleanFeed(value) {
  if (!value || typeof value !== 'object') return null;
  let size = 0; try { size = Buffer.byteLength(JSON.stringify(value)); } catch { return null; }
  if (size > MAX_FEED_BYTES) return null;
  const num = n => Number.isFinite(Number(n)) ? Number(n) : 0, text = v => typeof v === 'string' ? v.slice(0, 300) : '';
  const a = value.anchor && typeof value.anchor === 'object' ? value.anchor : {};
  const out = { docRev: num(value.docRev), title: text(value.title), artist: text(value.artist), skin: text(value.skin).slice(0, 40),
    prefs: value.prefs && typeof value.prefs === 'object' ? Object.fromEntries(Object.entries(value.prefs).filter(([k]) => PREF_KEYS.has(k) || k === 'scale')) : {},
    pet: { id: text(value.pet?.id).slice(0, 40) || 'cat', accessory: text(value.pet?.accessory).slice(0, 40) },
    anchor: { position: Number.isFinite(a.position) ? a.position : null, at: num(a.at), playing: a.playing === true, rate: num(a.rate) || 1, duration: num(a.duration) },
    energy: Math.max(0, Math.min(1, num(value.energy))), bpm: num(value.bpm), beatAt: num(value.beatAt) };
  if ('doc' in value) out.doc = value.doc && typeof value.doc === 'object' ? value.doc : null;
  return out;
}
function cleanPrefsPatch(value) {
  if (!value || typeof value !== 'object') return null;
  const patch = Object.fromEntries(Object.entries(value).filter(([key, v]) => PREF_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 20) : v]));
  return Object.keys(patch).length ? patch : null;
}

function createLyricWindow({ getSite, registerProtocol, screen, ipcMain, BrowserWindow, directory, relayPlayer = () => false, onChange = () => {}, log = () => {} }) {
  const file = path.join(directory, 'lyric-window.json');
  let saved = { open: false, locked: false, displays: {} };
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); saved = { open: value.open === true, locked: value.locked === true, displays: value.displays && typeof value.displays === 'object' ? value.displays : {} }; } catch { /* first run */ }
  let window = null, timer = null, docRev = -1, reading = false, hoverLock = false, saveTimer = null;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved)); fs.renameSync(`${file}.tmp`, file); } catch (error) { log('lyric-window-save', error.message); } }, 300); };
  const valid = event => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame?.url?.startsWith(PAGE.split('/lyrics.html')[0]);
  const send = (channel, value) => { if (window && !window.isDestroyed()) window.webContents.send(channel, value); };
  const applyLock = () => {
    if (!window || window.isDestroyed()) return;
    const ignore = saved.locked && !hoverLock;
    window.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
    // Changing focusability on Windows drops the topmost flag, so put the bar back on top after it.
    if (window.isFocusable() !== !saved.locked) window.setFocusable(!saved.locked);
    window.setAlwaysOnTop(true, TOP_LEVEL);
    send('cabin-lyrics:state', { locked: saved.locked });
  };
  async function poll() {
    const site = getSite();
    if (reading || !window || window.isDestroyed() || !window.isVisible() || !site || site.isDestroyed()) return;
    reading = true;
    try {
      const value = cleanFeed(await site.executeJavaScript(`window.cabinLyricFeed ? window.cabinLyricFeed.take(${Number(docRev)}) : null`));
      if (value) { if ('doc' in value) docRev = value.docRev; send('cabin-lyrics:update', value); }
    } catch (error) { log('lyric-feed', error.message); } finally { reading = false; }
  }
  const handlers = {
    'cabin-lyrics:ready': event => { if (!valid(event)) return; docRev = -1; send('cabin-lyrics:state', { locked: saved.locked }); poll(); },
    'cabin-lyrics:command': (event, action) => {
      if (!valid(event)) return;
      if (PLAYER.has(action)) relayPlayer(getSite(), action);
      else if (action === 'lock' || action === 'unlock') api.setLocked(action === 'lock');
      else if (action === 'close') api.close();
      else if (action === 'home') onChange({ home: true });
    },
    'cabin-lyrics:hover-lock': (event, hovering) => { if (!valid(event) || !saved.locked) return; hoverLock = hovering === true; applyLock(); },
    'cabin-lyrics:prefs': (event, value) => {
      const patch = valid(event) && cleanPrefsPatch(value), site = getSite(); if (!patch || !site || site.isDestroyed()) return;
      site.executeJavaScript(`window.dispatchEvent(new CustomEvent('cabin:lyric-prefs-patch', { detail: ${JSON.stringify(patch)} }))`).then(poll, () => {});
    }
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.on(channel, handler);
  const remember = () => {
    if (!window || window.isDestroyed()) return;
    const bounds = window.getBounds(), display = screen.getDisplayMatching(bounds);
    saved.displays[String(display.id)] = bounds; persist();
  };
  const api = {
    get open() { return Boolean(window && !window.isDestroyed()); },
    get locked() { return saved.locked; },
    async show() {
      if (window && !window.isDestroyed()) { window.showInactive(); return; }
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), bounds = restoreBounds(saved.displays[String(display.id)], display.workArea);
      const created = new BrowserWindow({ ...bounds, minWidth: MIN.width, minHeight: MIN.height, title: '心流小屋 · 桌面歌词', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
        resizable: true, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
        webPreferences: { preload: path.join(__dirname, 'lyric-preload.cjs'), partition: 'cabin-lyrics', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
      window = created;
      if (!(await created.webContents.session.protocol.isProtocolHandled('album-desktop'))) registerProtocol(created.webContents.session.protocol);
      if (window !== created || created.isDestroyed()) return;
      created.setAlwaysOnTop(true, TOP_LEVEL);
      created.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
      created.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      created.webContents.on('will-navigate', event => event.preventDefault());
      created.on('moved', remember); created.on('resized', remember);
      created.on('closed', () => { if (window === created) { window = null; clearInterval(timer); timer = null; onChange({ open: false }); } });
      await created.loadURL(PAGE);
      if (window !== created) return;
      created.showInactive(); applyLock();
      clearInterval(timer); timer = setInterval(poll, POLL_MS);
      saved.open = true; persist(); onChange({ open: true });
    },
    close() { saved.open = false; persist(); const old = window; window = null; clearInterval(timer); timer = null; if (old && !old.isDestroyed()) old.destroy(); onChange({ open: false }); },
    toggle() { return api.open ? api.close() : api.show(); },
    setLocked(value) { saved.locked = Boolean(value); hoverLock = false; persist(); applyLock(); onChange({ locked: saved.locked }); },
    // Reopen at launch if it was open when the app last quit.
    restore() { if (saved.open) return api.show(); },
    dispose() { clearInterval(timer); for (const [channel, handler] of Object.entries(handlers)) ipcMain.removeListener(channel, handler); window?.destroy(); window = null; }
  };
  return api;
}
module.exports = { createLyricWindow, defaultBounds, restoreBounds, cleanFeed, cleanPrefsPatch, PAGE };
