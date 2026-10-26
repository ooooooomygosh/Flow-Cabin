import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useFocus } from '../focus/useFocus';
import { formatClock } from '../focus/focus-model.mjs';
import { PlayPixel, PausePixel, PreviousPixel, NextPixel, QueueList, SpeakerWave, SpeakerOff, Loading, Clock, Music2, Album } from '../icons';
import { QueuePanel } from '../player/PlayerControls';
import { deckCapabilities } from '../player/providers.mjs';
import { volumePercent, wheelVolume } from '../player/volume-curve.mjs';
import { usePlaybackDuration, usePlaybackPosition } from '../deck/usePlaybackClock';
import { formatSeconds } from '../lib/time-format.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist, trackAlbum } from '../track-meta.mjs';
import { displayTitle } from '../display-title.mjs';
import { nowLine, recentRecords } from './listen-model.mjs';
import { useLyricLine, FadeLine, Cover, usePopover, HeartIcon } from './listen-hooks';
import './listen.css';

// 正在播放条 (docs/design/3.0-design.md §6.2): always at the bottom of the cabin home.
// Left: the record (→ 唱机特写), the song and one calm line of lyric. Centre: the
// transport and a thin progress bar (read only where the source cannot seek). Right:
// ♥, 歌词, 待播, 音量 and 「开始这一段」. Space keeps meaning play / pause (usePlayerShortcuts).
const startFocus = () => window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: 'focus-start' } }));

function SeekBar({ playback, seekable }) {
  const duration = usePlaybackDuration(playback), playhead = usePlaybackPosition(playback, .25);
  const [scrub, setScrub] = useState(null), pending = useRef(null), input = useRef(null);
  const commit = () => { const value = pending.current; pending.current = null; setScrub(null); if (value !== null) playback?.seek(value); };
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => { const element = input.current, change = () => commitRef.current(); element?.addEventListener('change', change); return () => element?.removeEventListener('change', change); }, []);
  const position = Math.min(scrub ?? playhead, duration || 1), percent = duration ? Math.min(100, position / duration * 100) : 0;
  return <div className={`listen-progress${seekable ? '' : ' is-read-only'}`} style={{ '--listen-progress': `${percent}%` }}>
    <small aria-hidden="true">{formatSeconds(position)}</small>
    {seekable ? <input ref={input} type="range" data-deck-seek="" aria-label="播放进度" aria-valuetext={`${formatSeconds(position)} / ${formatSeconds(duration)}`} min="0" max={duration || 1} step=".1" value={position} disabled={!duration} onChange={(event) => { pending.current = Number(event.target.value); setScrub(pending.current); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit}/>
      : <span className="listen-progress-track" role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={`${formatSeconds(position)} / ${formatSeconds(duration)}`} title="这个音源只显示进度，拖动请在它自己的播放器里进行"><i/></span>}
    <small aria-hidden="true">{formatSeconds(duration)}</small>
  </div>;
}
// 系统正在播放: the system player's position (interpolated between polls), read only.
function SystemBar({ timeline }) {
  const subscribe = (fn) => { const off = timeline?.subscribe?.(fn) || (() => {}); const timer = setInterval(fn, 500); return () => { off(); clearInterval(timer); }; };
  const position = useSyncExternalStore(subscribe, () => Math.floor(timeline?.position?.() || 0), () => 0);
  const duration = useSyncExternalStore(subscribe, () => timeline?.getSnapshot?.().duration || 0, () => 0);
  if (!duration) return <div className="listen-progress is-empty" aria-hidden="true"/>;
  return <div className="listen-progress is-read-only" style={{ '--listen-progress': `${Math.min(100, position / duration * 100)}%` }}><small aria-hidden="true">{formatSeconds(position)}</small><span className="listen-progress-track" role="progressbar" aria-label="系统播放进度" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(position, duration)}><i/></span><small aria-hidden="true">{formatSeconds(duration)}</small></div>;
}

