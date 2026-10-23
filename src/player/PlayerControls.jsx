import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X, SpeakerWave, SpeakerOff, Loading, Music2, RepeatPixel, RepeatOnePixel, ShufflePixel, PlayPixel, PausePixel, PreviousPixel, NextPixel, EjectPixel, Heart, Play, Trash2, Up, Down, Clock, GripPixel } from '../icons';
import { trackNames } from '../room-model.mjs';
import { trackArtist } from '../track-meta.mjs';
import { displayTitle } from '../display-title.mjs';
import { formatSeconds } from '../lib/time-format.mjs';
import { ariaKeys } from '../shortcuts.mjs';
import { usePlaybackDuration, usePlaybackPosition } from '../deck/usePlaybackClock';
import { deckCapabilities } from './providers.mjs';
import { volumePercent, wheelVolume } from './volume-curve.mjs';
import './player.css';
import './pocket-player.css';

const REPEAT_LABEL = { off: '顺序播放', all: '整张循环', one: '单曲循环' };

// The deck's transport, built like a pocket music player: a click wheel
// (待播 on top, previous / next at the sides, eject at the bottom, play in the
// middle), hardware keys with lights for repeat, shuffle and 喜欢, the track
// list and a volume slider. Progress lives on the screen (PocketProgress).
// Labels are stable — tests and screen readers depend on them.
const REPEAT_SHORT = { off: '顺序', all: '循环', one: '单曲' };
const two = (index) => String(index + 1).padStart(2, '0');
const sameItem = (a, b) => Boolean(a && b) && String(a.id) === String(b.id);
// Dragging the thumb only previews the time; the seek happens once, on release
// (or on the native change event a programmatic fill fires), so the thumb no
// longer jumps back with every timeupdate. Arrow keys seek 5 s (usePlayerShortcuts,
// `data-deck-seek`); a source that cannot seek shows a read-only bar.
export function PocketProgress({ playback, readOnly = false }) {
  const duration = usePlaybackDuration(playback), playhead = usePlaybackPosition(playback, .1);
  const [scrub, setScrub] = useState(null), pending = useRef(null), input = useRef(null);
  const commit = () => { const value = pending.current; pending.current = null; setScrub(null); if (value !== null) playback?.seek(value); };
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => { const element = input.current, change = () => commitRef.current(); element?.addEventListener('change', change); return () => element?.removeEventListener('change', change); }, []);
  const position = Math.min(scrub ?? playhead, duration || 1);
  return <div className={`pocket-progress${readOnly ? ' is-read-only' : ''}`}>
    <input ref={input} type="range" data-deck-seek="" aria-label="音乐播放进度" aria-valuetext={`${formatSeconds(position)} / ${formatSeconds(duration)}`} min="0" max={duration || 1} step=".1" value={position} disabled={!duration || readOnly} title={readOnly ? '这个音源只显示进度，拖动请在它自己的播放器里进行' : undefined} onChange={(event) => { pending.current = Number(event.target.value); setScrub(pending.current); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit} style={{ '--player-progress': `${duration ? Math.min(100, position / duration * 100) : 0}%` }}/>
    <small><span>{formatSeconds(position)}</span><span>-{formatSeconds(Math.max(0, duration - position))}</span></small>
  </div>;
}
// 系统正在播放: the system player's position (interpolated between polls), read only.
export function SystemProgress({ timeline }) {
  const subscribe = (fn) => { const off = timeline?.subscribe?.(fn) || (() => {}); const timer = setInterval(fn, 500); return () => { off(); clearInterval(timer); }; };
  const position = useSyncExternalStore(subscribe, () => Math.floor(timeline?.position?.() || 0), () => 0);
  const duration = useSyncExternalStore(subscribe, () => timeline?.getSnapshot?.().duration || 0, () => 0);
  if (!duration) return null;
  return <div className="pocket-progress is-read-only">
    <input type="range" aria-label="系统播放进度" min="0" max={duration} value={Math.min(position, duration)} disabled readOnly style={{ '--player-progress': `${Math.min(100, position / duration * 100)}%` }}/>
    <small><span>{formatSeconds(position)}</span><span>-{formatSeconds(Math.max(0, duration - position))}</span></small>
  </div>;
}

