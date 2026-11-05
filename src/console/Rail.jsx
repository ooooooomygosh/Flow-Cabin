import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LedDigits, LedGlass } from '../props/Led';
import { usePlaybackDuration, usePlaybackPosition } from '../deck/usePlaybackClock';
import { formatSeconds } from '../lib/time-format.mjs';
import { ledTimeSize } from './led-time.mjs';

// Elapsed / total as red seven-segment digits behind glass (the digits are for the eyes only:
// the progress control carries the time in aria-valuetext).
export function LedTime({ seconds, className = '' }) {
  const text = formatSeconds(seconds), size = useMemo(() => ledTimeSize(text), [text]);
  return <LedGlass width={size.width} height={size.height} className={`c-ledtime ${className}`}>
    <LedDigits text={text} x={size.x} y={size.y} w={12} h={20} gap={4}/>
  </LedGlass>;
}

// The progress rail: a brass strip with a dark groove, the groove a row of LED blocks lit up to
// the playhead. Over it sits the real control: an <input type=range> that seeks (dragging only
// previews; the seek happens once, on release, as before) or, for sources that cannot seek, a
// read-only progressbar. Arrow keys seek in 5 s steps through the player's own shortcuts
// (`data-deck-seek`).
function RailFrame({ position, duration, children, readOnly, className = '' }) {
  const percent = duration ? Math.min(100, position / duration * 100) : 0;
  return <div className={`c-rail-row${readOnly ? ' is-read-only' : ''} ${className}`}>
    <LedTime seconds={position} className="is-left"/>
    <div className="c-rail" style={{ '--p': `${percent}%` }}>
      <span className="c-rail-groove" aria-hidden="true"><i className="c-rail-ghost"/><i className="c-rail-lit"/></span>
      {children}
    </div>
    <LedTime seconds={duration} className="is-right"/>
  </div>;
}

export function SeekRail({ playback, seekable, label = '播放进度', className = '' }) {
  const duration = usePlaybackDuration(playback), playhead = usePlaybackPosition(playback, .25);
  const [scrub, setScrub] = useState(null), pending = useRef(null), input = useRef(null);
  const commit = () => { const value = pending.current; pending.current = null; setScrub(null); if (value !== null) playback?.seek(value); };
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => { const element = input.current, change = () => commitRef.current(); element?.addEventListener('change', change); return () => element?.removeEventListener('change', change); }, []);
  const position = Math.min(scrub ?? playhead, duration || 1), percent = duration ? Math.min(100, position / duration * 100) : 0;
  const text = `${formatSeconds(position)} / ${formatSeconds(duration)}`;
  return <RailFrame position={position} duration={duration} readOnly={!seekable} className={className}>
    {seekable
      ? <input ref={input} type="range" data-deck-seek="" aria-label={label} aria-valuetext={text} min="0" max={duration || 1} step=".1" value={position} disabled={!duration} style={{ '--p': `${percent}%` }} onChange={(event) => { pending.current = Number(event.target.value); setScrub(pending.current); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit}/>
      : <span className="c-rail-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={text} title="这个音源只显示进度，拖动请在它自己的播放器里进行"/>}
  </RailFrame>;
}

// 系统正在播放: the system player's position (interpolated between polls), read only.
export function SystemRail({ timeline, label = '系统播放进度', className = '' }) {
  const subscribe = (fn) => { const off = timeline?.subscribe?.(fn) || (() => {}); const timer = setInterval(fn, 500); return () => { off(); clearInterval(timer); }; };
  const position = useSyncExternalStore(subscribe, () => Math.floor(timeline?.position?.() || 0), () => 0);
  const duration = useSyncExternalStore(subscribe, () => timeline?.getSnapshot?.().duration || 0, () => 0);
  if (!duration) return <div className="c-rail-row is-empty" aria-hidden="true"/>;
  const shown = Math.min(position, duration);
  return <RailFrame position={shown} duration={duration} readOnly className={className}>
    <span className="c-rail-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={shown} aria-valuetext={`${formatSeconds(shown)} / ${formatSeconds(duration)}`}/>
  </RailFrame>;
}
