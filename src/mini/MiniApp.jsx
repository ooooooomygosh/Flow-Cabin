import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './mini.css';
import { PlayPixel, PausePixel, PreviousPixel, NextPixel, NotePixel, ClockPixel } from '../pixel-icons';
import RecordSleeve from '../ui/RecordSleeve';
import PixelRecord from '../ui/PixelRecord';
import { sleeveTone } from '../player/pixel-cover.mjs';
import { liftLabel } from '../scene/deck-sprite.mjs';

// The lamp's reflection travelling round the record: 8 frames in one strip that a
// CSS animation steps through (8 fps), so the record reads as turning without
// rotating pixel art.
const SHEEN = Array.from({ length: 8 }, (_, i) => { const t = i / 8 * Math.PI * 2 - 2.36; return [Math.round(24 + Math.cos(t) * 17), Math.round(24 + Math.sin(t) * 17), Math.round(24 - Math.cos(t) * 12), Math.round(24 - Math.sin(t) * 12)]; });

// 沉入桌面 mini player: a pocket deck. The record's sleeve (generated from the track,
// so each song keeps its print) with the record peeking out, the track on the first
// line and the deck's state on the second. Hover or keyboard focus swaps the second
// line for the controls, so the title never hides. Double-click: back to the window.
export function MiniPlayer({ snapshot, command, player = () => {}, exit }) {
  const playing = Boolean(snapshot?.musicPlaying || snapshot?.playing), phase = snapshot?.focus?.phase || 'idle', paused = snapshot?.focus?.paused === true;
  const focusLabel = phase === 'idle' ? '开始专注' : paused ? (phase === 'focus' ? '继续专注' : '继续休息') : (phase === 'focus' ? '暂停专注' : '暂停休息');
  const track = snapshot?.track || (playing ? '正在播放' : '唱机休息中');
  const focusState = phase === 'idle' ? '' : paused ? '专注暂停' : phase === 'focus' ? '专注中' : '休息中';
  const status = [playing ? '正在播放' : snapshot?.track ? '已暂停' : '双击回到小屋', focusState].filter(Boolean).join(' · ');
  const record = useMemo(() => ({ title: snapshot?.track || '心流小屋', artist: 'mini' }), [snapshot?.track]), tone = useMemo(() => liftLabel(sleeveTone(record), 150), [record]);
  return <div className={`mini-bar ${playing ? 'is-playing' : ''}`} onDoubleClick={exit} title="双击回到小屋窗口">
    <span className="mini-deck" aria-hidden="true">
      <span className="mini-record"><PixelRecord base="#2b2420" label={tone} seed={record.title}/><span className="mini-sheen"><svg viewBox="0 0 384 48" shapeRendering="crispEdges">{SHEEN.map(([x, y, ox, oy], i) => <g key={i} fill="#e4dfcc"><rect x={i * 48 + x - 1} y={y - 1} width="2" height="2"/><rect x={i * 48 + ox} y={oy} width="1" height="1" opacity=".6"/></g>)}</svg></span></span>
      <RecordSleeve item={record} title={false} className="mini-sleeve"/>
    </span>
    <span className="mini-copy">
      <span className="mini-track">{track}</span>
      <span className="mini-row">
        <span className="mini-status"><i className="mini-led"/>{status}</span>
        <nav className="mini-actions" aria-label="迷你唱机">
          <button type="button" aria-label="上一首" onClick={() => player('previous')}><PreviousPixel size={12}/></button>
          <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={() => player('toggle')}>{playing ? <PausePixel size={12}/> : <PlayPixel size={12}/>}</button>
          <button type="button" aria-label="下一首" onClick={() => player('next')}><NextPixel size={12}/></button>
          <button type="button" aria-label="开关小屋声音" onClick={() => command('sound-toggle')}><NotePixel size={12}/></button>
          <button type="button" aria-label={focusLabel} onClick={() => command('focus-toggle')}><ClockPixel size={12}/></button>
          <button type="button" className="is-primary" aria-label="浮出桌面" onClick={exit}>浮出</button>
        </nav>
      </span>
    </span>
  </div>;
}

function MiniApp() {
  const api = window.albumMini, [snapshot, setSnapshot] = useState(null);
  useEffect(() => { if (!api) return; api.getSnapshot().then((value) => value && setSnapshot(value)).catch(() => {}); return api.onSnapshot(setSnapshot); }, [api]);
  return <MiniPlayer snapshot={snapshot} command={(value) => api?.command(value)} player={(action) => api?.player?.(action)} exit={() => api?.exit()}/>;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<MiniApp/>);
