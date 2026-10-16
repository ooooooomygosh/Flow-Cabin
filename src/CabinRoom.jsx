import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { reportTrayPet } from './desktop/desktop-sink-client.mjs';
import { getRoomScene } from './scene-catalog.mjs';
import { normalizePetId } from './pet/pet-catalog.mjs';
import { setBeat } from './player/beat-clock.mjs';
import { Up, Down, ArrowUpRight, Settings, Eye, EyeSlash, Heart, Plus, ListBullet, Check, Computer, Play } from './icons';
import DiscogsLink from './DiscogsLink';
import { RecordBoxControls, RecordTools, useRecordLibrary, useRecordStyle } from './RecordLibrary';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import useReducedMotion from './useReducedMotion';
import RoomScene, { placeRecord } from './RoomScene';
import RoomTurntable from './RoomTurntable';
import FocusDock, { FocusBadge, loadStudy } from './focus/FocusDock';
import { useFocusState } from './focus/useFocus';
import { focusSnapshot } from './focus/focus-model.mjs';
import { useSoundscape } from './audio/useSoundscape';
import RoomCat from './pet/RoomCat';
import DesktopWidgets, { ImmersiveChrome } from './desktop/DesktopWidgets';
import { flyRecord } from './turntable/record-flight.mjs';
import { displayTitle } from './display-title.mjs';
import useShelf, { SORTS, DEFAULT_FILTERS } from './room/useShelf';
import useDeck from './room/useDeck';
import useRoomChrome from './room/useRoomChrome';
import useOnboardingFlow from './room/useOnboardingFlow';
import useCompanionSnapshot from './room/useCompanionSnapshot';
import './companion-room.css';
export { ShowroomArtwork } from './RoomArtwork';

// Opened on demand: the settings hub, the first-run guide, 音源与账户 and
// 唱机特写 load on first use (prefetched once the room is idle).
const loaders = { hub: () => import('./onboarding/SettingsHub'), wizard: () => import('./onboarding/OnboardingWizard'), music: () => import('./MusicSettings'), corner: () => import('./turntable/ListeningCorner') };
const prefetch = { ...loaders, study: loadStudy };
const SettingsHub = lazy(loaders.hub), OnboardingWizard = lazy(loaders.wizard), MusicSettings = lazy(loaders.music), ListeningCorner = lazy(loaders.corner);
function usePrefetch() {
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500)), cancel = window.cancelIdleCallback || clearTimeout;
    const handle = idle(() => Object.values(prefetch).forEach((load) => load().catch(() => {})), { timeout: 8000 });
    return () => cancel(handle);
  }, []);
}
// True as soon as `value` is; stays true for `ms` after it turns false.
function useSustained(value, ms) {
  const [held, setHeld] = useState(value);
  useEffect(() => { if (value) { setHeld(true); return; } const timer = setTimeout(() => setHeld(false), ms); return () => clearTimeout(timer); }, [value, ms]);
  return value || held;
}
const snapshotItem = (item) => item ? ({ id: item.id, title: item.title, artist: item.artist, cover: item.cover, type: item.type, tracks: item.tracks, externalIds: item.externalIds, collectionId: item.collectionId }) : null;
// What the wallpaper and the desktop pet see (window.albumRoomSnapshot), built only when they ask.
const buildSnapshot = ({ items, record, look, ...rest }) => ({ ...rest, look, roomName: getRoomScene(look).label, items: items.map(snapshotItem), record: snapshotItem(record) });