// 曲目: a button showing the song, opening a scrollable list of every track.
// Songs that just failed are greyed with the reason; they can still be tried.
function TrackPicker({ item, names, trackIndex, track, reasonFor }) {
  const [open, setOpen] = useState(false), button = useRef(null), list = useRef(null);
  useEffect(() => { if (!open) return; const current = list.current?.querySelector('[aria-selected=true]') || list.current?.querySelector('[role=option]'); current?.scrollIntoView({ block: 'center' }); current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => { if (!open) return; const away = (event) => { if (!event.target.closest?.('.pocket-track')) setOpen(false); }; document.addEventListener('pointerdown', away); return () => document.removeEventListener('pointerdown', away); }, [open]);
  const close = () => { setOpen(false); button.current?.focus({ preventScroll: true }); };
  const keys = (event) => {
    const options = [...(list.current?.querySelectorAll('[role=option]') || [])], at = options.indexOf(document.activeElement);
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key];
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); options[event.key === 'Home' ? 0 : options.length - 1]?.focus(); }
    else if (move) { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, (at < 0 ? trackIndex : at) + move))]?.focus(); }
  };
  const current = names[trackIndex] || '';
  return <div className={`pocket-track${open ? ' is-open' : ''}`}>
    <span>曲目</span>
    <button ref={button} type="button" className="pocket-track-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`选择曲目：${two(trackIndex)} · ${current}`} title={current} onClick={() => setOpen(!open)}><b>{two(trackIndex)}</b><em>{displayTitle(current)}</em><Down size={12}/></button>
    {open && <div ref={list} className="pocket-tracklist" role="listbox" aria-label="唱机展示曲目" onKeyDown={keys}>
      {names.map((name, index) => { const reason = reasonFor?.(index) || '', artist = item?.type === 'playlist' ? trackArtist(item, index) : ''; return <button type="button" role="option" key={index} aria-selected={index === trackIndex} tabIndex={-1} className={reason ? 'is-unplayable' : undefined} title={reason ? `${name} · ${reason}` : name} onClick={() => { track?.(index); close(); }}>
        <b>{two(index)}</b><span><strong>{displayTitle(name)}</strong>{(artist || reason) && <small>{reason ? `暂不可播 · ${reason}` : artist}</small>}</span>
      </button>; })}
    </div>}
  </div>;
}

