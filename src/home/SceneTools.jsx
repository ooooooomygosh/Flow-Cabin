import { musicRequest } from '../room-playback.mjs';
import React,{useEffect,useState} from 'react';
import {useCabinRuntime} from '../runtime/CabinRuntime';
import {readLayout,LAYOUT_PREFIX} from './spatial-layout.mjs';
import {readRecipes,writeRecipes,readLights,setRoomLight,recipeRecordIdentity,RECIPES_EVENT} from './recipes.mjs';
import {THEMES} from './spatial-layout.mjs';
import {diagnosticRows} from './diagnostics-model.mjs';
import './home-tools.css';
import {UndoLine,useUndo} from '../ui/Confirm';
import {applySceneRecipe} from './apply-scene.mjs';
import {downloadBlob} from '../lib/download.mjs';
import {readLocation} from '../location/location-state.mjs';

export function SceneRecipes(){
 const r=useCabinRuntime(),[saved,setSaved]=useState(safeRecipes),[name,setName]=useState(''),[minutes,setMinutes]=useState(0),[notice,setNotice]=useState(''),[undo,offerUndo,clearUndo]=useUndo();
 // Another window or a synced device may change the list while this panel is open.
 useEffect(()=>{const sync=()=>setSaved(safeRecipes());window.addEventListener(RECIPES_EVENT,sync);return()=>window.removeEventListener(RECIPES_EVENT,sync);},[]);
 const full=saved.recipes.length>=30;
 const save=()=>{try{const recipe={id:crypto.randomUUID(),name:name.trim(),theme:r.look,layout:readLayout(localStorage,r.look),dim:readLights()[r.look]===true,mix:r.sound.mix,sound:r.sound.enabled,focusMinutes:minutes,recordId:String(r.deck.deckItem?.id||''),recordIdentity:recipeRecordIdentity(r.deck.deckItem)};setSaved(writeRecipes({version:1,recipes:[...saved.recipes,recipe]}));setName('');setNotice('当前房间、灯光、声音和唱片已保存。');}catch(e){setNotice(e.message);}};
 const apply=recipe=>{try{const result=applySceneRecipe(r,recipe);setNotice(`已进入「${recipe.name}」${result.missingRecord?'；原唱片不在本机曲库中。':'。'}`);}catch(e){setNotice(e.message);}};
 const remove=recipe=>{
  try{
   const index=saved.recipes.findIndex(x=>x.id===recipe.id);
   setSaved(writeRecipes({...saved,recipes:saved.recipes.filter(x=>x.id!==recipe.id)}));setNotice('');
   // The undo lives in the panel: a toast behind this modal panel could not be clicked.
   offerUndo(`已移除场景「${recipe.name}」`,()=>{try{const now=safeRecipes();if(now.recipes.some(x=>x.id===recipe.id))return;const recipes=[...now.recipes];recipes.splice(Math.min(index,recipes.length),0,recipe);setSaved(writeRecipes({...now,recipes}));}catch(e){setNotice(`没能恢复「${recipe.name}」：${e.message}`);}});
  }catch(e){setNotice(e.message);}
 };
 const themeName=id=>THEMES.find(t=>t.id===id)?.name||'小屋';
 return <section className="home-scene-tools"><p>把喜欢的房间布置、灯光、环境音和唱片一起记下来，下次一键回到这里。</p>
  <label>场景名称<input value={name} maxLength={60} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim()&&!full){e.preventDefault();save();}}} placeholder="例如：雨天读书"/></label>
  <label>同时开始专注（分钟，0 为不启动）<input type="number" min="0" max="180" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>
  <button className="home-primary" disabled={!name.trim()||full} onClick={save}>保存当前场景</button>
  {full&&<p className="home-tools-hint">最多保存 30 个场景，移除一个后才能再存。</p>}
  {saved.recipes.length?<><h4 className="home-tools-subhead">已保存 · {saved.recipes.length}</h4><ul className="home-recipe-list">{saved.recipes.map(recipe=><li key={recipe.id}><span>{recipe.name}<small>{themeName(recipe.theme)} · {recipe.focusMinutes?`${recipe.focusMinutes} 分钟专注`:'自由时间'}{recipe.dim?' · 暗灯':''}{recipe.sound?' · 环境音':''}</small></span><button onClick={()=>apply(recipe)}>进入</button><button aria-label={`删除场景 ${recipe.name}`} onClick={()=>remove(recipe)}>移除</button></li>)}</ul></>
   :<div className="home-tools-empty" role="note"><strong>还没有场景配方</strong><small>先把房间布置好、调好灯光和环境音，放上一张唱片，再起个名字保存。比如「雨天读书」「深夜写代码」。</small></div>}
  <UndoLine offer={undo} clear={clearUndo}/>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
