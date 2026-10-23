import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Dialog from '../Dialog';
import { downloadBlob } from '../lib/download.mjs';
import { THEMES, FURNITURE, bounds, createLayoutHistory, defaultLayout, placement, validateLayout } from './layout.mjs';
import { ART_THEMES, artTheme } from './room-art.mjs';
import './room2.css';
const RoomCanvas = lazy(() => import('./RoomCanvas'));
const key = theme => `flow-cabin-room-layout-art-v2:${theme}`;
const load = theme => { try { const saved = localStorage.getItem(key(theme)); return saved ? validateLayout(JSON.parse(saved)) : defaultLayout(theme); } catch { return defaultLayout(theme); } };
export default function ModularRoom({ close, look, petId, playing, focus, onAction, reduceMotion = false }) {
  const [layout, setLayout] = useState(() => load(artTheme(look))), [editing, setEditing] = useState(false), [selected, select] = useState(''), [message, setMessage] = useState('');
  const [zone, setZone] = useState(() => innerWidth < 700 ? 1 : -1), [zoom, setZoom] = useState(1), [width, setWidth] = useState(900), [dim, setDim] = useState(false), [viewportHeight, setViewportHeight] = useState(innerHeight), [draft, setDraft] = useState(null);
  const [petReturnRequest, requestPetReturn] = useState(0);
  const host = useRef(null), history = useRef(null), drag = useRef(null), hold = useRef(null), holdOrigin = useRef(null), osReduced = useReducedMotion();
  const reduced = reduceMotion || osReduced;
  history.current ||= createLayoutHistory(layout);
  const viewWidth = zone < 0 ? 1200 : 400, scale = Math.min(width / viewWidth, zone < 0 ? Math.max(240, viewportHeight - 280) / 640 : Infinity) * zoom, offset = zone < 0 ? 0 : zone * 400;
  const visibleLayout = draft || layout;
  const chosen = layout.items.find(i => i.id === selected);
  const petHome = layout.items.find(i => i.type === 'bed') || { x: 880, y: 536 };
  const returnToPet = () => { requestPetReturn(value => value + 1); setZone(Math.max(0, Math.min(2, Math.floor((petHome.x + 72) / 400)))); setZoom(1); };
  useEffect(() => {
    if (!petReturnRequest || !host.current) return;
    host.current.scrollLeft = 0;
    host.current.scrollTop = Math.max(0, (petHome.y + 22) * scale - host.current.clientHeight / 2);
  }, [petReturnRequest]);
  useEffect(() => { const resize = () => setViewportHeight(innerHeight); const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(host.current); window.addEventListener('resize', resize); return () => { observer.disconnect(); window.removeEventListener('resize', resize); clearTimeout(hold.current); }; }, []);
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
    if (type.action === 'weather') { const w = window.cabinWeather; setMessage(w && Number.isFinite(w.temperature) ? `真实天气：${w.temperature}°C，体感 ${w.feelsLike ?? '—'}°C · ${new Date(w.fetchedAt).toLocaleString()}` : '尚无真实天气读数，请在设置中启用天气；窗景动画不代表实测。'); return; }
    if (type.action === 'tea') { setMessage('泡好一杯茶，起来走走、喝点水吧。'); return; }
    if (type.action === 'plant') { setMessage('植物记录你的累计专注；休息和缺席不会让它枯萎。'); return; }
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
    <header className="room2-header"><div><span className="room2-eyebrow">FLOW CABIN · LIVING ROOM</span><h2 tabIndex={-1} data-autofocus>灯亮着，慢慢来。</h2></div><button type="button" onClick={close} aria-label="关闭生活小屋">返回唱片架</button></header>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .4 }}>
      <div className="room2-tools">
        <label className="room2-theme-name">房间<select aria-label="房间主题" value={artTheme(layout.theme)} onChange={e => changeTheme(e.target.value)}>{THEMES.filter(theme => ART_THEMES.includes(theme.id)).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
        <button type="button" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? '完成布置' : '布置家具'}</button>
        {[-1, 0, 1, 2].map((value, i) => <button type="button" key={value} aria-pressed={zone === value} onClick={() => { setZone(value); setZoom(1); }}>{['全屋', '听歌角', '工作角', '生活角'][i]}</button>)}
        <button type="button" onClick={returnToPet}>回到宠物</button>
        <label>缩放<input type="range" min="1" max="2" step=".1" value={zoom} onChange={e => setZoom(Number(e.target.value))}/></label>
      </div>
      {editing && <div className="room2-tools">
        <button type="button" disabled={!history.current.canUndo} onClick={() => { const next = history.current.undo(); setLayout(next); persist(next); }}>撤销</button>
        <button type="button" disabled={!history.current.canRedo} onClick={() => { const next = history.current.redo(); setLayout(next); persist(next); }}>重做</button>
        {['work', 'listen', 'rest'].map((preset, i) => <button type="button" key={preset} onClick={() => commit(defaultLayout(layout.theme, preset))}>{['工作预设', '听歌预设', '休息预设'][i]}</button>)}
        <button type="button" onClick={exportLayout}>导出布局</button><label>导入布局<input type="file" accept="application/json,.json" onChange={importLayout}/></label>
        {chosen && <><label>横坐标<input type="number" step="8" value={chosen.x} onChange={e => move(e.target.value, chosen.y)}/></label><label>纵坐标<input type="number" step="8" value={chosen.y} onChange={e => move(chosen.x, e.target.value)}/></label><button type="button" onClick={() => move(chosen.x, chosen.y, chosen.rotation === 90 ? 0 : 90)}>旋转所选家具</button></>}
      </div>}
      <p role="status">{message || (editing ? '拖动家具，或在列表中选择后用坐标和方向键调整；墙面、桌面和地面分别吸附。' : '点家具打开功能；手机长按家具可进入布置。')}</p>
      <div ref={host} className="room2-viewport" style={{ height: Math.min(640 * scale, Math.max(280, viewportHeight - 280)) }}>
        <div className="room2-world" style={{ width: 1200 * scale, height: 640 * scale, marginLeft: zone < 0 ? Math.max(0, (width - 1200 * scale) / 2) : -offset * scale }}>
          <div className="room2-scaled" style={{ transform: `scale(${scale})` }}>
            <Suspense fallback={<div className="room2-fallback">正在点亮小屋…</div>}><RoomCanvas layout={visibleLayout} petId={petId} selected={editing ? selected : ''} playing={playing} focus={focus} dim={dim} reduced={!!reduced}/></Suspense>
            {visibleLayout.items.map(item => { const b = bounds(item); return <button type="button" key={item.id} className="room2-object" style={{ left: b.x, top: b.y, width: Math.max(b.w, 48 / scale), height: Math.max(b.h, 48 / scale), touchAction: editing ? 'none' : 'pan-x pan-y' }} aria-label={FURNITURE[item.type].name} title={FURNITURE[item.type].name} onClick={() => action(item)} onPointerDown={event => pointerDown(event, item)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { clearTimeout(hold.current); drag.current = null; setDraft(null); }} onKeyDown={event => {
              if (!editing) return; const steps = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
              if (steps) { event.preventDefault(); try { commit(placement(layout, item.id, item.x + steps[0], item.y + steps[1], item.rotation)); } catch (error) { setMessage(error.message); } }
            }}><span>{FURNITURE[item.type].name}</span></button>; })}
          </div>
        </div>
      </div>
      <details className="room2-list"><summary>家具列表与无障碍入口</summary><div className="room2-tools">{layout.items.map(item => <button type="button" key={item.id} aria-pressed={editing ? selected === item.id : undefined} onClick={() => action(item)}>{FURNITURE[item.type].name}</button>)}</div></details>
    </motion.div>
  </Dialog>;
}
