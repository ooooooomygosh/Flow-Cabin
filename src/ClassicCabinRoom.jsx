import { selectPack } from './pet/imported-pack.mjs';
import { CabinRuntimeProvider } from './runtime/CabinRuntime';
import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { reportTrayPet } from './desktop/desktop-sink-client.mjs';
import { getRoomScene, classicSceneId } from './scene-catalog.mjs';
import { normalizePetId, getPet } from './pet/pet-catalog.mjs';
import { setBeat } from './player/beat-clock.mjs';
import { currentCabinPlayback, onCabinPlayback } from './scene/playback-listener.mjs';
const ModularRoom = lazy(() => import('./room2/ModularRoom'));
import CabinWelcome from './room/CabinWelcome';
import { Up, Down, ArrowUpRight, Wand2, Sparkles, EyeSlash, Heart, Plus, ListBullet, Check, Computer, Play, SpeakerWave, SpeakerOff, Grid3X3, Refresh, Expand } from './icons';
import { RecordBoxControls, useRecordLibrary, useRecordStyle } from './RecordLibrary';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import useReducedMotion from './useReducedMotion';
import RoomScene, { placeRecord } from './RoomScene';
import RoomTurntable from './RoomTurntable';
import FocusDock, { FocusBadge, loadStudy } from './focus/FocusDock';
import { useFocusState } from './focus/useFocus';
import CabinJournal from './focus/stats/CabinJournal.jsx';
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
import { suggestProvider } from './player/usePlayer';
import { providerLabel } from './player/providers.mjs';
import { queueId } from './player/player-queue.mjs';
import { useCatCareHost } from './cat/useCatCare';
import { coverThumb } from './focus/session-log.mjs';
import './companion-room.css';
import Dialog from './Dialog';

// Opened on demand: Settings (with 音源 › 账户与文件夹), the first-run guide and
// 唱机特写 load on first use (prefetched once the room is idle).
const loaders = { hub: () => import('./onboarding/SettingsHub'), wizard: () => import('./onboarding/OnboardingWizard'), corner: () => import('./turntable/ListeningCorner') };
const prefetch = { ...loaders, study: loadStudy, smart: () => import('./ai/SmartTurntable') };
const CatPanel = lazy(() => import('./focus/CatPanel'));
const SettingsHub = lazy(loaders.hub), OnboardingWizard = lazy(loaders.wizard), ListeningCorner = lazy(loaders.corner);
const SmartTurntable = lazy(() => import('./ai/SmartTurntable'));
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

