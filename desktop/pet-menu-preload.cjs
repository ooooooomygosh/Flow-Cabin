'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['previous','toggle','next','focus','home']);
contextBridge.exposeInMainWorld('cabinPetMenu',Object.freeze({getState:()=>ipcRenderer.invoke('pet-menu:state'),command:action=>{if(allowed.has(action))ipcRenderer.send('pet-menu:command',action);},onState:callback=>{const receive=(_e,value)=>callback(value);ipcRenderer.on('pet-menu:update',receive);return()=>ipcRenderer.removeListener('pet-menu:update',receive);}}));
