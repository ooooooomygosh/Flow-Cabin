import { selectPack } from './imported-pack.mjs';
import React, { useEffect, useState } from 'react';
import PixelCat from './PixelCat';
import { PET_ACTIONS } from './pet-actions.mjs';
import './pet-pack.css';
const DSH_NAMES={typing:'写代码',focus:'轻快记录',listen:'悠闲哼歌',groove:'轻快摇摆舞',stretch:'超大伸懒腰'};
const api=async(path,options)=>{const response=await fetch(`/desktop-pets/${path}`,options); const value=await response.json();if(!response.ok)throw Error(value.error || '宠物包暂不可用');return value;};
export default function PetPackSettings() {
  const [packs,setPacks]=useState([]),[error,setError]=useState(''),[selected,setSelected]=useState(''),[action,setAction]=useState('idle'),[bridge,setBridge]=useState(null),[available,setAvailable]=useState(false);
  const refresh=async()=>{try { const value=await api('packs');setPacks(value.packs);setAvailable(true); } catch {setAvailable(false);} };
  useEffect(()=>{refresh();},[]);
  const [port,setPort]=useState(9527),[dshPet,setDshPet]=useState('main'),[mapping,setMapping]=useState(DSH_NAMES);
  const pack=packs.find(item=>item.id===selected);
  const importPack=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try {if(file.size>23*1024*1024)throw Error('宠物包不能超过 23 MB');const archive=/\.zip$/i.test(file.name);const body=archive?await file.arrayBuffer():await file.text();if(!archive)JSON.parse(body);const result=await api(archive?'packs/archive':'packs',{method:'POST',headers:{'Content-Type':archive?'application/zip':'application/json'},body});await refresh();setSelected(result.pack.id);setError('');}catch(e){setError(e.message);}};
  return <section className="pet-pack-settings" aria-label="宠物动画包">
    <h3>让小伙伴换一种模样</h3><p>导入自己拥有使用权的 PNG 动画图集包，可预览动作、镜像与落脚位置。</p>
    {!available && <p>动画包导入在桌面版中提供。内置五位小伙伴始终可用。</p>}
    <label>导入 .json / .zip 宠物包<input type="file" accept=".json,.zip,application/json,application/zip" disabled={!available} onChange={importPack}/></label>
    {packs.length>0 && <label>已导入<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">内置小猫</option>{packs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label>预览动作<select value={action} onChange={e=>setAction(e.target.value)}>{PET_ACTIONS.map(item=><option key={item}>{item}</option>)}</select></label>
    {pack ? <><PackPreview key={pack.id} pack={pack} action={action}/><p>{pack.author} · {pack.license} · {pack.authorized?'作者标记已授权':'授权待核实'}</p><button type="button" onClick={async()=>{try{await api(`packs/${pack.id}`,{method:'DELETE'});setSelected('');selectPack(null);await refresh();}catch(e){setError(e.message);}}}>移除这个包</button></> : <><PixelCat pose={action}/><button type="button" onClick={()=>selectPack(null)}>使用内置小伙伴</button></>}
    {available && <fieldset><legend>连接已运行的 dsh-pet</legend><label>本机端口<input type="number" min="1" max="65535" value={port} onChange={e=>setPort(Number(e.target.value))}/></label><label>宠物 ID<input value={dshPet} onChange={e=>setDshPet(e.target.value)}/></label>{Object.entries(mapping).map(([key,value])=><label key={key}>{key}<input value={value} onChange={e=>setMapping({...mapping,[key]:e.target.value})}/></label>)}</fieldset>}
    {available && <button type="button" onClick={async()=>{try{setBridge(await api('dsh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!bridge?.enabled,port,petId:dshPet,mapping})}));setError('');}catch(e){setError(e.message);}}}>{bridge?.enabled?'关闭并撤销本机连接':'启用本机动画桥接'}</button>}
    {bridge?.enabled && <p>仅本机 · 127.0.0.1:{bridge.port} · dsh-pet 官方占用接口</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function PackPreview({pack,action}) {
  const [frame,setFrame]=useState(0),[mirror,setMirror]=useState(pack.mirror),[baseline,setBaseline]=useState(pack.baseline),[actionMap,setActionMap]=useState(pack.actionMap || {});
  const mapping=pack.animations[actionMap[action] || action] || pack.animations.idle;
  useEffect(()=>{setFrame(0);const timer=setInterval(()=>setFrame(value=>(value+1)%mapping.frames.length),1000/mapping.fps);return()=>clearInterval(timer);},[mapping]);
  const {width,frameWidth,frameHeight}=pack.media,index=mapping.frames[frame%mapping.frames.length],columns=width/frameWidth;
  return <><button type="button" onClick={()=>selectPack({...pack,mirror,baseline,actionMap})}>使用这位小伙伴</button><div className="pet-pack-stage"><span style={{width:frameWidth,height:frameHeight,maxWidth:'100%',transform:`translateY(${-baseline*frameHeight}px) scaleX(${mirror?-1:1})`,backgroundImage:`url(/desktop-pets/packs/${pack.id}/atlas.png)`,backgroundPosition:`-${index%columns*frameWidth}px -${Math.floor(index/columns)*frameHeight}px`}}/></div>
    <label>将 {action} 映射到<select value={actionMap[action] || action} onChange={e=>setActionMap({...actionMap,[action]:e.target.value})}>{[...new Set([action,...Object.keys(pack.animations)])].map(value=><option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/>镜像预览</label><label>落脚位置<input type="range" min="0" max="1" step=".01" value={baseline} onChange={e=>setBaseline(Number(e.target.value))}/></label>
    {!pack.animations[actionMap[action] || action] && <p>此包尚未提供 {action}，正在预览 idle。</p>}</>;
}