const safeRecipes=()=>{try{return readRecipes();}catch{return {version:1,recipes:[]};}};
export function SleepPanel(){
 const {sleep,deck}=useCabinRuntime(),[state,setState]=useState(sleep.getSnapshot),[minutes,setMinutes]=useState(15),[error,setError]=useState('');
 useEffect(()=>sleep.subscribe(setState),[sleep]);
 return <section className="home-scene-tools"><h3>让小屋慢慢安静下来</h3><p>最后半分钟降低音乐和环境音，调暗灯光，让伙伴回窝。期间可以随时取消。</p>{deck.playback.remote&&<p>当前外部播放器将在结束时暂停；环境音会渐弱。</p>}{state.active?<><strong className="sleep-remaining">{Math.ceil(state.remaining/60000)} 分钟后休息</strong><button className="home-primary" onClick={sleep.cancel}>取消睡前模式</button></>:<><label>多久后休息<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><button className="home-primary" onClick={()=>{try{sleep.start(minutes);setError('');}catch(e){setError(e.message);}}}>开始睡前模式</button></>}{state.completed&&<p>{deck.audible?'已发送暂停请求，请确认外部播放器状态。':'小屋安静下来了，晚安。'}</p>}{state.error&&<p role="alert">{state.error}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
export function SleepIndicator(){const {sleep,commands}=useCabinRuntime(),[state,setState]=useState(sleep.getSnapshot);useEffect(()=>sleep.subscribe(setState),[sleep]);return state.active?<button className="home-sleep-indicator" onClick={()=>commands.open('sleep')}>☾ {Math.ceil(state.remaining/60000)} 分钟后休息 · 可取消</button>:null;}
export function Diagnostics(){
 const {deck,focus,identity,look,sky,devices,lyricsTrack}=useCabinRuntime();
 const [accounts,setAccounts]=useState({}),[live,setLive]=useState(devices.getSnapshot),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now);
 useEffect(()=>{let alive=true;musicRequest('/config').then(value=>{if(alive)setAccounts(Object.fromEntries(['qq','netease'].map(key=>[key,value.accounts?.[key]?.status||'empty'])));}).catch(()=>{if(alive)setAccounts({status:'unavailable'});});const off=devices.subscribe(setLive);const timer=setInterval(()=>setNow(Date.now()),30000);return()=>{alive=false;off();clearInterval(timer);};},[devices]);
 const platform=window.albumMobile?'android':document.documentElement.dataset.desktopClient==='true'?'desktop':'web',location=readLocation().status,storage=window.albumMobile?.storageStatus?.()||{available:true};
 const data={version:1,at:new Date().toISOString(),platform,room:look,pet:{kind:identity.kind,id:identity.id,accessory:identity.accessory},playback:{provider:deck.provider,status:deck.playback.status||'idle',audible:deck.audible,remote:Boolean(deck.playback.remote)},focus:{phase:focus.state.timer.phase,paused:focus.state.timer.paused,unsaved:Boolean(focus.hasUnsavedChanges)},location:{status:location},weather:{enabled:sky.settings.realWeather,updatedAt:sky.real?.fetchedAt||null},accounts,connection:{connected:live.connections.length,error:Boolean(live.error||window.cabinSyncError)},lyrics:{trackAvailable:Boolean(lyricsTrack.title)},storage};
 const rows=diagnosticRows({platform,provider:deck.provider,audible:deck.audible,statusText:deck.playback.statusText,remote:Boolean(deck.playback.remote),phase:focus.state.timer.phase,paused:focus.state.timer.paused,unsaved:Boolean(focus.hasUnsavedChanges),hasTrack:Boolean(deck.actualTrack||lyricsTrack.title),pet:identity.name,accessory:identity.accessory,connections:live.connections.length,syncError:live.error||window.cabinSyncError||'',accounts,location,weatherOn:Boolean(sky.settings.realWeather),weatherAt:sky.real?.fetchedAt||0,storage},now);
 const warnings=rows.filter(row=>row.tone==='warn').length;
 return <section className="home-scene-tools"><p>{warnings?`有 ${warnings} 项需要留意，说明写在每一行下面。`:'各项功能状态正常。'}这份报告不包含账号凭据、任务正文、歌曲地址或位置坐标。</p><dl className="home-diagnostics">{rows.map(row=><div key={row.id} data-tone={row.tone}><dt>{row.label}</dt><dd><span className="home-diagnostics-value"><i aria-hidden="true"/>{row.value}</span>{row.hint&&<small>{row.hint}</small>}</dd></div>)}</dl><button className="home-primary" onClick={async()=>{try{await downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`FlowCabin-诊断-${new Date().toLocaleDateString('zh-CN').replaceAll('/','-')}.json`);setNotice('诊断报告已导出。');}catch(error){setNotice(error.message);}}}>导出诊断报告</button>{notice&&<p role="status">{notice}</p>}</section>;
}
