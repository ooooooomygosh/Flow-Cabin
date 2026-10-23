import React, { useEffect, useState } from 'react';
import { LyricPlayer } from '@applemusic-like-lyrics/react';
import '@applemusic-like-lyrics/core/style.css';
import { frameClock } from '../frame-clock.mjs';

// AMLL owns the spring scrolling; this wrapper only feeds it the song clock, so the
// stage around it does not re-render every frame.
// `lite` (low-performance devices) keeps the spring but drops per-line blur.
export default function AmllPlayer({ lines, getTime, playing, reduced, lite = false, wordLevel = true, onSeek }) {
  const [time, setTime] = useState(() => Math.max(0, getTime() ?? 0));
  useEffect(() => frameClock().subscribe(() => { const value = getTime(); if (value !== null) setTime(Math.max(0, value)); }, { fps: reduced ? 10 : 60 }), [getTime, reduced]);
  return <LyricPlayer className={`cabin-amll ${wordLevel ? 'is-word' : 'is-line'}`} lyricLines={lines} currentTime={Math.round(time)} playing={playing}
    enableBlur={!reduced && !lite} enableScale={!reduced} enableSpring={!reduced} alignAnchor="center" alignPosition={.4} wordFadeWidth={.5}
    onLyricLineClick={event => onSeek(lines[event.lineIndex]?.startTime)}/>;
}