export default function CabinRoom({ items, loading, loadError = '', openRecord, openAdd, firstVisit = false, hubRequest = null, openBackup, openWall, notify }) {
  const appearance = useDesktopAppearance(), reduced = useReducedMotion();
  const stage = useRef(null);
  const flow = useOnboardingFlow({ client: appearance.client, loading, loadError, firstVisit, itemCount: items.length, hubRequest, notify });
  const chrome = useRoomChrome({ client: appearance.client, env: flow.env, notify });
  const library = useRecordLibrary(), look = library?.data.rooms[library.roomId]?.look || 'pixel';
  const { filters, setFilters, visible, view, selected, setSelectedId, changeRow, filtered } = useShelf({ items, look, stage });
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId);
  const deck = useDeck({ items, onLoad: (item) => setSelectedId(item.id) });
  const { record, provider, playback, player, deckItem, effectiveSpin } = deck;
  const focus = useFocusState(), sound = useSoundscape();
  const [pet, setPet] = useState(() => window.albumPetState || {});
  const [wallpaperError, setWallpaperError] = useState(() => window.albumRoomWallpaperState?.error || '');
  useEffect(() => { const receive = (event) => { window.albumPetState = event.detail; setPet(event.detail || {}); }; window.addEventListener('album-pet-state', receive); return () => window.removeEventListener('album-pet-state', receive); }, []);
  useEffect(() => { reportTrayPet(petId); }, [petId, appearance.client]);
  useEffect(() => { if (!wallpaperError) return; const timer = setTimeout(() => setWallpaperError(''), 5000); return () => clearTimeout(timer); }, [wallpaperError]);
  useEffect(() => { sound?.setDucked(deck.audible); }, [deck.audible]);
  usePrefetch();
  const recordStyle = useRecordStyle(deckItem);
  // Weather and the cat's accessory come from the focus record, not its clock:
  // the room does not re-render while a timer ticks (RoomCat keeps its own clock).
  const catFocus = useMemo(() => focus ? focusSnapshot(focus.state, Date.now()) : {}, [focus?.state]), weather = catFocus.weather || 'snow';
  // The cat keeps dancing through a moment of buffering or a track change.
  const grooving = useSustained(effectiveSpin || sound?.lofiState === 'playing', 1800);
  // Lo-fi alone: dance at its tempo (a detected song beat takes over when the deck plays).
  const lofiBpm = sound?.lofiState === 'playing' && !playback.playing ? sound.section?.bpm : 0;
  useEffect(() => { if (lofiBpm) setBeat({ bpm: lofiBpm }); }, [lofiBpm]);
  useCompanionSnapshot({ look, petId, petOut: Boolean(pet.active), weather, accessory: catFocus.accessory || '', grooving, track: deck.nowTrack, startRow: view.startRow, items: view.items, selectedId: selected?.id || '', record: deckItem, recordStyle, spinning: effectiveSpin, trackIndex: deck.shownTrackIndex, reduceMotion: appearance.reduceMotion, statusText: deck.statusText, actualTrack: deck.actualTrack, provider }, buildSnapshot, (state) => setWallpaperError(state.error || ''));
  const personalizeRoom = (patch) => library?.update((old) => ({ ...old, rooms: { ...old.rooms, [library.roomId]: { ...(old.rooms[library.roomId] || {}), ...patch } } }));
  const { zen, corner, dock, saveDock, filtersOpen, setFiltersOpen, fullscreen, desktopMode, sink } = chrome;
  // Not memoised on purpose: the cat's placement re-measures the console and
  // footer after every room commit (useCatPlacement), which room renders now are rare.
  const cat = <RoomCat petId={petId} focus={catFocus} playing={grooving} track={deck.nowTrack} reduceMotion={reduced} hidden={Boolean(pet.active)}/>;
  const petLabel = petId === 'cat' ? (pet.active ? '让小猫回家' : '小猫出门') : (pet.active ? '让伙伴回家' : '伙伴出门');
  const queued = player.queue.ids.includes(selected?.id);
  return <div className={`listening-room cabin-room cabin-${look}`} style={{ '--amber': getRoomScene(look).style.accent }}>
    <nav className="cabin-toolbar" aria-label="小屋工具">
      {focus && !zen && !fullscreen && <span className="zen-keep cabin-toolbar-group"><button type="button" aria-pressed={zen} aria-keyshortcuts="Z" title="沉浸模式 · Z" onClick={chrome.toggleZen}><EyeSlash size={17}/><span>沉浸</span></button></span>}
      <span className="cabin-toolbar-group">
        <button type="button" aria-label={petLabel} title={pet.active ? '让伙伴回家' : '伙伴出门'} aria-pressed={Boolean(pet.active)} onClick={() => desktopCommand(pet.active ? 'pet-stop' : 'pet-start')}><Heart size={17}/><span>{petLabel}</span></button>
        <button type="button" aria-label={sink.busy ? '取消沉入桌面' : sink.active ? '浮出桌面' : '沉入桌面'} aria-pressed={Boolean(sink.active)} disabled={appearance.client && !sink.supported} title={sink.active ? '浮出桌面：回到小屋窗口 · Ctrl/⌘+Alt+D' : sink.reason || '沉入桌面：窗口收起，小屋变成桌面背景，伙伴和迷你唱机还能点 · Ctrl/⌘+Alt+D'} onClick={chrome.toggleDesktopMode}><Computer size={17}/><span>{sink.busy ? '正在沉入…' : sink.active ? '浮出桌面' : '沉入桌面'}</span></button>
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
    {library?.error && flow.hub !== 'room' && !flow.wizard && !filtersOpen && <p className="room-preferences-error" role="alert">设置未保存：{library.error}</p>}
    {wallpaperError && <p className="wallpaper-error" role="alert">{wallpaperError}<button type="button" aria-label="关闭动态背景提示" onClick={() => setWallpaperError('')}>×</button></p>}
    {/* Under the opaque 唱机特写 the room is skipped entirely: no style, layout or paint work. */}
    <div ref={stage} className="cabin-stage-wrap" style={corner ? { contentVisibility: 'hidden' } : undefined}><RoomScene look={look} items={view.items} selectedId={selected?.id} select={setSelectedId} load={deck.place} startRow={view.startRow} weather={weather} cat={cat}>
      <RoomTurntable item={deckItem} spinning={effectiveSpin} system={deck.system} trackIndex={deck.shownTrackIndex} style={recordStyle} items={items} load={deck.load} toggle={deck.toggleVisual} track={deck.setTrackIndex} eject={deck.eject} provider={provider} setProvider={deck.chooseProvider} playback={playback} player={player} desktopClient tools={<nav className="turntable-room-tools" aria-label="小屋设置">
        <button type="button" aria-label="筛选与唱片盒" title="筛选与唱片盒" aria-controls="cabin-shelf-filters" aria-expanded={filtersOpen} className={filtered ? 'is-active' : ''} onClick={() => setFiltersOpen(!filtersOpen)}><Settings size={17}/><span>筛选与唱片盒{filtered ? ` · ${visible.length}` : ''}</span></button>
      </nav>}/>
      {!visible.length && <div className="room-empty">
        <p>{loading ? '正在整理唱片…' : loadError ? '唱片暂时没有读出来，请重试。' : items.length ? '没有符合筛选的唱片。' : '木屋的唱片架，等你放上第一张。'}</p>
        {!loading && !loadError && (items.length ? <button type="button" onClick={() => setFilters({ ...filters, ...DEFAULT_FILTERS, sort: filters.sort })}>清除筛选</button> : <>
          <small>也可以先专注一会儿，收藏慢慢来。</small>
          <div className="room-welcome-actions"><button type="button" onClick={() => openAdd()}><Plus size={16}/>添加第一张专辑</button>{focus && <button type="button" className="room-welcome-focus" onClick={() => saveDock({ open: true, tab: 'timer' })}>先专注一会儿</button>}</div>
          <small className="room-welcome-tip">在右上角「设置 → 房间与桌宠」里换场景和伙伴。</small>
        </>)}
      </div>}
      {view.rows > 3 && <div className="room-shelf-navigation" aria-label="唱片架浏览"><button type="button" aria-label="上一排唱片" disabled={view.startRow === 0} onClick={() => changeRow(view.startRow - 1)}><Up/></button><span>{`${view.startRow + 1}–${Math.min(view.rows, view.startRow + 3)} / ${view.rows} 排`}</span><button type="button" aria-label="下一排唱片" disabled={view.startRow >= view.maxRow} onClick={() => changeRow(view.startRow + 1)}><Down/></button><small>↑ ↓ / 滚轮浏览</small></div>}
    </RoomScene></div>
    {selected && <div className="room-now-playing"><div className="room-selection-copy"><small>唱片架 · 双击或回车放盘</small><h2 title={selected.title}>{displayTitle(selected.title)}</h2><p title={selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}>{selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}</p></div><div className="room-selection-actions">
      {/* An empty deck: the visible keyboard / pointer path to play. With a record
          already on, 加入待播 leads (and Enter / double-click still load). */}
      {!record && <button type="button" className="room-load-record is-primary" aria-keyshortcuts="Enter" title="放到唱机上播放 · 双击封面或按回车也可以" onClick={() => placeRecord(selected, document.querySelector('.room-record.is-selected') || stage.current, deck.place)}><Play size={16}/><span>放到唱机</span></button>}
      {record && record.id !== selected.id && <button type="button" className="room-queue-add" aria-label={queued ? '已在待播' : '加入待播'} aria-pressed={queued} title="当前唱片放完后接着放" onClick={(event) => { if (queued) { player.remove(selected.id); return; } if (!player.enqueue(selected.id)) return; const queueButton = document.querySelector('.room-turntable .player-mode[aria-label^="待播唱片"]'); flyRecord({ from: document.querySelector('.room-record.is-selected') || event.currentTarget, to: queueButton, target: queueButton, cover: selected.cover, mode: 'queue' }); }}>{queued ? <><Check size={16}/><span>已在待播</span></> : <><ListBullet size={16}/><span>加入待播</span></>}</button>}<RecordTools item={selected}/><DiscogsLink item={selected}/><button type="button" className="room-open-album" aria-label="唱片卡片" title="唱片卡片" onClick={() => openRecord(selected.id)}><span>唱片卡片</span><ArrowUpRight size={18}/></button></div></div>}
    {focus && <><FocusBadge open={dock.open} onClick={() => saveDock({ open: !dock.open })}/><FocusDock open={dock.open} tab={dock.tab} setTab={(tab) => saveDock({ tab })} close={() => saveDock({ open: false })}/></>}
    {desktopMode ? <DesktopWidgets mode="desktop" exit={chrome.toggleDesktopMode} item={deckItem} provider={provider} playback={playback} player={player} spinning={effectiveSpin} toggleVisual={deck.toggleVisual} trackIndex={deck.shownTrackIndex}/> : zen && !chrome.zenTools && <DesktopWidgets mode="zen"/>}
    {!desktopMode && <ImmersiveChrome zen={zen} fullscreen={fullscreen} exitFullscreen={chrome.exitFullscreen} toggleZen={chrome.toggleZen} tools={chrome.zenTools} setTools={chrome.setZenTools} openStudy={() => saveDock({ open: true, tab: 'study' })}/>}
    <Suspense fallback={null}>
      {corner && <ListeningCorner item={deckItem} items={visible} vinyl={recordStyle} provider={provider} spinning={effectiveSpin} trackIndex={deck.shownTrackIndex} setTrackIndex={deck.setTrackIndex} playback={playback} player={player} toggleVisual={deck.toggleVisual} load={deck.load} close={() => chrome.setCorner(false)} reduceMotion={reduced}/>}
      {flow.hub && <SettingsHub section={flow.hub} setSection={flow.setHub} close={() => flow.setHub('')} env={flow.env} player={flow.playerAdapter} desktop={chrome.desktopAdapter} provider={provider} useSource={deck.chooseProvider} openMusicSettings={flow.openMusicSettings} look={look} petId={petId} onRoomChange={personalizeRoom} reduceMotion={appearance.reduceMotion} error={library?.error} focus={focus} openDock={(tab) => { flow.setHub(''); saveDock({ open: true, tab }); }} pet={pet} openBackup={() => { flow.setHub(''); openBackup?.(); }} openWall={() => { flow.setHub(''); openWall?.(); }} restartOnboarding={flow.restartOnboarding}/>}
      {flow.wizard && <OnboardingWizard state={flow.onboarding} update={flow.saveOnboarding} env={flow.env} player={flow.playerAdapter} look={look} petId={petId} onRoomChange={personalizeRoom} useSource={deck.chooseProvider} openMusicSettings={flow.openMusicSettings} openAdd={() => { flow.closeWizard('later'); openAdd(); }} close={flow.closeWizard} reduceMotion={appearance.reduceMotion} error={library?.error}/>}
      {flow.musicSettings && <MusicSettings close={() => flow.setMusicSettings(false)} provider={provider} useSource={deck.chooseProvider}/>}
    </Suspense>
  </div>;
}
