import React, { useRef, useState } from 'react';
import { VinylDisc } from './RecordLibrary';
import SceneDeck from './scene/SceneDeck';
import { ChevronLeft, ChevronRight, Disc3, Pause, Play, Plus, PlayPixel, PausePixel, RepeatPixel, RepeatOnePixel, ShufflePixel } from './icons';
import { ROOM_DRAG_TYPE } from './RoomScene';
import useTurntablePosition from './useTurntablePosition';
import { trackNames } from './room-model.mjs';
import { trackArtist } from './track-meta.mjs';
import { providerLabel } from './player/providers.mjs';
import PlayerControls, { PocketProgress } from './player/PlayerControls';
import { displayTitle } from './display-title.mjs';
// Wrap the quality token (无损 / FLAC / Hi-Res / 320k MP3…) of a status line in a small badge; the text stays whole.
const QUALITY = /(\d{2,4}\s?k(?:bps)?(?:\s?(?:MP3|AAC|OGG))?|Hi-?Res|FLAC|无损)/i;
const statusNode = (text) => { const match = typeof text === 'string' && QUALITY.exec(text); return match ? <>{text.slice(0, match.index)}<span className="turntable-quality">{match[0]}</span>{text.slice(match.index + match[0].length)}</> : text; };

export default function RoomTurntable({ item, spinning, trackIndex = 0, style, items = [], load, toggle, track, eject, readOnly = false, provider = 'visual', setProvider, playback, statusText, actualTrack, system, player, tools }) {
  const [dragging, setDragging] = useState(false), names = trackNames(item), deckAnchor = useRef(null);
  const placement = useTurntablePosition(readOnly);
  const trackName = actualTrack || playback?.actualTrack || names[trackIndex] || (item ? '原始资料暂无曲目' : '双击封面，或将唱片拖到这里');
  const audible = provider !== 'visual' && provider !== 'system';
  const screenState = provider === 'system' ? (system?.playing ? 'playing' : system?.active ? 'paused' : 'idle') : !audible ? (item && spinning ? 'playing' : 'idle')
    : playback?.playing ? 'playing' : ['loading', 'searching', 'buffering'].includes(playback?.status) ? 'busy' : playback?.status === 'error' ? 'error' : playback?.status === 'paused' ? 'paused' : 'idle';
  return <aside ref={placement.ref} style={placement.style} data-moving={String(placement.moving)} className={`room-turntable ${spinning ? 'is-spinning' : ''} ${dragging ? 'is-drop-target' : ''}`} aria-label="黑胶唱机" data-provider={provider} data-loaded-id={item?.id || ''} data-spinning={String(Boolean(spinning))} onDragOver={(event) => { if (!readOnly && event.dataTransfer.types.includes(ROOM_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => {
    event.preventDefault(); setDragging(false);
    const found = items.find((candidate) => candidate.id === event.dataTransfer.getData(ROOM_DRAG_TYPE)); if (found && !readOnly) load?.(found);
  }}>
    {/* The physical deck lives in the scene (shelf top) — see src/scene/SceneDeck.jsx. */}
    <span ref={deckAnchor} hidden/>
    <SceneDeck anchor={deckAnchor} item={item} spinning={spinning} vinyl={style} readOnly={readOnly} dragType={ROOM_DRAG_TYPE}
      onActivate={() => deckAnchor.current?.closest('.room-turntable')?.querySelector('.turntable-toggle')?.click()}
      onDropRecord={(id) => { const found = items.find((candidate) => candidate.id === id); if (found && !readOnly) load?.(found); }}/>
    <div className="turntable-side-cabinet">
      <div className="turntable-console">
    <div className="turntable-heading">{readOnly ? <span><Disc3 size={15}/>木屋唱机</span> : <button type="button" className="turntable-drag-handle" aria-label="移动唱机" title="拖动移动唱机 · 方向键微调 · 双击或 Home 复位" {...placement.handle}><Disc3 size={15}/>木屋唱机 ⠿</button>}{readOnly ? <small className="turntable-source-chip">{providerLabel(provider, 'short')}</small> : <button type="button" className="turntable-source-chip" aria-label={`音源 ${providerLabel(provider, 'short')} · 更换`} title={`唱机音源：${providerLabel(provider)} · 在「设置 › 音源」里更换`} onClick={() => window.dispatchEvent(new Event('cabin-open-music-settings'))}>{providerLabel(provider, 'short')}<span aria-hidden="true">▾</span></button>}</div>
    {!readOnly && tools}
    {/* Two decks take turns: one plays, the other buffers the next song. */}
    {!readOnly && playback && playback.deckRefs.map((ref, index) => <audio key={index} ref={ref} {...playback.events} preload="auto"/>)}
    {/* The screen: a backlit LCD with the sleeve, the song, its status and progress. */}
    <div className="pocket-screen" data-state={screenState}>
    <div className="pocket-statusbar" aria-hidden="true"><span className="pocket-state">{screenState === 'playing' ? <PlayPixel size={12}/> : screenState === 'paused' ? <PausePixel size={12}/> : <i className="pocket-dot"/>}{{ playing: '播放中', paused: '已暂停', busy: '连接中', error: '没接上', idle: item ? '待播放' : '空唱机' }[screenState]}</span><span className="pocket-flags">{player?.queue.repeat === 'one' ? <RepeatOnePixel size={12}/> : player?.queue.repeat === 'all' ? <RepeatPixel size={12}/> : null}{player?.queue.shuffle && <ShufflePixel size={12}/>}{item && names.length > 0 && <b>{trackIndex + 1}/{names.length}</b>}</span></div>
    <div className="pocket-now">
    <button type="button" className="turntable-record-art" aria-label="唱机特写" title="唱机特写 · T" aria-keyshortcuts="T" disabled={readOnly} onClick={() => window.dispatchEvent(new Event('cabin-open-corner'))}>
      <span className="turntable-sleeve">{item?.cover ? <img src={item.cover} alt="" referrerPolicy="no-referrer"/> : <Disc3 size={32}/>}</span>
      <VinylDisc item={item || undefined} value={style} className={spinning ? 'is-spinning' : ''}/><span className="turntable-needle" aria-hidden="true"/>
    </button>
    <div className="turntable-copy"><strong title={item?.title}>{displayTitle(item?.title) || '让收藏转起来'}</strong><span className="turntable-artist">{item?.type === 'playlist' ? <>{trackArtist(item, trackIndex) || '歌单'} · <em>歌单</em></> : item?.artist || '专辑库原始封面与曲目'}</span><p className="turntable-track" title={trackName}>{item && names.length ? `${String(trackIndex + 1).padStart(2, '0')} · ` : ''}{displayTitle(trackName)}</p><small className="turntable-status" role="status">{statusNode(statusText || (provider === 'system' ? system?.statusText : provider === 'visual' ? (item ? spinning ? '展示中 · 无音频' : '旋转已暂停 · 无音频' : '等待放盘 · 无音频') : playback?.statusText))}</small></div>
    </div>
    {!readOnly && item && playback && !['visual', 'system', 'ma'].includes(provider) && <PocketProgress playback={playback}/>}
    </div>
    {!readOnly && provider === 'system' && system && <div className="turntable-controls turntable-system-controls">
      <button type="button" aria-label="系统播放器上一首" disabled={!system.active} onClick={() => system.control('previous')}><ChevronLeft size={18}/></button>
      <button type="button" className="turntable-toggle" aria-label={system.playing ? '暂停系统播放器' : '继续系统播放器'} disabled={!system.active} onClick={() => system.control('toggle')}>{system.playing ? <Pause size={19}/> : <Play size={19}/>}</button>
      <button type="button" aria-label="系统播放器下一首" disabled={!system.active} onClick={() => system.control('next')}><ChevronRight size={18}/></button>
      {system.active && <button type="button" className="turntable-collect" title="在曲库中搜索这张专辑并收藏到唱片架" onClick={() => window.dispatchEvent(new CustomEvent('album-quick-search', { detail: { query: `${system.albumArtist || system.artist} ${system.album || system.title}` } }))}><Plus size={16}/>收藏这张</button>}
    </div>}
    {!readOnly && item && provider !== 'system' && <PlayerControls item={item} items={items} provider={provider} spinning={spinning} trackIndex={trackIndex} track={track} toggle={toggle} eject={eject} playback={playback} player={player} setProvider={setProvider}/>}
    {!readOnly && !['visual', 'system'].includes(provider) && playback?.candidates.length > 0 && <div className="turntable-matches" aria-label="选择曲目版本">{playback.candidates.map((candidate) => <button type="button" key={`${candidate.provider}:${candidate.id}`} onClick={() => playback.choose(candidate)}><strong>{candidate.title}</strong><span>{candidate.artist} · {candidate.album || '专辑未知'}</span></button>)}</div>}
    {!readOnly && playback?.localApp && <p className="turntable-local-app"><button type="button" onClick={() => playback.openInLocalApp()} title="小屋内播放失败时的备用办法：在平台 App（未安装时为官方网页）中打开这首歌。声音由该 App 播放，小屋不会显示进度。">{playback.localApp.label}</button><small>交给平台 App 播放 · 小屋不显示进度</small></p>}
    {!readOnly && playback?.notice && <p className="turntable-local-app-notice" role="status">{playback.notice}</p>}
      </div>
    </div>
  </aside>;
}
