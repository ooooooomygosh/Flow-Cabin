import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './mini.css';
import { PlayPixel, PausePixel, PreviousPixel, NextPixel, NotePixel, ClockPixel } from '../pixel-icons';
import PixelCat from '../pet/PixelCat';
import RecordSleeve from '../ui/RecordSleeve';
import PixelRecord from '../ui/PixelRecord';
import { sleeveTone } from '../player/pixel-cover.mjs';
import { liftLabel } from '../scene/deck-sprite.mjs';
import { formatSeconds } from '../lib/time-format.mjs';
import { volumePercent, wheelVolume } from '../player/volume-curve.mjs';

// The lamp's reflection travelling round the record: 8 frames in one strip that a
// CSS animation steps through (8 fps), so the record reads as turning without
// rotating pixel art.
const SHEEN = Array.from({ length: 8 }, (_, i) => { const t = i / 8 * Math.PI * 2 - 2.36; return [Math.round(24 + Math.cos(t) * 17), Math.round(24 + Math.sin(t) * 17), Math.round(24 - Math.cos(t) * 12), Math.round(24 - Math.sin(t) * 12)]; });
const PinGlyph = () => <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" shapeRendering="crispEdges" fill="currentColor"><path d="M4 1h4v1H7v4h2v1H7v4H5V7H3V6h2V2H4z"/></svg>;

// The position between two snapshots: the main process polls ~1.3 times a second,
// the bar moves every half second from the last known spot.
function usePlayhead(now) {
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!now?.playing) return; const timer = setInterval(() => setTick((value) => value + 1), 500); return () => clearInterval(timer); }, [now?.playing, now?.at]);
  void tick;
  if (!now?.duration) return 0;
  const elapsed = now.playing && now.at ? Math.max(0, Date.now() - now.at) / 1000 : 0;
  return Math.min(now.duration, (now.position || 0) + elapsed);
}

