'use strict';
// Global media hotkeys (work while the cabin is in the background or hidden in the
// tray): play / pause, previous, next, volume ± and the desktop lyrics toggle.
// Bindings are Electron accelerators, saved in userData/media-keys.json and edited in
// 设置 › 显示与桌面. A combination another app already owns is reported, never forced.
// The page sees { supported, enabled, bindings, failed } as window.cabinMediaKeys and
// the 'cabin:media-keys' event (src/desktop/media-keys-client.mjs).
const fs = require('node:fs');
const path = require('node:path');

const ACTIONS = Object.freeze([
  { id: 'toggle', label: '播放 / 暂停' },
  { id: 'previous', label: '上一首' },
  { id: 'next', label: '下一首' },
  { id: 'volume-up', label: '音量 +' },
  { id: 'volume-down', label: '音量 −' },
  // Dispatched as the desktop command 'lyrics-toggle' (the floating lyric window owns it).
  { id: 'lyrics-toggle', label: '桌面歌词' }
].map(Object.freeze));
const ACTION_IDS = ACTIONS.map((action) => action.id);
// Like 网易云音乐's defaults; Ctrl/⌘+Alt+D stays 沉入桌面.
const DEFAULT_BINDINGS = Object.freeze({ toggle: 'CommandOrControl+Alt+P', previous: 'CommandOrControl+Alt+Left', next: 'CommandOrControl+Alt+Right', 'volume-up': 'CommandOrControl+Alt+Up', 'volume-down': 'CommandOrControl+Alt+Down', 'lyrics-toggle': 'CommandOrControl+Alt+L' });
const RESERVED = new Set(['CommandOrControl+Alt+D']);
const MODIFIERS = new Set(['CommandOrControl', 'CmdOrCtrl', 'Command', 'Cmd', 'Control', 'Ctrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);
const KEYS = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|[,./;'\[\]\\`=-])$/;
const MEDIA_KEYS = new Set(['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'VolumeUp', 'VolumeDown', 'VolumeMute']);
// A usable accelerator: at least one modifier and one key (media keys may stand alone).
function cleanAccelerator(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > 60) return '';
  if (MEDIA_KEYS.has(text)) return text;
  const parts = text.split('+');
  if (parts.some((part) => !part)) return '';
  const key = parts.pop(), mods = parts;
  if (!mods.length || !mods.every((mod) => MODIFIERS.has(mod)) || new Set(mods).size !== mods.length) return '';
  if (!KEYS.test(key.length === 1 ? key.toUpperCase() : key)) return '';
  if (!mods.some((mod) => mod !== 'Shift')) return ''; // Shift+letter would eat typing everywhere
  const normal = [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
  return RESERVED.has(normal) ? '' : normal;
}
function normalizeMediaKeys(value) {
  const v = value && typeof value === 'object' ? value : {}, input = v.bindings && typeof v.bindings === 'object' ? v.bindings : {}, bindings = {}, used = new Set();
  for (const id of ACTION_IDS) {
    const raw = Object.prototype.hasOwnProperty.call(input, id) ? input[id] : DEFAULT_BINDINGS[id];
    const accelerator = raw === '' ? '' : cleanAccelerator(raw) || (Object.prototype.hasOwnProperty.call(input, id) ? '' : DEFAULT_BINDINGS[id]);
    // One combination drives one action: a duplicate is left unbound.
    bindings[id] = accelerator && !used.has(accelerator.toLowerCase()) ? accelerator : '';
    if (bindings[id]) used.add(accelerator.toLowerCase());
  }
  return { enabled: v.enabled !== false, bindings };
}

// globalShortcut: Electron's; run(action) performs one action.
function createMediaKeys({ globalShortcut, directory = '', run, publish = () => {}, log = () => {} }) {
  const file = directory ? path.join(directory, 'media-keys.json') : '';
  let settings = (() => { try { return normalizeMediaKeys(file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}); } catch { return normalizeMediaKeys({}); } })();
  let registered = new Map(), failed = [];
  const unregister = () => { for (const accelerator of registered.keys()) { try { globalShortcut.unregister(accelerator); } catch {} } registered = new Map(); };
  function apply() {
    unregister(); failed = [];
    if (!settings.enabled) return;
    for (const id of ACTION_IDS) {
      const accelerator = settings.bindings[id];
      if (!accelerator) continue;
      let ok = false;
      try { ok = globalShortcut.register(accelerator, () => run(id)) !== false && (globalShortcut.isRegistered?.(accelerator) ?? true); } catch (error) { log('media-keys', `${accelerator} ${error.message}`); }
      if (ok) registered.set(accelerator, id); else failed.push(id);
    }
  }
  const state = () => ({ supported: true, enabled: settings.enabled, bindings: { ...settings.bindings }, defaults: { ...DEFAULT_BINDINGS }, failed: [...failed], actions: ACTIONS.map((action) => ({ ...action })) });
  return {
    start() { apply(); publish(state()); return state(); },
    set(value) {
      settings = normalizeMediaKeys({ enabled: value?.enabled ?? settings.enabled, bindings: { ...settings.bindings, ...(value?.bindings || {}) } });
      if (value?.reset) settings = normalizeMediaKeys({ enabled: settings.enabled });
      if (file) { try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(settings)); fs.renameSync(file + '.tmp', file); } catch (error) { log('media-keys', error.message); } }
      apply(); publish(state()); return state();
    },
    publish() { publish(state()); return state(); },
    state, stop: unregister
  };
}
const mediaKeysScript = (value) => `window.cabinMediaKeys = ${JSON.stringify(value)}; window.dispatchEvent(new CustomEvent('cabin:media-keys', { detail: window.cabinMediaKeys }));`;
module.exports = { createMediaKeys, normalizeMediaKeys, cleanAccelerator, mediaKeysScript, ACTIONS, ACTION_IDS, DEFAULT_BINDINGS };
