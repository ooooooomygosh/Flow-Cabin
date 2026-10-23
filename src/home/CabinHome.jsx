import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { DesktopControls } from '../desktop-client';
import PixelCat from '../pet/PixelCat';
import Dialog from '../Dialog';
import { Down as ChevronDown, Play, Pause, BookOpen, Clock, Library, Grid3X3, Settings, Heart } from '../icons';
import { FURNITURE, THEMES, bounds, unproject, defaultLayout, readLayout, saveLayout, createHistory, placeFurniture, addFurniture, removeFurniture, migrateLayout, LAYOUT_CHANGED, LAYOUT_PREFIX } from './spatial-layout.mjs';
import { downloadBlob } from '../lib/download.mjs';
import RoomCanvas from './RoomCanvas';
import { readLights, setRoomLight } from './recipes.mjs';
import { SleepIndicator } from './SceneTools';
import HomeCorner from './HomeCorner';
import { ClockReadout, CalendarReadout, LyricsReadout } from './HomeReadouts';
import './home.css';

const ZONES = [{ id: 'music', name: '听歌角', x: 335, y: 454 }, { id: 'work', name: '工作角', x: 790, y: 388 }, { id: 'life', name: '生活角', x: 880, y: 545 }];
const shortDate = date => date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
function FurnitureContents({ item }) {
  const { deck, focus, sky } = useCabinRuntime();
  if (['clock', 'timer'].includes(item.type)) return <ClockReadout/>;
  if (item.type === 'calendar') return <CalendarReadout/>;
  if (item.type === 'weather') { const weather = sky.settings.realWeather && sky.real; return <span className="home-weather-readout"><b>{Number.isFinite(weather?.temperature) ? `${Math.round(weather.temperature)}°` : '天气'}</b><small>{weather ? sky.city?.name || '附近' : '选择地区'}</small></span>; }
  if (item.type === 'lyrics') return <LyricsReadout/>;
  if (item.type === 'deck' && deck.deckItem?.cover) return <span className={`home-deck-cover ${deck.audible ? 'is-playing' : ''}`}><img src={deck.deckItem.cover} alt=""/><i/></span>;

  if (item.type === 'notes' && focus.state.notes) return <span className="home-note-preview">{focus.state.notes.slice(0, 28)}</span>;
  return null;
}

function FurnitureLive({ item, manifest }) {
  const {focus}=useCabinRuntime();
  const spec = FURNITURE[item.type], frame = manifest?.frames?.[`${item.type}-${item.facing === 'left' ? 'nw' : 'se'}`];
  if(item.type==='tasks'&&frame){
    const factor=Math.min(spec.w/frame.frame[2],spec.h/frame.frame[3]),w=frame.frame[2]*factor,h=frame.frame[3]*factor;
    const tasks=focus.state.tasks.filter(t=>!t.done).slice(0,3);
    return <span className="home-task-readout" style={{left:(spec.w-w)/2,top:spec.h-h,width:w,height:h}}>{[[.15,.25],[.405,.47],[.67,.33]].map(([x,y],i)=><span key={i} className="home-task-paper" style={{left:`${(item.facing==='left'?x:.82-x)*100}%`,top:`${y*100}%`}}>{tasks[i]?tasks[i].text.slice(0,6):i===0?'今日小事':'＋'}</span>)}</span>;
  }
  const rect = frame?.blankRect;
  if (!rect) return <FurnitureContents item={item}/>;
  const scale = Math.min(spec.w / frame.frame[2], spec.h / frame.frame[3]);
  const width = frame.frame[2] * scale, height = frame.frame[3] * scale;
  const style = { left:(spec.w-width)/2+rect.x*width, top:spec.h-height+rect.y*height, width:rect.width*width, height:rect.height*height };
  return <span className={`home-live-frame live-${item.type}`} style={style}><FurnitureContents item={item}/></span>;
}

