import OnboardingWizard from './onboarding/OnboardingWizard';
import SettingsHub from './onboarding/SettingsHub';
import * as onboardingModel from './onboarding/onboarding-model.mjs';
import { createPlayerAdapter, createDesktopAdapter } from './onboarding/onboarding-adapter.mjs';
import { musicRequest, trackCover } from './room-playback.mjs';
import { enterDesktopMode, exitDesktopMode, getDesktopModeStatus, onDesktopModeChange, installDesktopApi, reportTrayPet } from './desktop/desktop-sink-client.mjs';
import { getRoomScene } from './scene-catalog.mjs';
import { normalizePetId } from './pet/pet-catalog.mjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Up, Down, ArrowUpRight, Grid3X3, Settings, External, Music2, Eye, EyeSlash, Heart, Plus, ListBullet, Check, Computer } from './icons';
import DiscogsLink from './DiscogsLink';
import { RecordBoxControls, RecordTools, useRecordLibrary, useRecordStyle } from './RecordLibrary';
import { matchesLibraryFilters } from './record-library.mjs';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import RoomScene from './RoomScene';
import RoomTurntable from './RoomTurntable';
import { shelfWindow } from './room-model.mjs';
import MusicSettings from './MusicSettings';
import useRoomPlayback from './useRoomPlayback';
import useSystemNowPlaying from './useSystemNowPlaying';
import FocusDock, { FocusBadge } from './focus/FocusDock';
import { useFocus } from './focus/useFocus';
import { focusSnapshot } from './focus/focus-model.mjs';
import { useSoundscape } from './audio/useSoundscape';
import RoomCat from './pet/RoomCat';
import ListeningCorner from './turntable/ListeningCorner';
import DesktopWidgets, { ImmersiveChrome } from './desktop/DesktopWidgets';
import { flyRecord } from './turntable/record-flight.mjs';
import { usePlayerQueue, usePlayerShortcuts, usePlaybackBroadcast, suggestProvider } from './player/usePlayer';
import './companion-room.css';
export { ShowroomArtwork } from './RoomArtwork';

const snapshotItem = (item) => item ? ({ id: item.id, title: item.title, artist: item.artist, cover: item.cover, type: item.type, tracks: item.tracks, externalIds: item.externalIds, collectionId: item.collectionId }) : null;
const PROVIDERS = ['auto', 'qq', 'netease', 'ma', 'local', 'appleMusic', 'system'];
const SORTS = { recent: '最近放上', year: '发行年份', title: '专辑名', artist: '歌手' };
const readJSON = (key, fallback) => { try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key)) || {}) }; } catch { return fallback; } };
const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

// Sort and filter the shelf: kept on this computer between visits.
function useShelfFilters(items) {
  const library = useRecordLibrary();
  const [filters, setFiltersState] = useState(() => readJSON('album-circle-shelf-filters-v1', { sort: 'recent', type: 'all', box: 'all', genre: 'all', decade: 'all', provider: 'all' }));
  const setFilters = (change) => setFiltersState((old) => { const next = typeof change === 'function' ? change(old) : change; writeJSON('album-circle-shelf-filters-v1', next); return next; });
  const visible = useMemo(() => {
    const list = items.filter((item) => (filters.type === 'all' || item.type === filters.type) && matchesLibraryFilters(item, library.data, library.roomId, filters));
    const by = { year: (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0), title: (a, b) => String(a.title).localeCompare(String(b.title), 'zh'), artist: (a, b) => String(a.artist).localeCompare(String(b.artist), 'zh'), recent: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) };
    return [...list].sort(by[filters.sort] || by.recent);
  }, [items, filters, library.data, library.roomId]);
  return { filters, setFilters, visible };
}

