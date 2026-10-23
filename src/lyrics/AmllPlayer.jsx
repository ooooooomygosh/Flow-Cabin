import React from 'react';
import { LyricPlayer } from '@applemusic-like-lyrics/react';
import '@applemusic-like-lyrics/core/style.css';
export default function AmllPlayer({ lines, time, playing, reduced, onSeek }) {
  return <LyricPlayer className="cabin-amll" lyricLines={lines} currentTime={time} playing={playing} enableBlur={false} enableScale={!reduced} enableSpring={!reduced}
    onLyricLineClick={event => onSeek(lines[event.lineIndex]?.startTime)}/>;
}