function useRoomLayout(look) {
  const histories = useRef(new Map()), [error, setError] = useState('');
  const read = theme => { if (!histories.current.has(theme)) { let value; try { value = readLayout(localStorage, theme); } catch (e) { value = defaultLayout(theme); queueMicrotask(() => setError(`原布局已保留：${e.message}`)); } histories.current.set(theme, createHistory(value)); } return histories.current.get(theme); };
  const [layout, setLayout] = useState(() => read(look).get());
  useEffect(() => { setLayout(read(look).get()); }, [look]);
  useEffect(() => { const receive = event => { if (event.key && event.key !== LAYOUT_PREFIX + look) return; try { const next = readLayout(localStorage, look); histories.current.set(look, createHistory(next)); setLayout(next); } catch (e) { setError(e.message); } }; window.addEventListener('storage', receive); return () => window.removeEventListener('storage', receive); }, [look]);
  const commit = next => { try { const safe = saveLayout(localStorage, next); read(safe.theme).apply(safe); setLayout(safe); setError(''); window.dispatchEvent(new Event(LAYOUT_CHANGED)); return true; } catch (e) { setError(`布局未保存：${e.message}`); return false; } };
  const historyAction = name => { const h = read(look), previous = h.get(); try { const next = h[name](); saveLayout(localStorage, next); setLayout(next); setError(''); window.dispatchEvent(new Event(LAYOUT_CHANGED)); } catch (e) { h[name === 'undo' ? 'redo' : 'undo'](); setLayout(previous); setError(e.message); } };
  return { layout, commit, error, setError, undo: () => historyAction('undo'), redo: () => historyAction('redo'), canUndo: read(look).canUndo, canRedo: read(look).canRedo };
}

