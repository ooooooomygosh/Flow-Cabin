import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { DesktopControls } from '../desktop-client';
import PixelCat from '../pet/PixelCat';
import Dialog from '../Dialog';
import { Down as ChevronDown, ChevronLeft, ChevronRight, Play, Pause, BookOpen, Clock, Library, Grid3X3, Settings, Heart } from '../icons';
import { FURNITURE, THEMES, bounds, unproject, defaultLayout, readLayout, saveLayout, createHistory, placeFurniture, addFurniture, removeFurniture, migrateLayout, LAYOUT_CHANGED, LAYOUT_PREFIX } from './spatial-layout.mjs';
import { downloadBlob } from '../lib/download.mjs';
import RoomCanvas, { prefetchRoomArt } from './RoomCanvas';
import { readLights, setRoomLight } from './recipes.mjs';
import { SleepIndicator } from './SceneTools';
import HomeCorner, { CornerActions } from './HomeCorner';
import { ClockReadout, CalendarReadout, LyricsReadout } from './HomeReadouts';
import { FURNITURE_EXTRAS, FurnitureExtra } from './FurnitureExtras';
import useBackLayer from '../ui/useBackLayer';
import { shouldShowHomeNotice, dismissHomeNotice } from '../interface-mode.mjs';
import { ZONE_ORDER, ZONE_NAMES, zoneSpots, TIMING, ZOOM, PUSH, PHONE_WIDTH, TAP_SLOP, isZone, zoneIndex, neighbour, dragOffset, velocity, snapIndex, settleDuration, wheelDistance, dotLevels, keyTarget, readZone, saveZone, zoneAfterResize, worldCamera, cameraTransform } from './corner-nav.mjs';
import { cornerReady, preloadCorners, whenIdle } from './corner-assets.mjs';
import './home.css';
import NowPlayingBar from '../listen/NowPlayingBar';

