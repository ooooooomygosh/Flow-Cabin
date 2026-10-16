import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PixelTurntable from './PixelTurntable';
import { sideProgress, seekTarget } from './turntable-physics.mjs';
import { flyRecord } from './record-flight.mjs';
import { deckSoundsEnabled, setDeckSounds } from './deck-sfx.mjs';
import { displayTitle } from '../display-title.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist } from '../track-meta.mjs';
import { formatDuration } from '../playlist-model.mjs';
import { ChevronLeft, ChevronRight, Pause, Play, X, SpeakerWave, SpeakerOff, Disc3 } from '../icons';
import './listening-corner.css';

// 唱机特写 · Listening Corner: the deck up close on a lamp-lit desk, its sleeve
// leaning beside it, the side's tracks, and a crate of records to flip through.
const clock = (seconds) => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
const LIGHTS = [['lamp', '台灯'], ['dusk', '黄昏'], ['night', '深夜']];

// The visual-only deck has no audio clock; time passes while it spins.
function useVisualClock(running, key) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { setSeconds(0); }, [key]);
  useEffect(() => { if (!running) return; const timer = setInterval(() => setSeconds((value) => value + 1), 1000); return () => clearInterval(timer); }, [running]);
  return seconds;
}

export default function ListeningCorner({ item, items = [], vinyl, provider, spinning, trackIndex = 0, setTrackIndex, playback, player, toggleVisual, load, close, reduceMotion = false }) {
  const audible = provider !== 'visual' && provider !== 'system' && playback;
  const playing = audible ? Boolean(playback.playing) : Boolean(spinning);
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const names = trackNames(item), durations = (item?.trackDetails || []).map((track) => track?.lengthMillis || 0);
  const lengths = names.map((_, index) => durations[index] || 0);
  const visualSeconds = useVisualClock(!audible && spinning && Boolean(item), `${item?.id}|${trackIndex}`);
  const position = audible ? playback.position || 0 : visualSeconds;
  const { progress, gaps } = useMemo(() => sideProgress(lengths.length ? lengths : [0], trackIndex, position), [lengths.join(), trackIndex, Math.floor(position)]);
  const [speed, setSpeed] = useState(33), [light, setLight] = useState(() => { try { return localStorage.getItem('album-circle-corner-light-v1') || 'lamp'; } catch { return 'lamp'; } });
  const [sounds, setSounds] = useState(deckSoundsEnabled), [energyStep, setEnergyStep] = useState(0), [query, setQuery] = useState(''), [notice, setNotice] = useState('');
  const root = useRef(null), deckRef = useRef(null), list = useRef(null);
  useEffect(() => { setSpeed(33); }, [item?.id]);
  useEffect(() => {
    const previous = document.activeElement; root.current?.focus({ preventScroll: true });
    const key = (event) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1), current = document.activeElement;
      // This full-screen section is a modal dialog. Keep keyboard navigation
      // inside it, including when focus starts on the section itself.
      if (!first) { event.preventDefault(); root.current.focus(); }
      else if (event.shiftKey && (current === first || current === root.current || !root.current.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !root.current.contains(current))) { event.preventDefault(); first.focus(); }
    };
    const energyListener = (event) => { const value = event.detail?.playing ? Math.min(1, Math.max(0, Number(event.detail.energy) || 0)) : 0; root.current?.style.setProperty('--corner-energy', value.toFixed(3)); setEnergyStep(Math.round(value * 4) / 4); };
    document.addEventListener('keydown', key); window.addEventListener('cabin:playback', energyListener);
    document.documentElement.classList.add('room-corner-open');
    return () => { document.removeEventListener('keydown', key); window.removeEventListener('cabin:playback', energyListener); document.documentElement.classList.remove('room-corner-open'); previous?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [trackIndex, item?.id]);
  const toggle = () => audible ? playback.toggle() : toggleVisual?.();
  const seek = (value) => {
    if (!item) return;
    const target = seekTarget(lengths.length ? lengths : [0], value);
    if (!audible) { if (target.trackIndex !== trackIndex) setTrackIndex(target.trackIndex); if (!spinning) toggleVisual?.(); return; }
    if (target.trackIndex === trackIndex) { playback.seek(target.seconds); if (!playback.playing) playback.toggle(); }
    else { playback.startAt(target.seconds); setTrackIndex(target.trackIndex); }
  };
  const changeSpeed = (value) => { setSpeed(value); if (audible) playback.setRate(value === 45 ? 45 / (100 / 3) : 1); };
  const pick = (entry, event) => {
    const sleeve = event.currentTarget.querySelector('img, .corner-crate-blank'), deck = deckRef.current?.querySelector('canvas');
    flyRecord({ from: sleeve, to: deck, cover: entry.cover, mode: 'load' });
    load(entry, 0);
  };
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const matches = items.filter(entry => !needle || `${entry.title} ${entry.artist}`.normalize('NFKC').toLowerCase().includes(needle));
  const crate = matches.slice(0, 120);
  const queueRecord = (entry, event) => { if (!player?.enqueue(entry.id)) { setNotice(''); return; } flyRecord({ from: event.currentTarget.closest('li')?.querySelector('img, .corner-crate-blank'), to: root.current?.querySelector('.corner-crate-status'), cover: entry.cover, mode: 'queue' }); setNotice(`《${entry.title}》已加入待播`); };
  return createPortal(<section ref={root} tabIndex={-1} className={`listening-corner is-${light}`} role="dialog" aria-modal="true" aria-label="唱机特写" data-playing={String(playing)}>
    <div className="corner-backdrop" aria-hidden="true"><span className="corner-lamp"/><span className="corner-window"/><span className="corner-dust"/></div>
    <header className="corner-bar">
      <span className="corner-title"><Disc3 size={16}/>唱机特写<small>拖动唱臂换位置 · 点唱片暂停 · 33 / 45 转</small></span>
      <span className="corner-bar-actions">
        <span className="segmented corner-light" role="radiogroup" aria-label="灯光">{LIGHTS.map(([value, label]) => <button type="button" role="radio" key={value} aria-checked={light === value} onClick={() => { setLight(value); try { localStorage.setItem('album-circle-corner-light-v1', value); } catch {} }}>{label}</button>)}</span>
        <button type="button" className="pixel-button is-quiet" aria-pressed={sounds} title="唱针落下、抬起与唱片出套的声音" onClick={() => { setDeckSounds(!sounds); setSounds(!sounds); }}>{sounds ? <SpeakerWave size={15}/> : <SpeakerOff size={15}/>}唱机声音</button>
        <button type="button" className="pixel-button" onClick={close}><X size={15}/>回到小屋 · Esc</button>
      </span>
    </header>
    <div className="corner-stage">
      <div ref={deckRef} className="corner-deck">
        <PixelTurntable item={item} vinyl={vinyl} playing={playing && !busy} progress={item ? progress : 0} gaps={gaps} energy={energyStep} speed={speed} reduceMotion={reduceMotion}
          label={item ? `唱机特写：${item.title}${playing ? '，正在播放' : '，已暂停'}` : '唱机特写：还没有放唱片'} onToggle={item ? toggle : undefined} onSeek={item ? seek : undefined} onSpeed={changeSpeed}/>
        {!item && <p className="corner-empty">从下面的唱片箱挑一张，或回到小屋双击封面。</p>}
      </div>
      <aside className="corner-side" aria-label="正在播放">
        {item ? <>
          <div className="corner-sleeve">{item.cover ? <img src={item.cover} alt={`${item.title} 封套`} referrerPolicy="no-referrer"/> : <span className="corner-crate-blank"/>}<span className="corner-sleeve-shadow"/></div>
          <div className="corner-copy">
            <small>{item.type === 'playlist' ? '歌单' : item.year || '唱片'}{speed === 45 ? ' · 45 转加速' : ''}</small>
            <h2 title={item.title}>{displayTitle(item.title)}</h2>
            <p title={names[trackIndex]}>{String(trackIndex + 1).padStart(2, '0')} · {displayTitle(audible && playback.actualTrack || names[trackIndex] || '原始资料暂无曲目')}</p>
            <p className="corner-artist">{item.type === 'playlist' ? trackArtist(item, trackIndex) : item.artist}</p>
          </div>
          <div className="corner-transport">
            <button type="button" aria-label="上一首" disabled={!player?.canPrevious} onClick={() => player?.previous()}><ChevronLeft size={18}/></button>
            <button type="button" className="corner-play" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>
            <button type="button" aria-label="下一首" disabled={!player?.canNext} onClick={() => player?.next()}><ChevronRight size={18}/></button>
            <span className="corner-time">{audible && playback.duration ? `${clock(position)} / ${clock(playback.duration)}` : provider === 'visual' ? '仅动画 · 无音频' : ''}</span>
          </div>
          {audible && playback.statusText && !playback.playing && <p className="corner-status" role="status">{playback.statusText}</p>}
          <ol ref={list} className="corner-tracks" aria-label="本面曲目">{names.map((name, index) => <li key={index}><button type="button" aria-current={index === trackIndex ? 'true' : undefined} onClick={() => setTrackIndex(index)}><b>{String(index + 1).padStart(2, '0')}</b><span>{displayTitle(name)}</span><small>{lengths[index] ? formatDuration(lengths[index]) : ''}</small></button></li>)}</ol>
        </> : <p className="corner-empty-side">唱机上还没有唱片。</p>}
      </aside>
    </div>
    {items.length > 0 && <nav className="corner-crate" aria-label="唱片箱">
      <div className="corner-crate-tools"><label>唱片箱<input type="search" aria-label="查找唱片箱" placeholder="唱片或歌手" value={query} onChange={event => setQuery(event.target.value)}/></label><span className="corner-crate-status" role="status">{notice || `待播 ${player?.queue.ids.length || 0} 张 · ${matches.length} 张匹配`}</span></div>
      {player?.queueError && <p role="alert">{player.queueError}</p>}
      {!matches.length && <p>没有找到匹配唱片，换个关键词试试。</p>}
      {matches.length > 120 && <small>显示前 120 张，搜索可以查找全部 {items.length} 张。</small>}
      <ul>{crate.map((entry) => <li key={entry.id}><button type="button" className={entry.id === item?.id ? 'is-current' : ''} aria-label={`放上《${entry.title}》`} title={`${entry.title} · ${entry.artist}`} onClick={(event) => pick(entry, event)}>
        {entry.cover ? <img src={entry.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/> : <span className="corner-crate-blank"/>}
        <span className="corner-crate-copy">{entry.title}</span>
      </button>{entry.id !== item?.id && player && <button type="button" className="corner-crate-queue" aria-label={`加入待播 ${entry.title}`} disabled={player.queue.ids.includes(entry.id)} onClick={event => queueRecord(entry, event)}>{player.queue.ids.includes(entry.id) ? '已入队' : '+ 待播'}</button>}</li>)}</ul>
    </nav>}
  </section>, document.querySelector('.cabin-room') || document.body);
}