export default function CabinHome({ reduced = false, editRequest = 0, focusOpen = false, petOpen = false }) {
  const { deck, focus, identity, look, sky, commands, notify } = useCabinRuntime();
  const store = useRoomLayout(look), { layout, commit } = store;
  const [furnitureManifest, setFurnitureManifest] = useState(null);
  useEffect(() => { let alive = true; setFurnitureManifest(null); fetch(`/room-scenes/v21/furniture/${look}/manifest.json`).then(r => r.json()).then(v => alive && setFurnitureManifest(v)).catch(() => {}); return () => { alive = false; }; }, [look]);
  const [editing, setEditing] = useState(false), [drawer, setDrawer] = useState(''), [selected, setSelected] = useState('');
  const [zone, setZone] = useState(() => innerWidth < 700 ? 'music' : 'all');
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight - 140 });
  const [dim, updateDim] = useState(() => readLights()[look] === true);
  const setDim = value => { const next = typeof value === 'function' ? value(dim) : value; try { setRoomLight(look,next); updateDim(next); } catch { notify('灯光设置未能保存。'); } };
  useEffect(() => { const update = () => updateDim(readLights()[look] === true); update(); window.addEventListener('cabin:lights',update); window.addEventListener('storage',update); return () => { window.removeEventListener('cabin:lights',update); window.removeEventListener('storage',update); }; }, [look]);
  const petHit = useRef(null);
  const placePetHit = useCallback(point => { if (petHit.current) { petHit.current.style.left = `${point.x - 38}px`; petHit.current.style.top = `${point.y - 82}px`; } }, []);
  const [intro, setIntro] = useState(() => localStorage.getItem('flow-cabin-home-intro-v1') !== 'done');
  const host = useRef(null), drag = useRef(null), swipe = useRef(null), held = useRef(0), suppressClick = useRef(false), compact = useRef(innerWidth < 700);
  const [preview, setPreview] = useState(null); const shown = preview || layout;
  const chosen = layout.items.find(i => i.id === selected), theme = THEMES.find(t => t.id === look) || THEMES[0];
  useEffect(() => { if (editRequest) { setZone('all'); setEditing(true); setDrawer('decorate'); } }, [editRequest]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; setViewport({ width, height }); const phone = width < 700; if (compact.current !== phone) { compact.current = phone; setZone(phone ? 'music' : 'all'); } }); observer.observe(host.current);
    return () => { observer.disconnect(); clearTimeout(held.current); };
  }, []);
  const overview = zone === 'all';
  const scale = Math.min(viewport.width / 1200, viewport.height / 800);
  const transform = `translate(${viewport.width / 2 - 600 * scale}px, ${viewport.height / 2 - 400 * scale}px) scale(${scale})`;
  const completeIntro = () => { setIntro(false); try { localStorage.setItem('flow-cabin-home-intro-v1', 'done'); } catch {} };
  const activate = item => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (editing) { setSelected(item.id); setDrawer('decorate'); return; }
    if (item.type === 'lamp' || item.type === 'curtain') { setDim(value => !value); return; }
    commands.open(FURNITURE[item.type].action);
  };
  const begin = (event, item) => {
    if (event.button !== 0) return;
    suppressClick.current = false; drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, item, active: editing, next: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editing) setSelected(item.id);
    else if (event.pointerType !== 'mouse') held.current = setTimeout(() => { if (drag.current) { drag.current.active = true; setEditing(true); setSelected(item.id); suppressClick.current = true; } }, 550);
  };
  const move = event => {
    const d = drag.current; if (!d || d.pointerId !== event.pointerId) return;
    const dx = (event.clientX - d.x) / scale, dy = (event.clientY - d.y) / scale;
    if (Math.hypot(dx, dy) > 8) { clearTimeout(held.current); suppressClick.current = true; }
    if (!d.active || Math.hypot(dx, dy) < 3) return;
    const delta = unproject(600 + dx, 308 + dy), patch = { u: d.item.u + delta.u, v: d.item.v + delta.v };
    if (d.item.mount === 'wall-left') { patch.u = 0; patch.v = d.item.v - dx / .62; patch.z = Math.max(90, Math.min(255, d.item.z - dy - dx * .448)); }
    if (d.item.mount === 'wall-right') { patch.v = 0; patch.u = d.item.u + dx / .62; patch.z = Math.max(90, Math.min(255, d.item.z - dy + dx * .448)); }
    try { d.next = placeFurniture(layout, d.item.id, patch); setPreview(d.next); store.setError(''); } catch (e) { d.next = null; setPreview(null); store.setError(e.message); }
  };
  const end = event => { const d = drag.current; clearTimeout(held.current); if (d?.pointerId === event.pointerId) { if (d.next && event.type !== 'pointercancel') commit(d.next); drag.current = null; setPreview(null); } };
  const exportLayout = () => downloadBlob(new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }), `${look}-小屋布局.json`);
  const importLayout = async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 128 * 1024) throw Error('布局文件不能超过 128 KiB。'); const next = migrateLayout(JSON.parse(await file.text())); if (commit(next)) commands.theme(next.theme); } catch (e) { store.setError(e.message); } event.target.value = ''; };
  const mutate = fn => { try { commit(fn()); } catch (e) { store.setError(e.message); } };
  const playingTitle = deck.nowTrack || deck.deckItem?.title;
  return <section className={`cabin-home theme-${look} ${editing ? 'is-editing' : ''} ${!overview ? 'is-corner' : ''} ${reduced ? 'is-reduced' : ''}`} aria-label="生活小屋首页" data-zone={zone}>
    <header className="home-header">
      <button type="button" className="home-pet-portrait" aria-expanded={petOpen} aria-label={`伙伴与装扮 · ${identity.name}`} onClick={() => commands.open('pet')}><PixelCat petId={identity.builtinId} accessory={identity.accessory} reduceMotion={reduced} label={identity.name}/></button>
      <button type="button" className="home-room-name" aria-label="选择房间主题" onClick={() => setDrawer('themes')}><small>FLOW CABIN · BETA</small><span>{theme.name}<ChevronDown size={14}/></span></button>
      <nav className="home-shortcuts" aria-label="小屋常用工具"><button type="button" onClick={() => commands.open('wall')}><Grid3X3 size={17}/><span>专辑墙</span></button><button type="button" onClick={() => commands.open('library')}><Library size={17}/><span>唱片库</span></button><button type="button" className="focus-badge" aria-expanded={focusOpen} onClick={() => commands.open('timer')}><Clock size={17}/><span>专注</span></button><button type="button" onClick={() => commands.open('notes')}><BookOpen size={17}/><span>随手记</span></button><button type="button" aria-pressed={editing} onClick={() => { if (editing) { setEditing(false); setDrawer(''); setSelected(''); } else { setZone('all'); setEditing(true); setDrawer('decorate'); } }}><Settings size={16}/><span>{editing ? '完成布置' : '布置'}</span></button></nav>
      <DesktopControls onSettings={() => setDrawer('menu')} onError={text => notify(text, { tone: 'error' })}/>
    </header>
    <div className="home-room-caption">{!overview && <button type="button" className="home-back-overview" onClick={() => setZone('all')}>‹ 返回全屋</button>}<span>{shortDate(new Date())}</span><p>{focus.state.timer.phase === 'focus' ? '留一点安静，做眼前的小事。' : playingTitle ? '唱片在转，时间慢一点。' : '灯亮着，慢慢来。'}</p></div>
    <div ref={host} className="home-viewport" onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }} onPointerDown={event => { suppressClick.current = false; if (!editing) swipe.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={event => {
      const start = swipe.current; swipe.current = null; if (editing || !start || overview) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) { suppressClick.current = true; const index = Math.max(0, ZONES.findIndex(z => z.id === zone)); setZone(ZONES[Math.min(2, Math.max(0, index + (dx < 0 ? 1 : -1)))].id); }
    }}>
      <div className="home-world" hidden={!overview} style={{ transform }}>
        <RoomCanvas layout={shown} selected={editing ? selected : ''} reduced={reduced} dim={dim || sky.state.bucket === 'night'} active={overview} onPetPosition={placePetHit}/>
        <div className="home-furniture-layer">{shown.items.map(item => { const b = bounds(item), spec = FURNITURE[item.type]; return <button key={item.id} type="button" data-furniture={item.type} data-live={['clock', 'timer', 'tasks', 'calendar', 'weather', 'lyrics', 'deck', 'notes'].includes(item.type)} className={`home-furniture facing-${item.facing} ${intro && ['deck', 'clock'].includes(item.type) ? 'is-guided' : ''}`} aria-label={`${spec.name}${editing ? ' · 移动或调整' : ''}`} style={{ left: b.x, top: b.y, width: Math.max(b.w, 48 / scale), height: Math.max(b.h, 48 / scale), zIndex: Math.round(item.u + item.v + (item.z ? 20 : 0)) }} onClick={() => activate(item)} onPointerDown={e => begin(e, item)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => {
          if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const step = event.shiftKey ? 40 : 10, patch = item.mount.startsWith('wall-') ? { [item.mount === 'wall-left' ? 'v' : 'u']: (item.mount === 'wall-left' ? item.v : item.u) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), z: item.z + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) } : { u: item.u + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), v: item.v + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) };
          mutate(() => placeFurniture(layout, item.id, patch));
        }}><FurnitureLive item={item} manifest={furnitureManifest}/><span className="home-furniture-label">{spec.name}</span></button>; })}</div>
        <button type="button" className="home-pet-hit" ref={petHit} style={{ left: 612, top: 558 }} aria-label={`${identity.name} · 照顾伙伴`} onClick={() => commands.open('pet')}/>
      </div>
      {!overview && <HomeCorner zone={zone} viewport={viewport} reduced={reduced} dim={dim} onLight={() => setDim(v => !v)}/>}
    </div>
    <SleepIndicator/>
    {intro && <aside className="home-intro" aria-label="小屋初次指引"><span>点唱机听歌，点钟开始专注。布置可以慢慢来。</span><button type="button" onClick={completeIntro}>知道了</button></aside>}
    {store.error && <p className="home-layout-error" role="alert">{store.error}</p>}
    <footer className="home-footer"><button type="button" className="home-now-playing" onClick={() => commands.open('music')} aria-label="打开播放器">{deck.deckItem?.cover && <img src={deck.deckItem.cover} alt=""/>}<span><strong>{playingTitle || '今天想听什么？'}</strong><small>{playingTitle ? deck.statusText : '从唱片库选一张喜欢的'}</small></span>{deck.audible ? <Pause size={16}/> : <Play size={16}/>}</button><nav className="home-zones" aria-label="房间区域"><button type="button" aria-pressed={zone === 'all'} onClick={() => setZone('all')}>{overview ? '全屋' : '返回全屋'}</button>{ZONES.map(z => <button type="button" key={z.id} aria-pressed={zone === z.id} onClick={() => setZone(z.id)}>{z.name}</button>)}</nav><button type="button" className="home-pet-return" aria-label="回到宠物" onClick={() => setZone('life')}><Heart size={16}/>{identity.name}</button></footer>
    <details className="home-accessible-furniture"><summary>家具与无障碍入口</summary><div>{layout.items.map(item => <button type="button" key={item.id} onClick={() => activate(item)}>{FURNITURE[item.type].name}</button>)}</div></details>
    {drawer && <Dialog title={drawer === 'themes' ? '选择小屋' : drawer === 'menu' ? '小屋日常' : '布置小屋'} close={() => setDrawer('')} className="home-tool home-editor" size="lg">
      {drawer === 'menu' ? <nav className="home-menu-grid" aria-label="小屋功能">{[['recipes','场景配方'],['sleep','睡前模式'],['postcard','小屋明信片'],['weather','位置与天气'],['diagnostics','功能诊断'],['backup','备份与恢复'],['settings','全部设置'],['interface','切回原版首页']].map(([id,name]) => <button type="button" key={id} onClick={() => { setDrawer(''); commands.open(id); }}>{name}</button>)}</nav> : drawer === 'themes' ? <div className="home-theme-grid">{THEMES.map(t => <button type="button" key={t.id} aria-pressed={look === t.id} onClick={() => { commands.theme(t.id); setDrawer(''); }}><img src={`/room-scenes/v21/${t.id}/shell.png`} alt=""/><span>{t.name}</span></button>)}</div> : <>
        <p>拖动家具，或聚焦后用方向键微调。桌面小物会跟着桌子移动。</p>
        <div className="home-editor-actions"><button type="button" disabled={!store.canUndo} onClick={store.undo}>撤销</button><button type="button" disabled={!store.canRedo} onClick={store.redo}>重做</button><button type="button" className="home-primary" onClick={() => { setDrawer(''); setEditing(false); setSelected(''); }}>完成布置</button><button type="button" onClick={() => setDrawer('')}>到屋内拖动</button></div>
        <fieldset><legend>完整布置预设</legend>{[['listen', '听歌'], ['work', '工作'], ['rest', '休息']].map(([id, label]) => <button type="button" key={id} onClick={() => commit(defaultLayout(look, id))}>{label}</button>)}</fieldset>
        {chosen && <section className="home-editor-selection"><h3>{FURNITURE[chosen.type].name}</h3><button type="button" onClick={() => mutate(() => placeFurniture(layout, chosen.id, { facing: chosen.facing === 'right' ? 'left' : 'right' }))}>换个朝向</button><button type="button" onClick={() => { mutate(() => removeFurniture(layout, chosen.id)); setSelected(''); }}>收起家具{FURNITURE[chosen.type].support ? '和桌面小物' : ''}</button></section>}
        <div className="home-inventory">{Object.entries(FURNITURE).filter(([id]) => id !== 'fireplace').map(([id, spec]) => { const present = layout.items.find(i => i.type === id); return <button type="button" key={id} aria-pressed={selected === present?.id} onClick={() => { if (present) setSelected(present.id); else mutate(() => addFurniture(layout, id)); }}><span>{spec.name}</span><small>{present ? '已摆放' : '＋添加'}</small></button>; })}</div>
        <div className="home-editor-actions"><button type="button" onClick={exportLayout}>另存布局</button><label className="home-file-button">导入布局<input type="file" accept="application/json,.json" onChange={importLayout}/></label><button type="button" onClick={() => commit(defaultLayout(look))}>恢复默认</button></div>
        {store.error && <p role="alert">{store.error}</p>}
      </>}
    </Dialog>}
  </section>;
}