// 待播: what plays next (the decided next song, queued songs, queued records),
// drag or Alt+↑/↓ to reorder, 立即播放, 置顶, 清空, and 最近播放.
function QueuePanel({ item, names, trackIndex, track, player, panel, close, reasonFor }) {
  const [view, setView] = useState('queue'), [notice, setNotice] = useState(''), [dragging, setDragging] = useState(null), [over, setOver] = useState(null);
  const upNext = player.upNext || [], entries = upNext.filter((entry) => entry.kind === 'track' || entry.kind === 'album');
  const songs = entries.filter((entry) => entry.kind === 'track'), albums = entries.filter((entry) => entry.kind === 'album');
  const decided = upNext.find((entry) => entry.kind === 'next' || entry.kind === 'resume');
  const shuffle = player.queue.shuffle, repeatOne = player.queue.repeat === 'one';
  const songName = (entry) => trackNames(entry.item)[entry.index] || entry.item.title;
  const move = (entry, to) => { if (to < 0 || to >= player.queue.ids.length || !player.move(entry.position, to)) return; setNotice(`已移到第 ${to + 1} 位`); };
  const row = (entry, label, body) => <li key={entry.key} draggable className={`${dragging === entry.position ? 'is-dragging' : ''}${over === entry.position && dragging !== entry.position ? ' is-drop-target' : ''}`}
    onDragStart={(event) => { setDragging(entry.position); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(entry.position)); }}
    onDragOver={(event) => { if (dragging === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(entry.position); }}
    onDragLeave={() => setOver((value) => value === entry.position ? null : value)}
    onDrop={(event) => { event.preventDefault(); if (dragging !== null && dragging !== entry.position) move({ position: dragging }, entry.position); setDragging(null); setOver(null); }}
    onDragEnd={() => { setDragging(null); setOver(null); }}>
    <button type="button" className="player-queue-grip" aria-label={`拖动排序 ${label}`} title="拖动排序 · Alt+↑/↓" onKeyDown={(event) => { if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); move(entry, entry.position + (event.key === 'ArrowUp' ? -1 : 1)); }}><GripPixel size={12}/></button>
    {body}
    <button type="button" className="player-queue-now" aria-label={`立即播放 ${label}`} title="立即播放" onClick={() => { if (player.playNow(entry.entry)) setNotice(`正在播放 ${label}`); }}><Play size={12}/></button>
    {entry.position > 0 && <button type="button" className="player-queue-promote" aria-label={`${entry.kind === 'album' ? '下一张播' : '下一首播'} ${label}`} onClick={() => { if (!player.playNext(entry.entry)) { setNotice(''); return; } setNotice(`${label}已移到待播首位`); }}>置顶</button>}
    <button type="button" aria-label={`从待播移除 ${label}`} onClick={() => player.remove(entry.entry)}><X size={12}/></button>
  </li>;
  const listens = (player.listens || []).slice(0, 20);
  return <div ref={panel} className="player-queue" role="region" aria-label="待播唱片" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <div className="player-queue-header"><span className="player-queue-tabs" role="group" aria-label="待播视图"><button type="button" aria-pressed={view === 'queue'} onClick={() => setView('queue')}><strong>待播</strong></button><button type="button" aria-pressed={view === 'history'} aria-label="最近播放" onClick={() => setView('history')}><Clock size={12}/>最近</button></span>{view === 'queue' && entries.length > 0 && <button type="button" className="player-queue-clear" aria-label="清空待播" title="清空待播" onClick={() => { if (player.clear()) setNotice('待播已清空'); }}><Trash2 size={12}/></button>}<button type="button" aria-label="关闭待播" onClick={close}><X size={16}/></button></div>
    {view === 'history' ? (listens.length ? <ol className="player-queue-history">{listens.map((entry) => <li key={`${entry.id}:${entry.index}:${entry.at}`}><button type="button" className="player-queue-jump" aria-label={`再听一次 ${entry.title}`} onClick={() => { if (player.playListen(entry)) setNotice(`再听一次《${entry.title}》`); else setNotice('这张唱片已不在唱片架上'); }}><span title={`${entry.title} · ${entry.artist}`}><strong>{displayTitle(entry.title)}</strong><small>{entry.artist}</small></span><time>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></button></li>)}</ol> : <p className="player-queue-state">还没有听过的歌。放一首，它会出现在这里。</p>)
    : <>
      {player.solo && <p className="player-queue-state">正在放待播里的单曲{decided?.kind === 'resume' ? ` · 之后回到《${decided.item.title}》第 ${decided.index + 1} 首` : ''}</p>}
      {!repeatOne && !shuffle && !player.solo && songs.length === 0 && names.length > trackIndex + 1 && <><small className="player-queue-title">接下来 · 本张</small><ol className="player-queue-tracks">{names.slice(trackIndex + 1, trackIndex + 6).map((name, offset) => { const index = trackIndex + offset + 1, reason = reasonFor?.(index); return <li key={offset} className={reason ? 'is-unplayable' : undefined}><button type="button" className="player-queue-jump" aria-label={`跳到第 ${index + 1} 首 ${name}`} title={reason ? `${name} · ${reason}` : name} onClick={() => track?.(index)}><b>{two(index)}</b><span>{displayTitle(name)}{reason && <small>暂不可播</small>}</span></button></li>; })}</ol>{names.length > trackIndex + 6 && <small className="player-queue-more">还有 {names.length - trackIndex - 6} 首</small>}</>}
      {repeatOne && <p className="player-queue-state">单曲循环中 · 切换为顺序播放后继续待播</p>}
      {!repeatOne && shuffle && <><small className="player-queue-title">本张随机播放中 · 每首放一次，放完进入待播</small>{decided?.kind === 'next' && sameItem(decided.item, item) && songs.length === 0 && <ol className="player-queue-tracks"><li><button type="button" className="player-queue-jump" aria-label={`跳到第 ${decided.index + 1} 首 ${names[decided.index]}`} onClick={() => track?.(decided.index)}><b>{two(decided.index)}</b><span>{displayTitle(names[decided.index])}<small>下一首</small></span></button></li></ol>}</>}
      {songs.length > 0 && <><small className="player-queue-title">接下来 · 单曲 {songs.length}</small><ol className="player-queue-songs">{songs.map((entry, index) => { const name = songName(entry), reason = sameItem(entry.item, item) ? reasonFor?.(entry.index) : ''; return row(entry, `《${name}》`, <span className={reason ? 'is-unplayable' : undefined} title={`${name} · ${entry.item.title}${reason ? ` · ${reason}` : ''}`}><strong>{displayTitle(name)}</strong><small>{index === 0 ? '下一首' : `第 ${index + 1} 首`} · {trackArtist(entry.item, entry.index) || entry.item.title}{reason ? ' · 暂不可播' : ''}</small></span>); })}</ol></>}
      <small className="player-queue-title">待播唱片{albums.length ? ` · ${albums.length}` : ''}</small>
      {albums.length ? <ol className="player-queue-albums">{albums.map((entry, index) => row(entry, entry.item.title, <>{entry.item.cover ? <img src={entry.item.cover} alt="" referrerPolicy="no-referrer"/> : <Music2 size={20}/>}<span title={`${entry.item.title} · ${entry.item.artist}`}><strong>{entry.item.title}</strong><small>{index === 0 ? '下一张' : `第 ${index + 1} 张`} · {entry.item.artist}</small></span></>))}</ol>
        : <p>待播里还没有唱片。在唱片架选中一张，点「加入待播」，或在歌单里给一首歌点「下一首播放」，就会接着放。</p>}
    </>}
    {notice && <small className="player-queue-notice" role="status">{notice}</small>}
  </div>;
}

