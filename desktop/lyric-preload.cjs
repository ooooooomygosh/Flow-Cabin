'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const COMMANDS = new Set(['toggle', 'next', 'previous', 'lock', 'unlock', 'close', 'home']);
const listen = channel => callback => { if (typeof callback !== 'function') return () => {}; const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('cabinLyrics', Object.freeze({
  ready: () => ipcRenderer.send('cabin-lyrics:ready'),
  onUpdate: listen('cabin-lyrics:update'),
  onState: listen('cabin-lyrics:state'),
  command: action => { if (COMMANDS.has(action)) ipcRenderer.send('cabin-lyrics:command', action); },
  hoverLock: hovering => ipcRenderer.send('cabin-lyrics:hover-lock', hovering === true),
  setPrefs: patch => ipcRenderer.send('cabin-lyrics:prefs', patch && typeof patch === 'object' ? { ...patch } : null)
}));
