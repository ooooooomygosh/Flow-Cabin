import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Dialog from '../Dialog';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { desktopCommand } from '../desktop/desktop-command.mjs';
import { frameClock, onBackgroundChange } from '../frame-clock.mjs';
import useCoverColour from '../useCoverColour';
import { performanceLevel } from '../perf-profile.mjs';
import PixelCat from '../pet/PixelCat';
import { Play, Pause } from '../icons';
import { invalidateLyrics, playbackPosition, writeLyricSettings, chooseLyricCandidate } from './lyric-session.mjs';
import { activeLyric, MAX_LYRIC_BYTES, parseLyrics } from './lyrics-model.mjs';
import { skinFor, skinStyle } from './lyric-skins.mjs';
import { createParticles } from './lyric-particles.mjs';
import { useLyricDoc, useLyricPrefs, useLyricSettings, usePlaybackSignal } from './useLyrics';
import './lyrics.css';

const AmllPlayer = lazy(() => import('./AmllPlayer'));
class RendererBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
const clock = seconds => { const s = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const sourceName = source => ({ qq: 'QQ 音乐', netease: '网易云音乐', LRCLIB: 'LRCLIB 公共歌词', local: '本地导入', none: '—' }[source] || source || '—');

// Room particles behind the lyrics, following the music's energy and beat.
function StageParticles({ skin, enabled, calm }) {
  const canvas = useRef(null), signal = usePlaybackSignal();
  useLayoutEffect(() => {
    const node = canvas.current; if (!node || !enabled) return;
    const layer = createParticles(node, { kind: skin.particle, colors: skin });
    const resize = () => layer.resize(node.clientWidth, node.clientHeight, Math.min(2, devicePixelRatio || 1));
    resize(); const observer = new ResizeObserver(resize); observer.observe(node);
    let lastBeat = 0;
    const stop = frameClock().subscribe((_t, dt) => {
      const { playing, energy, bpm, beatAt } = signal.current;
      layer.setEnergy(playing ? energy * (calm ? .35 : 1) : .05);
      if (playing && bpm && beatAt && !calm) { const length = 60000 / bpm, index = Math.floor((Date.now() - beatAt) / length); if (index !== lastBeat) { lastBeat = index; layer.pulse(.5); } }
      layer.step(dt * 1000);
    }, { fps: 30 });
    return () => { stop(); observer.disconnect(); layer.clear(); };
  }, [skin, enabled, calm]);
  return enabled ? <canvas ref={canvas} className="lyrics-stage-particles" aria-hidden="true"/> : null;
}

function StageProgress({ deck, seekable, onSeek }) {
  const range = useRef(null), elapsed = useRef(null), left = useRef(null), dragging = useRef(false);
  const system = deck.provider === 'system' ? deck.system : null;
  const duration = system ? system.timeline?.getSnapshot().duration || 0 : deck.playback.duration || 0;
  useEffect(() => frameClock().subscribe(() => {
    const ms = playbackPosition(deck.playback, system), seconds = ms === null ? 0 : ms / 1000;
    if (!dragging.current && range.current) range.current.value = String(seconds);
    if (elapsed.current) elapsed.current.textContent = clock(dragging.current ? Number(range.current?.value) : seconds);
    if (left.current) left.current.textContent = duration ? `-${clock(duration - seconds)}` : '';
  }, { fps: 4 }), [deck.playback, system, duration]);
  if (!duration) return null;
  return <div className="lyrics-stage-progress">
    <input ref={range} type="range" min="0" max={duration} step="1" defaultValue="0" aria-label="播放进度" disabled={!seekable}
      onPointerDown={() => { dragging.current = true; }} onPointerUp={e => { dragging.current = false; onSeek(Number(e.currentTarget.value)); }}
      onKeyUp={e => { if (/^Arrow|Home|End|Page/.test(e.key)) onSeek(Number(e.currentTarget.value)); }}/>
    <span><small ref={elapsed}>0:00</small><small ref={left}/></span>
  </div>;
}

function StageSettings({ track, doc, prefs, setPrefs, offset, setOffset, getPosition, totalOffset, close }) {
  const [error, setError] = useState('');
  const importFile = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > MAX_LYRIC_BYTES) throw Error('歌词文件不能超过 1 MiB。');
      const text = await file.text(), format = file.name.split('.').at(-1).toLowerCase(); parseLyrics(text, format);
      writeLyricSettings(track, { text, format, source: 'local' }); setError('');
    } catch (e) { setError(e.message); }
    event.target.value = '';
  };
  // Tap when the next line starts: everything shifts so that line begins right now.
  const tapSync = () => {
    const position = getPosition(); if (position === null || !doc?.lines.length) return;
    const index = activeLyric(doc.lines, position, totalOffset), next = doc.lines[Math.min(doc.lines.length - 1, index + 1)];
    setOffset(Math.round(position - next.startTime - (doc.offset || 0)));
  };
  const candidates = doc?.candidates || [];
  return <section className="lyrics-stage-settings" aria-label="歌词设置">
    <header><h3>歌词设置</h3><button type="button" onClick={close} aria-label="收起歌词设置">完成</button></header>
    <div className="lyrics-settings-row"><span>时间偏移</span><div className="lyrics-offset">
      <button type="button" onClick={() => setOffset(offset - 500)} aria-label="歌词提前 0.5 秒">−0.5s</button>
      <output aria-live="polite">{offset > 0 ? '+' : ''}{(offset / 1000).toFixed(1)}s</output>
      <button type="button" onClick={() => setOffset(offset + 500)} aria-label="歌词推后 0.5 秒">+0.5s</button>
      {offset !== 0 && <button type="button" onClick={() => setOffset(0)}>归零</button>}
    </div></div>
    <button type="button" className="lyrics-tap-sync" onClick={tapSync} disabled={getPosition() === null || !doc?.lines.length}>听到下一句开头时，点这里对齐</button>
    <div className="lyrics-settings-row"><span>字号</span><input type="range" min=".7" max="1.6" step=".05" value={prefs.scale} onChange={e => setPrefs({ scale: Number(e.target.value) })} aria-label="歌词字号"/></div>
    <label className="lyrics-switch"><input type="checkbox" checked={prefs.translation} disabled={!doc?.hasTranslation} onChange={e => setPrefs({ translation: e.target.checked })}/>显示翻译{!doc?.hasTranslation && <small>这首没有翻译</small>}</label>
    <label className="lyrics-switch"><input type="checkbox" checked={prefs.romanization} disabled={!doc?.hasRomanization} onChange={e => setPrefs({ romanization: e.target.checked })}/>显示罗马音{!doc?.hasRomanization && <small>这首没有罗马音</small>}</label>
    <label className="lyrics-switch"><input type="checkbox" checked={prefs.stageParticles} onChange={e => setPrefs({ stageParticles: e.target.checked })}/>房间粒子随音乐律动</label>
    {(candidates.length > 0 || doc?.chosen) && <fieldset className="lyrics-candidates"><legend>歌词不对？换一版</legend>
      {doc?.chosen && <button type="button" onClick={() => chooseLyricCandidate(track, 0)}>回到自动匹配</button>}
      {candidates.map(c => <button type="button" key={c.id} aria-pressed={c.id === doc.lrclibId} onClick={() => chooseLyricCandidate(track, c.id)}><strong>{c.title}</strong><small>{c.artist}{c.album ? ` · ${c.album}` : ''} · {clock(c.duration)}{c.synced ? ' · 同步' : ' · 纯文本'}</small></button>)}
    </fieldset>}
    <div className="lyrics-settings-actions">
      <label className="lyrics-file">导入歌词文件<input type="file" accept=".lrc,.eslrc,.yrc,.qrc,.ttml,.txt" onChange={importFile}/></label>
      {doc?.source === 'local' && <button type="button" onClick={() => writeLyricSettings(track, { text: '', format: '' })}>清除本地歌词</button>}
      <button type="button" onClick={() => invalidateLyrics(track)}>重新查找</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <small className="lyrics-credit">来源：{sourceName(doc?.source)} · {doc?.precision === 'word' ? '逐字时间' : doc?.precision === 'line' ? '逐行时间' : '普通文本'} · <a href="https://github.com/amll-dev/applemusic-like-lyrics" target="_blank" rel="noreferrer">AMLL（AGPL-3.0-only）</a> · <a href="https://github.com/ooooooomygosh/Flow-Cabin" target="_blank" rel="noreferrer">小屋对应源码</a></small>
  </section>;
}

