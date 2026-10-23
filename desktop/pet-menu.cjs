'use strict';
const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
const URL='album-desktop://shell/pet-menu.html';
const ACTIONS=new Set(['previous','toggle','next','focus','home']);
function menuBounds(anchor,area,width=320,height=280){return{x:Math.round(Math.max(area.x+8,Math.min(area.x+area.width-width-8,anchor.x+anchor.width/2-width/2))),y:Math.round(Math.min(area.y+area.height-height-8,anchor.y+anchor.height+7)),width,height};}
function createPetMenu({getTray,getState,command,registerProtocol}) {
  let window=null;
  const valid=e=>window&&!window.isDestroyed()&&e.sender===window.webContents&&e.senderFrame?.url===URL;
  ipcMain.handle('pet-menu:state',e=>{if(!valid(e))throw Error('Unknown menu sender');return getState();});
  ipcMain.on('pet-menu:command',(e,action)=>{if(valid(e)&&ACTIONS.has(action)){command(action);if(action==='home')window.hide();}});
  async function toggle(){
    if(window?.isVisible()){window.hide();return;}
    const anchor=getTray()?.getBounds();if(!anchor)return;
    const area=screen.getDisplayMatching(anchor).workArea;
    if(!window){
      const created=new BrowserWindow({...menuBounds(anchor,area),show:false,frame:false,transparent:false,backgroundColor:'#252d25',hasShadow:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{preload:path.join(__dirname,'pet-menu-preload.cjs'),partition:'album-pet-menu',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false}});
      window=created;
      if(!(await created.webContents.session.protocol.isProtocolHandled('album-desktop')))registerProtocol(created.webContents.session.protocol);
      created.webContents.setWindowOpenHandler(()=>({action:'deny'}));created.webContents.on('will-navigate',e=>e.preventDefault());
      created.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
      created.on('blur',()=>created.hide());created.on('closed',()=>{if(window===created)window=null;});
      await created.loadURL(URL);if(window!==created)return;
    }
    window.setBounds(menuBounds(anchor,area));window.webContents.send('pet-menu:update',getState());window.show();window.focus();
  }
  return {toggle,publish(){if(window?.isVisible())window.webContents.send('pet-menu:update',getState());},dispose(){window?.destroy();window=null;ipcMain.removeHandler('pet-menu:state');}};
}
module.exports={createPetMenu,menuBounds,ACTIONS};
