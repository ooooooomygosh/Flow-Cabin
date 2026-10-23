import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocus } from '../focus/useFocus';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { formatClock } from '../focus/focus-model.mjs';
import { playbackPosition } from '../lyrics/lyric-session.mjs';
import { activeLyric } from '../lyrics/lyrics-model.mjs';
import { lineEnd } from '../lyrics/lyric-timing.mjs';
import { skinFor, paperStyle } from '../lyrics/lyric-skins.mjs';
import { useLyricDoc, useLyricSettings } from '../lyrics/useLyrics';
import KaraokeLine from '../lyrics/KaraokeLine';
import '../lyrics/lyrics.css';
import { frameClock, onBackgroundChange } from '../frame-clock.mjs';
import useReducedMotion from '../useReducedMotion';
import { useStudy } from '../study/useStudy';
import { dayKey } from '../focus/focus-model.mjs';
export function ClockReadout() {
  const focus = useFocus(), [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(id); }, []);
  return <span className="home-clock-readout">{focus.state.timer.phase === 'idle' ? new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : formatClock(focus.remaining)}<small>{focus.state.timer.phase === 'idle' ? '慢慢来' : focus.state.timer.paused ? '已暂停' : focus.state.timer.phase === 'focus' ? '专注中' : '休息中'}</small></span>;
}
// The lyric book / projection in the room: the current line sings in the room's own
// lyric skin, the next line waits underneath. Shares the stage's skins and timing.
export function LyricsReadout() {
  const { deck, look, lyricsTrack: track } = useCabinRuntime();
  const visual = deck.provider === 'visual' || !track.title;
  const { doc } = useLyricDoc(visual ? { title: '' } : track), settings = useLyricSettings(track);
  const [index, setIndex] = useState(-1), [hidden, setHidden] = useState(false);
  const reduced = useReducedMotion();
  const state = useRef({}); state.current = { deck, offset: (doc?.offset || 0) + (Number(settings.offset) || 0) };
  const getTime = useCallback(() => { const { deck: d, offset } = state.current, p = playbackPosition(d.playback, d.provider === 'system' ? d.system : null); return p === null ? null : p - offset; }, []);
  useEffect(() => onBackgroundChange(setHidden), []);
  useEffect(() => { if (!doc?.lines.length || hidden) return; const tick = () => setIndex(activeLyric(doc.lines, getTime(), 0)); tick(); return frameClock().subscribe(tick, { fps: 8 }); }, [doc, hidden, getTime]);
  const lines = doc?.lines || [], line = lines[index], next = lines[index + 1];
  const text = l => l?.words.map(w => w.word).join('') || '';
  return <span className={`home-lyrics-readout lyric-readout ${reduced ? 'is-reduced' : ''}`} style={paperStyle(skinFor(look))}>
    {line ? <KaraokeLine key={`${line.startTime}:${index}`} line={line} end={lineEnd(lines, index)} getTime={getTime} reduced={reduced} active={!hidden}/> : <span>{doc?.instrumental ? '让旋律慢慢流淌' : deck.audible ? '打开歌词册' : '放一张喜欢的唱片'}</span>}
    <small className="lyric-readout-next">{text(next) || '歌词册'}</small>
  </span>;
}

export function CalendarReadout(){const study=useStudy(),[now,setNow]=useState(()=>new Date());useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(new Date());},60000);return()=>clearInterval(timer);},[]);const marked=study?.state.countdowns.some(d=>d.date===dayKey(now.getTime()));return <span className="home-calendar-readout"><small>{now.getMonth()+1} 月{marked?' ·':''}</small><b>{now.getDate()}</b></span>;}
