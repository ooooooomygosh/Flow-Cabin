import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import Dialog from '../Dialog';
import { Segmented } from '../ui/Roving';
import { rovingIndex } from '../ui/roving-keys.mjs';
import PixelTurntable from './PixelTurntable';
import { sideProgress, seekTarget } from './turntable-physics.mjs';
import { cornerLayout, paintScene, sceneProps, weatherTile } from './corner-scene.mjs';
import { sleeveCanvas, sleeveUrl } from './sleeve-art.mjs';
import { flyRecord } from './record-flight.mjs';
import { deckSoundsEnabled, setDeckSounds } from './deck-sfx.mjs';
import { displayTitle } from '../display-title.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist } from '../track-meta.mjs';
import { formatDuration, formatSeconds } from '../lib/time-format.mjs';
import { bindEnergyVar } from '../scene/playback-listener.mjs';
import { timeOfDay, normalizeWeather } from '../room-ambience.mjs';
import { bitmapPath } from '../pixel-icon-bitmaps.mjs';
import { usePlaybackDuration, usePlaybackPosition } from '../deck/usePlaybackClock';
import { ChevronLeft, ChevronRight, Pause, Play, Plus, X, SpeakerWave, SpeakerOff, Disc3 } from '../icons';
import './listening-corner.css';

// 唱机特写 · Listening Corner: the deck up close on a lamp-lit desk in a small
// pixel room, its liner notes standing beside it, and a crate of records to
// flip through. Room, deck and sleeves share one integer pixel grid.
const glyph = (rows) => function Glyph() { return <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" shapeRendering="crispEdges" fill="currentColor"><path d={bitmapPath(rows)}/></svg>; };
const LampIcon = glyph(['....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '.XXXXXXXXXX.', '....X..X....', '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '...XXXXXX...', '..XXXXXXXX..', '............']);
const SunsetIcon = glyph(['.....X......', '..X.....X...', '.....XX.....', '...XXXXXX...', 'X.XXXXXXXX.X', '..XXXXXXXX..', 'XXXXXXXXXXXX', '............', '.XXXXXXXXXX.', '............', '...XXXXXX...', '............']);
const MoonIcon = glyph(['.....XXXX...', '...XXXX.....', '..XXXX......', '.XXXX.......', '.XXXX.......', 'XXXX........', 'XXXX........', '.XXXX.......', '.XXXXX....X.', '..XXXXXXXXX.', '...XXXXXXX..', '.....XXX....']);
const LIGHTS = [{ id: 'lamp', label: '台灯', icon: <LampIcon/> }, { id: 'dusk', label: '黄昏', icon: <SunsetIcon/> }, { id: 'night', label: '深夜', icon: <MoonIcon/> }];
const SPEEDS = [{ id: 33, label: '33' }, { id: 45, label: '45' }];
const LIGHT_KEY = 'album-circle-corner-light-v1';

// The visual-only deck has no audio clock; time passes while it spins.
function useVisualClock(running, key) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { setSeconds(0); }, [key]);
  useEffect(() => { if (!running) return; const timer = setInterval(() => setSeconds((value) => value + 1), 1000); return () => clearInterval(timer); }, [running]);
  return seconds;
}
const measure = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
function useCornerLayout(records) {
  const [size, setSize] = useState(measure);
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setSize((old) => { const next = measure(); return old.width === next.width && old.height === next.height && old.dpr === next.dpr ? old : next; })); };
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); };
  }, []);
  return useMemo(() => cornerLayout({ ...size, records }), [size, records]);
}
const box = ({ x, y, w, h }) => ({ left: x, top: y, width: w, height: h });
// The sleeve: the cover, or a generated pixel sleeve when there is none (or it fails).
function Sleeve({ item, className = '', lazy = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item?.cover]);
  const generated = !item?.cover || failed;
  return <img className={`${className}${generated ? ' is-generated' : ''}`} src={generated ? sleeveUrl(item) : item.cover} alt="" decoding="async" loading={lazy ? 'lazy' : undefined} referrerPolicy="no-referrer" draggable="false" onError={() => setFailed(true)}/>;
}
// The hero sleeve on the liner notes: the cover box-filtered to 64 × 64 art
// pixels and shown on the room's pixel grid (drawn, never read back, so
// artwork from any origin works).
function PixelSleeve({ item }) {
  const canvas = useRef(null);
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d'); if (!ctx) return;
    let alive = true;
    const draw = (source) => { if (!alive) return; ctx.clearRect(0, 0, 64, 64); ctx.imageSmoothingEnabled = !(source instanceof HTMLCanvasElement); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, 64, 64); };
    const fallback = () => { const art = sleeveCanvas(item); if (art) draw(art); };
    if (!item?.cover) { fallback(); return () => { alive = false; }; }
    const image = new Image(); image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.onload = () => draw(image); image.onerror = fallback; image.src = item.cover;
    return () => { alive = false; };
  }, [item?.id, item?.cover]);
  return <canvas ref={canvas} width="64" height="64" role="img" aria-label={`${item.title} 封套`}/>;
}
// A record's spine: the colours along the cover's left edge, averaged into five
// blocks (drawn, never read back), under the title printed down the spine. A
// crop of the cover would show a sliver of its picture, which reads as noise.
function SpineArt({ item }) {
  const canvas = useRef(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    let alive = true;
    const draw = (source) => { if (!alive) return; const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height; if (!w || !h) return; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, Math.max(1, Math.round(w * .35)), h, 0, 0, 1, 5); };
    const fallback = () => { const art = sleeveCanvas(item); if (art) draw(art); };
    if (!item?.cover) { fallback(); return () => { alive = false; }; }
    const image = new Image(); image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.onload = () => draw(image); image.onerror = fallback; image.src = item.cover;
    return () => { alive = false; };
  }, [item?.id, item?.cover]);
  return <><canvas ref={canvas} className="corner-spine-art" width="1" height="5" aria-hidden="true"/><span className="corner-spine-title" aria-hidden="true">{displayTitle(item.title)}</span></>;
}

