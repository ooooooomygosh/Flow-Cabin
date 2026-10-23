import React, { useEffect, useState } from 'react';
import { useFocus } from '../focus/useFocus';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { formatClock } from '../focus/focus-model.mjs';
import { loadLyrics, readLyricSettings, playbackPosition, LYRIC_CHANGED } from '../lyrics/lyric-session.mjs';
import { activeLyric, lyricTrackKey } from '../lyrics/lyrics-model.mjs';
import { useStudy } from '../study/useStudy';
import { dayKey } from '../focus/focus-model.mjs';
export function ClockReadout() {
  const focus = useFocus(), [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(id); }, []);
  return <span className="home-clock-readout">{focus.state.timer.phase === 'idle' ? new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : formatClock(focus.remaining)}<small>{focus.state.timer.phase === 'idle' ? '慢慢来' : focus.state.timer.paused ? '已暂停' : focus.state.timer.phase === 'focus' ? '专注中' : '休息中'}</small></span>;
}
export function LyricsReadout() {
  const { deck, lyricsTrack: track } = useCabinRuntime(), key = lyricTrackKey(track);
  const [doc, setDoc] = useState(null), [line, setLine] = useState(-1), [revision, setRevision] = useState(0);
  useEffect(() => { const changed = () => setRevision(n => n + 1); window.addEventListener(LYRIC_CHANGED, changed); return () => window.removeEventListener(LYRIC_CHANGED, changed); }, []);
  useEffect(() => {
    let disposed = false; setDoc(null);
    if (track.title && deck.provider !== 'visual') loadLyrics(track).then(value => !disposed && setDoc(value), () => {});
    return () => { disposed = true; };
  }, [key, revision]);
  useEffect(() => { if (!doc) return; const tick = () => { if (!document.hidden) setLine(activeLyric(doc.lines, playbackPosition(deck.playback, deck.provider === 'system' ? deck.system : null), (doc.offset || 0) + (readLyricSettings(track).offset || 0))); }; tick(); const id = setInterval(tick, 200); return () => clearInterval(id); }, [doc, key, deck.playback, deck.system, deck.provider, revision]);
  const text = i => doc?.lines?.[i]?.words.map(w => w.word).join('');
  return <span className="home-lyrics-readout"><span>{text(line) || (doc?.instrumental ? '让旋律慢慢流淌' : deck.audible ? '打开歌词册' : '放一张喜欢的唱片')}</span><small>{text(line + 1) || '歌词册'}</small></span>;
}

export function CalendarReadout(){const study=useStudy(),[now,setNow]=useState(()=>new Date());useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(new Date());},60000);return()=>clearInterval(timer);},[]);const marked=study?.state.countdowns.some(d=>d.date===dayKey(now.getTime()));return <span className="home-calendar-readout"><small>{now.getMonth()+1} 月{marked?' ·':''}</small><b>{now.getDate()}</b></span>;}