export default function CabinRoom({ items, loading, openRecord, openAdd, firstVisit = false, hubRequest = null, openBackup, openWall, notify }) {
  const library = useRecordLibrary(), look = library?.data.rooms[library.roomId]?.look || 'pixel';
  const appearance = useDesktopAppearance();
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId);
  // Settings hub section ('' = closed). Old shortcuts open their section.
  const [hub, setHub] = useState('');
  const env = useMemo(() => onboardingModel.detectEnv(window), [appearance.client]);
  const playerAdapter = useMemo(() => createPlayerAdapter({ env, command: desktopCommand, request: musicRequest }), [env]);
  const [onboarding, setOnboarding] = useState(() => onboardingModel.readOnboarding(localStorage));
  const [wizard, setWizard] = useState(false);
  const welcomeChecked = useRef(false);
  const saveOnboarding = (next) => { setOnboarding(next); try { onboardingModel.writeOnboarding(localStorage, next); } catch { notify?.('这次未能记住引导进度，下次仍可从「设置 › 关于」重新引导。'); } };
  useEffect(() => {
    if (loading || welcomeChecked.current) return;
    welcomeChecked.current = true;
    if (onboardingModel.shouldAutoOpen(onboarding, { isNew: firstVisit && !items.length })) { setWizard(true); if (onboarding.status === 'new') saveOnboarding(onboardingModel.start(onboarding)); }
  }, [loading, firstVisit, items.length]);
  useEffect(() => { if (hubRequest?.section) setHub(hubRequest.section); }, [hubRequest]);
  const restartOnboarding = () => { setHub(''); saveOnboarding(onboardingModel.reopen(onboarding)); setWizard(true); };
  // 音源设置 / turntable error buttons open the hub's 音源 detail page directly.
  const openMusicDeep = () => setMusicSettings(true);
  const { filters, setFilters, visible } = useShelfFilters(items);
  const [row, setRow] = useState(0), [selectedId, setSelectedId] = useState(visible[0]?.id || '');
  const [record, setRecord] = useState(null), [spinning, setSpinning] = useState(false), [trackIndex, setTrackIndex] = useState(0);
  const [provider, setProvider] = useState(() => { try { const value = localStorage.getItem('album-circle-room-player-v1'); return PROVIDERS.includes(value) || value === 'visual' ? value : 'visual'; } catch { return 'visual'; } });
  const chosenProvider = useRef((() => { try { return Boolean(localStorage.getItem('album-circle-room-player-v1')); } catch { return true; } })());
  const chooseProvider = (value) => { chosenProvider.current = true; setProvider(value); try { localStorage.setItem('album-circle-room-player-v1', value); } catch {} };
  const [musicSettings, setMusicSettings] = useState(false), [filtersOpen, setFiltersOpen] = useState(false);
  const queueRef = useRef(null);
  const playback = useRoomPlayback(record, trackIndex, provider, (manual = false) => queueRef.current?.current.next(manual), { peekNext: () => queueRef.current?.current.peekNext(), canNext: () => Boolean(queueRef.current?.current.canNext) });
  const system = useSystemNowPlaying(provider === 'system');
  // A playlist shows the current song's own cover on the deck, widgets and media keys.
  const shownCover = provider === 'system' ? '' : trackCover(record, trackIndex, playback.actualCover);
  const deckItem = useMemo(() => provider === 'system' ? system.item : record && shownCover && shownCover !== record.cover ? { ...record, cover: shownCover } : record, [provider, system.item, record, shownCover]);
  const effectiveSpin = provider === 'visual' ? spinning : provider === 'system' ? Boolean(system.active && system.playing) : playback.playing;
  const [wallpaper, setWallpaper] = useState(() => window.albumRoomWallpaperState || {});
  const [wallpaperError, setWallpaperError] = useState('');
  useEffect(() => {
    setWallpaperError(wallpaper.error || '');
    if (!wallpaper.error) return;
    const timer = setTimeout(() => setWallpaperError(''), 5000);
    return () => clearTimeout(timer);
  }, [wallpaper]);
  const stage = useRef(null), wheel = useRef({ amount: 0, time: 0 }), snapshot = useRef(null);
  const focus = useFocus(), sound = useSoundscape();
  const [dock, setDock] = useState(() => readJSON('album-circle-focus-dock-v1', { open: false, tab: 'timer' }));
  const saveDock = (change) => setDock((old) => { const next = { ...old, ...change }; writeJSON('album-circle-focus-dock-v1', next); return next; });
  const [desktopMode, setDesktopMode] = useState(() => document.documentElement.dataset.desktopMode === 'true'), [fullscreen, setFullscreen] = useState(() => document.documentElement.dataset.desktopFullscreen === 'true');
  const [corner, setCorner] = useState(false), [zen, setZen] = useState(false), [pet, setPet] = useState(() => window.albumPetState || {});
  const shelfColumns = getRoomScene(look).geometry.columns.length;
  const signature = visible.map((item) => item.id).join('|'), view = shelfWindow(visible, row, shelfColumns);
  const selected = view.items.find((item) => item.id === selectedId) || view.items[0];
  const load = (item, index = 0) => {
    if (!chosenProvider.current && provider === 'visual') { const suggested = suggestProvider(item); if (suggested) { setProvider(suggested); chosenProvider.current = true; } }
    if (record?.id === item.id && trackIndex === index && provider !== 'visual' && !playback.playing) playback.toggle(); setRecord(item); setSelectedId(item.id); setTrackIndex(index); setSpinning(true); };
  const [player, playerRef] = usePlayerQueue({ items, record, trackIndex, setTrackIndex, loadAlbum: (item, index) => loadRef.current(item, index), playback, provider });
  queueRef.current = playerRef;
  usePlayerShortcuts({ playback, player, provider, record: provider === 'system' ? record : deckItem, trackIndex, spinning, toggleVisual: () => setSpinning((value) => !value) });
  usePlaybackBroadcast({ playing: provider === 'system' ? Boolean(system.active && system.playing) : provider === 'visual' ? false : playback.playing, provider, spinning: effectiveSpin, record: deckItem, trackIndex: provider === 'system' ? 0 : trackIndex, trackTitle: provider === 'system' ? system.title : playback.actualTrack, audio: playback.audio });
  useEffect(() => { const open = () => openMusicDeep(), openCorner = () => setCorner(true); window.addEventListener('cabin-open-music-settings', open); window.addEventListener('cabin-open-corner', openCorner); return () => { window.removeEventListener('cabin-open-music-settings', open); window.removeEventListener('cabin-open-corner', openCorner); }; }, []);
  const changeRow = (next) => { const value = shelfWindow(visible, next, shelfColumns); setRow(value.startRow); setSelectedId(value.items[0]?.id || ''); };
  useEffect(() => { setRow(0); setSelectedId(visible[0]?.id || ''); }, [signature, look]);
  useEffect(() => { if (record && !items.some((item) => item.id === record.id)) { setRecord(null); setSpinning(false); } }, [items]);
  // The album card asks the deck to play an album, optionally from a track.
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    // A playlist saved a moment ago may not be in `items` yet; the event carries it.
    const resolve = (detail) => items.find((entry) => entry.id === detail?.id) || (detail?.item?.id === detail?.id ? detail.item : null);
    const play = (event) => { const item = resolve(event.detail); if (!item) return; if (event.detail.shuffle && !queueRef.current?.current?.queue.shuffle) queueRef.current?.current?.toggleShuffle(); loadRef.current(item, Math.max(0, Number(event.detail.track) || 0)); };
    const enqueue = (event) => { const item = resolve(event.detail); if (event.detail) event.detail.accepted = Boolean(item && queueRef.current?.current?.enqueue(item.id)); };
    window.addEventListener('cabin-play', play); window.addEventListener('cabin-enqueue', enqueue);
    return () => { window.removeEventListener('cabin-play', play); window.removeEventListener('cabin-enqueue', enqueue); };
  }, [items]);
  useEffect(() => {
    // 桌面模式 and fullscreen are decided by the desktop shell; the page follows.
    const mode = (event) => setDesktopMode(Boolean(event.detail?.active)), screen = (event) => setFullscreen(Boolean(event.detail));
    const observer = new MutationObserver(() => { setDesktopMode(document.documentElement.dataset.desktopMode === 'true'); setFullscreen(document.documentElement.dataset.desktopFullscreen === 'true'); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-mode', 'data-desktop-fullscreen'] });
    window.addEventListener('album-desktop-mode', mode); window.addEventListener('album-desktop-fullscreen', screen);
    return () => { observer.disconnect(); window.removeEventListener('album-desktop-mode', mode); window.removeEventListener('album-desktop-fullscreen', screen); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('room-desktop', desktopMode); window.dispatchEvent(new Event('resize')); return () => document.documentElement.classList.remove('room-desktop'); }, [desktopMode]);
  // In a browser preview there is no shell: 桌面模式 only changes the layout.
  // 沉入桌面 replaces 桌面模式 + 动态桌面背景. In a browser preview there is no shell: it only previews the widget layout.
  const [sink, setSink] = useState(getDesktopModeStatus);
  useEffect(() => { installDesktopApi(); setSink(getDesktopModeStatus()); return onDesktopModeChange(setSink); }, [appearance.client]);
  useEffect(() => { reportTrayPet(petId); }, [petId, appearance.client]);
  const toggleDesktopMode = () => { if (appearance.client) { if (sink.active || sink.busy) exitDesktopMode(); else enterDesktopMode(); } else setDesktopMode((value) => !value); };
  useEffect(() => { document.documentElement.classList.toggle('room-zen', zen); document.documentElement.classList.toggle('room-focus-open', dock.open); document.documentElement.classList.toggle('room-filters-open', filtersOpen); }, [zen, dock.open, filtersOpen]);
  useEffect(() => () => document.documentElement.classList.remove('room-zen', 'room-focus-open', 'room-filters-open'), []);
  useEffect(() => {
    const key = (event) => {
      if (event.defaultPrevented || event.repeat || event.target?.closest?.('input,textarea,select,[contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
      if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); setZen((value) => !value); }
      else if ((event.key === 't' || event.key === 'T') && !event.shiftKey) { event.preventDefault(); setCorner((value) => !value); }
      else if (event.key === 'Escape' && !corner && !dock.open) {
        if (zen) setZen(false);
        else if (fullscreen && appearance.client) desktopCommand('fullscreen-exit');
      }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [zen, corner, dock.open, fullscreen, appearance.client]);
  useEffect(() => { const receive = (event) => { window.albumPetState = event.detail; setPet(event.detail || {}); }; window.addEventListener('album-pet-state', receive); return () => window.removeEventListener('album-pet-state', receive); }, []);
  useEffect(() => { sound?.setDucked(provider === 'system' ? Boolean(system.playing) : provider !== 'visual' && playback.playing); }, [provider, playback.playing, system.playing]);
  useEffect(() => {
    const blocked = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"],dialog,.room-turntable,.shelf-filters,.focus-dock') || document.querySelector('dialog[open]');
    const keydown = (event) => {
      if (blocked(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); changeRow(event.key === 'Home' ? 0 : event.key === 'End' ? view.maxRow : view.startRow + (event.key === 'ArrowDown' ? 1 : -1));
    };
    const onWheel = (event) => {
      if (blocked(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault(); const now = performance.now(), current = wheel.current;
      if (now - current.time > 280 || Math.sign(current.amount) !== Math.sign(event.deltaY)) current.amount = 0;
      current.amount += event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 200 : 1);
      if (Math.abs(current.amount) >= 65 && now - current.time >= 180) { changeRow(view.startRow + Math.sign(current.amount)); current.amount = 0; current.time = now; }
    };
    document.addEventListener('keydown', keydown); stage.current.addEventListener('wheel', onWheel, { passive: false });
    const element = stage.current;
    return () => { document.removeEventListener('keydown', keydown); element.removeEventListener('wheel', onWheel); };
  }, [view.startRow, view.maxRow, signature]);
  const recordStyle = useRecordStyle(deckItem);
  const catFocus = focus ? focusSnapshot(focus.state, focus.now) : {}, weather = catFocus.weather || 'snow';
  const nowTrack = provider === 'visual' ? '' : provider === 'system' ? (system.active ? system.title : '') : playback.actualTrack || (record && playback.playing ? record.tracks?.[trackIndex] || record.title : '');
  const grooving = effectiveSpin || sound?.lofiState === 'playing';
  snapshot.current = { look, petId, petOut: Boolean(pet.active), roomName: getRoomScene(look).label, weather, accessory: catFocus.accessory || '', grooving, track: typeof nowTrack === 'string' ? nowTrack : '', startRow: view.startRow, items: view.items.map(snapshotItem), selectedId: selected?.id || '', record: snapshotItem(deckItem), recordStyle, spinning: effectiveSpin, trackIndex: provider === 'system' ? 0 : trackIndex, reduceMotion: appearance.reduceMotion, statusText: provider === 'visual' ? (record ? spinning ? '展示中 · 无音频' : '旋转已暂停 · 无音频' : '等待放盘 · 无音频') : provider === 'system' ? system.statusText : playback.statusText, actualTrack: provider === 'system' ? system.title || '' : playback.actualTrack || '', provider };
  useEffect(() => {
    const getter = () => snapshot.current; window.albumRoomSnapshot = getter;
    const receive = (event) => { window.albumRoomWallpaperState = event.detail; setWallpaper(event.detail || {}); };
    window.addEventListener('album-room-wallpaper', receive);
    return () => { if (window.albumRoomSnapshot === getter) delete window.albumRoomSnapshot; window.removeEventListener('album-room-wallpaper', receive); };
  }, []);
  const personalizeRoom = (patch) => library?.update((old) => ({ ...old, rooms: { ...old.rooms, [library.roomId]: { ...(old.rooms[library.roomId] || {}), ...patch } } }));
  const filtered = visible.length !== items.length;
  const closeWizard = (reason) => {
    setWizard(false);
    if (reason === 'skip') saveOnboarding(onboardingModel.skip(onboarding));
    else if (reason === 'done') saveOnboarding(onboardingModel.complete(onboarding));
    // 'later' keeps status 'active' so the next launch resumes this step.
  };
  // 沉入桌面 adapter; the fallback drives today's 桌面模式 until feat/desktop-merge ships its API.
  const desktopLive = useRef({}); desktopLive.current = { active: desktopMode, toggle: toggleDesktopMode };
  const desktopAdapter = useMemo(() => createDesktopAdapter({ env, fallback: { get active() { return desktopLive.current.active; }, enter: () => { if (!desktopLive.current.active) desktopLive.current.toggle(); }, exit: () => { if (desktopLive.current.active) desktopLive.current.toggle(); } } }), [env]);
  useEffect(() => { if (!window.cabinDesktop) window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: { active: desktopMode, supported: true, reason: '' } })); }, [desktopMode]);
  useEffect(() => {
    const receive = (event) => { const command = event.detail?.command; if (command === 'open-settings') setHub((value) => value || 'music'); if (command === 'open-about') setHub('about'); if (command === 'open-onboarding') restartOnboarding(); };
    const open = (event) => setHub(event.detail?.section || 'music');
    window.addEventListener('album-companion-command', receive); window.addEventListener('cabin-open-settings', open);
    return () => { window.removeEventListener('album-companion-command', receive); window.removeEventListener('cabin-open-settings', open); };
  });
  return <div className={`listening-room cabin-room cabin-${look}`} style={{ '--amber': getRoomScene(look).style.accent }}>
    <nav className="cabin-toolbar" aria-label="小屋工具">
      {focus && !zen && !fullscreen && <span className="zen-keep cabin-toolbar-group"><button type="button" aria-pressed={zen} title="沉浸模式 · Z" onClick={() => setZen(!zen)}>{zen ? <><Eye size={17}/><span>退出沉浸</span></> : <><EyeSlash size={17}/><span>沉浸</span></>}</button></span>}
      <span className="cabin-toolbar-group">
        <button type="button" aria-label={petId === 'cat' ? (pet.active ? '让小猫回家' : '小猫出门') : (pet.active ? '让伙伴回家' : '伙伴出门')} title={pet.active ? '让伙伴回家' : '伙伴出门'} aria-pressed={Boolean(pet.active)} onClick={() => desktopCommand(pet.active ? 'pet-stop' : 'pet-start')}><Heart size={17}/><span>{petId === 'cat' ? (pet.active ? '让小猫回家' : '小猫出门') : (pet.active ? '让伙伴回家' : '伙伴出门')}</span></button>
        <button type="button" aria-label={sink.busy ? '取消沉入桌面' : sink.active ? '浮出桌面' : '沉入桌面'} aria-pressed={Boolean(sink.active)} disabled={appearance.client && !sink.supported} title={sink.active ? '浮出桌面：回到小屋窗口 · Ctrl/⌘+Alt+D' : sink.reason || '沉入桌面：窗口收起，小屋变成桌面背景，伙伴和迷你唱机还能点 · Ctrl/⌘+Alt+D'} onClick={toggleDesktopMode}><Computer size={17}/><span>{sink.busy ? '正在沉入…' : sink.active ? '浮出桌面' : '沉入桌面'}</span></button>
      </span>
    </nav>
    {filtersOpen && <section id="cabin-shelf-filters" className="shelf-filters" aria-label="筛选与唱片盒">
      <header className="shelf-filters-header"><strong>筛选与唱片盒</strong><button type="button" aria-label="收起筛选与唱片盒" onClick={() => setFiltersOpen(false)}>收起</button></header>
      <div className="shelf-filter-row">
        <label>排序<select aria-label="排序方式" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>{Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>类型<select aria-label="筛选类型" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">全部</option><option value="album">专辑</option><option value="song">单曲</option><option value="playlist">歌单</option></select></label>
      </div>
      <RecordBoxControls items={items} filters={filters} setFilters={(change) => setFilters((old) => ({ ...old, ...(typeof change === 'function' ? change(old) : change) }))} count={visible.length}/>
    </section>}
    {library?.error && hub !== 'room' && !wizard && !filtersOpen && <p className="room-preferences-error" role="alert">设置未保存：{library.error}</p>}
    {wallpaperError && <p className="wallpaper-error" role="alert">{wallpaperError}<button type="button" aria-label="关闭动态背景提示" onClick={() => setWallpaperError('')}>×</button></p>}
    <div ref={stage} className="cabin-stage-wrap"><RoomScene look={look} items={view.items} selectedId={selected?.id} select={setSelectedId} load={load} startRow={view.startRow} weather={weather} cat={<RoomCat petId={petId} focus={catFocus} playing={grooving} track={snapshot.current.track} reduceMotion={appearance.reduceMotion} hidden={Boolean(pet.active)}/>}>
      <RoomTurntable item={deckItem} spinning={effectiveSpin} system={system} trackIndex={provider === 'system' ? 0 : trackIndex} style={recordStyle} items={items} load={load} toggle={() => setSpinning(!spinning)} track={setTrackIndex} eject={() => { setRecord(null); setSpinning(false); }} provider={provider} setProvider={chooseProvider} playback={playback} player={player} desktopClient tools={<nav className="turntable-room-tools" aria-label="小屋设置">
        <button type="button" aria-label="筛选与唱片盒" title="筛选与唱片盒" aria-controls="cabin-shelf-filters" aria-expanded={filtersOpen} className={filtered ? 'is-active' : ''} onClick={() => setFiltersOpen(!filtersOpen)}><Settings size={17}/><span>筛选与唱片盒{filtered ? ` · ${visible.length}` : ''}</span></button>
      </nav>}/>
      {!visible.length && <div className="room-empty">
        <p>{loading ? '正在整理唱片…' : items.length ? '没有符合筛选的唱片。' : '木屋的唱片架，等你放上第一张。'}</p>
        {!loading && (items.length ? <button type="button" onClick={() => setFilters({ ...filters, type: 'all', box: 'all', genre: 'all', decade: 'all', provider: 'all' })}>清除筛选</button> : <>
          <small>也可以先专注一会儿，收藏慢慢来。</small>
          <div className="room-welcome-actions"><button type="button" onClick={() => openAdd()}><Plus size={16}/>添加第一张专辑</button>{focus && <button type="button" className="room-welcome-focus" onClick={() => saveDock({ open: true, tab: 'timer' })}>先专注一会儿</button>}</div>
          <small className="room-welcome-tip">在右上角「设置 → 房间与桌宠」里换场景和伙伴。</small>
        </>)}
      </div>}
      {view.rows > 3 && <div className="room-shelf-navigation" aria-label="唱片架浏览"><button type="button" aria-label="上一排唱片" disabled={view.startRow === 0} onClick={() => changeRow(view.startRow - 1)}><Up/></button><span>{`${view.startRow + 1}–${Math.min(view.rows, view.startRow + 3)} / ${view.rows} 排`}</span><button type="button" aria-label="下一排唱片" disabled={view.startRow >= view.maxRow} onClick={() => changeRow(view.startRow + 1)}><Down/></button><small>↑ ↓ / 滚轮浏览</small></div>}
    </RoomScene></div>
    {selected && <div className="room-now-playing"><div className="room-selection-copy"><small>唱片架 · 双击封面放盘</small><h2 title={selected.title}>{selected.title}</h2><p title={selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}>{selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}</p></div><div className="room-selection-actions">{record && record.id !== selected.id && <button type="button" className="room-queue-add" aria-label={player.queue.ids.includes(selected.id) ? '已在待播' : '加入待播'} aria-pressed={player.queue.ids.includes(selected.id)} title="当前唱片放完后接着放" onClick={(event) => { if (player.queue.ids.includes(selected.id)) { player.remove(selected.id); return; } if (!player.enqueue(selected.id)) return; const queueButton = document.querySelector('.room-turntable .player-mode[aria-label^="待播唱片"]'); flyRecord({ from: document.querySelector('.room-record.is-selected') || event.currentTarget, to: queueButton, target: queueButton, cover: selected.cover, mode: 'queue' }); }}>{player.queue.ids.includes(selected.id) ? <><Check size={16}/><span>已在待播</span></> : <><ListBullet size={16}/><span>加入待播</span></>}</button>}<RecordTools item={selected}/><DiscogsLink item={selected}/><button type="button" className="room-open-album" aria-label="唱片卡片" title="唱片卡片" onClick={() => openRecord(selected.id)}><span>唱片卡片</span><ArrowUpRight size={18}/></button></div></div>}
    {focus && <><FocusBadge open={dock.open} onClick={() => saveDock({ open: !dock.open })}/><FocusDock open={dock.open} tab={dock.tab} setTab={(tab) => saveDock({ tab })} close={() => saveDock({ open: false })}/></>}
    {desktopMode ? <DesktopWidgets mode="desktop" exit={toggleDesktopMode} item={deckItem} provider={provider} playback={playback} player={player} spinning={effectiveSpin} toggleVisual={() => setSpinning((value) => !value)} trackIndex={provider === 'system' ? 0 : trackIndex}/> : zen && <DesktopWidgets mode="zen"/>}
    {!desktopMode && <ImmersiveChrome zen={zen} fullscreen={fullscreen} desktopClient={appearance.client} toggleZen={() => setZen((value) => !value)} openStudy={() => saveDock({ open: true, tab: 'study' })}/>}
    {corner && <ListeningCorner item={deckItem} items={visible} vinyl={recordStyle} provider={provider} spinning={effectiveSpin} trackIndex={provider === 'system' ? 0 : trackIndex} setTrackIndex={setTrackIndex} playback={playback} player={player} toggleVisual={() => setSpinning((value) => !value)} load={load} close={() => setCorner(false)} reduceMotion={appearance.reduceMotion}/>}
    {hub && <SettingsHub section={hub} setSection={setHub} close={() => setHub('')} env={env} player={playerAdapter} desktop={desktopAdapter} provider={provider} useSource={chooseProvider} openMusicSettings={() => { setHub(''); setMusicSettings(true); }} look={look} petId={petId} onRoomChange={personalizeRoom} reduceMotion={appearance.reduceMotion} error={library?.error} focus={focus} openDock={(tab) => { setHub(''); saveDock({ open: true, tab }); }} pet={pet} openBackup={() => { setHub(''); openBackup?.(); }} openWall={() => { setHub(''); openWall?.(); }} restartOnboarding={restartOnboarding}/>}
    {wizard && <OnboardingWizard state={onboarding} update={saveOnboarding} env={env} player={playerAdapter} look={look} petId={petId} onRoomChange={personalizeRoom} useSource={chooseProvider} openMusicSettings={() => { setHub(''); setMusicSettings(true); }} openAdd={() => { closeWizard('later'); openAdd(); }} close={closeWizard} reduceMotion={appearance.reduceMotion} error={library?.error}/>}
    {musicSettings && <MusicSettings close={() => setMusicSettings(false)} provider={provider} useSource={chooseProvider}/>}
  </div>;
}
