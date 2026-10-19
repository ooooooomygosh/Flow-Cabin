'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const COMMANDS = new Set(['focus-start', 'focus-pause', 'focus-toggle', 'focus-skip', 'sound-toggle', 'cat-feed', 'open-settings', 'open-onboarding', 'open-about']);
const SIZES = new Set(['S', 'M', 'L']);
const ACCESSORIES = new Set(['', 'headphones', 'scarf', 'beanie', 'bow', 'sprout']);
contextBridge.exposeInMainWorld('albumPet', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('pet:snapshot'),
  cursor: () => ipcRenderer.invoke('pet:cursor'),
  onSnapshot: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('pet:update', listener);
    return () => ipcRenderer.removeListener('pet:update', listener);
  },
  setHit: (value) => ipcRenderer.send('pet:hit', value === true),
  moveBy: (dx, dy) => { if (Number.isFinite(dx) && Number.isFinite(dy)) ipcRenderer.send('pet:move', Math.round(dx), Math.round(dy)); },
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  menu: () => ipcRenderer.send('pet:menu'),
  open: () => ipcRenderer.send('pet:open'),
  panel: (value) => ipcRenderer.send('pet:panel', value === true),
  resize: (value) => { if (SIZES.has(value)) ipcRenderer.send('pet:resize', value); },
  equipAccessory: (value) => { if (ACCESSORIES.has(value)) ipcRenderer.send('pet:equip-accessory', value); },
  focusDisplay: () => ipcRenderer.send('pet:focus-display'),
  command: (value) => { if (COMMANDS.has(value)) ipcRenderer.send('pet:command', value); }
}));