// The volume row: a perceptual slider (volume-curve.mjs), the wheel adjusts it, a % readout.
function VolumeRow({ playback }) {
  const row = useRef(null), latest = useRef(playback); latest.current = playback;
  useEffect(() => { const node = row.current; if (!node) return; const wheel = (event) => { event.preventDefault(); const pb = latest.current; pb.setVolume(wheelVolume(pb.muted ? 0 : pb.volume, event.deltaY)); }; node.addEventListener('wheel', wheel, { passive: false }); return () => node.removeEventListener('wheel', wheel); }, []);
  const value = playback.muted ? 0 : playback.volume, percent = volumePercent(value);
  return <div ref={row} className="turntable-audio-sliders pocket-volume" title="滚轮也可以调节音量">
    <label className="player-volume"><button type="button" className="player-mute" aria-label={playback.muted ? '取消静音' : '静音'} title="静音 · M" aria-keyshortcuts={ariaKeys('mute')} aria-pressed={playback.muted} onClick={() => playback.setMuted(!playback.muted)}>{playback.muted || playback.volume === 0 ? <SpeakerOff size={14}/> : <SpeakerWave size={14}/>}</button>音量<input type="range" aria-label="音乐音量" aria-valuetext={`${percent}%`} min="0" max="1" step=".01" value={value} style={{ '--player-volume': `${percent}%` }} onChange={(event) => playback.setVolume(Number(event.target.value))}/><output className="player-volume-readout" aria-hidden="true">{percent}%</output></label>
  </div>;
}

