'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const commands = new Set(['ready', 'retry', 'home', 'menu', 'settings', 'settings-close', 'fit-display', 'minimize', 'maximize', 'close']);
contextBridge.exposeInMainWorld('albumDesktop', Object.freeze({
  command(value) {
    if (!commands.has(value)) return Promise.reject(new Error('Unknown command'));
    return ipcRenderer.invoke('desktop:command', value);
  },
  settings(operation, value) {
    if (!['get', 'apply', 'reset', 'typing-permission'].includes(operation)) return Promise.reject(new Error('Unknown settings operation'));
    return ipcRenderer.invoke('desktop:settings', operation, value);
  },
  onState(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:state', listener);
    return () => ipcRenderer.removeListener('desktop:state', listener);
  }
}));