// Mini player (沉入桌面, or floating from the tray / 控制 menu): the song's own cover
// with the record peeking out, the title, the artist — or the current lyric line
// (`snapshot.lyric`) when there is one — progress, volume, and on hover the controls.
// Drag anywhere to move it; double-click returns to the cabin.
export function MiniPlayer({ snapshot, command, player = () => {}, exit, drag, pin }) {
  const now = snapshot?.nowPlaying || null, mode = snapshot?.mini?.mode === 'user' ? 'user' : 'sink', pinned = snapshot?.mini?.alwaysOnTop === true;
  // Real audio only: lo-fi ambience and a display-only (仅展示) record are not "playing".
  const playing = now ? now.playing === true : snapshot?.musicPlaying === true;
  const phase = snapshot?.focus?.phase || 'idle', paused = snapshot?.focus?.paused === true;
  const focusLabel = phase === 'idle' ? '开始专注' : paused ? (phase === 'focus' ? '继续专注' : '继续休息') : (phase === 'focus' ? '暂停专注' : '暂停休息');
  const title = now?.title || snapshot?.track || (playing ? '正在播放' : '唱机休息中');
  const focusState = phase === 'idle' ? '' : paused ? '专注暂停' : phase === 'focus' ? '专注中' : '休息中';
  const status = [playing ? '正在播放' : now || snapshot?.track ? '已暂停' : '双击回到小屋', focusState].filter(Boolean).join(' · ');
  const lyric = typeof snapshot?.lyric === 'string' ? snapshot.lyric.trim() : '';
  const record = useMemo(() => ({ title: now?.album || title || '心流小屋', artist: now?.artist || 'mini' }), [now?.album, now?.artist, title]), tone = useMemo(() => liftLabel(sleeveTone(record), 150), [record]);
  const [coverFailed, setCoverFailed] = useState(false); useEffect(() => setCoverFailed(false), [now?.cover]);
  const position = usePlayhead(now), duration = now?.duration || 0;
  const [scrub, setScrub] = useState(null), shown = scrub ?? position;
  const [volume, setVolume] = useState(null); useEffect(() => setVolume(null), [now?.volume, now?.muted]);
  const level = volume ?? (now?.muted ? 0 : now?.volume || 0);
  const bar = useRef(null), latest = useRef(level); latest.current = level;
  // The wheel over the deck changes the volume (when this source has one).
  useEffect(() => { const node = bar.current; if (!node || !now?.canVolume) return; const wheel = (event) => { if (event.target.closest?.('.mini-progress input')) return; event.preventDefault(); const next = wheelVolume(latest.current, event.deltaY); setVolume(next); player('set-volume', next); }; node.addEventListener('wheel', wheel, { passive: false }); return () => node.removeEventListener('wheel', wheel); }, [now?.canVolume]);
  // Drag to move: offsets from the press, so the window follows the pointer exactly.
  const dragging = useRef(null);
  const down = (event) => { if (!drag || event.button !== 0 || event.target.closest?.('button,input')) return; dragging.current = { x: event.screenX, y: event.screenY, moved: false }; event.currentTarget.setPointerCapture?.(event.pointerId); };
  const move = (event) => { const start = dragging.current; if (!start) return; const dx = event.screenX - start.x, dy = event.screenY - start.y; if (!start.moved && Math.abs(dx) + Math.abs(dy) < 3) return; if (!start.moved) { start.moved = true; drag('start'); } drag('move', dx, dy); };
  const up = () => { const start = dragging.current; dragging.current = null; if (start?.moved) drag('end'); };
  return <div ref={bar} className={`mini-bar ${playing ? 'is-playing' : ''}`} onDoubleClick={exit} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="拖动移动 · 双击回到小屋窗口">
    <span className="mini-deck" aria-hidden="true">
      <span className="mini-record"><PixelRecord base="#2b2420" label={tone} seed={record.title}/><span className="mini-sheen"><svg viewBox="0 0 384 48" shapeRendering="crispEdges">{SHEEN.map(([x, y, ox, oy], i) => <g key={i} fill="#e4dfcc"><rect x={i * 48 + x - 1} y={y - 1} width="2" height="2"/><rect x={i * 48 + ox} y={oy} width="1" height="1" opacity=".6"/></g>)}</svg></span></span>
      {now?.cover && !coverFailed ? <img className="mini-cover" src={now.cover} alt="" draggable="false" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)}/> : <RecordSleeve item={record} title={false} className="mini-sleeve"/>}
    </span>
    <span className="mini-pet"><PixelCat petId={snapshot?.petId} packOverride={snapshot?.petPack || null} accessory={snapshot?.focus?.accessory || ''} pose={phase === 'focus' ? 'read' : playing ? 'listen' : 'idle'} reduceMotion={snapshot?.reduceMotion}/></span>
    <span className="mini-copy">
      <span className="mini-track" title={title}>{title}{now?.liked && <i className="mini-liked" aria-label="已喜欢">♥</i>}</span>
      {/* The lyric slot: the current line when the lyric service provides one, else the artist. */}
      {lyric ? <span className="mini-lyric" title={lyric}>{lyric}</span> : <span className="mini-artist" title={now?.artist || ''}>{now?.artist || (now ? '' : '小屋唱机')}{now?.album ? ` · ${now.album}` : ''}</span>}
      {now && duration > 0 && <span className="mini-progress">
        <input type="range" aria-label="迷你唱机进度" min="0" max={duration} step="1" value={Math.min(shown, duration)} disabled={!now.canSeek} style={{ '--mini-progress': `${Math.min(100, shown / duration * 100)}%` }} onChange={(event) => setScrub(Number(event.target.value))} onPointerUp={() => { if (scrub !== null) player('seek', scrub); setScrub(null); }} onKeyUp={() => { if (scrub !== null) player('seek', scrub); setScrub(null); }}/>
        <small>{formatSeconds(shown)} / {formatSeconds(duration)}</small>
        {now.canVolume && <input type="range" className="mini-volume" aria-label="迷你唱机音量" aria-valuetext={`${volumePercent(level)}%`} title={`音量 ${volumePercent(level)}% · 滚轮调节`} min="0" max="1" step=".05" value={level} onChange={(event) => { const next = Number(event.target.value); setVolume(next); player('set-volume', next); }}/>}
      </span>}
      <span className="mini-row">
        <span className="mini-status"><i className="mini-led"/>{status}</span>
        <nav className="mini-actions" aria-label="迷你唱机">
          <button type="button" aria-label="上一首" onClick={() => player('previous')}><PreviousPixel size={12}/></button>
          <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={() => player('toggle')}>{playing ? <PausePixel size={12}/> : <PlayPixel size={12}/>}</button>
          <button type="button" aria-label="下一首" onClick={() => player('next')}><NextPixel size={12}/></button>
          <button type="button" aria-label="开关小屋声音" onClick={() => command('sound-toggle')}><NotePixel size={12}/></button>
          <button type="button" aria-label={focusLabel} onClick={() => command('focus-toggle')}><ClockPixel size={12}/></button>
          {pin && <button type="button" aria-label={pinned ? '取消置顶' : '置顶迷你唱机'} aria-pressed={pinned} title="总在最前" onClick={() => pin(!pinned)}><PinGlyph/></button>}
          <button type="button" className="is-primary" aria-label={mode === 'user' ? '回到小屋' : '浮出桌面'} onClick={exit}>{mode === 'user' ? '小屋' : '浮出'}</button>
        </nav>
      </span>
    </span>
  </div>;
}

function MiniApp() {
  const api = window.albumMini, [snapshot, setSnapshot] = useState(null);
  useEffect(() => { if (!api) return; api.getSnapshot().then((value) => value && setSnapshot(value)).catch(() => {}); return api.onSnapshot(setSnapshot); }, [api]);
  return <MiniPlayer snapshot={snapshot} command={(value) => api?.command(value)} player={(action, value) => api?.player?.(action, value)} exit={() => api?.exit()} drag={api?.drag ? (phase, dx, dy) => api.drag(phase, dx, dy) : null} pin={api?.pin ? (on) => api.pin(on) : null}/>;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<MiniApp/>);
