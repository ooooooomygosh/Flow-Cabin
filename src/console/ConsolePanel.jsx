import React, { useRef } from 'react';
import Dialog from '../Dialog';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { LedDots, LedGlass } from '../props/Led';
import { playSfx } from '../props/sfx.mjs';
import { Cover } from '../listen/listen-hooks';
import { QueuePanel, TrackPicker } from '../player/PlayerControls';
import { deckCapabilities, providerLabel } from '../player/providers.mjs';
import { volumePercent } from '../player/volume-curve.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist, trackAlbum } from '../track-meta.mjs';
import { displayTitle } from '../display-title.mjs';
import { ariaKeys } from '../shortcuts.mjs';
import { PlayPixel, PausePixel, PreviousPixel, NextPixel, EjectPixel, Loading, Plus } from '../icons';
import PushKey from './PushKey';
import Knob from './Knob';
import Lever from './Lever';
import VuMeter from './VuMeter';
import SourceDial from './SourceDial';
import ScreenText from './ScreenText';
import { SeekRail, SystemRail } from './Rail';
import './console.css';
import './console-panel.css';

// 唱机旁, the close-up of the whole machine (opened by commands.open('music')): two meters on the
// left, the lit screen and the big volume knob in the middle, levers and the rotary source switch
// on the right, the keys and the progress rail along the bottom, and the queue as a roll of paper
// strips coming out of a slot at the side. Every capability of the old panel is here, under the
// same names; the audio itself is untouched (the hosts stay mounted above, data-cabin-audio-host).
const REPEAT_LABEL = { off: '顺序播放', all: '整张循环', one: '单曲循环' };
const REPEAT_SHORT = { off: '顺序', all: '整张', one: '单曲' };
const STATE_WORD = { playing: '播放中', paused: '已暂停', busy: '连接中', error: '没接上' };
const two = (index) => String(index + 1).padStart(2, '0');
// Wrap the quality token (无损 / FLAC / Hi-Res / 320k MP3…) of a status line in a small badge; the text stays whole.
const QUALITY = /(\d{2,4}\s?k(?:bps)?(?:\s?(?:MP3|AAC|OGG))?|Hi-?Res|FLAC|无损)/i;
const statusNode = (text) => { const match = typeof text === 'string' && QUALITY.exec(text); return match ? <>{text.slice(0, match.index)}<b className="console-quality">{match[0]}</b>{text.slice(match.index + match[0].length)}</> : text; };

// 01/03 in red dot-matrix print behind its own glass.
function Counter({ text }) {
  const width = (text.length * 6 - 1) * 2.4 + 8;
  return <LedGlass width={width} height={7 * 2.4 + 8} className="console-counter"><LedDots text={text} x={4} y={4} pitch={2.4}/></LedGlass>;
}