// Plain list for line lyrics when AMLL cannot load, and for screen readers.
function LyricList({ lines, index, seek, seekable }) {
  const list = useRef(null), manualUntil = useRef(0), [away, setAway] = useState(false);
  const recenter = useCallback((smooth = true) => { manualUntil.current = 0; setAway(false); list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'instant' }); }, []);
  useEffect(() => { if (Date.now() >= manualUntil.current) recenter(); }, [index]);
  const manual = () => { manualUntil.current = Date.now() + 6000; setAway(true); };
  return <><div ref={list} className="lyrics-stage-list" onWheel={manual} onTouchMove={manual}>{lines.map((line, i) => <button type="button" key={`${line.startTime}:${i}`} aria-current={i === index ? 'true' : undefined} onClick={() => seek(line.startTime)} disabled={!seekable}><span>{line.words.map(w => w.word).join('')}</span>{line.romanLyric && <small>{line.romanLyric}</small>}{line.translatedLyric && <small>{line.translatedLyric}</small>}</button>)}</div>
    {away && <button type="button" className="lyrics-recenter" onClick={() => recenter()}>回到当前句</button>}</>;
}

export default function LyricsStage({ track: trackOverride, close }) {
  const runtime = useCabinRuntime(), { deck, commands, look, identity, focus } = runtime;
  const track = trackOverride || runtime.lyricsTrack;
  const system = deck.provider === 'system' ? deck.system : null, playback = deck.playback;
  const { doc, error, busy, retry } = useLyricDoc(track), settings = useLyricSettings(track), [prefs, setPrefs] = useLyricPrefs();
  const [panel, setPanel] = useState(false), [idle, setIdle] = useState(false), [background, setBackground] = useState(false), [index, setIndex] = useState(-1);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.desktopReduceMotion === 'true';
  const skin = useMemo(() => skinFor(look), [look]), tint = useCoverColour(deck.deckItem?.cover || '');
  const offset = Number(settings.offset) || 0, totalOffset = (doc?.offset || 0) + offset;
  const setOffset = value => { try { writeLyricSettings(track, { offset: Math.max(-30000, Math.min(30000, Math.round(value))) }); } catch { /* storage full: keep the old offset */ } };
  const state = useRef({}); state.current = { playback, system, totalOffset };
  const getPosition = useCallback(() => playbackPosition(state.current.playback, state.current.system), []);
  const getLyricTime = useCallback(() => { const p = getPosition(); return p === null ? null : p - state.current.totalOffset; }, [getPosition]);
  const lines = useMemo(() => (doc?.lines || []).map(line => ({ ...line, translatedLyric: prefs.translation ? line.translatedLyric || '' : '', romanLyric: prefs.romanization ? line.romanLyric || '' : '' })), [doc, prefs.translation, prefs.romanization]);
  const seekable = !system && playback?.canControl && !playback?.remote;
  const seek = ms => { if (seekable && Number.isFinite(ms)) playback.seek(Math.max(0, (ms + totalOffset) / 1000)); };
  const hasClock = getPosition() !== null;
  useEffect(() => onBackgroundChange(setBackground), []);
  useEffect(() => { if (background) return; return frameClock().subscribe(() => setIndex(activeLyric(lines, getLyricTime(), 0)), { fps: 10 }); }, [lines, background, getLyricTime]);
  // Controls fade after three quiet seconds; any pointer or key brings them back.
  const timer = useRef(0);
  const wake = useCallback(() => { setIdle(false); clearTimeout(timer.current); timer.current = setTimeout(() => setIdle(true), 3000); }, []);
  useEffect(() => { wake(); return () => clearTimeout(timer.current); }, [wake]);
  const keys = event => {
    wake();
    if (event.target.closest?.('input,textarea,select')) return;
    const k = event.key.toLowerCase();
    if (k === ' ') { event.preventDefault(); commands.play(); }
    else if (k === 'arrowleft' || k === 'arrowright') { const p = getPosition(); if (p !== null && seekable) { event.preventDefault(); playback.seek(Math.max(0, p / 1000 + (k === 'arrowleft' ? -5 : 5))); } }
    else if (k === 't' && doc?.hasTranslation) setPrefs({ translation: !prefs.translation });
    else if (k === 'r' && doc?.hasRomanization) setPrefs({ romanization: !prefs.romanization });
    else if (event.key === '[' || event.key === ']') setOffset(offset + (event.key === '[' ? -100 : 100));
  };
  const playing = Boolean(system ? system.playing : deck.audible);
  const calm = focus?.state?.timer?.phase === 'focus';
  const desktop = document.documentElement.dataset.desktopClient === 'true';
  const fallback = <LyricList lines={lines} index={index} seek={seek} seekable={seekable}/>;
  const current = lines[index];
  const words = doc?.precision === 'word';
  return <Dialog title="歌词" label="沉浸歌词" variant="full" close={close} className="lyrics-stage-dialog" onKeyDown={keys}>
    <div className={`lyrics-stage enter-${skin.enter} ${idle && !panel ? 'is-idle' : ''} ${reduced ? 'is-reduced' : ''}`} style={{ ...skinStyle(skin), '--lyric-scale': prefs.scale, '--lyric-tint': tint }} data-skin={skin.id} onPointerMove={wake} onPointerDown={wake}>
      <div className="lyrics-stage-backdrop" aria-hidden="true"><img src={`/room-scenes/v21/${skin.id}/corners/music.webp`} alt="" onError={e => { e.currentTarget.hidden = true; }}/>{deck.deckItem?.cover && <img className="lyrics-stage-cover-glow" src={deck.deckItem.cover} alt=""/>}</div>
      <StageParticles skin={skin} enabled={prefs.stageParticles && !reduced && !background} calm={calm}/>
      <header className="lyrics-stage-top">
        <button type="button" className="lyrics-stage-close" onClick={close} aria-label="收起歌词">⌄</button>
        <span className="lyrics-stage-room">{skin.name} · 歌词</span>
        <span className="lyrics-stage-tools">
          {desktop && <button type="button" onClick={() => desktopCommand('lyrics-toggle')}>桌面歌词</button>}
          <button type="button" aria-expanded={panel} onClick={() => setPanel(v => !v)}>歌词设置</button>
        </span>
      </header>
      <aside className="lyrics-stage-now">
        <div className={`lyrics-stage-art ${playing && !reduced ? 'is-playing' : ''}`}>{deck.deckItem?.cover ? <img src={deck.deckItem.cover} alt=""/> : <span aria-hidden="true">♪</span>}</div>
        <div className="lyrics-stage-meta"><strong>{track.title || '还没有放歌'}</strong><span>{track.artist || '放一张喜欢的唱片'}</span></div>
        <StageProgress deck={deck} seekable={seekable} onSeek={seconds => playback.seek(seconds)}/>
        <div className="lyrics-stage-controls">
          <button type="button" onClick={() => commands.previous()} aria-label="上一首">⏮</button>
          <button type="button" className="lyrics-stage-play" onClick={() => commands.play()} aria-label={playing ? '暂停' : '播放'}>{playing ? <Pause size={22}/> : <Play size={22}/>}</button>
          <button type="button" onClick={() => commands.next()} aria-label="下一首">⏭</button>
        </div>
        <div className="lyrics-stage-pet" aria-hidden="true"><PixelCat petId={identity.builtinId} accessory={identity.accessory} pose={playing ? 'listen' : 'idle'} musicBeat={playing && !reduced} reduceMotion={reduced}/></div>
      </aside>
      <main className="lyrics-stage-lyrics" style={{ fontSize: `calc(${prefs.scale} * clamp(22px, 3.2vw, 44px))` }} aria-live="off">
        {error && <div className="lyrics-stage-empty" role="alert"><p>{error}</p><button type="button" onClick={retry}>重试</button></div>}
        {!error && busy && !doc && <div className="lyrics-stage-empty" role="status"><p>正在翻歌词本…</p></div>}
        {doc && !lines.length && <div className="lyrics-stage-empty">{doc.plain ? <pre>{doc.plain}</pre> : <><p>{doc.instrumental ? '纯音乐，请安静聆听' : doc.reason || '暂时没有找到歌词'}</p><button type="button" onClick={() => setPanel(true)}>{doc.candidates?.length ? '挑一版相近的歌词' : '导入本地歌词'}</button></>}</div>}
        {lines.length > 0 && !hasClock && <p className="lyrics-stage-note">播放器没有提供可靠进度，可以手动浏览歌词。</p>}
        {lines.length > 0 && (hasClock && !background ? <RendererBoundary key={track.title} fallback={fallback}><Suspense fallback={fallback}><AmllPlayer lines={lines} getTime={getLyricTime} playing={playing} reduced={reduced} lite={performanceLevel() === 'low'} wordLevel={words} onSeek={seek}/></Suspense></RendererBoundary> : fallback)}
        {/* Screen readers hear the current line, not the animated view. */}
        <p className="lyrics-sr-only" aria-live="polite">{current ? current.words.map(w => w.word).join('') : ''}</p>
      </main>
      {panel && <StageSettings track={track} doc={doc} prefs={prefs} setPrefs={setPrefs} offset={offset} setOffset={setOffset} getPosition={getPosition} totalOffset={totalOffset} close={() => setPanel(false)}/>}
    </div>
  </Dialog>;
}
