import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Dialog from '../Dialog';
import { ArrowLeft, Settings, Heart, X, Pencil, Check, Expand } from '../icons';
import { downloadBlob } from '../lib/download.mjs';
import { THEMES, FURNITURE, bounds, createLayoutHistory, defaultLayout, placement, validateLayout, addFurniture, removeFurniture } from './layout.mjs';
import { ART_THEMES, artTheme, roomArtSpec } from './room-art.mjs';
import './room2.css';
const RoomCanvas = lazy(() => import('./RoomCanvas'));
const key = theme => `flow-cabin-room-layout-art-v2:${theme}`;
function FurnitureThumb({ spec, type }) {
  const extras = FURNITURE[type].atlas === 'extras', frames = extras ? spec?.extras?.frames : spec?.frames;
  const frame = frames?.[type], size = extras ? spec?.extras?.size : spec?.furnitureSize;
  if (!frame || !size) return null;
  return <svg className="room2-furniture-thumb" viewBox={frame.join(' ')} aria-hidden="true"><image href={extras ? spec.extras.url : spec.furniture} width={size[0]} height={size[1]}/></svg>;
}
const load = theme => { try { const saved = localStorage.getItem(key(theme)); return saved ? validateLayout(JSON.parse(saved)) : defaultLayout(theme); } catch { return defaultLayout(theme); } };
export default function ModularRoom({ close, look, petId, playing, focus, onAction, reduceMotion = false }) {
  const [layout, setLayout] = useState(() => load(artTheme(look))), [editing, setEditing] = useState(false), [selected, select] = useState(''), [message, setMessage] = useState('');
  const [zone, setZone] = useState(() => innerWidth < 700 ? 1 : -1), [zoom, setZoom] = useState(1), [width, setWidth] = useState(900), [dim, setDim] = useState(false), [viewportHeight, setViewportHeight] = useState(innerHeight), [draft, setDraft] = useState(null);
  const [inventoryArt, setInventoryArt] = useState(null);
  useEffect(() => { let disposed = false; setInventoryArt(null); fetch(`/room-scenes/modular/${artTheme(layout.theme)}/asset-manifest.json`).then(response => { if (!response.ok) throw Error('素材不可用'); return response.json(); }).then(value => { if (!disposed) setInventoryArt(roomArtSpec(artTheme(layout.theme), value)); }).catch(() => {}); return () => { disposed = true; }; }, [layout.theme]);
  const [petReturnRequest, requestPetReturn] = useState(0), [panel, setPanel] = useState(false), [showChrome, setShowChrome] = useState(true);
  const chromeTimer = useRef(null);
  const wakeChrome = () => { setShowChrome(true); clearTimeout(chromeTimer.current); chromeTimer.current = setTimeout(() => setShowChrome(false), 3200); };
  useEffect(() => { wakeChrome(); return () => clearTimeout(chromeTimer.current); }, []);
  const host = useRef(null), history = useRef(null), drag = useRef(null), hold = useRef(null), holdOrigin = useRef(null), osReduced = useReducedMotion();
  const compactViewport = useRef(innerWidth < 700);
  const reduced = reduceMotion || osReduced;
  history.current ||= createLayoutHistory(layout);
  const viewWidth = zone < 0 ? 1200 : 400, scale = Math.min(width / viewWidth, zone < 0 ? Math.max(240, viewportHeight - 16) / 640 : Infinity) * zoom, offset = zone < 0 ? 0 : zone * 400;
  const visibleLayout = draft || layout;
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 6000); return () => clearTimeout(timer); }, [message]);
  const chosen = layout.items.find(i => i.id === selected);
  const petHome = layout.items.find(i => i.type === 'bed') || { x: 880, y: 536 };
  const returnToPet = () => { requestPetReturn(value => value + 1); setZone(Math.max(0, Math.min(2, Math.floor((petHome.x + 72) / 400)))); setZoom(1); };
  useEffect(() => {
    if (!petReturnRequest || !host.current) return;
    host.current.scrollLeft = 0;
    host.current.scrollTop = Math.max(0, (petHome.y + 22) * scale - host.current.clientHeight / 2);
  }, [petReturnRequest]);
  useEffect(() => { const resize = () => {
    setViewportHeight(innerHeight);
    const compact = innerWidth < 700;
    if (compact !== compactViewport.current) { compactViewport.current = compact; setZone(compact ? 1 : -1); setZoom(1); }
  }; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(host.current); window.addEventListener('resize', resize); return () => { observer.disconnect(); window.removeEventListener('resize', resize); clearTimeout(hold.current); }; }, []);
  const persist = next => {
    try { localStorage.setItem(key(next.theme), JSON.stringify(next)); setMessage('布局已保存'); return true; }
    catch { setMessage('布局尚未保存；请导出后再关闭。'); return false; }
  };
  const commit = next => { try { const value = history.current.apply(next); setLayout(value); persist(value); } catch (error) { setMessage(error.message); } };
  const move = (x, y, rotation = chosen?.rotation) => { try { commit(placement(layout, selected, Number(x), Number(y), rotation)); } catch (error) { setMessage(error.message); } };
  const action = item => {
    if (editing) { select(item.id); return; }
    const type = FURNITURE[item.type];
    if (type.action === 'lamp') { setDim(v => !v); return; }
    if (type.action === 'weather') { const w = window.cabinWeather; setMessage(w && Number.isFinite(w.temperature) ? `真实天气：${w.temperature}°C，体感 ${w.feelsLike ?? '—'}°C，湿度 ${w.humidity ?? '—'}% · ${new Date(w.fetchedAt).toLocaleString()}` : '尚无真实天气读数，请在设置中启用天气；窗景动画不代表实测。'); return; }
    if (type.action === 'tea') { setMessage('泡好一杯茶，起来走走、喝点水吧。'); return; }
    if (type.action === 'plant') { setMessage('绿植陪你慢慢长大。今天也记得休息。'); return; }
    onAction(type.action);
  };
  const changeTheme = theme => { const value = load(theme); history.current = createLayoutHistory(value); setLayout(value); setDraft(null); select(''); setMessage(''); };
  const exportLayout = () => downloadBlob(new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }), `${layout.theme}-小屋布局.json`);
  const importLayout = async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 128 * 1024) throw Error('布局文件不能超过 128 KiB。'); commit(validateLayout(JSON.parse(await file.text()))); } catch (error) { setMessage(error.message); } event.target.value = ''; };
  const pointerDown = (event, item) => {
    if (!editing) { holdOrigin.current = { x: event.clientX, y: event.clientY }; hold.current = setTimeout(() => { setEditing(true); select(item.id); hold.current = null; }, 550); return; }
    select(item.id); drag.current = { id: item.id, x: event.clientX, y: event.clientY, item }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = event => {
    if (hold.current && holdOrigin.current && Math.hypot(event.clientX - holdOrigin.current.x, event.clientY - holdOrigin.current.y) > 8) { clearTimeout(hold.current); hold.current = null; }
    const value = drag.current; if (!value) return;
    try { setDraft(placement(layout, value.id, value.item.x + (event.clientX - value.x) / scale, value.item.y + (event.clientY - value.y) / scale, value.item.rotation)); }
    catch (error) { setMessage(error.message); }
  };
  const pointerUp = event => {
    clearTimeout(hold.current); hold.current = null;
    const value = drag.current; drag.current = null; setDraft(null);
    if (!value) return;
    try { commit(placement(layout, value.id, value.item.x + (event.clientX - value.x) / scale, value.item.y + (event.clientY - value.y) / scale, value.item.rotation)); window.navigator.vibrate?.(12); }
    catch (error) { setMessage(error.message); }
  };
  return <Dialog title="生活小屋" close={close} variant="full" className="room2-dialog">
    <motion.div className={`room2-experience ${showChrome || panel || editing ? 'chrome-awake' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .45 }} onPointerMove={wakeChrome} onPointerDown={wakeChrome} onFocusCapture={wakeChrome}>
      <h2 className="room2-sr-only" tabIndex={-1} data-autofocus>生活小屋</h2>
      <div className="room2-hud room2-identity"><span className="room2-presence" aria-hidden="true"/>{THEMES.find(theme => theme.id === layout.theme)?.name}</div>
      <nav className="room2-hud room2-quick" aria-label="小屋快捷入口">
        <button type="button" onClick={close} aria-label="关闭生活小屋" title="返回唱片架"><ArrowLeft size={16}/></button>
        <button type="button" onClick={returnToPet} aria-label="回到宠物" title="回到宠物"><Heart size={16}/></button>
        <button type="button" onClick={() => setPanel(true)} aria-label="小屋布置与视角" title="小屋布置与视角"><Settings size={16}/></button>
      </nav>
      {editing && <div className="room2-edit-hint"><Pencil size={12}/><span>轻轻拖动家具，找个喜欢的位置</span><button type="button" onClick={() => setEditing(false)}><Check size={12}/>完成</button></div>}
      <p className={`room2-notice ${message ? 'is-visible' : ''}`} role="status">{message}</p>
      <div ref={host} className="room2-viewport" style={{ height: viewportHeight }}>
        <div className="room2-world" style={{ width: 1200 * scale, height: 640 * scale, top: Math.max(0, (viewportHeight - 640 * scale) / 2), marginLeft: zone < 0 ? Math.max(0, (width - 1200 * scale) / 2) : -offset * scale }}>
          <div className="room2-scaled" style={{ transform: `scale(${scale})` }}>
            <Suspense fallback={<div className="room2-fallback">正在点亮小屋…</div>}><RoomCanvas layout={visibleLayout} petId={petId} selected={editing ? selected : ''} playing={playing} focus={focus} dim={dim} reduced={!!reduced}/></Suspense>
            {visibleLayout.items.map(item => { const b = bounds(item); return <button type="button" key={item.id} className="room2-object" style={{ left: b.x, top: b.y, width: Math.max(b.w, 48 / scale), height: Math.max(b.h, 48 / scale), touchAction: editing ? 'none' : 'pan-x pan-y' }} aria-label={FURNITURE[item.type].name} title={FURNITURE[item.type].name} onClick={() => action(item)} onPointerDown={event => pointerDown(event, item)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { clearTimeout(hold.current); drag.current = null; setDraft(null); }} onKeyDown={event => {
              if (!editing) return; const steps = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
              if (steps) { event.preventDefault(); try { commit(placement(layout, item.id, item.x + steps[0], item.y + steps[1], item.rotation)); } catch (error) { setMessage(error.message); } }
            }}><span>{FURNITURE[item.type].name}</span></button>; })}
          </div>
        </div>
      </div>
      {zone >= 0 && <nav className="room2-zone-nav" aria-label="小屋区域">{[0, 1, 2].map((value, i) => <button type="button" key={value} aria-pressed={zone === value} onClick={() => { setZone(value); setZoom(1); host.current?.scrollTo({ top: 0, left: 0 }); }}><span className="room2-sr-only">{['听歌角', '工作角', '生活角'][i]}</span></button>)}</nav>}
      {panel && <Dialog title="小屋布置" close={() => setPanel(false)} className="room2-drawer" size="sm">
        <p className="room2-panel-intro">给今天，换一点风景。</p>
        <label className="room2-field">房间<select aria-label="房间主题" value={artTheme(layout.theme)} onChange={e => changeTheme(e.target.value)}>{THEMES.filter(theme => ART_THEMES.includes(theme.id)).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
        <div className="room2-theme-gallery">{THEMES.filter(theme => ART_THEMES.includes(theme.id)).map(theme => <button type="button" key={theme.id} aria-label={`布置为${theme.name}`} aria-pressed={layout.theme === theme.id} onClick={() => changeTheme(theme.id)}><img src={`/room-scenes/modular/${theme.id}/shell.png`} alt="" loading="lazy"/><span>{theme.name}</span></button>)}</div>
        <div className="room2-panel-actions"><button type="button" onClick={() => { setEditing(value => !value); setPanel(false); }}>{editing ? '完成布置' : '布置家具'}</button><button type="button" onClick={() => { setZone(-1); setZoom(1); setPanel(false); }}>看完整小屋</button></div>
        <div className="room2-panel-actions">{[0, 1, 2].map((value, i) => <button type="button" key={value} onClick={() => { setZone(value); setZoom(1); setPanel(false); }}>{['听歌角', '工作角', '生活角'][i]}</button>)}</div>
        <label className="room2-field">视角远近<input aria-label="缩放" type="range" min="1" max="2" step=".1" value={zoom} onChange={e => setZoom(Number(e.target.value))}/></label>
              {editing && <div className="room2-tools">
        <button type="button" disabled={!history.current.canUndo} onClick={() => { const next = history.current.undo(); setLayout(next); persist(next); }}>撤销</button>
        <button type="button" disabled={!history.current.canRedo} onClick={() => { const next = history.current.redo(); setLayout(next); persist(next); }}>重做</button>
        {['work', 'listen', 'rest'].map((preset, i) => <button type="button" key={preset} onClick={() => commit(defaultLayout(layout.theme, preset))}>{['工作预设', '听歌预设', '休息预设'][i]}</button>)}
        {chosen && <button type="button" onClick={() => { commit(removeFurniture(layout, chosen.id)); select(''); }}>收起所选家具</button>}
        <button type="button" onClick={exportLayout}>导出布局</button><label>导入布局<input type="file" accept="application/json,.json" onChange={importLayout}/></label>
        {chosen && <><label>横坐标<input type="number" step="8" value={chosen.x} onChange={e => move(e.target.value, chosen.y)}/></label><label>纵坐标<input type="number" step="8" value={chosen.y} onChange={e => move(chosen.x, e.target.value)}/></label><button type="button" onClick={() => move(chosen.x, chosen.y, chosen.rotation === 90 ? 0 : 90)}>旋转所选家具</button></>}
      </div>}

      {<section className="room2-inventory" aria-label="家具库存"><h3>家具库存</h3><p>桌面小物可以逐件摆放，收起后随时放回。</p><div className="room2-inventory-grid">{Object.entries(FURNITURE).filter(([type, item]) => item.atlas !== 'extras' || inventoryArt?.extras?.frames?.[type]).map(([type, item]) => { const placed = layout.items.some(value => value.type === type); return <button type="button" key={type} aria-label={`添加${item.name}`} disabled={placed} onClick={() => { try { const next = addFurniture(layout, type); setEditing(true); commit(next); select(next.items.at(-1).id); } catch (error) { setMessage(error.message); } }}><FurnitureThumb spec={inventoryArt} type={type}/><span>{item.name}</span><small>{placed ? '已摆放' : '放入小屋'}</small></button>; })}</div></section>}
      <details className="room2-list"><summary>家具列表与无障碍入口</summary><div className="room2-tools">{layout.items.map(item => <button type="button" key={item.id} aria-pressed={editing ? selected === item.id : undefined} onClick={() => action(item)}>{FURNITURE[item.type].name}</button>)}</div></details>
      </Dialog>}
    </motion.div>
  </Dialog>;
}
