'use strict';
const {BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const PAGE='album-desktop://shell/lyrics.html';
function createLyricWindow({getSite,registerProtocol}) {
  let window=null;
  ipcMain.handle('cabin-lyrics:read',async event=>{
    if(!window || window.isDestroyed() || event.sender!==window.webContents || event.senderFrame?.url!==PAGE)throw Error('Unknown lyric sender');
    const site=getSite(); if(!site || site.isDestroyed())return null;
    const raw=await site.executeJavaScript('window.cabinLyricLine || null');
    if(!raw)return null;
    return Object.fromEntries(['title','current','next'].map(key=>[key,typeof raw[key]==='string'?raw[key].slice(0,1000):'']));
  });
  return { async open() {
    if(window && !window.isDestroyed()){window.show();window.focus();return;}
    const created=new BrowserWindow({width:640,height:230,minWidth:300,minHeight:170,title:'小屋伴随歌词',show:false,alwaysOnTop:true,backgroundColor:'#222923',webPreferences:{preload:path.join(__dirname,'lyric-preload.cjs'),partition:'cabin-lyrics',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    window=created;
    if(!(await created.webContents.session.protocol.isProtocolHandled('album-desktop')))registerProtocol(created.webContents.session.protocol);
    created.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
    created.webContents.setWindowOpenHandler(()=>({action:'deny'}));created.webContents.on('will-navigate',event=>event.preventDefault());
    created.on('closed',()=>{if(window===created)window=null;});
    await created.loadURL(PAGE);if(window===created)created.show();
  },dispose(){window?.destroy();window=null;ipcMain.removeHandler('cabin-lyrics:read');}};
}
module.exports={createLyricWindow};
