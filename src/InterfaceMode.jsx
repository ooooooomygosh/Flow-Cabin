import React, { useState } from 'react';
import Dialog from './Dialog';
import PixelCat from './pet/PixelCat';
import { usePetIdentity } from './runtime/CabinRuntime';
import { DesktopControls, desktopCommand } from './desktop-client';
import { Plus, Grid3X3, Sparkles } from './icons';
import { interfaceMode, switchInterface } from './interface-mode.mjs';
import { currentBackup } from './backup/upgrade.mjs';
import { saveRecovery } from './backup/recovery.mjs';
import { markResumeOnLoad } from './player/deck-resume.mjs';
export function ClassicTitlebar({items,loading,onAdd,onWall,onBeta,onSettings,notify}) {
  const pet=usePetIdentity();
  return <header className="app-titlebar"><div className="app-brand"><PixelCat pose="idle" petId={pet.builtinId} accessory={pet.accessory} className="app-brand-cat" label={pet.name}/><span><h1>心流小屋</h1><small>{loading?'整理唱片中…':`${items.length} 张唱片`}</small></span></div><div className="app-actions"><button type="button" className="pixel-button album-wall-entry" aria-label="专辑墙" title="打开专辑墙" onClick={onWall}><Grid3X3 size={17}/><span>专辑墙</span></button><button type="button" className="pixel-button interface-choice-button" aria-label="回到生活小屋" title="回到生活小屋首页（可随时切换）" onClick={onBeta}><Sparkles size={17}/><span>生活小屋</span></button><button type="button" className="pixel-button is-primary" aria-label="添加到唱片架" onClick={onAdd}><Plus size={17}/><span>添加到唱片架</span></button></div><DesktopControls onSettings={onSettings} onError={text=>notify(text,{tone:'error'})}/></header>;
}
// 设置 › 小屋与奶糖: the classic shelf home, kept for one more version so long-time users can move over gently.
export function InterfacePreference(){const cabin=interfaceMode()==='beta';return <section id="hub-home" className="hub-block hub-classic-home"><h3>经典首页（过渡）</h3><p>{cabin?'现在的首页是小屋：唱机、书桌和日记本就是入口，唱片墙在「唱片架」里。':'现在用的是原版唱片架首页。'}习惯原版唱片架的话，可以先换回去用一阵，这个开关会保留一个版本。两种首页共用全部数据，切换时会保存恢复点并重新载入画面，正在听的歌会接着播放。</p><button type="button" className="pixel-button" onClick={()=>window.dispatchEvent(new Event('cabin:interface-choice'))}>{cabin?'改用原版唱片架':'回到生活小屋'}</button></section>;}
export function InterfaceDialog({mode,items,close}){
  const beta=mode==='beta',[busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=async()=>{setBusy(true);setError('');try{
    await saveRecovery(currentBackup(items),{reason:'切换首页前'});
    await switchInterface(beta?'classic':'beta',{flush:()=>globalThis.albumMobile?.flushStorage?.(),restart:async()=>{markResumeOnLoad();if(window.albumMobile?.restartInterface)await window.albumMobile.restartInterface();else if(document.documentElement.dataset.desktopClient==='true')desktopCommand('interface-restart');else window.location.reload();}});
  }catch(e){setBusy(false);setError(`切换尚未完成：${e.message}`);}};
  return <Dialog title="选择首页" close={busy?()=>{}:close} className="interface-dialog"><h3>{beta?'改用熟悉的唱片架':'回到生活小屋'}</h3><p>{beta?'原版首页以唱片架和专辑墙为主。小屋的布局会保留，随时可以回来。':'生活小屋有听歌、工作、生活三个角落，家具就是功能入口。'}</p><p>唱片、专辑墙、手记和专注记录共用。切换前会保存恢复点，画面重新载入后正在听的歌会接着播放。</p><button type="button" className="pixel-button is-primary" disabled={busy} onClick={change}>{busy?'正在保存并切换…':beta?'改用原版唱片架':'回到生活小屋'}</button>{error&&<p role="alert">{error}</p>}</Dialog>;
}
