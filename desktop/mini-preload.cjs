'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const COMMANDS = new Set(['sound-toggle', 'focus-toggle']);
contextBridge.exposeInMainWorld('albumMini', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('mini:snapshot'),
  onSnapshot: (callback) => { const listener = (_e, value) => callback(value); ipcRenderer.on('mini:update', listener); return () => ipcRenderer.removeListener('mini:update', listener); },
  command: (value) => { if (COMMANDS.has(value)) ipcRenderer.send('mini:command', value); },
  player: (action) => { if (['toggle', 'play', 'pause', 'next', 'previous'].includes(action)) ipcRenderer.send('cabin:player-command', action); },
  exit: () => ipcRenderer.send('mini:exit')
}));