function VolumeButton({ playback }) {
  const pop = usePopover(), latest = useRef(playback); latest.current = playback;
  useEffect(() => { const node = pop.button.current; if (!node) return; const wheel = (event) => { event.preventDefault(); const pb = latest.current; pb.setVolume(wheelVolume(pb.muted ? 0 : pb.volume, event.deltaY)); }; node.addEventListener('wheel', wheel, { passive: false }); return () => node.removeEventListener('wheel', wheel); }, []);
  const value = playback.muted ? 0 : playback.volume, percent = volumePercent(value), silent = playback.muted || !playback.volume;
  return <span className="listen-pop-anchor">
    <button ref={pop.button} type="button" className="listen-icon" aria-label={`音量 ${percent}%`} title="音量 · 滚轮调节 · M 静音" aria-expanded={pop.open} onClick={pop.toggle}>{silent ? <SpeakerOff size={16}/> : <SpeakerWave size={16}/>}</button>
    {pop.open && <div ref={pop.panel} className="listen-pop listen-volume" role="group" aria-label="音量" tabIndex={-1}>
      <button type="button" className="listen-icon" aria-label={playback.muted ? '取消静音' : '静音'} aria-pressed={Boolean(playback.muted)} onClick={() => playback.setMuted(!playback.muted)}>{silent ? <SpeakerOff size={14}/> : <SpeakerWave size={14}/>}</button>
      <input data-autofocus type="range" aria-label="音乐音量" aria-valuetext={`${percent}%`} min="0" max="1" step=".01" value={value} style={{ '--listen-progress': `${percent}%` }} onChange={(event) => playback.setVolume(Number(event.target.value))}/>
      <output aria-hidden="true">{percent}%</output>
    </div>}
  </span>;
}

function QueueButton({ item, trackIndex, setTrackIndex, player, playback, provider }) {
  const pop = usePopover(), panel = useRef(null), names = trackNames(item);
  const entries = (player?.upNext || []).filter((entry) => entry.kind === 'track' || entry.kind === 'album');
  const audible = provider !== 'visual' && provider !== 'system' && playback;
  const reasonFor = (index) => audible ? playback.blockedReason?.(item, index) || '' : '';
  return <span className="listen-pop-anchor">
    <button ref={pop.button} type="button" className="listen-icon" aria-label={entries.length ? `待播 ${entries.length} 项` : '待播与最近播放'} title="待播与最近播放" aria-expanded={pop.open} onClick={pop.toggle}><QueueList size={16}/>{entries.length > 0 && <b className="listen-badge">{entries.length}</b>}</button>
    {pop.open && <div ref={pop.panel} className="listen-pop listen-queue" tabIndex={-1}><QueuePanel item={item} names={names} trackIndex={trackIndex} track={setTrackIndex} player={player} panel={panel} close={pop.close} reasonFor={reasonFor}/></div>}
  </span>;
}

// 「开始这一段」: the same command the tray, the desktop pet and the widgets send
// (album-companion-command › focus-start, src/focus/useFocus.jsx). While a round runs,
// it shows the time left and opens the focus panel.
function FocusButton({ open }) {
  const focus = useFocus(), phase = focus?.state?.timer?.phase || 'idle', paused = Boolean(focus?.state?.timer?.paused);
  if (!focus) return null;
  if (phase === 'idle') return <button type="button" className="listen-focus" onClick={startFocus} title="用上次的时长开始一段专注"><Clock size={14}/><span>开始这一段</span></button>;
  const left = formatClock(focus.remaining), label = phase === 'focus' ? (paused ? '专注暂停' : '专注中') : '休息中';
  return <button type="button" className="listen-focus is-running" aria-label={`${label} · 还剩 ${left} · 打开专注`} onClick={() => open('timer')}><Clock size={14}/><span>{label}</span><time>{left}</time></button>;
}

function EmptyBar({ commands, player, items }) {
  const recent = recentRecords(player?.listens, items, 3);
  return <div className="listen-bar-host"><div className="listen-bar is-empty" role="region" aria-label="正在播放">
    <div className="listen-empty">
      <span className="listen-empty-text"><strong>今天想听什么？</strong><small>{recent.length ? '接着听最近的唱片，或者放一张新的。' : items.length ? '从唱片架选一张喜欢的。' : '架子还空着，先放上第一张唱片。'}</small></span>
      {recent.length > 0 && <ul className="listen-recent" aria-label="最近播放的唱片">{recent.map((entry) => <li key={entry.id}><button type="button" className="listen-recent-cover" aria-label={`接着听 ${entry.item.title}${entry.title && entry.title !== entry.item.title ? ` · ${entry.title}` : ''}`} title={`${entry.item.title} · ${entry.title}`} onClick={() => { if (!player.playListen(entry)) commands.open('library'); }}><Cover item={entry.item}/><PlayPixel size={14}/></button></li>)}</ul>}
      <button type="button" className="listen-primary" onClick={() => commands.open('library')}><Album size={16}/>放一张唱片</button>
    </div>
    <FocusButton open={commands.open}/>
  </div></div>;
}