const shortDate = date => date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
const typingTarget = target => target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role=slider],[role=tablist],[role=radiogroup],[role=listbox],[role=menu],.room-turntable');
const GUTTER = 20; // px between close views on the strip (matches --gutter)
const pause = ms => new Promise(done => setTimeout(done, ms));
// A full-window dialog (唱机特写, 专辑墙, 专注画面…) hides the room completely: its renderer can rest.
function useFullWindowCover() {
  const [covered, setCovered] = useState(false);
  useEffect(() => { const check = () => setCovered(Boolean(document.querySelector('dialog.is-full[open]'))); check(); const observer = new MutationObserver(check); observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] }); return () => observer.disconnect(); }, []);
  return covered;
}
function FurnitureContents({ item }) {
  const { deck, focus, sky } = useCabinRuntime();
  if (FURNITURE_EXTRAS[item.type]) return <FurnitureExtra item={item}/>;
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
  const [furnitureManifest, setFurnitureManifest] = useState(null), [artTheme, setArtTheme] = useState(''), [artAttempt, setArtAttempt] = useState(0);
  useEffect(() => { let alive = true; setFurnitureManifest(null); fetch(`/room-scenes/v21/furniture/${look}/manifest.json`).then(r => r.json()).then(v => alive && setFurnitureManifest(v)).catch(() => {}); return () => { alive = false; }; }, [look, artAttempt]);
  const [editing, setEditing] = useState(false), [drawer, setDrawer] = useState(''), [selected, setSelected] = useState('');
  const firstZone = useRef(null); if (firstZone.current === null) firstZone.current = readZone(globalThis.localStorage, innerWidth);
  // zone: where the person is (buttons, Esc, memory). corner: the close view on the strip (kept while leaving).
  // phase: overview → zoom (dolly in while the art decodes) → reveal (cross-fade) → corner → unreveal (fade out) → zoomout → overview.
  const [zone, setZoneState] = useState(firstZone.current), [corner, setCornerState] = useState(firstZone.current === 'all' ? 'music' : firstZone.current);
  const [phase, setPhaseState] = useState(firstZone.current === 'all' ? 'overview' : 'corner');
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight - 140 }), [stage, setStage] = useState({ width: innerWidth, height: innerHeight });
  const covered = useFullWindowCover(), [preloaded, setPreloaded] = useState('');
  const [dim, updateDim] = useState(() => readLights()[look] === true);
  const setDim = value => { const next = typeof value === 'function' ? value(dim) : value; try { setRoomLight(look,next); updateDim(next); } catch { notify('灯光设置未能保存。'); } };
  useEffect(() => { const update = () => updateDim(readLights()[look] === true); update(); window.addEventListener('cabin:lights',update); window.addEventListener('storage',update); return () => { window.removeEventListener('cabin:lights',update); window.removeEventListener('storage',update); }; }, [look]);
  const petHit = useRef(null);
  const placePetHit = useCallback(point => { if (petHit.current) { petHit.current.style.left = `${point.x - 38}px`; petHit.current.style.top = `${point.y - 82}px`; } }, []);
  const [intro, setIntro] = useState(() => localStorage.getItem('flow-cabin-home-intro-v1') !== 'done');
  const [homeNotice, setHomeNotice] = useState(() => shouldShowHomeNotice());
  const closeHomeNotice = () => { dismissHomeNotice(); setHomeNotice(false); };
  const host = useRef(null), stageHost = useRef(null), track = useRef(null), dots = useRef([]), drag = useRef(null), swipe = useRef(null), held = useRef(0), suppressClick = useRef(false), compact = useRef(innerWidth < PHONE_WIDTH);
  const zoneRef = useRef(zone), cornerRef = useRef(corner), phaseRef = useRef(phase), lookRef = useRef(look), reducedRef = useRef(reduced), editingRef = useRef(false), settle = useRef(0), timers = useRef([]), token = useRef(0), goRef = useRef(null);
  lookRef.current = look; reducedRef.current = reduced;
  const setPhase = next => { phaseRef.current = next; setPhaseState(next); };
  const after = (ms, fn) => { const t = token.current; timers.current.push(setTimeout(() => { if (t === token.current) fn(); }, ms)); };
  const painted = fn => { const t = token.current; requestAnimationFrame(() => requestAnimationFrame(() => { if (t === token.current) fn(); })); };
  const restart = () => { token.current++; timers.current.forEach(clearTimeout); timers.current = []; };
  // Every way of moving (buttons, the floor, keys, swipes, the trackpad, Esc, resizing) goes through here.
  const go = (next, { instant = false } = {}) => {
    if (!isZone(next)) return;
    const from = phaseRef.current, still = reducedRef.current;
    zoneRef.current = next; setZoneState(next);
    if (next === 'all') {
      if (from === 'overview') return;
      restart(); if (instant) { setPhase('overview'); return; }
      setPhase('unreveal');
      if (still) after(TIMING.reduced + 20, () => setPhase('overview'));
      else after(TIMING.fadeOut * .6, () => { setPhase('zoomout'); after(TIMING.zoomOut + 20, () => setPhase('overview')); });
      return;
    }
    cornerRef.current = next; setCornerState(next);
    if (from === 'corner' || from === 'reveal') return; // the strip slides there
    restart(); if (instant) { setPhase('corner'); return; }
    setPhase('zoom');
    const t = token.current, started = performance.now(), zoom = still ? 0 : TIMING.zoom;
    // Dolly in while the close view decodes; cross-fade only onto a picture that is ready (or once the budget is spent).
    Promise.race([cornerReady(lookRef.current, next).catch(() => {}), pause(TIMING.decodeBudget)]).then(() => {
      if (t !== token.current) return;
      const reveal = () => { setPhase('reveal'); after((still ? TIMING.reduced : TIMING.reveal + 60) + 20, () => setPhase('corner')); };
      const wait = zoom - (performance.now() - started);
      if (wait > 16) after(wait, reveal); else painted(reveal);
    });
  };
  goRef.current = go;
  const setZone = next => go(next);
  const [preview, setPreview] = useState(null); const shown = preview || layout;
  const chosen = layout.items.find(i => i.id === selected), theme = THEMES.find(t => t.id === look) || THEMES[0];
  useEffect(() => { if (editRequest) { setZone('all'); setEditing(true); setDrawer('decorate'); } }, [editRequest]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; setViewport({ width, height }); const phone = width < PHONE_WIDTH; if (compact.current !== phone) { compact.current = phone; const next = zoneAfterResize(zoneRef.current, phone); if (next !== zoneRef.current) goRef.current(next, { instant: true }); } }); observer.observe(host.current);
    const full = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; setStage({ width, height }); }); full.observe(stageHost.current);
    return () => { observer.disconnect(); full.disconnect(); clearTimeout(held.current); restart(); };
  }, []);
  // Remember the place per device (not the default picked on a first launch).
  const remembered = useRef(zone); useEffect(() => { if (remembered.current !== zone) { remembered.current = zone; saveZone(globalThis.localStorage, zone); } }, [zone]);
  // Warm the close views when idle, the current one first, so walking in never shows a loading frame.
  useEffect(() => { let alive = true; const cancel = whenIdle(() => { const first = cornerRef.current; preloadCorners(look, [first, ...ZONE_ORDER.filter(z => z !== first)], () => alive).then(done => done && setPreloaded(look), () => {}); }); return () => { alive = false; cancel(); }; }, [look]);
  const overview = zone === 'all', stripShown = phase !== 'overview', cornerShown = phase === 'reveal' || phase === 'corner', settled = phase === 'corner';
  const artReady = artTheme === shown.theme;
  const finishEditing = () => { setEditing(false); setDrawer(''); setSelected(''); };
  editingRef.current = editing;
  useBackLayer(!overview && !editing, () => setZone('all'), 'corner');
  useBackLayer(editing, finishEditing, 'decorate');
  const scale = Math.min(viewport.width / 1200, viewport.height / 800);
  // The overview camera: fitted to the frame, or dollied toward the corner being entered or left.
  const zoomed = !reduced && ['zoom', 'reveal', 'corner', 'unreveal'].includes(phase);
  const spots = useMemo(() => zoneSpots(shown.items.map(item => ({ type: item.type, ...bounds(item) }))), [shown]);
  const camera = worldCamera(viewport.width, viewport.height, zoomed ? spots[corner] : null, phase === 'zoom' ? ZOOM : ZOOM * PUSH);
  const worldMotion = reduced ? undefined : { zoom: `transform ${TIMING.zoom}ms cubic-bezier(.55,0,.3,1)`, reveal: `transform ${TIMING.reveal + 60}ms cubic-bezier(.2,.7,.2,1)`, corner: 'none', unreveal: 'none', zoomout: `transform ${TIMING.zoomOut}ms cubic-bezier(.25,.75,.25,1)` }[phase];
  const worldStyle = { transform: cameraTransform(camera), transition: worldMotion, visibility: settled ? 'hidden' : undefined };
  // The strip is moved by hand (no re-render per pointer move); the page dots follow its fractional page.
  const paintDots = progress => dotLevels(progress).forEach((level, i) => dots.current[i]?.style.setProperty('--lit', level.toFixed(3)));
  const place = (offset = 0, duration = 0) => {
    const el = track.current, index = zoneIndex(cornerRef.current), width = el?.clientWidth || 1;
    if (zoneRef.current !== 'all') paintDots(index - offset / width);
    if (!el) return; if (reducedRef.current) { el.style.transform = el.style.transition = ''; return; }
    el.style.transition = duration ? `transform ${duration}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    el.style.transform = `translate3d(calc(${-index} * (100% + var(--gutter)) + ${offset}px), 0, 0)`;
  };
  const placedCorner = useRef('');
  useLayoutEffect(() => {
    if (!track.current) { placedCorner.current = ''; return; }
    const moved = placedCorner.current && placedCorner.current !== corner; placedCorner.current = corner;
    place(0, moved ? settle.current || 420 : 0); settle.current = 0;
    if (document.activeElement?.closest?.('.home-corner[inert]')) track.current.focus({ preventScroll: true });
  }, [corner, stripShown, reduced]);
  useLayoutEffect(() => { paintDots(zone === 'all' ? -9 : zoneIndex(zone)); }, [zone]);
  const bump = direction => { if (reducedRef.current || !track.current) return; place(-direction * 34, 140); after(150, () => place(0, 320)); };
  // ← → 1 2 3 0 (Esc belongs to the back stack). Capture phase: inside a corner the arrows walk instead of seeking.
  useEffect(() => {
    const key = event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key === 'Escape') return;
      if (editingRef.current || document.querySelector('dialog[open]') || typingTarget(event.target)) return;
      const action = keyTarget(event.key, zoneRef.current); if (!action) return;
      event.preventDefault(); if (event.repeat) return;
      if (action.edge) bump(action.edge); else goRef.current(action.to);
    };
    document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true);
  }, []);
  // Horizontal trackpad scrolling: the strip follows, turns one page per gesture, then waits for the gesture to end.
  useEffect(() => {
    const el = stageHost.current; let travel = 0, idle = 0, locked = false;
    const wheel = event => {
      if (phaseRef.current !== 'corner' || editingRef.current || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.target.closest?.('dialog')) return;
      event.preventDefault(); clearTimeout(idle);
      idle = setTimeout(() => { if (!locked && travel) place(0, 300); travel = 0; locked = false; }, locked ? 220 : 140);
      if (locked) return;
      travel -= event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const width = el.clientWidth + GUTTER, current = cornerRef.current, next = Math.abs(travel) >= wheelDistance(width) && neighbour(current, travel < 0 ? 1 : -1);
      if (next) { locked = true; settle.current = 340; travel = 0; goRef.current(next); return; }
      place(dragOffset(travel, zoneIndex(current), width), 0);
    };
    el.addEventListener('wheel', wheel, { passive: false }); return () => { el.removeEventListener('wheel', wheel); clearTimeout(idle); };
  }, []);
  // Finger or mouse drag between corners: follows 1:1, rubber-bands at the ends, settles by distance and speed.
  const swipeStart = event => {
    suppressClick.current = false; swipe.current = null;
    if (editing || !['corner', 'reveal'].includes(phaseRef.current) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest?.('.corner-actions,.home-corner-edge')) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, samples: [{ x: event.clientX, t: event.timeStamp }], engaged: false, width: (stageHost.current?.clientWidth || stage.width) + GUTTER };
  };
  const swipeMove = event => {
    const g = swipe.current; if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    g.samples.push({ x: event.clientX, t: event.timeStamp }); if (g.samples.length > 12) g.samples.shift();
    if (!g.engaged) {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) { swipe.current = null; return; }
      g.engaged = true; suppressClick.current = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }
    place(dragOffset(dx, zoneIndex(cornerRef.current), g.width), 0);
  };
  const swipeEnd = event => {
    const g = swipe.current; swipe.current = null; if (!g || g.id !== event.pointerId) return;
    if (event.type === 'pointercancel') { if (g.engaged) place(0, 300); return; }
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.engaged && !(Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy) * 1.3)) return;
    suppressClick.current = true; g.samples.push({ x: event.clientX, t: event.timeStamp });
    const index = zoneIndex(cornerRef.current), speed = velocity(g.samples), target = snapIndex({ index, dx, velocity: speed, width: g.width });
    const offset = reducedRef.current || !g.engaged ? 0 : dragOffset(dx, index, g.width);
    settle.current = settleDuration(offset + (target - index) * g.width, speed);
    if (target === index) place(0, settle.current || 300); else go(ZONE_ORDER[target]);
  };
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
  const prev = neighbour(corner, -1), next = neighbour(corner, 1);
  return <section className={`cabin-home theme-${look} ${editing ? 'is-editing' : ''} ${!overview ? 'is-corner' : ''} ${cornerShown ? 'has-corner-view' : ''} ${reduced ? 'is-reduced' : ''}`} aria-label="生活小屋首页" data-zone={zone} data-phase={phase} data-corners-ready={preloaded || undefined}>
    <header className="home-header">
      <button type="button" className="home-pet-portrait" aria-expanded={petOpen} aria-label={`伙伴与装扮 · ${identity.name}`} onClick={() => commands.open('pet')}><PixelCat petId={identity.builtinId} accessory={identity.accessory} reduceMotion={reduced} label={identity.name}/></button>
      <button type="button" className="home-room-name" aria-label="选择房间主题" onClick={() => setDrawer('themes')}><small>FLOW CABIN</small><span>{theme.name}<ChevronDown size={14}/></span></button>
      <nav className="home-shortcuts" aria-label="小屋常用工具"><button type="button" onClick={() => commands.open('wall')}><Grid3X3 size={17}/><span>专辑墙</span></button><button type="button" onClick={() => commands.open('library')}><Library size={17}/><span>唱片库</span></button><button type="button" className="focus-badge" aria-expanded={focusOpen} onClick={() => commands.open('timer')}><Clock size={17}/><span>专注</span></button><button type="button" onClick={() => commands.open('notes')}><BookOpen size={17}/><span>随手记</span></button><button type="button" aria-pressed={editing} onClick={() => { if (editing) { setEditing(false); setDrawer(''); setSelected(''); } else { setZone('all'); setEditing(true); setDrawer('decorate'); } }}><Settings size={16}/><span>{editing ? '完成布置' : '布置'}</span></button></nav>
      <DesktopControls onSettings={() => setDrawer('menu')} onError={text => notify(text, { tone: 'error' })}/>
    </header>
    <div className="home-room-caption">{!overview && <button type="button" className="home-back-overview" onClick={() => setZone('all')}>‹ 返回全屋</button>}<span>{shortDate(new Date())}</span><p>{focus.state.timer.phase === 'focus' ? '留一点安静，做眼前的小事。' : playingTitle ? '唱片在转，时间慢一点。' : '灯亮着，慢慢来。'}</p></div>
    <div ref={stageHost} className="home-viewport" onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }} onPointerDown={swipeStart} onPointerMove={swipeMove} onPointerUp={swipeEnd} onPointerCancel={swipeEnd}>
      <div ref={host} className="home-overview">
        <div className={`home-world ${artReady ? '' : 'is-art-loading'}`} data-phase={phase} inert={phase !== 'overview'} style={worldStyle}>
          <RoomCanvas layout={shown} selected={editing ? selected : ''} reduced={reduced} dim={dim || sky.state.bucket === 'night'} active={['overview', 'unreveal', 'zoomout'].includes(phase) && !covered} onPetPosition={placePetHit} onArtReady={setArtTheme} onRetry={() => setArtAttempt(n => n + 1)}/>
          <div className="home-art-veil" aria-hidden="true">正在布置小屋…</div>
          {!editing && <div className="home-zone-areas">{ZONE_ORDER.map(id => <button type="button" key={id} tabIndex={-1} className={`home-zone-area zone-${id}`} style={{ left: spots[id].floor.x, top: spots[id].floor.y }} aria-label={`走进${ZONE_NAMES[id]}`} onClick={() => setZone(id)}><span>{ZONE_NAMES[id]}</span></button>)}</div>}
          <div className="home-furniture-layer">{shown.items.map(item => { const b = bounds(item), spec = FURNITURE[item.type]; return <button key={item.id} type="button" data-furniture={item.type} data-live={['clock', 'timer', 'tasks', 'calendar', 'weather', 'lyrics', 'deck', 'notes'].includes(item.type)} className={`home-furniture facing-${item.facing} ${intro && ['deck', 'clock'].includes(item.type) ? 'is-guided' : ''}`} aria-label={`${spec.name}${editing ? ' · 移动或调整' : ''}`} style={{ left: b.x, top: b.y, width: Math.max(b.w, 48 / scale), height: Math.max(b.h, 48 / scale), zIndex: Math.round(item.u + item.v + (item.z ? 20 : 0)) }} onClick={() => activate(item)} onPointerDown={e => begin(e, item)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => {
            if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); const step = event.shiftKey ? 40 : 10, patch = item.mount.startsWith('wall-') ? { [item.mount === 'wall-left' ? 'v' : 'u']: (item.mount === 'wall-left' ? item.v : item.u) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), z: item.z + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) } : { u: item.u + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), v: item.v + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) };
            mutate(() => placeFurniture(layout, item.id, patch));
          }}><FurnitureLive item={item} manifest={furnitureManifest}/><span className="home-furniture-label">{spec.name}</span></button>; })}</div>
          <button type="button" className="home-pet-hit" ref={petHit} style={{ left: 612, top: 558 }} aria-label={`${identity.name} · 照顾伙伴`} onClick={() => commands.open('pet')}/>
        </div>
      </div>
      {stripShown && <div className="home-corners" data-phase={phase}>
        <div ref={track} className="home-corner-track" tabIndex={-1}>{ZONE_ORDER.map((id, i) => <div key={id} className={`home-corner-page ${id === corner ? 'is-current' : ''}`} style={{ '--page': i }}><HomeCorner zone={id} active={id === corner && cornerShown} viewport={stage} reduced={reduced} dim={dim} onLight={() => setDim(v => !v)}/></div>)}</div>
      </div>}
    </div>
    {stripShown && <div className="home-corner-ui" data-phase={phase}>
      {prev && <button type="button" className="home-corner-edge is-prev" aria-label={`上一个角落：${ZONE_NAMES[prev]}`} title={`${ZONE_NAMES[prev]}（←）`} onClick={() => setZone(prev)}><ChevronLeft size={22}/></button>}
      {next && <button type="button" className="home-corner-edge is-next" aria-label={`下一个角落：${ZONE_NAMES[next]}`} title={`${ZONE_NAMES[next]}（→）`} onClick={() => setZone(next)}><ChevronRight size={22}/></button>}
      <CornerActions key={corner} zone={corner}/>
    </div>}
    <SleepIndicator/>
    {homeNotice ? <aside className="home-intro home-notice" aria-label="新的首页"><span><b>首页换成了生活小屋。</b>唱片、手记和专注记录都在，原版唱片架也随时可以换回。</span><button type="button" onClick={closeHomeNotice}>好的</button><button type="button" onClick={() => { closeHomeNotice(); window.dispatchEvent(new Event('cabin:interface-choice')); }}>改用原版</button></aside>
    : intro && <aside className="home-intro" aria-label="小屋初次指引"><span>点唱机听歌，点钟开始专注。布置可以慢慢来。</span><button type="button" onClick={completeIntro}>知道了</button></aside>}
    {store.error && <p className="home-layout-error" role="alert">{store.error}</p>}
    <footer className="home-footer"><NowPlayingBar/><nav className="home-zones" aria-label="房间区域" aria-keyshortcuts="0 1 2 3 ArrowLeft ArrowRight"><button type="button" aria-pressed={zone === 'all'} onClick={() => setZone('all')}>{overview ? '全屋' : '返回全屋'}</button>{ZONE_ORDER.map((id, i) => <button type="button" key={id} aria-pressed={zone === id} onClick={() => setZone(id)}><i className="home-zone-dot" aria-hidden="true" ref={el => { dots.current[i] = el; }}/>{ZONE_NAMES[id]}</button>)}</nav><button type="button" className="home-pet-return" aria-label="回到宠物" onClick={() => setZone('life')}><Heart size={16}/>{identity.name}</button></footer>
    <details className="home-accessible-furniture"><summary>家具与无障碍入口</summary><div>{layout.items.map(item => <button type="button" key={item.id} onClick={() => activate(item)}>{FURNITURE[item.type].name}</button>)}</div></details>
    {drawer && <Dialog title={drawer === 'themes' ? '选择小屋' : drawer === 'menu' ? '小屋日常' : '布置小屋'} close={() => setDrawer('')} className="home-tool home-editor" size="lg">
      {drawer === 'menu' ? <nav className="home-menu-grid" aria-label="小屋功能">{[['recipes','场景配方'],['sleep','睡前模式'],['postcard','小屋明信片'],['weather','位置与天气'],['diagnostics','功能诊断'],['backup','备份与恢复'],['settings','全部设置'],['interface','改用原版唱片架']].map(([id,name]) => <button type="button" key={id} onClick={() => { setDrawer(''); commands.open(id); }}>{name}</button>)}</nav> : drawer === 'themes' ? <div className="home-theme-grid">{THEMES.map(t => <button type="button" key={t.id} aria-pressed={look === t.id} onPointerEnter={() => prefetchRoomArt(t.id)} onFocus={() => prefetchRoomArt(t.id)} onClick={() => { commands.theme(t.id); setDrawer(''); }}><img src={`/room-scenes/v21/${t.id}/shell.webp`} alt=""/><span>{t.name}</span></button>)}</div> : <>
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
