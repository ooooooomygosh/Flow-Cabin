import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KaraokeLine from './KaraokeLine';
import { activeLyric } from './lyrics-model.mjs';
import { lineEnd, unpackLyrics } from './lyric-timing.mjs';
import { skinFor, skinStyle } from './lyric-skins.mjs';
import { frameClock } from '../frame-clock.mjs';
import useReducedMotion from '../useReducedMotion';
import { remotePosition } from './remote-position.mjs';
import './lyrics.css';

// 歌词副屏: the other cabin's song, sung here in that cabin's room skin.
export default function RemoteLyrics({ snapshot }) {
  const reduced = useReducedMotion(), lyrics = snapshot?.lyrics || {};
  const lines = useMemo(() => unpackLyrics({ precision: 'word', lines: lyrics.lines || [] }).lines, [JSON.stringify(lyrics.lines || [])]);
  const state = useRef(snapshot); state.current = snapshot;
  const getTime = useCallback(() => remotePosition(state.current), []);
  const [index, setIndex] = useState(-1);
  useEffect(() => { const tick = () => setIndex(activeLyric(lines, getTime(), 0)); tick(); return frameClock().subscribe(tick, { fps: 10 }); }, [lines, getTime]);
  const skin = skinFor(lyrics.skin);
  const text = line => line.words.map(w => w.word).join('');
  return <div className="remote-lyrics" role="region" aria-label="歌词副屏" style={skinStyle(skin)} data-skin={skin.id}>
    <small className="remote-lyrics-title">{lyrics.title || snapshot?.music?.title || '等待连接'}{snapshot?.music?.artist ? ` · ${snapshot.music.artist}` : ''}</small>
    {lines.length ? <ol className="remote-lyrics-lines">{lines.map((line, i) => <li key={`${line.startTime}:${i}`} className={i === index ? 'is-current' : i < index ? 'is-past' : ''} aria-current={i === index ? 'true' : undefined}>
      {i === index ? <KaraokeLine line={line} end={lineEnd(lines, i)} getTime={getTime} reduced={reduced} translation={line.translatedLyric}/> : <span>{text(line)}{line.translatedLyric && <small>{line.translatedLyric}</small>}</span>}
    </li>)}</ol> : <strong className="remote-lyrics-fallback">{lyrics.current || '等待歌词…'}</strong>}
  </div>;
}
