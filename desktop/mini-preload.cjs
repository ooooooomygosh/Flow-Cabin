'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const COMMANDS = new Set(['sound-toggle', 'focus-toggle']);
const PLAYER = new Set(['toggle', 'play', 'pause', 'stop', 'next', 'previous', 'volume-up', 'volume-down', 'set-volume', 'seek', 'seek-by']);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
contextBridge.exposeInMainWorld('albumMini', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('mini:snapshot'),
  onSnapshot: (callback) => { const listener = (_e, value) => callback(value); ipcRenderer.on('mini:update', listener); return () => ipcRenderer.removeListener('mini:update', listener); },
  command: (value) => { if (COMMANDS.has(value)) ipcRenderer.send('mini:command', value); },
  player: (action, value) => { if (!PLAYER.has(action)) return; if (finite(value)) ipcRenderer.send('cabin:player-command', action, value); else ipcRenderer.send('cabin:player-command', action); },
  // Dragging: offsets from where the drag started, in screen pixels.
  drag: (phase, dx, dy) => { if (phase === 'start' || phase === 'end') ipcRenderer.send('mini:drag', phase); else if (phase === 'move' && finite(dx) && finite(dy)) ipcRenderer.send('mini:drag', 'move', Math.round(dx), Math.round(dy)); },
  pin: (on) => ipcRenderer.send('mini:pin', on === true),
  exit: () => ipcRenderer.send('mini:exit')
}));
