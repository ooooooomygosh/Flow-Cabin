import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { deskLayout, clockFace } from './desk/layout.mjs';
import { autoMode } from './desk/desk-model.mjs';
import { deskUrl, whenDeskImages, FIRST } from './desk/images.mjs';
import ClockFace from './desk/ClockFace';
import { PHASE_LABELS } from './focus/focus-model.mjs';
import './styles/tokens.css';
import './desk/desk.css';
import './wallpaper.css';
import { syncPerformance, applyPerformance } from './perf-profile.mjs';
syncPerformance();
applyPerformance(); // the wallpaper follows the main window's 流畅模式 (same profile storage)

// 沉入桌面: the desk itself under every window -- DEsk's walnut desk (https://github.com/fyzugx/DEsk, MIT,
// (c) 2026 The DEsk authors) with what stands at its back edge, laid out by the same src/desk pieces as the
// home (layout.mjs, ClockFace.jsx), and nothing to press. The red LED clock tells the time, or counts the
// round down while one runs; a slip of paper at the front says what is on the turntable.
//
// The wallpaper keeps its own partition (no shared preferences): the main window relays the round and the
// record in its snapshot (window.albumWallpaper).
function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useEffect(() => { const update = () => setSize({ width: innerWidth, height: innerHeight }); addEventListener('resize', update); return () => removeEventListener('resize', update); }, []);
  return size;
}

function WallpaperDesk() {
  const [snapshot, setSnapshot] = useState(null), [now, setNow] = useState(Date.now), [lit, setLit] = useState(false);
  const { width, height } = useWindowSize(), lay = useMemo(() => deskLayout(width, height), [width, height]);
  useEffect(() => {
    let alive = true;
    window.albumWallpaper?.getSnapshot().then((value) => { if (alive) setSnapshot(value); });
    const unsubscribe = window.albumWallpaper?.onSnapshot((value) => setSnapshot(value));
    whenDeskImages(FIRST).then(() => alive && setLit(true));
    const tick = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => { alive = false; unsubscribe?.(); clearInterval(tick); };
  }, []);
  useEffect(() => { document.documentElement.dataset.desktopReduceMotion = String(Boolean(snapshot?.reduceMotion)); }, [snapshot?.reduceMotion]);
  const focus = snapshot?.focus || {}, running = focus.phase && focus.phase !== 'idle';
  const remaining = running ? (focus.paused || !focus.endsAt ? focus.remaining || 0 : Math.max(0, focus.endsAt - now)) : 0;
  const mode = autoMode({ focusPhase: focus.phase, playing: false });
  const face = clockFace(mode, { now: new Date(now), focus: running && { phase: focus.phase, paused: Boolean(focus.paused), remaining, rounds: focus.round || 0, progress: focus.duration ? 1 - remaining / focus.duration : null } });
  const style = (r) => ({ left: r.x, top: r.y, width: r.w, height: r.h });
  const record = snapshot?.record;
  return <main className={`desk-home wallpaper-desk ${lit ? 'is-lit' : ''} ${lay.phone ? 'is-phone' : ''}`} aria-label="书桌（动态桌面）" style={{ '--desk-s': lay.s }}>
    <div className="desk-wood" style={{ backgroundImage: `url(${deskUrl('desk-wood.webp')})` }} aria-hidden="true"/>
    <div className="desk-top">
      <img className="desk-piece" src={deskUrl('edge-console.webp')} alt="" style={style(lay.console)} draggable="false"/>
      <img className="desk-piece" src={deskUrl('edge-clock.webp')} alt="" style={style(lay.clock)} draggable="false"/>
      <img className="desk-piece" src={deskUrl('edge-post.webp')} alt="" style={style(lay.post)} draggable="false"/>
      <div className="desk-plate desk-console-plate" style={{ ...style(lay.consolePlate), backgroundImage: `url(${deskUrl('plate-console.webp')})` }}><span className="desk-engraving" style={{ fontSize: Math.max(12, 13 * lay.s) }}>唱机</span></div>
      <div className="desk-clock" style={style(lay.clockFace)}><div className="desk-clock-face"><ClockFace face={lit ? face : { ...face, digits: '000000', word: 'LOAD' }} scale={lay.s}/></div></div>
      <div className="desk-post" style={{ ...style(lay.postBox), backgroundImage: `url(${deskUrl('post0.webp')})` }}/>
    </div>
    <div className="desk-plate desk-shelf-plate" style={{ ...style(lay.shelfPlate), backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }}><span className="desk-engraving" style={{ fontSize: Math.max(12, 13 * lay.s) }}>唱片架</span></div>
    {(record || running) && <p className="wallpaper-slip">
      {running && <span>{PHASE_LABELS[focus.phase]}{focus.paused ? ' · 暂停' : ''}{focus.task ? ` · ${focus.task}` : ''}</span>}
      {record && <span><b>{snapshot.spinning ? '正在播放' : '唱机上'}</b>{record.title}{record.artist ? ` · ${record.artist}` : ''}</span>}
    </p>}
  </main>;
}
createRoot(document.getElementById('root')).render(<WallpaperDesk/>);
