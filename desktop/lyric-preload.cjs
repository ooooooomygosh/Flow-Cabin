'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cabinLyrics',Object.freeze({read:()=>ipcRenderer.invoke('cabin-lyrics:read')}));