export default function NowPlayingBar() {
  const { deck, items, commands } = useCabinRuntime();
  const { deckItem: item, record, provider, playback, player, system } = deck;
  const follow = provider === 'system', visual = provider === 'visual';
  const playing = follow ? Boolean(system?.playing) : visual ? deck.spinning : Boolean(playback?.playing);
  const lyric = useLyricLine(Boolean(item) && !visual);
  if (!item || (follow && !system?.active)) return <EmptyBar commands={commands} player={player} items={items}/>;
  const index = deck.shownTrackIndex;
  const title = follow ? system.title || item.title : deck.actualTrack || trackNames(record)[index] || item.title || '';
  const artist = follow ? system.artist || '' : trackArtist(record, index) || playback?.resolvedArtist || item.artist || '';
  const album = follow ? system.album || '' : trackAlbum(record, index) || playback?.resolvedAlbum || '';
  const caps = deckCapabilities(provider, { remote: playback?.remote });
  const busy = !follow && !visual && ['loading', 'searching', 'buffering'].includes(playback?.status);
  const failed = !follow && !visual && playback?.status === 'error' ? playback.error || '这首暂时放不了' : '';
  const line = failed || nowLine({ lyric, album, record: item.type === 'playlist' ? item.title : '', status: visual ? '仅展示 · 无音频' : deck.statusText });
  const likeable = !follow && Boolean(record);
  const toggle = () => failed ? playback.retry() : commands.play();
  return <div className="listen-bar-host"><div className={`listen-bar${playing ? ' is-playing' : ''}`} role="region" aria-label="正在播放" data-provider={provider}>
    <div className="listen-now">
      <button type="button" className="listen-cover-button" aria-label={`打开唱机特写：${item.title}`} title="唱机特写 · T" onClick={() => window.dispatchEvent(new Event('cabin-open-corner'))}><Cover item={item}/></button>
      <button type="button" className="listen-meta" aria-label={`唱机旁：${title}${artist ? ` · ${artist}` : ''}`} title="打开唱机旁：音源、曲目与播放模式" onClick={() => commands.open('music')}>
        <strong>{displayTitle(title)}{artist && <span className="listen-artist"> · {artist}</span>}</strong>
        <FadeLine text={line} className={`listen-line${failed ? ' is-error' : lyric ? ' is-lyric' : ''}`}/>
      </button>
    </div>
    <div className="listen-transport">
      <div className="listen-keys">
        <button type="button" className="listen-icon listen-skip" aria-label="上一首歌" title="上一首 · Shift+←" disabled={!follow && !player?.canPrevious} onClick={commands.previous}><PreviousPixel/></button>
        <button type="button" className={`listen-play${busy ? ' is-busy' : ''}`} aria-label={failed ? '重试这首' : playing ? '暂停播放' : '继续播放'} title="播放 / 暂停 · 空格" aria-keyshortcuts="Space" disabled={!follow && !visual && playback?.handoff} onClick={toggle}>{busy ? <Loading size={18} className="listen-spin"/> : playing ? <PausePixel/> : <PlayPixel/>}</button>
        <button type="button" className="listen-icon listen-skip" aria-label="下一首歌" title="下一首 · Shift+→" disabled={!follow && !player?.canNext} onClick={commands.next}><NextPixel/></button>
      </div>
      {follow ? <SystemBar timeline={system.timeline}/> : caps.progress && playback ? <SeekBar playback={playback} seekable={caps.seek}/> : <div className="listen-progress is-empty" aria-hidden="true"/>}
    </div>
    <div className="listen-actions">
      {likeable && <button type="button" className="listen-icon listen-like" aria-label="喜欢这首歌" aria-pressed={Boolean(deck.liked)} title={deck.liked ? '已在「我喜欢」· 再点一下取消' : '喜欢这首 · 收进「我喜欢」'} onClick={deck.toggleLiked}><HeartIcon filled={Boolean(deck.liked)}/></button>}
      <button type="button" className="listen-icon listen-lyrics" aria-label="歌词" title="沉浸歌词" onClick={() => commands.open('lyrics')}><Music2 size={16}/></button>
      {!follow && player && <QueueButton item={record} trackIndex={deck.trackIndex} setTrackIndex={deck.setTrackIndex} player={player} playback={playback} provider={provider}/>}
      {!follow && !visual && caps.volume && playback && <VolumeButton playback={playback}/>}
      <FocusButton open={commands.open}/>
    </div>
  </div></div>;
}