export default function ListeningCorner({ item, items = [], vinyl, provider, spinning, trackIndex = 0, setTrackIndex, playback, player, toggleVisual, load, close, reduceMotion = false }) {
  const audible = provider !== 'visual' && provider !== 'system' && playback;
  const playing = audible ? Boolean(playback.playing) : Boolean(spinning);
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const names = trackNames(item), durations = (item?.trackDetails || []).map((track) => track?.lengthMillis || 0);
  const lengths = names.map((_, index) => durations[index] || 0);
  const visualSeconds = useVisualClock(!audible && spinning && Boolean(item), `${item?.id}|${trackIndex}`);
  // Whole seconds are all the needle and the clock show: one render a second.
  const playhead = usePlaybackPosition(audible ? playback : null, 1), duration = usePlaybackDuration(audible ? playback : null);
  const position = audible ? playhead : visualSeconds;
  const { progress, gaps } = useMemo(() => sideProgress(lengths.length ? lengths : [0], trackIndex, position), [lengths.join(), trackIndex, Math.floor(position)]);
  const [speed, setSpeed] = useState(33), [light, setLight] = useState(() => { try { const value = localStorage.getItem(LIGHT_KEY); return LIGHTS.some((entry) => entry.id === value) ? value : 'lamp'; } catch { return 'lamp'; } });
  const [sounds, setSounds] = useState(deckSoundsEnabled), [query, setQuery] = useState(''), [notice, setNotice] = useState(''), [activeId, setActiveId] = useState(item?.id || null);
  const layout = useCornerLayout(Math.min(120, items.length)), scene = useRef(null), crateList = useRef(null), deckRef = useRef(null), list = useRef(null), dialogRoot = () => deckRef.current?.closest('.listening-corner');
  const hint = useId();
  // The room's weather and hour (the cabin behind keeps them on its scene).
  const ambience = useMemo(() => { const room = document.querySelector('.room-scene'); return { weather: normalizeWeather(room?.dataset.weather), time: room?.dataset.timeOfDay || timeOfDay(new Date().getHours()) }; }, []);
  const props = useMemo(() => sceneProps(layout, { light }), [layout, light]);
  useEffect(() => { setSpeed(33); }, [item?.id]);
  useEffect(() => {
    // Energy breathes in the lamp pool only (one element), in eighths, through the rAF-coalesced playback listener.
    const offEnergy = bindEnergyVar(() => dialogRoot()?.querySelector('.corner-pool'), '--corner-energy', 8);
    document.documentElement.classList.add('room-corner-open');
    return () => { offEnergy(); document.documentElement.classList.remove('room-corner-open'); };
  }, []);
  // The liner notes are as tall as their content (standing on the desk); the room paints their shadow.
  const card = useRef(null), [cardH, setCardH] = useState(0);
  useLayoutEffect(() => {
    const node = card.current; if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setCardH(Math.round(node.offsetHeight)));
    observer.observe(node); setCardH(Math.round(node.offsetHeight));
    return () => observer.disconnect();
  }, [Boolean(item)]);
  // The room is painted once per size, light and weather; nothing in it animates.
  useLayoutEffect(() => {
    const canvas = scene.current; if (!canvas) return;
    canvas.width = layout.art.w; canvas.height = layout.art.h;
    const h = cardH || layout.card.h, room = layout.narrow ? layout : { ...layout, card: { ...layout.card, y: layout.card.y + layout.card.h - h, h } };
    paintScene(canvas.getContext('2d'), room, { light, weather: ambience.weather, time: ambience.time });
  }, [layout, light, ambience, cardH]);
  const tiles = useMemo(() => ({ weather: ['snow', 'rain'].includes(ambience.weather) ? weatherTile(ambience.weather).toDataURL() : '', dust: weatherTile('dust').toDataURL() }), [ambience.weather]);
  // The room's keys stand down while a dialog is open, so the corner answers T itself;
  // Esc in a filled crate search clears it first, the next Esc leaves (Dialog).
  const keys = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && event.target?.matches?.('input[type=search]') && event.target.value) { event.preventDefault(); setQuery(''); return; }
    if ((event.key === 't' || event.key === 'T') && !event.shiftKey && !event.repeat && !event.target?.closest?.('input,textarea,select')) { event.preventDefault(); close(); }
  };
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
  const changeLight = (value) => { setLight(value); try { localStorage.setItem(LIGHT_KEY, value); } catch {} };

  // ── Crate ──
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const matches = items.filter(entry => !needle || `${entry.title} ${entry.artist}`.normalize('NFKC').toLowerCase().includes(needle));
  const crate = matches.slice(0, 120);
  const activeIndex = Math.max(0, crate.findIndex((entry) => entry.id === activeId));
  const active = crate[activeIndex] || null;
  useEffect(() => { setActiveId(crate[0]?.id ?? null); }, [needle]);
  const queued = (entry) => Boolean(player?.queue.ids.includes(entry.id));
  const spineArt = (id) => crateList.current?.querySelector(`[data-id="${CSS.escape(String(id))}"] .corner-spine-art`);
  const pick = (entry) => {
    flyRecord({ from: spineArt(entry.id), to: deckRef.current?.querySelector('canvas'), cover: entry.cover || sleeveUrl(entry), mode: 'load' });
    load(entry, 0);
  };
  const queueRecord = (entry) => {
    if (!player?.enqueue(entry.id)) { setNotice(''); return; }
    flyRecord({ from: spineArt(entry.id), to: dialogRoot()?.querySelector('.corner-crate-status'), cover: entry.cover || sleeveUrl(entry), mode: 'queue' });
    setNotice(`《${entry.title}》已加入待播`);
  };
  const spineKeys = (event, index) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.key === '+' || event.key === '=') && crate[index]) { event.preventDefault(); if (crate[index].id !== item?.id && !queued(crate[index])) queueRecord(crate[index]); return; }
    const next = rovingIndex(event.key, index, crate.length, 'horizontal');
    if (next < 0) return;
    event.preventDefault(); setActiveId(crate[next].id);
    const node = crateList.current?.querySelectorAll('.corner-spine')[next]; node?.focus(); node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  // The peek card floats above the active spine.
  const [peekLeft, setPeekLeft] = useState(0);
  const placePeek = () => {
    if (layout.crate.peek !== 'top') return;
    const listNode = crateList.current, spine = listNode?.querySelectorAll('.corner-spine')[activeIndex];
    if (!listNode || !spine) return;
    const nav = listNode.closest('.corner-crate').getBoundingClientRect(), at = spine.getBoundingClientRect();
    setPeekLeft(Math.round(Math.max(8, Math.min(nav.width - 188, at.left - nav.left + at.width / 2 - 90))));
  };
  useLayoutEffect(placePeek, [activeIndex, crate.length, layout]);
  const upNext = (player?.queue.ids || []).map((id) => items.find((entry) => entry.id === id)).filter(Boolean).slice(0, 3);
  const count = names.length, sideTotal = lengths.reduce((sum, value) => sum + value, 0);
  const style = { '--corner-s': `${layout.s}px` };
  const s = layout.s;
  return <Dialog variant="full" title="唱机特写" close={close} returnFocus=".focus-badge" onKeyDown={keys} deckKeys className={`listening-corner is-${light}${layout.narrow ? ' is-narrow' : ''}`} container={document.querySelector('.cabin-room')}>
    <div className="corner-room" style={style} aria-hidden="true">
      <canvas ref={scene} className="corner-scene" style={{ width: layout.art.w * s, height: layout.art.h * s }}/>
      {tiles.weather && <span className={`corner-weather is-${ambience.weather}`} style={{ ...box({ x: props.panes.x * s, y: props.panes.y * s, w: props.panes.w * s, h: props.panes.h * s }), '--tile': `url(${tiles.weather})`, '--tile-size': `${32 * s}px` }}/>}
      {light !== 'dusk' && <span className="corner-pool" style={{ ...box({ x: (props.poolCenter[0] - props.poolRadius) * s, y: (props.poolCenter[1] - props.poolRadius * .7) * s, w: props.poolRadius * 2 * s, h: (Math.min(props.poolCenter[1] + props.poolRadius * .7, props.deskFront) - props.poolCenter[1] + props.poolRadius * .7) * s }), '--tile': `url(${tiles.dust})`, '--tile-size': `${32 * s}px` }}/>}
    </div>
    <header className="corner-bar">
      <span className="corner-title"><Disc3 size={24}/>唱机特写</span>
      <span className="corner-bar-actions">
        <Segmented className="segmented corner-light" label="灯光" items={LIGHTS} value={light} onChange={changeLight}/>
        <button type="button" className="pixel-button is-quiet corner-sounds" aria-pressed={sounds} title="唱针落下、抬起与唱片出套的声音" onClick={() => { setDeckSounds(!sounds); setSounds(!sounds); }}>{sounds ? <SpeakerWave size={12}/> : <SpeakerOff size={12}/>}<span>唱机声音</span></button>
        <button type="button" className="pixel-button" aria-keyshortcuts="Escape T" onClick={close}><X size={12}/>回到小屋<kbd>Esc</kbd></button>
      </span>
    </header>
    <div ref={deckRef} className="corner-deck" style={box(layout.deck)}>
      <PixelTurntable item={item} vinyl={vinyl} playing={playing && !busy} progress={item ? progress : 0} gaps={gaps} speed={speed} light={light} reduceMotion={reduceMotion}
        label={item ? `唱机特写：${item.title}${playing ? '，正在播放' : '，已暂停'}` : '唱机特写：还没有放唱片'} onToggle={item ? toggle : undefined} onSeek={item ? seek : undefined} onSpeed={changeSpeed}/>
      {!item && <p className="corner-empty">从下面的唱片箱挑一张，或回到小屋双击封面。</p>}
    </div>
    <aside ref={card} className="corner-side" aria-label="正在播放" style={{ left: layout.card.x, width: layout.card.w, maxHeight: layout.card.h, ...(layout.narrow ? { top: layout.card.y, height: layout.card.h } : { bottom: layout.height - layout.card.y - layout.card.h }), '--corner-sleeve': layout.narrow ? Math.round(40 * s) : Math.min(Math.round((layout.height < 640 ? 48 : 64) * s), Math.round(layout.card.w * .4)) }}>
      {item ? <>
        <div className="corner-head">
          <div className="corner-sleeve"><PixelSleeve item={item}/></div>
          <div className="corner-copy">
            <small>{item.type === 'playlist' ? '歌单' : item.year || '唱片'} · {speed === 45 ? '45 转' : '33⅓ 转'}</small>
            <h2 title={item.title}>{displayTitle(item.title)}</h2>
            <p className="corner-artist">{item.type === 'playlist' ? trackArtist(item, trackIndex) : item.artist}</p>
            <p className="corner-meter" aria-label={`第 ${trackIndex + 1} 首，共 ${count} 首`}>
              <b>SIDE A</b>
              <span className="corner-meter-bar">{count <= 16 ? names.map((_, index) => <i key={index} className={index < trackIndex ? 'is-done' : index === trackIndex ? 'is-now' : undefined}/>) : <i className="is-fill" style={{ width: `${Math.round(progress * 100)}%` }}/>}</span>
              <span>{String(trackIndex + 1).padStart(2, '0')}/{String(count).padStart(2, '0')}</span>
            </p>
          </div>
        </div>
        <p className="corner-now" title={names[trackIndex]}><span aria-hidden="true">▶</span>{displayTitle(audible && playback.actualTrack || names[trackIndex] || '暂无曲目信息')}</p>
        <div className="corner-transport">
          <button type="button" aria-label="上一首" disabled={!player?.canPrevious} onClick={() => player?.previous()}><ChevronLeft size={12}/></button>
          <button type="button" className="corner-play" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>{playing ? <Pause size={24}/> : <Play size={24}/>}</button>
          <button type="button" aria-label="下一首" disabled={!player?.canNext} onClick={() => player?.next()}><ChevronRight size={12}/></button>
          <span className="corner-time">{audible && duration ? `${formatSeconds(position)} / ${formatSeconds(duration)}` : provider === 'visual' ? '仅动画 · 无音频' : ''}</span>
          <Segmented className="segmented corner-speed" label="转速" items={SPEEDS} value={speed} onChange={changeSpeed}/>
        </div>
        {audible && playback.statusText && !playback.playing && <p className="corner-status" role="status">{playback.statusText}</p>}
        <ol ref={list} className="corner-tracks" aria-label="本面曲目">{names.map((name, index) => <li key={index}><button type="button" aria-current={index === trackIndex ? 'true' : undefined} onClick={() => setTrackIndex(index)}>
          <b>{String(index + 1).padStart(2, '0')}</b><span>{displayTitle(name)}</span><small>{lengths[index] ? formatDuration(lengths[index]) : ''}</small>
          <i className="corner-groove" style={{ width: `${Math.max(6, Math.round((sideTotal ? lengths[index] / sideTotal : 1 / Math.max(1, count)) * 100))}%` }}/>
        </button></li>)}</ol>
        {upNext.length > 0 && <div className="corner-next"><small>接下来</small><ul>{upNext.map((entry) => <li key={entry.id} title={`${entry.title} · ${entry.artist}`}><Sleeve item={entry}/><span>{displayTitle(entry.title)}</span></li>)}</ul></div>}
      </> : <p className="corner-empty-side">唱机上还没有唱片。<br/>从唱片箱里抽一张吧。</p>}
    </aside>
    {items.length > 0 && <nav className={`corner-crate is-peek-${layout.crate.peek}`} aria-label="唱片箱" style={{ left: layout.crate.x, width: layout.crate.w, height: layout.crate.h, bottom: layout.floorGap, '--spine-w': `${layout.spine.w}px`, '--spine-gap': `${layout.spine.gap}px` }}>
      {player?.queueError && <p role="alert">{player.queueError}</p>}
      <ul ref={crateList} className="corner-crate-spines" aria-describedby={hint} onScroll={placePeek}>{crate.map((entry, index) => <li key={entry.id} data-id={entry.id}>
        <button type="button" className={`corner-spine${entry.id === item?.id ? ' is-current' : ''}${index === activeIndex ? ' is-active' : ''}`} tabIndex={index === activeIndex ? 0 : -1} aria-label={`放上《${entry.title}》`} title={`${entry.title} · ${entry.artist}`}
          onClick={() => pick(entry)} onFocus={() => setActiveId(entry.id)} onPointerEnter={() => setActiveId(entry.id)} onKeyDown={(event) => spineKeys(event, index)}>
          <SpineArt item={entry}/>
        </button>
      </li>)}</ul>
      {active && <div className="corner-crate-peek" style={layout.crate.peek === 'top' ? { left: peekLeft } : undefined}>
        <Sleeve item={active}/>
        <span><b title={active.title}>{displayTitle(active.title)}</b><small>{active.artist}</small></span>
        {player && active.id !== item?.id && <button type="button" className="corner-crate-queue" aria-label={`加入待播 ${active.title}`} disabled={queued(active)} onClick={() => queueRecord(active)}><Plus size={12}/>{queued(active) ? '已入队' : '待播'}</button>}
        {active.id === item?.id && <em>在唱机上</em>}
      </div>}
      <div className="corner-crate-front">
        <div className="corner-crate-tools"><label>唱片箱<input type="search" aria-label="查找唱片箱" placeholder="唱片或歌手" value={query} onChange={event => setQuery(event.target.value)}/></label><span className="corner-crate-status" role="status">{notice || `待播 ${player?.queue.ids.length || 0} 张 · ${matches.length} 张匹配`}</span></div>
        <span id={hint} className="corner-crate-hint">← → 翻找 · 回车放上唱机 · + 加入待播</span>
      </div>
      {!matches.length && <p className="corner-crate-empty">没有找到匹配唱片，换个关键词试试。</p>}
      {matches.length > 120 && <small className="corner-crate-more">显示前 120 张，搜索可以查找全部 {items.length} 张。</small>}
    </nav>}
  </Dialog>;
}