export default function ClassicCabinRoom({ items, loading, loadError = '', reload, openRecord, openAdd, firstVisit = false, hubRequest = null, openBackup, openWall, notify, saveToShelf }) {
  const appearance = useDesktopAppearance(), reduced = useReducedMotion();
  const stage = useRef(null);
  const flow = useOnboardingFlow({ client: appearance.client, loading, loadError, firstVisit, itemCount: items.length, hubRequest, notify });
  const chrome = useRoomChrome({ client: appearance.client, notify });
  const library = useRecordLibrary(), look = classicSceneId(library?.data.rooms[library.roomId]?.look);
  const [mobileSlotCount, setMobileSlotCount] = useState(null);
  const [mobileShelfCompact, setMobileShelfCompact] = useState(false);
  const { filters, setFilters, visible, view, selected, setSelectedId, changeRow, filtered } = useShelf({ items, look, stage, mobileSlotCount });
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId);
  const deck = useDeck({ items, onLoad: (item) => setSelectedId(item.id) });
  const { record, provider, playback, player, deckItem, effectiveSpin } = deck;
  const focus = useFocusState(), sound = useSoundscape();
  useCatCareHost();
  const [modularOpen, setModularOpen] = useState(false);
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const closeSmart = useCallback(() => setSmartOpen(false), []);
  const openSmart = useCallback(() => setSmartOpen(true), []);
  // Capture the first interaction before the lazy panel's module is available.
  useLayoutEffect(() => {
    const open = () => setCatPanelOpen(true);
    window.addEventListener('cabin-open-cat', open);
    return () => window.removeEventListener('cabin-open-cat', open);
  }, []);
  const [pet, setPet] = useState(() => window.albumPetState || {});
  const [wallpaperError, setWallpaperError] = useState(() => window.albumRoomWallpaperState?.error || '');
  useEffect(() => { const receive = (event) => { window.albumPetState = event.detail; setPet(event.detail || {}); }; window.addEventListener('album-pet-state', receive); return () => window.removeEventListener('album-pet-state', receive); }, []);
  useEffect(() => { reportTrayPet(petId); }, [petId, appearance.client]);
  useEffect(() => { if (!wallpaperError) return; const timer = setTimeout(() => setWallpaperError(''), 5000); return () => clearTimeout(timer); }, [wallpaperError]);
  useEffect(() => { sound?.setDucked(deck.audible); }, [deck.audible]);
  usePrefetch();
  useEffect(() => {
    const ended = (event) => { if (event.detail?.phase === 'focus' && event.detail?.next === 'idle' && !event.detail?.completed) notify?.('这一轮结束了。歇一会儿，唱片还在这里。'); };
    window.addEventListener('album-focus-phase', ended);
    return () => window.removeEventListener('album-focus-phase', ended);
  }, [notify]);
  const recordStyle = useRecordStyle(deckItem);
  // The deck's record for other surfaces (专注画面 › 唱片计时): cabin:deck-item, docs/events.md.
  useEffect(() => { const detail = deckItem ? { id: deckItem.id, title: deckItem.title || '', artist: deckItem.artist || '', cover: deckItem.cover || '' } : null; window.__cabinDeckItem = detail; window.dispatchEvent(new CustomEvent('cabin:deck-item', { detail })); if (detail?.cover) coverThumb(detail.cover).then((thumb) => { if (window.__cabinDeckItem === detail) window.__cabinDeckItem = { ...detail, thumb }; }); }, [deckItem?.id, deckItem?.title, deckItem?.artist, deckItem?.cover]);
  // Weather and the cat's accessory come from the focus record, not its clock:
  // the room does not re-render while a timer ticks (RoomCat keeps its own clock).
  const catFocus = useMemo(() => focus ? focusSnapshot(focus.state, Date.now()) : {}, [focus?.state]), weather = catFocus.weather || 'snow';
  // The cat keeps dancing through a moment of buffering or a track change.
  const grooving = useSustained(effectiveSpin || sound?.lofiState === 'playing', 1800);
  // Lo-fi alone: dance at its tempo (a detected song beat takes over when the deck plays).
  const lofiBpm = sound?.lofiState === 'playing' && !playback.playing ? sound.section?.bpm : 0;
  // Lo-fi alone: its tempo and its heard quarter-note phase, refreshed while it plays (the section tempo ramps).
  useEffect(() => {
    if (!lofiBpm) return undefined;
    const apply = () => { if (!currentCabinPlayback().playing) setBeat({ bpm: lofiBpm, beatAt: sound?.lofiBeatAt?.() || 0 }); };
    const off = onCabinPlayback(apply), timer = setInterval(apply, 1000);
    return () => { clearInterval(timer); off(); };
  }, [lofiBpm]);
  useCompanionSnapshot({ look, petId, petOut: Boolean(pet.active), weather, accessory: catFocus.accessory || '', grooving, track: deck.nowTrack, startRow: view.startRow, items: view.items, selectedId: selected?.id || '', record: deckItem, recordStyle, spinning: effectiveSpin, trackIndex: deck.shownTrackIndex, reduceMotion: appearance.reduceMotion, statusText: deck.statusText, actualTrack: deck.actualTrack, provider }, buildSnapshot, (state) => setWallpaperError(state.error || ''));
  const personalizeRoom = (patch) => { const saved = library?.update((old) => ({ ...old, rooms: { ...old.rooms, [library.roomId]: { ...(old.rooms[library.roomId] || {}), ...patch } } })); if (saved !== false && patch.petId) { try { selectPack(null); } catch(error) { notify(error.message); return false; } } return saved; };
  // Starting is explicit: persist the focus settings and timer first, then put
  // the AI playlist or the first shelf pick on the deck.
  const startSmartSession = (plan) => {
    if (!focus) {
      notify?.('专注记录还没有准备好，智能专注没有开始。', { tone: 'error' });
      return false;
    }
    const shelf = Array.isArray(items) ? items : [], picked = [], seen = new Set();
    const isPlaylist = plan?.kind === 'playlist' && plan?.item?.type === 'playlist';
    const rawItems = isPlaylist ? [plan.item] : Array.isArray(plan?.items) && plan.items.length ? plan.items : Array.isArray(plan?.albums) ? plan.albums : [];
    for (const item of rawItems) {
      const rawId = item && typeof item === 'object' ? item.id ?? item.albumId ?? item.recordId ?? item.item?.id : item;
      const id = queueId(rawId);
      if (!id || seen.has(id)) continue;
      const shelfItem = isPlaylist ? item : shelf.find((entry) => queueId(entry?.id) === id);
      if (!shelfItem) continue;
      seen.add(id);
      picked.push(shelfItem);
    }
    if (!picked.length) {
      notify?.('推荐的唱片或歌单不完整，智能专注没有开始。', { tone: 'error' });
      return false;
    }
    const minutes = Math.max(1, Math.min(180, Math.round(Number(plan?.minutes) || 50)));
    const activity = typeof plan?.activity === 'string' ? plan.activity : plan?.activity?.label || plan?.activity?.name || '专注';
    // Older callers omitted autoplay; they always expected the record to play.
    const autoplay = plan?.autoplay === undefined ? true : Boolean(plan.autoplay);
    if (Number(focus.state?.settings?.focusMin) !== minutes) {
      const saved = focus.settings({ focusMin: minutes });
      if (saved === false) {
        notify?.('无法保存专注设置，智能专注没有开始。请检查存储空间后重试。', { tone: 'error' });
        return false;
      }
    }
    if (focus.start('focus') === false) {
      focus.reset?.();
      notify?.('专注计时保存失败，智能专注没有开始。请检查存储空间后重试。', { tone: 'error' });
      return false;
    }
    // visual / system cannot make the cabin audible. When autoplay is on,
    // switch to a source the record can verify (local files or a platform
    // match) when possible. Without autoplay, only leave the honest visual.
    const switched = autoplay && (provider === 'visual' || provider === 'system') ? suggestProvider(picked[0]) : '';
    if (switched) deck.chooseProvider(switched);
    // Following the system player would show another app's song, not this
    // recommendation. With no verifiable source, show the record honestly.
    else if (provider === 'system') deck.chooseProvider('visual');
    const source = switched || (provider === 'system' ? 'visual' : provider);
    const audible = source !== 'visual' && source !== 'system';
    const queued = deck.replaceQueue(picked.slice(1), picked[0].id);
    deck.load(picked[0], 0, { autoplay });
    setSmartOpen(false);
    const first = `${picked[0].type === 'playlist' ? '歌单' : '唱片'}《${picked[0].title}》`;
    const queueFailure = !queued
      ? picked.length > 1 ? ' 其余推荐未能写入待播，请检查存储空间。' : ' 待播未能更新，请检查存储空间。'
      : '';
    const queueNote = queued && picked.length > 1 ? `，后面待播 ${picked.length - 1} 张` : '';
    if (!autoplay) {
      const sourceNote = source !== provider ? `已切到「${providerLabel(source)}」` : `当前音源「${providerLabel(source)}」`;
      notify?.(audible
        ? `已开始 ${minutes} 分钟「${activity}」，${first}已放上唱机但未自动播放${queueNote}；按播放键开始。${queueFailure}`
        : `已开始 ${minutes} 分钟「${activity}」，${sourceNote}，不会从小屋出声；${first}已放上唱机但未自动播放。${queueFailure}`, audible && !queueFailure ? undefined : { tone: 'error' });
    } else if (!audible) {
      const sourceNote = source !== provider ? `已切到「${providerLabel(source)}」` : `当前音源「${providerLabel(source)}」`;
      notify?.(`已开始 ${minutes} 分钟「${activity}」，${sourceNote}，不会从小屋出声；${first}已放上唱机，可在唱机面板切换音源。${queueFailure}`, { tone: 'error' });
    } else if (!queued) {
      notify?.(`已开始 ${minutes} 分钟「${activity}」，${first}已放上唱机；${picked.length > 1 ? '其余推荐未能写入待播' : '待播未能更新'}，请检查存储空间。`, { tone: 'error' });
    } else {
      const sourceNote = switched ? `已切到「${providerLabel(source)}」` : `音源：${providerLabel(source)}`;
      notify?.(`已开始 ${minutes} 分钟「${activity}」，${sourceNote}，${first}已放上唱机${queueNote}。`);
    }
    return true;
  };
  const { zen, corner, dock, saveDock, filtersOpen, setFiltersOpen, fullscreen, desktopMode, sink } = chrome;
  // Not memoised on purpose: the cat's placement re-measures the console and
  // footer after every room commit (useCatPlacement), which room renders now are rare.
  const cat = <RoomCat petId={petId} focus={catFocus} playing={grooving} track={deck.nowTrack} reduceMotion={reduced} hidden={Boolean(pet.active)}/>;
  const petLabel = pet.active ? '让伙伴回家' : '伙伴出门', petName = getPet(petId).name;
  const queued = deck.isQueued(selected?.id);
  const openTool = action => { if (['timer','tasks','study','notes','stats','sound'].includes(action)) saveDock({open:true,tab:action}); else if(action==='pet')setCatPanelOpen(true);else if(action==='music')chrome.setCorner(true);else if(action==='library')setFiltersOpen(true);else if(action==='wall')openWall?.();else if(action==='backup')openBackup?.();else flow.setHub('music'); };
  return <CabinRuntimeProvider deck={deck} items={items} look={look} onNavigate={openTool} onRoomChange={personalizeRoom} notify={notify}><div className={`listening-room cabin-room cabin-${look}`} style={{ '--scene-accent': getRoomScene(look).style.accent }}>
    {look === 'pixel' && <CabinWelcome petName={petName} onNotes={() => saveDock({ open: true, tab: 'notes' })}/>}
    {/* One row of room actions, right-aligned: focus · sound · companion · 沉入桌面 · 沉浸.
        Preferences live in Settings (titlebar ⚙). */}
    <nav className="cabin-toolbar" aria-label="小屋工具">
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has('room-studio') && <button type="button" onClick={() => setModularOpen(true)}>生活小屋 · 制作中</button>}
      {focus && <span className="zen-keep cabin-toolbar-group"><FocusBadge open={dock.open && dock.tab !== 'sound'} onClick={() => saveDock({ open: !(dock.open && dock.tab !== 'sound'), ...(dock.tab === 'sound' ? { tab: 'timer' } : {}) })}/></span>}
      <span className="cabin-toolbar-group">
        {mobileShelfCompact && <button type="button" aria-label="打开播放器" title="打开唱机特写与播放控制" onClick={() => chrome.setCorner(true)}><Play size={17}/><span>播放器</span></button>}
        {sound && <button type="button" className={sound.enabled ? 'is-on' : ''} aria-label={sound.enabled ? '小屋声音（开）' : '小屋声音（关）'} aria-expanded={dock.open && dock.tab === 'sound'} title="Lo-fi 电台与环境音" onClick={() => saveDock(dock.open && dock.tab === 'sound' ? { open: false } : { open: true, tab: 'sound' })}>{sound.enabled ? <SpeakerWave size={17}/> : <SpeakerOff size={17}/>}<span>声音</span></button>}
        <button type="button" aria-label={petLabel} title={pet.active ? `让${petName}回家` : `${petName}出门：到桌面上散步`} aria-pressed={Boolean(pet.active)} onClick={() => desktopCommand(pet.active ? 'pet-stop' : 'pet-start')}><Heart size={17}/><span>{petLabel}</span></button>
        <button type="button" aria-label={sink.busy ? '取消沉入桌面' : sink.active ? '浮出桌面' : '沉入桌面'} aria-pressed={Boolean(sink.active)} disabled={appearance.client && !sink.supported} title={sink.active ? '浮出桌面：回到小屋窗口 · Ctrl/⌘+Alt+D' : sink.reason || '沉入桌面：窗口收起，小屋变成桌面背景，伙伴和迷你唱机还能点 · Ctrl/⌘+Alt+D'} onClick={chrome.toggleDesktopMode}><Computer size={17}/><span>{sink.busy ? '正在沉入…' : sink.active ? '浮出桌面' : '沉入桌面'}</span></button>
        <button type="button" aria-keyshortcuts="Z" title="沉浸：窗口变成专注画面（翻页钟等），Esc 或点空白处返回 · Z" onClick={() => window.dispatchEvent(new CustomEvent('cabin-focus-display', { detail: { open: true } }))}><Expand size={17}/><span>沉浸</span></button>
        {!zen && !fullscreen && <button type="button" aria-pressed={false} aria-keyshortcuts="H" title="收起工具：只留房间和时钟 · H" onClick={chrome.toggleZen}><EyeSlash size={17}/><span>收起工具</span></button>}
      </span>
    </nav>
    {filtersOpen && <section id="cabin-shelf-filters" className="shelf-filters" aria-label="整理唱片架">
      <header className="shelf-filters-header"><strong>整理唱片架</strong><button type="button" aria-label="收起整理唱片架" onClick={() => setFiltersOpen(false)}>收起</button></header>
      <div className="shelf-filter-row">
        <label>排序<select aria-label="排序方式" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>{Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>类型<select aria-label="筛选类型" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">全部</option><option value="album">专辑</option><option value="song">单曲</option><option value="playlist">歌单</option></select></label>
      </div>
      <RecordBoxControls items={items} filters={filters} setFilters={(change) => setFilters((old) => ({ ...old, ...(typeof change === 'function' ? change(old) : change) }))} count={visible.length}/>
      <div className="shelf-filter-wall"><span>挑几张唱片，拼成一张专辑墙图片。</span><button type="button" onClick={() => { setFiltersOpen(false); openWall?.(); }}><Grid3X3 size={16}/>专辑墙</button></div>
    </section>}
    {library?.error && flow.hub !== 'room' && !flow.wizard && !filtersOpen && <p className="room-preferences-error" role="alert">设置未保存：{library.error}</p>}
    {wallpaperError && <p className="wallpaper-error" role="alert">{wallpaperError}<button type="button" aria-label="关闭动态背景提示" onClick={() => setWallpaperError('')}>×</button></p>}
    {/* Under the opaque 唱机特写 the room is skipped entirely: no style, layout or paint work. */}
    <div ref={stage} className="cabin-stage-wrap"><RoomScene look={look} items={view.items} selectedId={selected?.id} select={setSelectedId} load={deck.place} startRow={view.startRow} weather={weather} cat={cat} onShelfCapacity={setMobileSlotCount} onShelfCompact={setMobileShelfCompact}>
      <RoomTurntable ownsAudio={false} item={deckItem} spinning={effectiveSpin} system={deck.system} trackIndex={deck.shownTrackIndex} style={recordStyle} items={items} load={deck.load} toggle={deck.toggleVisual} track={deck.setTrackIndex} eject={deck.eject} provider={provider} setProvider={deck.chooseProvider} playback={playback} player={player} tools={<nav className="turntable-room-tools" aria-label="唱片架">
        <button type="button" aria-label="整理唱片架" title="排序、筛选、唱片盒与专辑墙" aria-controls="cabin-shelf-filters" aria-expanded={filtersOpen} className={filtered ? 'is-active' : ''} onClick={() => setFiltersOpen(!filtersOpen)}><Wand2 size={17}/><span>整理唱片架{filtered ? ` · ${visible.length}` : ''}</span></button>
        <button type="button" aria-label="智能唱片机" title="说出计划，让小屋按场景编排一张可播放歌单" onClick={openSmart}><Sparkles size={17}/><span>智能唱片机</span></button>
      </nav>}/>
      {!visible.length && <div className="room-empty">
        {/* A failed read is explained once, in the titlebar alert; the shelf offers the way back. */}
        {loadError && !loading ? <button type="button" onClick={reload}><Refresh size={16}/>重新读取唱片</button> : <p>{loading ? '正在整理唱片…' : items.length ? '没有符合筛选的唱片。' : '木屋的唱片架，等你放上第一张。'}</p>}
        {!loading && !loadError && (items.length ? <button type="button" onClick={() => setFilters({ ...filters, ...DEFAULT_FILTERS, sort: filters.sort })}>清除筛选</button> : <>
          <small>也可以先专注一会儿，收藏慢慢来。</small>
          <div className="room-welcome-actions"><button type="button" onClick={() => openAdd()}><Plus size={16}/>添加第一张专辑</button>{focus && <button type="button" className="room-welcome-focus" onClick={() => saveDock({ open: true, tab: 'timer' })}>先专注一会儿</button>}</div>
          <small className="room-welcome-tip">在标题栏「设置 › 房间与桌宠」里换场景和伙伴。</small>
        </>)}
      </div>}
      {(view.mode === 'page' ? view.rows > 1 : view.rows > 3) && <div className="room-shelf-navigation" aria-label="唱片架浏览"><button type="button" aria-label={view.mode === 'page' ? '上一页唱片' : '上一排唱片'} disabled={view.startRow === 0} onClick={() => changeRow(view.startRow - 1)}><Up/></button><span>{view.mode === 'page' ? `${view.startRow + 1} / ${view.rows} 页` : `${view.startRow + 1}–${Math.min(view.rows, view.startRow + 3)} / ${view.rows} 排`}</span><button type="button" aria-label={view.mode === 'page' ? '下一页唱片' : '下一排唱片'} disabled={view.startRow >= view.maxRow} onClick={() => changeRow(view.startRow + 1)}><Down/></button><small>{view.mode === 'page' ? '翻页浏览' : '↑↓ 或滚轮翻排'}</small></div>}
    </RoomScene></div>
    {selected && <div className="room-now-playing"><div className="room-selection-copy"><small>唱片架 · 双击或回车放盘</small><h2 title={selected.title}>{displayTitle(selected.title)}</h2><p title={selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}>{selected.type === 'playlist' ? `歌单 · ${selected.artist} · ${selected.tracks?.length || 0} 首` : `${selected.artist} · ${selected.year || '年份待补充'} · ${selected.tracks?.length || 0} 首曲目`}</p></div><div className="room-selection-actions">
      {/* An empty deck: the visible keyboard / pointer path to play. With a record
          already on, 加入待播 leads (and Enter / double-click still load). */}
      {!record && <button type="button" className="room-load-record is-primary" aria-keyshortcuts="Enter" title="放到唱机上播放 · 双击封面或按回车也可以" onClick={() => placeRecord(selected, document.querySelector('.room-record.is-selected') || stage.current, deck.place)}><Play size={16}/><span>放到唱机</span></button>}
      {record && queueId(record.id) !== queueId(selected.id) && <button type="button" className="room-queue-add" aria-label={queued ? '已在待播' : '加入待播'} aria-pressed={queued} title="当前唱片放完后接着放" onClick={(event) => { if (queued) { player.remove(selected.id); return; } if (!player.enqueue(selected.id)) return; const queueButton = document.querySelector('.room-turntable .player-mode[aria-label^="待播唱片"]'); flyRecord({ from: document.querySelector('.room-record.is-selected') || event.currentTarget, to: queueButton, target: queueButton, cover: selected.cover, mode: 'queue' }); }}>{queued ? <><Check size={16}/><span>已在待播</span></> : <><ListBullet size={16}/><span>加入待播</span></>}</button>}<button type="button" className="room-open-album" aria-label="唱片卡片" title="唱片卡片：曲目、笔记、自定义唱片与 Discogs" onClick={() => openRecord(selected.id)}><span>唱片卡片</span><ArrowUpRight size={18}/></button></div></div>}
    {focus && <CabinJournal/>}
    {modularOpen && <Suspense fallback={<span role="status">正在打开生活小屋…</span>}><ModularRoom close={() => setModularOpen(false)} reduceMotion={appearance.reduceMotion || reduced} look={look} petId={petId} playing={effectiveSpin} focus={focus.state.timer.phase === 'focus' && !focus.state.timer.paused} onAction={action => {
      setModularOpen(false);
      if (['timer', 'tasks', 'study', 'notes', 'stats'].includes(action)) saveDock({ open: true, tab: action });
      else if (action === 'pet') setCatPanelOpen(true);
      else if (action === 'music') chrome.setCorner(true);
      else if (action === 'lyrics') setTimeout(() => document.querySelector('.turntable-lyrics-entry')?.click(), 0);
      else window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: action === 'mail' ? { tab: 'letters' } : {} }));
    }}/></Suspense>}
    {focus && <FocusDock open={dock.open} tab={dock.tab} setTab={(tab) => saveDock({ tab })} close={() => saveDock({ open: false })} onOpenSmart={openSmart}/>}
    {desktopMode ? <DesktopWidgets mode="desktop" exit={chrome.toggleDesktopMode} item={deckItem} provider={provider} playback={playback} player={player} spinning={effectiveSpin} toggleVisual={deck.toggleVisual} trackIndex={deck.shownTrackIndex}/> : zen && !chrome.zenTools && <DesktopWidgets mode="zen"/>}
    {!desktopMode && <ImmersiveChrome zen={zen} fullscreen={fullscreen} exitFullscreen={chrome.exitFullscreen} toggleZen={chrome.toggleZen} tools={chrome.zenTools} setTools={chrome.setZenTools} />}
    <Suspense fallback={null}>
      <Suspense fallback={null}><CatPanel open={catPanelOpen} onClose={() => setCatPanelOpen(false)}/></Suspense>
      <SmartTurntable open={smartOpen} close={closeSmart} items={items} onStart={startSmartSession} onSave={saveToShelf} onNeedAiSettings={() => { setSmartOpen(false); flow.setHub('ai'); }}/>
      {corner && <Suspense fallback={<Dialog title="唱机特写" close={() => chrome.setCorner(false)} returnFocus=".focus-badge" size="sm"><p role="status">正在点亮唱机旁的台灯…</p></Dialog>}><ListeningCorner item={deckItem} items={visible} vinyl={recordStyle} provider={provider} spinning={effectiveSpin} trackIndex={deck.shownTrackIndex} setTrackIndex={deck.setTrackIndex} playback={playback} player={player} toggleVisual={deck.toggleVisual} load={deck.load} close={() => chrome.setCorner(false)} reduceMotion={reduced}/></Suspense>}
      {flow.hub && <SettingsHub openStudio={() => { flow.setHub(''); setModularOpen(true); }} section={flow.hub} setSection={flow.setHub} close={() => flow.setHub('')} env={flow.env} player={flow.playerAdapter} provider={provider} useSource={deck.chooseProvider} look={look} petId={petId} onRoomChange={personalizeRoom} reduceMotion={appearance.reduceMotion} error={library?.error} desktop={chrome.desktop} openBackup={() => { flow.setHub(''); openBackup?.(); }} restartOnboarding={flow.restartOnboarding}/>}
      {flow.wizard && <OnboardingWizard state={flow.onboarding} update={flow.saveOnboarding} env={flow.env} player={flow.playerAdapter} look={look} petId={petId} onRoomChange={personalizeRoom} useSource={deck.chooseProvider} openMusicSettings={flow.openMusicSettings} openAdd={() => { flow.closeWizard('later'); openAdd(); }} close={flow.closeWizard} reduceMotion={appearance.reduceMotion} error={library?.error}/>}
    </Suspense>
  </div></CabinRuntimeProvider>;
}