export default function PlayerControls({ item, items = [], provider, spinning, trackIndex, track, toggle, eject, playback, player, setProvider }) {
  const [queueOpen, setQueueOpen] = useState(false), names = trackNames(item);
  const queuePanel = useRef(null), queueButton = useRef(null);
  useEffect(() => { if (queueOpen) { queuePanel.current?.focus({ preventScroll: true }); queuePanel.current?.scrollIntoView({ block: 'nearest' }); } }, [queueOpen]);
  const closeQueue = () => { setQueueOpen(false); queueButton.current?.focus({ preventScroll: true }); queueButton.current?.scrollIntoView({ block: 'nearest' }); };
  const visual = provider === 'visual', audible = !visual && playback, caps = deckCapabilities(provider, { remote: playback?.remote });
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const playing = visual ? spinning : Boolean(playback?.playing);
  const entries = (player?.upNext || []).filter((entry) => entry.kind === 'track' || entry.kind === 'album');
  const albumCount = entries.filter((entry) => entry.kind === 'album').length, songCount = entries.length - albumCount;
  const queueLabel = songCount ? `待播 ${entries.length} 项` : `待播唱片 ${albumCount} 张`;
  const failed = audible && playback.status === 'error' && playback.error;
  const reasonFor = (index) => audible ? playback.blockedReason?.(item, index) || (index === trackIndex && failed ? playback.error : '') : '';
  return <div className="player-controls pocket-controls">
    <div className="turntable-controls pocket-deck">
      <div className="pocket-wheel">
        {player ? <button ref={queueButton} type="button" className="pocket-wheel-key is-top player-mode" aria-label={queueLabel} title="待播与最近播放" aria-expanded={queueOpen} onClick={() => queueOpen ? closeQueue() : setQueueOpen(true)}>待播{entries.length > 0 && <b>{entries.length}</b>}</button> : <span className="pocket-wheel-key is-top" aria-hidden="true">MENU</span>}
        <button type="button" className="pocket-wheel-key is-left" aria-label="上一首展示曲目" title="上一首 · Shift+←" aria-keyshortcuts="Shift+ArrowLeft" disabled={!player?.canPrevious} onClick={() => player?.previous()}><PreviousPixel/></button>
        <button type="button" className="pocket-wheel-key is-right" aria-label="下一首展示曲目" title="下一首 · Shift+→" aria-keyshortcuts="Shift+ArrowRight" disabled={!player?.canNext} onClick={() => player?.next()}><NextPixel/></button>
        <button type="button" className="pocket-wheel-key is-bottom" aria-label="取下唱片" title="取下唱片" onClick={eject}><EjectPixel size={20}/></button>
        <button type="button" className={`turntable-toggle pocket-center ${busy ? 'is-busy' : ''} ${playing ? 'is-playing' : ''}`} aria-label={visual ? spinning ? '暂停唱片旋转' : '继续唱片旋转' : playing ? '暂停音乐播放' : '播放音乐'} title="播放 / 暂停 · 空格" disabled={!visual && playback?.handoff} onClick={visual ? toggle : playback?.toggle}>{busy ? <Loading size={22} className="player-spin"/> : playing ? <PausePixel/> : <PlayPixel/>}</button>
      </div>
      {player && <span className="player-modes pocket-keys">
        <button type="button" className="player-mode pocket-key" aria-label={`播放模式：${REPEAT_LABEL[player.queue.repeat]}`} title={`${REPEAT_LABEL[player.queue.repeat]} · R`} aria-keyshortcuts={ariaKeys('repeat')} aria-pressed={player.queue.repeat !== 'off'} data-mode={player.queue.repeat} onClick={player.cycleRepeat}><i className="pocket-led" aria-hidden="true"/>{player.queue.repeat === 'one' ? <RepeatOnePixel/> : <RepeatPixel/>}<small>{REPEAT_SHORT[player.queue.repeat]}</small></button>
        <button type="button" className="player-mode pocket-key" aria-label="随机播放本张" title="本张随机 · S" aria-keyshortcuts={ariaKeys('shuffle')} aria-pressed={player.queue.shuffle} onClick={player.toggleShuffle}><i className="pocket-led" aria-hidden="true"/><ShufflePixel/><small>随机</small></button>
        {player.toggleLiked && <button type="button" className="player-mode pocket-key pocket-like" aria-label={player.liked ? '取消喜欢这首' : '喜欢这首'} title={player.liked ? '已喜欢 · 只保存在这台设备' : '喜欢这首 · 只保存在这台设备'} aria-pressed={Boolean(player.liked)} onClick={player.toggleLiked}><i className="pocket-led" aria-hidden="true"/><Heart/><small>喜欢</small></button>}
      </span>}
      {!!names.length && <TrackPicker item={item} names={names} trackIndex={trackIndex} track={track} reasonFor={reasonFor}/>}
    </div>
    {queueOpen && player && <QueuePanel item={item} names={names} trackIndex={trackIndex} track={track} player={player} panel={queuePanel} close={closeQueue} reasonFor={reasonFor}/>}
    {player?.queueError && <p className="player-error" role="alert">{player.queueError}</p>}
    {failed && <div className="player-error" role="alert"><span>{playback.error}</span><span className="player-error-actions"><button type="button" onClick={playback.retry}>重试</button><button type="button" onClick={() => window.dispatchEvent(new Event('cabin-open-music-settings'))}>音源设置</button></span></div>}
    {visual && item && <p className="player-visual-note">点上方「仅展示」选个出声的音源</p>}
    {audible && item && caps.volume && <VolumeRow playback={playback}/>}
    {audible && item && !caps.volume && <p className="player-visual-note">音量与拖动进度请在{provider === 'ma' ? '家庭播放器' : '「音乐」App'}里调节</p>}
  </div>;
}