export default function ConsolePanel({ close, openSmart }) {
  const { deck, commands } = useCabinRuntime();
  const { deckItem: item, provider, playback, player, system } = deck;
  const trackIndex = deck.shownTrackIndex, spinning = deck.effectiveSpin;
  const visual = provider === 'visual', follow = provider === 'system', audible = !visual && !follow && Boolean(playback);
  const caps = deckCapabilities(provider, { remote: playback?.remote });
  const names = trackNames(item), queueRoll = useRef(null);
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const playing = follow ? Boolean(system?.playing) : visual ? Boolean(spinning) : Boolean(playback?.playing);
  const failed = audible && playback.status === 'error' && playback.error;
  const screenState = follow ? (system?.playing ? 'playing' : system?.active ? 'paused' : 'idle') : !audible ? (item && spinning ? 'playing' : 'idle')
    : playback.playing ? 'playing' : busy ? 'busy' : playback.status === 'error' ? 'error' : playback.status === 'paused' ? 'paused' : 'idle';
  const state = STATE_WORD[screenState] || (item ? '待播放' : '空唱机');
  const trackName = playback?.actualTrack || names[trackIndex] || (item ? '暂无曲目信息' : '');
  const artist = item?.type === 'playlist' ? `${trackArtist(item, trackIndex) || '歌单'} · 歌单` : follow ? system?.artist || item?.artist || '' : item?.artist || '';
  const album = follow ? system?.album || '' : item ? trackAlbum(item, trackIndex) || '' : '';
  const reasonFor = (index) => audible ? playback.blockedReason?.(item, index) || (index === trackIndex && failed ? playback.error : '') : '';
  const entries = (player?.upNext || []).filter((entry) => entry.kind === 'track' || entry.kind === 'album');
  const meterOn = follow ? Boolean(system?.playing) : audible && Boolean(playback.playing);
  const value = playback?.muted ? 0 : playback?.volume ?? 0, percent = volumePercent(value);
  const openCorner = () => window.dispatchEvent(new Event('cabin-open-corner'));
  const openSettings = () => window.dispatchEvent(new Event('cabin-open-music-settings'));
  const backdrop = (event) => { if (event.target === event.currentTarget) close(); };

  return <Dialog variant="full" title="唱机旁" close={close} deckKeys initialFocus=".console" returnFocus=".focus-badge" className="console-shell">
    <div className="console-stage" onClick={backdrop}>
      <div className="console-wrap">
        <section className="console" tabIndex={-1} aria-label="唱机控制台" data-state={screenState} data-provider={provider}>
          <i className="console-cheek is-left" aria-hidden="true"/><i className="console-cheek is-right" aria-hidden="true"/>
          <i className="console-screw is-tl" aria-hidden="true"/><i className="console-screw is-tr" aria-hidden="true"/><i className="console-screw is-bl" aria-hidden="true"/><i className="console-screw is-br" aria-hidden="true"/>
          <header className="console-top">
            <span className="c-plate is-primary console-name">唱机旁</span>
            <span className="console-lamps" aria-hidden="true"><i className="is-power"/><i className={playing ? 'is-play' : ''}/><i className={failed || screenState === 'error' ? 'is-fault' : ''}/></span>
            <button type="button" className="cabin-dialog-close console-close c-plate" aria-label="关闭唱机旁" title="放回 · Esc" onPointerEnter={() => playSfx('corner-lift')} onClick={() => { playSfx('corner-tap'); close(); }}>放回<span aria-hidden="true">↩</span></button>
          </header>

          <div className="console-body">
            <div className="console-meters">
              <VuMeter kind="level" title="音 量" subtitle="均值" playing={meterOn}/>
              <VuMeter kind="peak" title="峰 值" subtitle="PEAK" playing={meterOn}/>
            </div>

            <div className="console-centre">
              <div className="console-display c-screen" data-state={screenState}>
                <div className="console-display-status">
                  <span className="console-state"><i aria-hidden="true"/>{state}</span>
                  <span className="console-flags">
                    {player?.queue.repeat !== 'off' && player && <span>{REPEAT_SHORT[player.queue.repeat]}</span>}
                    {player?.queue.shuffle && <span>随机</span>}
                    <span className="console-source">{providerLabel(provider, 'short')}</span>
                  </span>
                </div>
                <div className="console-display-main">
                  <button type="button" className="c-frame console-cover" aria-label="唱机特写" title="唱机特写 · T" aria-keyshortcuts="T" disabled={!item} onClick={openCorner}>{item ? <Cover item={item}/> : <span className="listen-cover" aria-hidden="true"/>}</button>
                  <div className="console-display-text">
                    <strong className="console-title"><ScreenText text={displayTitle(item?.title) || '等一张唱片'}/></strong>
                    <ScreenText className="console-artist" text={[artist, album && album !== item?.title ? album : ''].filter(Boolean).join(' · ') || (item ? ' ' : '去唱片架挑一张，放上唱机')}/>
                    <ScreenText className="console-track" text={item ? `${names.length ? `${two(trackIndex)} · ` : ''}${displayTitle(trackName)}` : ''}/>
                    <small className="console-status" role="status">{statusNode(deck.statusText)}</small>
                  </div>
                </div>
                {item && names.length > 0 && <div className="console-display-foot"><Counter text={`${two(trackIndex)}/${two(names.length - 1)}`}/></div>}
              </div>

              <div className="console-knob-area">
                {caps.volume && audible && item
                  ? <Knob size="lg" value={value} label="音乐音量" valueText={playback.muted ? '已静音' : `${percent}%`} legend="音量" keyshortcuts={ariaKeys('mute')}
                      onChange={(next) => playback.setVolume(next)} onPress={() => playback.setMuted(!playback.muted)}/>
                  : <Knob size="lg" value={0} label="音乐音量" valueText="这个音源不能在这里调" legend="音量" disabled/>}
                <p className="console-note">{!item ? '' : visual ? '仅展示 · 没有声音。在右边的音源旋钮选一个出声的音源。' : !caps.volume && audible ? `音量与拖动进度请在${provider === 'ma' ? '家庭播放器' : '「音乐」App'}里调节` : follow ? '音量请在正在放歌的播放器里调节' : '转动、滚轮或方向键调音量 · 按一下静音'}</p>
              </div>
            </div>

            <div className="console-switches">
              <div className="console-levers">
                {player && item && <Lever legend="随机" state={player.queue.shuffle ? '开' : '关'} on={player.queue.shuffle} aria-label="随机播放本张" title="本张随机 · S" aria-keyshortcuts={ariaKeys('shuffle')} aria-pressed={player.queue.shuffle} onClick={player.toggleShuffle}/>}
                {player && item && <Lever legend="循环" state={REPEAT_SHORT[player.queue.repeat]} on={player.queue.repeat !== 'off'} position={player.queue.repeat === 'off' ? -1 : 1} data-mode={player.queue.repeat} aria-label={`播放模式：${REPEAT_LABEL[player.queue.repeat]}`} title={`${REPEAT_LABEL[player.queue.repeat]} · R`} aria-keyshortcuts={ariaKeys('repeat')} aria-pressed={player.queue.repeat !== 'off'} onClick={player.cycleRepeat}/>}
                {player?.toggleLiked && item && <Lever legend="喜欢" state={player.liked ? '收藏' : ''} lamp="red" on={Boolean(player.liked)} aria-label={player.liked ? '取消喜欢这首' : '喜欢这首'} title={player.liked ? '已喜欢 · 只保存在这台设备' : '喜欢这首 · 只保存在这台设备'} aria-pressed={Boolean(player.liked)} onClick={player.toggleLiked}/>}
                {caps.volume && audible && item && <Lever legend="静音" state={playback.muted ? '开' : ''} on={Boolean(playback.muted)} lamp="red" aria-label={playback.muted ? '取消静音' : '静音'} title="静音 · M" aria-keyshortcuts={ariaKeys('mute')} aria-pressed={Boolean(playback.muted)} onClick={() => playback.setMuted(!playback.muted)}/>}
              </div>
              <SourceDial provider={provider} choose={deck.chooseProvider} openSettings={openSettings}/>
            </div>
          </div>

          {item && <div className="console-deck">
            <div className="console-keys">
              {follow ? <>
                <PushKey tone="cream" aria-label="系统播放器上一首" disabled={!system?.active} onClick={() => system.control('previous')}><PreviousPixel/></PushKey>
                <PushKey tone="black" lamp lit={playing} aria-label={system?.playing ? '暂停系统播放器' : '继续系统播放器'} disabled={!system?.active} onClick={() => system.control('toggle')}>{system?.playing ? <PausePixel/> : <PlayPixel/>}</PushKey>
                <PushKey tone="cream" aria-label="系统播放器下一首" disabled={!system?.active} onClick={() => system.control('next')}><NextPixel/></PushKey>
              </> : <>
                <PushKey tone="cream" aria-label="上一首展示曲目" title="上一首 · Shift+←" aria-keyshortcuts="Shift+ArrowLeft" disabled={!player?.canPrevious} onClick={() => player?.previous()}><PreviousPixel/></PushKey>
                <PushKey tone="black" lamp lit={playing} className={busy ? 'is-busy' : ''} aria-label={visual ? spinning ? '暂停唱片旋转' : '继续唱片旋转' : playing ? '暂停音乐播放' : '播放音乐'} title="播放 / 暂停 · 空格" disabled={!visual && playback?.handoff} onClick={visual ? deck.toggleVisual : playback?.toggle}>{busy ? <Loading size={22} className="console-spin"/> : playing ? <PausePixel/> : <PlayPixel/>}</PushKey>
                <PushKey tone="cream" aria-label="下一首展示曲目" title="下一首 · Shift+→" aria-keyshortcuts="Shift+ArrowRight" disabled={!player?.canNext} onClick={() => player?.next()}><NextPixel/></PushKey>
                <PushKey tone="cream" aria-label="取下唱片" title="取下唱片" onClick={deck.eject}><EjectPixel size={20}/></PushKey>
              </>}
              {follow && system?.active && <button type="button" className="c-plate console-collect" title="在曲库中搜索这张专辑并收藏到唱片架" onClick={() => window.dispatchEvent(new CustomEvent('album-quick-search', { detail: { query: `${system.albumArtist || system.artist} ${system.album || system.title}` } }))}><Plus size={16}/>收藏这张</button>}
            </div>
            <div className="console-progress">
              {follow ? (system?.active && <SystemRail timeline={system.timeline}/>)
                : caps.progress && playback && !visual ? <SeekRail playback={playback} seekable={caps.seek} label="音乐播放进度"/> : null}
            </div>
            {!!names.length && !follow && <div className="console-tracks"><TrackPicker item={item} names={names} trackIndex={trackIndex} track={deck.setTrackIndex} reasonFor={reasonFor}/></div>}
          </div>}

          {(failed || player?.queueError || playback?.notice || (audible && playback?.candidates?.length > 0) || playback?.localApp) && <div className="console-notes">
            {player?.queueError && <p className="console-alert" role="alert">{player.queueError}</p>}
            {failed && <div className="console-alert" role="alert"><span>{playback.error}</span><span className="console-alert-actions"><button type="button" className="c-plate" onClick={playback.retry}>重试</button><button type="button" className="c-plate" onClick={openSettings}>音源设置</button></span></div>}
            {audible && playback.candidates?.length > 0 && <div className="console-matches" role="group" aria-label="选择曲目版本">{playback.candidates.map((candidate) => <button type="button" key={`${candidate.provider}:${candidate.id}`} onClick={() => playback.choose(candidate)}><strong>{candidate.title}</strong><span>{candidate.artist} · {candidate.album || '专辑未知'}</span></button>)}</div>}
            {playback?.localApp && <p className="console-local-app"><button type="button" className="c-plate" onClick={() => playback.openInLocalApp()} title="小屋内播放失败时的备用办法：在平台 App（未安装时为官方网页）中打开这首歌。声音由该 App 播放，小屋不会显示进度。">{playback.localApp.label}</button><small>交给平台 App 播放 · 小屋不显示进度</small></p>}
            {playback?.notice && <p className="console-notice" role="status">{playback.notice}</p>}
          </div>}

          <footer className="console-links">
            <button type="button" className="c-plate" onClick={() => { playSfx('paper-press'); commands.open('library'); }}>打开唱片架</button>
            <button type="button" className="c-plate" disabled={!item} onClick={openCorner}>唱机特写</button>
            <button type="button" className="c-plate" disabled={!item} onClick={() => { playSfx('paper-press'); commands.open('lyrics'); }}>歌词册</button>
            {openSmart && <button type="button" className="c-plate" onClick={openSmart}>让小屋挑一张</button>}
          </footer>
        </section>

        {player && <aside className="console-roll c-roll" aria-label="待播纸带">
          <div className="console-roll-slot" aria-hidden="true"><span>待播{entries.length ? ` · ${entries.length}` : ''}</span></div>
          <div className="console-roll-paper c-paper"><QueuePanel embedded item={item} names={names} trackIndex={trackIndex} track={deck.setTrackIndex} player={player} panel={queueRoll} close={() => {}} reasonFor={reasonFor}/></div>
        </aside>}
      </div>
    </div>
  </Dialog>;
}
