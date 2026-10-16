import React, { useEffect, useRef, useState } from 'react';
import { X, SpeakerWave, SpeakerOff, Loading, Music2, RepeatPixel, RepeatOnePixel, ShufflePixel, PlayPixel, PausePixel, PreviousPixel, NextPixel, EjectPixel } from '../icons';
import { trackNames } from '../room-model.mjs';
import { displayTitle } from '../display-title.mjs';
import { formatSeconds } from '../lib/time-format.mjs';
import './player.css';
import './pocket-player.css';

const REPEAT_LABEL = { off: '顺序播放', all: '整张循环', one: '单曲循环' };

// The deck's transport, built like a pocket music player: a click wheel
// (待播 on top, previous / next at the sides, eject at the bottom, play in the
// middle), two hardware keys with lights for repeat and shuffle, the track
// selector and a volume slider. Progress lives on the screen (PocketProgress).
// Labels are stable — tests and screen readers depend on them.
const REPEAT_SHORT = { off: '顺序', all: '循环', one: '单曲' };
export function PocketProgress({ playback }) {
  const duration = playback?.duration || 0, position = Math.min(playback?.position || 0, duration || 1);
  return <div className="pocket-progress">
    <input type="range" aria-label="音乐播放进度" min="0" max={duration || 1} step=".1" value={position} disabled={!duration} onChange={(event) => playback.seek(Number(event.target.value))} style={{ '--player-progress': `${duration ? Math.min(100, position / duration * 100) : 0}%` }}/>
    <small><span>{formatSeconds(position)}</span><span>-{formatSeconds(Math.max(0, duration - position))}</span></small>
  </div>;
}
export default function PlayerControls({ item, items = [], provider, spinning, trackIndex, track, toggle, eject, playback, player, setProvider }) {
  const [queueOpen, setQueueOpen] = useState(false), [queueNotice, setQueueNotice] = useState(''), names = trackNames(item);
  const queuePanel = useRef(null), queueButton = useRef(null);
  useEffect(() => { if (queueOpen) { queuePanel.current?.focus({ preventScroll: true }); queuePanel.current?.scrollIntoView({ block: 'nearest' }); } }, [queueOpen]);
  const closeQueue = () => { setQueueOpen(false); queueButton.current?.focus({ preventScroll: true }); queueButton.current?.scrollIntoView({ block: 'nearest' }); };
  const visual = provider === 'visual', audible = !visual && playback;
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const playing = visual ? spinning : Boolean(playback?.playing);
  const queued = (player?.queue.ids || []).map((id) => items.find((entry) => entry.id === id)).filter(Boolean);
  const failed = audible && playback.status === 'error' && playback.error;
  return <div className="player-controls pocket-controls">
    <div className="turntable-controls pocket-deck">
      <div className="pocket-wheel">
        {player ? <button ref={queueButton} type="button" className="pocket-wheel-key is-top player-mode" aria-label={`待播唱片 ${queued.length} 张`} title="待播唱片" aria-expanded={queueOpen} onClick={() => queueOpen ? closeQueue() : setQueueOpen(true)}>待播{queued.length > 0 && <b>{queued.length}</b>}</button> : <span className="pocket-wheel-key is-top" aria-hidden="true">MENU</span>}
        <button type="button" className="pocket-wheel-key is-left" aria-label="上一首展示曲目" title="上一首 · Shift+←" disabled={!player?.canPrevious} onClick={() => player?.previous()}><PreviousPixel/></button>
        <button type="button" className="pocket-wheel-key is-right" aria-label="下一首展示曲目" title="下一首 · Shift+→" disabled={!player?.canNext} onClick={() => player?.next()}><NextPixel/></button>
        <button type="button" className="pocket-wheel-key is-bottom" aria-label="取下唱片" title="取下唱片" onClick={eject}><EjectPixel size={20}/></button>
        <button type="button" className={`turntable-toggle pocket-center ${busy ? 'is-busy' : ''} ${playing ? 'is-playing' : ''}`} aria-label={visual ? spinning ? '暂停唱片旋转' : '继续唱片旋转' : playing ? '暂停音乐播放' : '播放音乐'} title="播放 / 暂停 · 空格" disabled={!visual && playback?.handoff} onClick={visual ? toggle : playback?.toggle}>{busy ? <Loading size={22} className="player-spin"/> : playing ? <PausePixel/> : <PlayPixel/>}</button>
      </div>
      {player && <span className="player-modes pocket-keys">
        <button type="button" className="player-mode pocket-key" aria-label={`播放模式：${REPEAT_LABEL[player.queue.repeat]}`} title={`${REPEAT_LABEL[player.queue.repeat]} · R`} aria-pressed={player.queue.repeat !== 'off'} data-mode={player.queue.repeat} onClick={player.cycleRepeat}><i className="pocket-led" aria-hidden="true"/>{player.queue.repeat === 'one' ? <RepeatOnePixel/> : <RepeatPixel/>}<small>{REPEAT_SHORT[player.queue.repeat]}</small></button>
        <button type="button" className="player-mode pocket-key" aria-label="随机播放本张" title="本张随机 · S" aria-pressed={player.queue.shuffle} onClick={player.toggleShuffle}><i className="pocket-led" aria-hidden="true"/><ShufflePixel/><small>随机</small></button>
      </span>}
      {!!names.length && <label className="pocket-track"><span>曲目</span><select aria-label="唱机展示曲目" value={trackIndex} onChange={(event) => track?.(Number(event.target.value))}>{names.map((name, index) => <option value={index} key={index}>{String(index + 1).padStart(2, '0')} · {displayTitle(name)}</option>)}</select></label>}
    </div>
    {queueOpen && player && <div ref={queuePanel} className="player-queue" role="region" aria-label="待播唱片" tabIndex={-1}>
      <div className="player-queue-header"><strong>待播</strong><button type="button" aria-label="关闭待播" onClick={closeQueue}><X size={12}/></button></div>
      {player.queue.repeat !== 'one' && !player.queue.shuffle && names.length > trackIndex + 1 && <><small className="player-queue-title">接下来 · 本张</small><ol className="player-queue-tracks">{names.slice(trackIndex + 1, trackIndex + 6).map((name, offset) => <li key={offset}><button type="button" className="player-queue-jump" aria-label={`跳到第 ${trackIndex + offset + 2} 首 ${name}`} onClick={() => track?.(trackIndex + offset + 1)}><b>{String(trackIndex + offset + 2).padStart(2, '0')}</b><span title={name}>{displayTitle(name)}</span></button></li>)}</ol>{names.length > trackIndex + 6 && <small className="player-queue-more">还有 {names.length - trackIndex - 6} 首</small>}</>}
      {player.queue.repeat === 'one' && <p className="player-queue-state">单曲循环中 · 切换为顺序播放后继续待播</p>}
      {player.queue.repeat !== 'one' && player.queue.shuffle && <small className="player-queue-title">本张随机播放中 · 每首放一次，放完进入待播</small>}
      <small className="player-queue-title">待播唱片{queued.length ? ` · ${queued.length}` : ''}</small>
      {queued.length ? <ol className="player-queue-albums">{queued.map((entry, index) => <li key={entry.id}>{entry.cover ? <img src={entry.cover} alt="" referrerPolicy="no-referrer"/> : <Music2 size={20}/>}<span title={`${entry.title} · ${entry.artist}`}><strong>{entry.title}</strong><small>{index === 0 ? '下一张' : `第 ${index + 1} 张`} · {entry.artist}</small></span>{index > 0 && <button type="button" className="player-queue-promote" aria-label={`下一张播 ${entry.title}`} onClick={() => { if (!player.playNext(entry.id)) { setQueueNotice(''); return; } setQueueNotice(`《${entry.title}》已移到待播首位`); }}>置顶</button>}<button type="button" aria-label={`从待播移除 ${entry.title}`} onClick={() => player.remove(entry.id)}><X size={12}/></button></li>)}</ol>
        : <p>待播里还没有唱片。在唱片架选中一张，点「加入待播」，或在「我的歌单」里点「加入待播」，就会接着放。</p>}
      {queueNotice && <small className="player-queue-notice" role="status">{queueNotice}</small>}
    </div>}
    {player?.queueError && <p className="player-error" role="alert">{player.queueError}</p>}
    {failed && <div className="player-error" role="alert"><span>{playback.error}</span><span className="player-error-actions"><button type="button" onClick={playback.retry}>重试</button><button type="button" onClick={() => window.dispatchEvent(new Event('cabin-open-music-settings'))}>音源设置</button></span></div>}
    {visual && item && <p className="player-visual-note">仅展示唱片 · 声音可在「设置 → 音源」中开启</p>}
    {audible && provider !== 'ma' && item && <div className="turntable-audio-sliders pocket-volume">
      <label className="player-volume"><button type="button" className="player-mute" aria-label={playback.muted ? '取消静音' : '静音'} title="静音 · M" aria-pressed={playback.muted} onClick={() => playback.setMuted(!playback.muted)}>{playback.muted || playback.volume === 0 ? <SpeakerOff size={14}/> : <SpeakerWave size={14}/>}</button>音量<input type="range" aria-label="音乐音量" min="0" max="1" step=".01" value={playback.muted ? 0 : playback.volume} onChange={(event) => playback.setVolume(Number(event.target.value))}/></label>
    </div>}
  </div>;
}
