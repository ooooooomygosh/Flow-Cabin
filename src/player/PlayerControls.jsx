import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, X, SpeakerWave, SpeakerOff, ListBullet, Loading, Music2 } from '../icons';
import { trackNames } from '../room-model.mjs';
import './player.css';

const clock = (seconds) => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
const REPEAT_LABEL = { off: '顺序播放', all: '整张循环', one: '单曲循环' };
const REPEAT_GLYPH = { off: '→', all: '⟳', one: '⟳1' };
export const QUICK_SOURCES = [['auto', '自动匹配'], ['local', '本地音乐'], ['qq', 'QQ 音乐'], ['netease', '网易云']];

// The deck's transport: one obvious play button, previous / next, a small
// 待播 stack, repeat / shuffle, progress and volume, and errors that say what
// to do next. Labels are stable — tests and screen readers depend on them.
export default function PlayerControls({ item, items = [], provider, spinning, trackIndex, track, toggle, eject, playback, player, setProvider }) {
  const [queueOpen, setQueueOpen] = useState(false), [queueNotice, setQueueNotice] = useState(''), names = trackNames(item);
  const visual = provider === 'visual', audible = !visual && playback;
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const playing = visual ? spinning : Boolean(playback?.playing);
  const queued = (player?.queue.ids || []).map((id) => items.find((entry) => entry.id === id)).filter(Boolean);
  const failed = audible && playback.status === 'error' && playback.error;
  return <div className="player-controls">
    <div className="turntable-controls">
      <button type="button" aria-label="上一首展示曲目" title="上一首 · Shift+←" disabled={!player?.canPrevious} onClick={() => player?.previous()}><ChevronLeft size={18}/></button>
      <button type="button" className={`turntable-toggle ${busy ? 'is-busy' : ''}`} aria-label={visual ? spinning ? '暂停唱片旋转' : '继续唱片旋转' : playing ? '暂停音乐播放' : '播放音乐'} title="播放 / 暂停 · 空格" onClick={visual ? toggle : playback?.toggle}>{busy ? <Loading size={19} className="player-spin"/> : playing ? <Pause size={19}/> : <Play size={19}/>}</button>
      <button type="button" aria-label="下一首展示曲目" title="下一首 · Shift+→" disabled={!player?.canNext} onClick={() => player?.next()}><ChevronRight size={18}/></button>
      <button type="button" aria-label="取下唱片" title="取下唱片" onClick={eject}><X size={17}/></button>
      {player && <span className="player-modes">
        <button type="button" className="player-mode" aria-label={`播放模式：${REPEAT_LABEL[player.queue.repeat]}`} title={`${REPEAT_LABEL[player.queue.repeat]} · R`} aria-pressed={player.queue.repeat !== 'off'} onClick={player.cycleRepeat}>{REPEAT_GLYPH[player.queue.repeat]}</button>
        <button type="button" className="player-mode" aria-label="随机播放本张" title="本张随机 · S" aria-pressed={player.queue.shuffle} onClick={player.toggleShuffle}>⤮</button>
        <button type="button" className="player-mode" aria-label={`待播唱片 ${queued.length} 张`} title="待播唱片" aria-expanded={queueOpen} onClick={() => setQueueOpen(!queueOpen)}><ListBullet size={14}/>{queued.length > 0 && <b>{queued.length}</b>}</button>
      </span>}
      {!!names.length && <select aria-label="唱机展示曲目" value={trackIndex} onChange={(event) => track?.(Number(event.target.value))}>{names.map((name, index) => <option value={index} key={index}>{String(index + 1).padStart(2, '0')} · {name}</option>)}</select>}
    </div>
    {queueOpen && player && <div className="player-queue" aria-label="待播唱片">
      {player.queue.repeat !== 'one' && !player.queue.shuffle && names.length > trackIndex + 1 && <><small className="player-queue-title">接下来 · 本张</small><ol className="player-queue-tracks">{names.slice(trackIndex + 1, trackIndex + 6).map((name, offset) => <li key={offset}><button type="button" className="player-queue-jump" aria-label={`跳到第 ${trackIndex + offset + 2} 首 ${name}`} onClick={() => track?.(trackIndex + offset + 1)}><b>{String(trackIndex + offset + 2).padStart(2, '0')}</b><span title={name}>{name}</span></button></li>)}</ol>{names.length > trackIndex + 6 && <small className="player-queue-more">还有 {names.length - trackIndex - 6} 首</small>}</>}
      {player.queue.repeat === 'one' && <p className="player-queue-state">单曲循环中 · 切换为顺序播放后继续待播</p>}
      {player.queue.repeat !== 'one' && player.queue.shuffle && <small className="player-queue-title">本张随机播放中 · 关闭随机后进入待播</small>}
      <small className="player-queue-title">待播唱片{queued.length ? ` · ${queued.length}` : ''}</small>
      {queued.length ? <ol className="player-queue-albums">{queued.map((entry, index) => <li key={entry.id}>{entry.cover ? <img src={entry.cover} alt="" referrerPolicy="no-referrer"/> : <Music2 size={20}/>}<span title={`${entry.title} · ${entry.artist}`}><strong>{entry.title}</strong><small>{index === 0 ? '下一张' : `第 ${index + 1} 张`} · {entry.artist}</small></span>{index > 0 && <button type="button" className="player-queue-promote" aria-label={`下一张播 ${entry.title}`} onClick={() => { if (!player.playNext(entry.id)) { setQueueNotice(''); return; } setQueueNotice(`《${entry.title}》已移到待播首位`); }}>置顶</button>}<button type="button" aria-label={`从待播移除 ${entry.title}`} onClick={() => player.remove(entry.id)}><X size={12}/></button></li>)}</ol>
        : <p>待播里还没有唱片。在唱片架选中一张，点「加入待播」，或在「我的歌单」里点「加入待播」，就会接着放。</p>}
      {queueNotice && <small className="player-queue-notice" role="status">{queueNotice}</small>}
    </div>}
    {player?.queueError && <p className="player-error" role="alert">{player.queueError}</p>}
    {failed && <div className="player-error" role="alert"><span>{playback.error}</span><span className="player-error-actions"><button type="button" onClick={playback.retry}>重试</button><button type="button" onClick={() => window.dispatchEvent(new Event('cabin-open-music-settings'))}>音源设置</button></span></div>}
    {visual && item && <p className="player-visual-note">仅展示唱片 · 声音可在「设置 → 音源」中开启</p>}
    {audible && provider !== 'ma' && item && <div className="turntable-audio-sliders">
      <label>进度<input type="range" aria-label="音乐播放进度" min="0" max={playback.duration || 1} step=".1" value={Math.min(playback.position, playback.duration || 1)} disabled={!playback.duration} onChange={(event) => playback.seek(Number(event.target.value))} style={{ '--player-progress': `${playback.duration ? Math.min(100, playback.position / playback.duration * 100) : 0}%` }}/><small>{clock(playback.position)} / {clock(playback.duration)}</small></label>
      <label className="player-volume"><button type="button" className="player-mute" aria-label={playback.muted ? '取消静音' : '静音'} title="静音 · M" aria-pressed={playback.muted} onClick={() => playback.setMuted(!playback.muted)}>{playback.muted || playback.volume === 0 ? <SpeakerOff size={14}/> : <SpeakerWave size={14}/>}</button>音量<input type="range" aria-label="音乐音量" min="0" max="1" step=".01" value={playback.muted ? 0 : playback.volume} onChange={(event) => playback.setVolume(Number(event.target.value))}/></label>
    </div>}
  </div>;
}
