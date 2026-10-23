import { readPetDirectory } from './import-directory.mjs';
import { selectPack } from './imported-pack.mjs';
import React, { useEffect, useState, useRef } from 'react';
import PixelCat from './PixelCat';
import { PET_ACTIONS } from './pet-actions.mjs';
import './pet-pack.css';
const DSH_NAMES={observe:'',yawn:'',greet:'',petresponse:'',idle:'',walk:'',sleep:'',wake:'',turn:'',dragged:'',land:'',read:'',write:'',type:'',think:'',nod:'',sway:'',dance:'',eat:'',satisfied:'',celebrate:'',deliver:'',typing:'写代码',focus:'轻快记录',listen:'悠闲哼歌',groove:'轻快摇摆舞',stretch:'超大伸懒腰'};
const api=async(path,options)=>{if(window.albumMobile?.petRequest){if(path==='packs/archive')throw Error('手机请导入 JSON 动画包；ZIP 可先在电脑导入后携带素材备份。');if(options?.method==='DELETE')return window.albumMobile.petRequest('/remove',{id:path.split('/')[1]});return window.albumMobile.petRequest('/'+path,options?.body?JSON.parse(options.body):undefined);}const response=await fetch(`/desktop-pets/${path}`,options); const value=await response.json();if(!response.ok)throw Error(value.error || '宠物包暂不可用');return value;};
export default function PetPackSettings() {
  const [packs,setPacks]=useState([]),[error,setError]=useState(''),[selected,setSelected]=useState(''),[action,setAction]=useState('idle'),[bridge,setBridge]=useState(null),[available,setAvailable]=useState(false);
  const refresh=async()=>{try { const value=await api('packs');setPacks(value.packs);setAvailable(true); } catch {setAvailable(false);} };
  useEffect(()=>{refresh();if(window.albumMobile)return;let initial=true;const update=()=>api('dsh').then(value=>{setBridge(value);if(initial){initial=false;if(value.port)setPort(value.port);setDshPet(value.petId||'main');setMapping({...DSH_NAMES,...value.mapping});}}).catch(()=>{});update();const timer=setInterval(update,2000);return()=>clearInterval(timer);},[]);
  const [port,setPort]=useState(3080),[dshPet,setDshPet]=useState('main'),[mapping,setMapping]=useState(DSH_NAMES);
  const pack=packs.find(item=>item.id===selected);
  const importPack=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try {if(file.size>23*1024*1024)throw Error('宠物包不能超过 23 MB');const archive=/\.zip$/i.test(file.name);const body=archive?await file.arrayBuffer():await file.text();if(!archive)JSON.parse(body);const result=await api(archive?'packs/archive':'packs',{method:'POST',headers:{'Content-Type':archive?'application/zip':'application/json'},body});await refresh();setSelected(result.pack.id);setError('');}catch(e){setError(e.message);}};
  return <section className="pet-pack-settings" aria-label="宠物动画包">
    <h3>让小伙伴换一种模样</h3><p>导入自己拥有使用权的 PNG 图集或透明 WebM 动画包，可预览动作、镜像与落脚位置。</p>
    {!available && <p>动画包导入在桌面版和 Android 版中提供。内置五位小伙伴始终可用。</p>}
    <label>导入 .json / .zip 宠物包<input type="file" accept=".json,.zip,application/json,application/zip" disabled={!available} onChange={importPack}/></label>
    <label>导入素材目录（含配置和动画）<input type="file" webkitdirectory="" multiple disabled={!available} onChange={async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;try{const body=await readPetDirectory(files);const result=await api('packs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await refresh();setSelected(result.pack.id);setError('');}catch(error){setError(error.message);}}}/></label>
    {packs.length>0 && <label>已导入<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">内置小猫</option>{packs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label>预览动作<select value={action} onChange={e=>setAction(e.target.value)}>{PET_ACTIONS.map(item=><option key={item}>{item}</option>)}</select></label>
    {pack ? <><PackPreview key={pack.id} pack={pack} action={action} onError={setError}/><p>{pack.author} · {pack.license} · {pack.authorized?'作者标记已授权':'授权待核实'}</p><button type="button" onClick={async()=>{try{await api(`packs/${pack.id}`,{method:'DELETE'});setSelected('');selectPack(null);await refresh();}catch(e){setError(e.message);}}}>移除这个包</button></> : <><PixelCat pose={action}/><button type="button" onClick={()=>{try{selectPack(null);}catch(error){setError(error.message);}}}>使用内置小伙伴</button></>}
    {available && !window.albumMobile && <fieldset><legend>连接已运行的 dsh-pet</legend><label>本机端口<input type="number" min="1" max="65535" value={port} onChange={e=>setPort(Number(e.target.value))}/></label><label>宠物 ID<input value={dshPet} onChange={e=>setDshPet(e.target.value)}/></label>{Object.entries(mapping).map(([key,value])=><label key={key}>{key}<input list="dsh-animation-names" value={value} onChange={e=>setMapping({...mapping,[key]:e.target.value})}/></label>)}<datalist id="dsh-animation-names">{bridge?.animationNames?.map(name=><option value={name} key={name}/>)}</datalist></fieldset>}
    {available && !window.albumMobile && <button type="button" onClick={async()=>{try{setBridge(await api('dsh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!bridge?.enabled,port,petId:dshPet,mapping})}));setError('');}catch(e){setError(e.message);}}}>{bridge?.enabled?'关闭并撤销本机连接':'启用本机动画桥接'}</button>}
    {bridge?.enabled && <p>仅本机 · 127.0.0.1:{bridge.port} · {bridge.receipt?.status || '等待动作'}{bridge.error ? ` · ${bridge.error}` : ''}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function PackPreview({pack,action,onError=()=>{}}) {
  const stage=useRef(null);
  const [mirror,setMirror]=useState(pack.mirror),[baseline,setBaseline]=useState(pack.baseline),[actionMap,setActionMap]=useState(pack.actionMap || {});
  return <><button type="button" onClick={()=>{try{selectPack({...pack,mirror,baseline,actionMap});onError('');}catch(error){onError(error.message);}}}>使用这位小伙伴</button><div className="pet-pack-stage" ref={stage}><PixelCat packOverride={{...pack,mirror,baseline,actionMap}} packBase="/desktop-pets/packs" pose={action}/></div>
    {window.albumMobile?.pinPetShortcut && <button type="button" onClick={async()=>{try{const canvas=stage.current.querySelector('canvas'),icon=canvas.toDataURL('image/png').split(',')[1];const result=await window.albumMobile.pinPetShortcut({name:pack.name,icon});onError(result.requested?'已请求添加快捷方式，请在系统窗口中完成。':'当前启动器不支持固定快捷方式。');}catch(error){onError(error.message);}}}>用这位伙伴创建桌面快捷方式</button>}
    <label>将 {action} 映射到<select value={actionMap[action] || action} onChange={e=>setActionMap({...actionMap,[action]:e.target.value})}>{[...new Set([action,...Object.keys(pack.animations)])].map(value=><option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/>镜像预览</label><label>落脚位置<input type="range" min="0" max="1" step=".01" value={baseline} onChange={e=>setBaseline(Number(e.target.value))}/></label>
    {!pack.animations[actionMap[action] || action] && <p>此包尚未提供 {action}，正在预览 idle。</p>}</>;
}
