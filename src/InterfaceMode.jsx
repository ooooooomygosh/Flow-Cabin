import React, { useState } from 'react';
import Dialog from './Dialog';
import PixelCat from './pet/PixelCat';
import { usePetIdentity } from './runtime/CabinRuntime';
import { DesktopControls, desktopCommand } from './desktop-client';
import { Plus, Grid3X3, Sparkles } from './icons';
import { interfaceMode, switchInterface } from './interface-mode.mjs';
import { currentBackup } from './backup/upgrade.mjs';
import { saveRecovery } from './backup/recovery.mjs';
export function ClassicTitlebar({items,loading,onAdd,onWall,onBeta,onSettings,notify}) {
  const pet=usePetIdentity();
  return <header className="app-titlebar"><div className="app-brand"><PixelCat pose="idle" petId={pet.builtinId} accessory={pet.accessory} className="app-brand-cat" label={pet.name}/><span><h1>心流小屋</h1><small>{loading?'整理唱片中…':`${items.length} 张唱片`}</small></span></div><div className="app-actions"><button type="button" className="pixel-button album-wall-entry" aria-label="专辑墙" title="打开专辑墙" onClick={onWall}><Grid3X3 size={17}/><span>专辑墙</span></button><button type="button" className="pixel-button interface-choice-button" aria-label="体验 Beta 小屋" title="体验 Beta 小屋（可切回）" onClick={onBeta}><Sparkles size={17}/><span>Beta</span></button><button type="button" className="pixel-button is-primary" aria-label="添加到唱片架" onClick={onAdd}><Plus size={17}/><span>添加到唱片架</span></button></div><DesktopControls onSettings={onSettings} onError={text=>notify(text,{tone:'error'})}/></header>;
}
export function InterfacePreference(){const beta=interfaceMode()==='beta';return <section><h3>{beta?'正在体验 Beta 小屋':'原版首页'}</h3><p>原版唱片架与专辑墙继续保留。Beta 提供全屏角落、家具布置和新的生活小屋；切换后重启应用，数据共用。</p><button type="button" className="pixel-button" onClick={()=>window.dispatchEvent(new Event('cabin:interface-choice'))}>{beta?'切回原版首页':'体验 Beta 小屋'}</button></section>;}
export function InterfaceDialog({mode,items,close}){
  const beta=mode==='beta',[busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=async()=>{setBusy(true);setError('');try{
    await saveRecovery(currentBackup(items),{reason:'切换首页前'});
    await switchInterface(beta?'classic':'beta',{flush:()=>globalThis.albumMobile?.flushStorage?.(),restart:async()=>{if(window.albumMobile?.restartInterface)await window.albumMobile.restartInterface();else if(document.documentElement.dataset.desktopClient==='true')desktopCommand('interface-restart');else window.location.reload();}});
  }catch(e){setBusy(false);setError(`切换尚未完成：${e.message}`);}};
  return <Dialog title="小屋 Beta 体验" close={busy?()=>{}:close} className="interface-dialog"><h3>{beta?'切回熟悉的唱片架':'试试新的生活小屋'}</h3><p>{beta?'重新打开后恢复原版首页，专辑墙仍在顶部。Beta 布局会保留，下次继续体验时仍可使用。':'原版首页保持为默认。主动开启后，重新打开应用即可进入全屏小屋与听歌、工作、生活角落。'}</p><p>唱片、专辑墙、手记和专注记录共用。重启会暂停音乐，切换前会保存恢复点。</p><button type="button" className="pixel-button is-primary" disabled={busy} onClick={change}>{busy?'正在保存并重启…':beta?'切回原版并重启':'切换为 Beta 并重启'}</button>{error&&<p role="alert">{error}</p>}</Dialog>;
}
