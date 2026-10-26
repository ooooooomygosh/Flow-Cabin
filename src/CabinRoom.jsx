import { selectPack } from './pet/imported-pack.mjs';
import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { reportTrayPet } from './desktop/desktop-sink-client.mjs';
import { dismissHomeNotice } from './interface-mode.mjs';
import { getRoomScene } from './scene-catalog.mjs';
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
import { CabinRuntimeProvider } from './runtime/CabinRuntime';
import CabinHome from './home/CabinHome';
import HomePanels, { HomeLyrics, LifeReminder } from './home/HomePanels';
import useLabs from './product/useLabs';
import { openJournal } from './focus/stats/journal-events.mjs';

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

export default function CabinRoom({ items, loading, loadError = '', reload, openRecord, openAdd, firstVisit = false, hubRequest = null, openBackup, openWall, notify, saveToShelf }) {
  const appearance = useDesktopAppearance(), reduced = useReducedMotion();
  const stage = useRef(null);
  // 「首页换成了生活小屋」 is news only for people who used an earlier home; a new install starts here.
  useState(() => { if (firstVisit) dismissHomeNotice(); });
  const flow = useOnboardingFlow({ client: appearance.client, loading, loadError, firstVisit, itemCount: items.length, hubRequest, notify });
  // On a first visit the guide comes first; the home's one-line hint waits until it has been closed once.
  const [guideDone, setGuideDone] = useState(!firstVisit), guideShown = useRef(false);
  useEffect(() => { if (flow.wizard) guideShown.current = true; else if (guideShown.current) setGuideDone(true); }, [flow.wizard]);
  const chrome = useRoomChrome({ client: appearance.client, notify, restoreDock: false });
  const library = useRecordLibrary(), look = library?.data.rooms[library.roomId]?.look || 'pixel';
  const [mobileSlotCount, setMobileSlotCount] = useState(null);
  const [mobileShelfCompact, setMobileShelfCompact] = useState(false);
  const { filters, setFilters, visible, view, selected, setSelectedId, changeRow, filtered } = useShelf({ items, look, stage, mobileSlotCount });
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId);
  const deck = useDeck({ items, onLoad: (item) => setSelectedId(item.id), notify });
  const { record, provider, playback, player, deckItem, effectiveSpin } = deck;
  const focus = useFocusState(), sound = useSoundscape();
  useCatCareHost();
  const [tool, setTool] = useState(''), [lyricsOpen, setLyricsOpen] = useState(false), [editRequest, setEditRequest] = useState(0);
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const closeSmart = useCallback(() => setSmartOpen(false), []);
  const openSmart = useCallback(() => setSmartOpen(true), []);
  // 实验室 (src/product/features.mjs): an entry point is only offered while its lab is on.
  const labs = useLabs(), smartEntry = labs.smartTurntable ? openSmart : undefined;
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
  const openTool = action => {
    if (['timer', 'tasks', 'study', 'notes', 'stats', 'sound'].includes(action)) { setTool(''); saveDock({ open: true, tab: action }); return; }
    saveDock({ open: false });
    if (action === 'wall') { setTool(''); openWall?.(); return; }
    if (action === 'interface') { setTool(''); window.dispatchEvent(new Event('cabin:interface-choice')); return; }
    if (action === 'backup') { setTool(''); openBackup?.(); return; }
    if (action === 'pet') { setTool(''); setCatPanelOpen(true); return; }
    if (action === 'settings' || action === 'music-settings') { setTool(''); flow.setHub('music'); return; }
    if (action === 'lyrics') { setLyricsOpen(true); return; }
    // 日记 (top bar, the 窝/日记本 hotspot): the journal's own first page, the same as L.
    if (action === 'diary') { openJournal(); return; }
    if (action === 'journal' || action === 'mail') { window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: action === 'mail' && labs.letters ? 'letters' : 'entries' } })); return; }    setTool(action);
  };
  return <CabinRuntimeProvider deck={deck} items={items} look={look} onNavigate={openTool} onRoomChange={personalizeRoom} notify={notify}>
    <CabinHome reduced={appearance.reduceMotion || reduced} editRequest={editRequest} focusOpen={dock.open} petOpen={catPanelOpen} guiding={flow.wizard || !guideDone}/>
    <LifeReminder/>
    {library?.error && <p className="home-layout-error" role="alert">设置未保存：{library.error}</p>}
    {wallpaperError && <p className="wallpaper-error" role="alert">{wallpaperError}<button type="button" aria-label="关闭动态背景提示" onClick={() => setWallpaperError('')}>×</button></p>}
    <HomePanels tool={tool} close={() => setTool('')} filters={filters} setFilters={setFilters} visible={visible} recordStyle={recordStyle} openAdd={openAdd} openRecord={openRecord} openWall={openWall} openSmart={smartEntry && (() => { setTool(''); openSmart(); })} onRoomChange={personalizeRoom}/>{/* the panel is modal: close it, or the smart turntable opens inert behind it */}
    {focus && <CabinJournal/>}
    {focus && <FocusDock open={false}/>}
    {focus && dock.open && <Dialog title="专注" close={() => saveDock({ open: false })} className="home-tool home-focus-dialog" size="lg"><FocusDock embedded open tab={dock.tab} setTab={tab => saveDock({ tab })} close={() => saveDock({ open: false })} onOpenSmart={smartEntry}/></Dialog>}
    {lyricsOpen && <HomeLyrics close={() => setLyricsOpen(false)}/>}
    {desktopMode ? <DesktopWidgets mode="desktop" exit={chrome.toggleDesktopMode} item={deckItem} provider={provider} playback={playback} player={player} spinning={effectiveSpin} toggleVisual={deck.toggleVisual} trackIndex={deck.shownTrackIndex}/> : zen && !chrome.zenTools && <DesktopWidgets mode="zen"/>}
    {!desktopMode && <ImmersiveChrome zen={zen} fullscreen={fullscreen} exitFullscreen={chrome.exitFullscreen} toggleZen={chrome.toggleZen} tools={chrome.zenTools} setTools={chrome.setZenTools}/>}
    <Suspense fallback={null}>
      <CatPanel open={catPanelOpen} onClose={() => setCatPanelOpen(false)} onChoosePet={() => { setCatPanelOpen(false); setTool('companions'); }}/>
      <SmartTurntable open={smartOpen} close={closeSmart} items={items} onStart={startSmartSession} onSave={saveToShelf} onNeedAiSettings={() => { setSmartOpen(false); flow.setHub('ai'); }}/>
      {corner && <Suspense fallback={<Dialog title="唱机特写" close={() => chrome.setCorner(false)}><p role="status">正在点亮唱机旁的台灯…</p></Dialog>}><ListeningCorner item={deckItem} items={visible} vinyl={recordStyle} provider={provider} spinning={effectiveSpin} trackIndex={deck.shownTrackIndex} setTrackIndex={deck.setTrackIndex} playback={playback} player={player} toggleVisual={deck.toggleVisual} load={deck.load} close={() => chrome.setCorner(false)} reduceMotion={reduced}/></Suspense>}
      {flow.hub && <SettingsHub openStudio={() => { flow.setHub(''); setEditRequest(value => value + 1); }} section={flow.hub} setSection={flow.setHub} close={() => flow.setHub('')} env={flow.env} player={flow.playerAdapter} provider={provider} useSource={deck.chooseProvider} look={look} petId={petId} onRoomChange={personalizeRoom} reduceMotion={appearance.reduceMotion} error={library?.error} desktop={chrome.desktop} openBackup={() => { flow.setHub(''); openBackup?.(); }} restartOnboarding={flow.restartOnboarding}/>}
      {flow.wizard && <OnboardingWizard state={flow.onboarding} update={flow.saveOnboarding} env={flow.env} player={flow.playerAdapter} look={look} petId={petId} onRoomChange={personalizeRoom} useSource={deck.chooseProvider} openMusicSettings={flow.openMusicSettings} openAdd={() => { flow.closeWizard('later'); openAdd(); }} close={flow.closeWizard} reduceMotion={appearance.reduceMotion} error={library?.error}/>}
    </Suspense>
  </CabinRuntimeProvider>;
}
