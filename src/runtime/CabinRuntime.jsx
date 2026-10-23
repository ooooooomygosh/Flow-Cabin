import { loadLyrics, playbackPosition, readLyricSettings, lyricCacheKey, LYRIC_CHANGED } from '../lyrics/lyric-session.mjs';
import { createLyricFeed } from '../lyrics/lyric-feed.mjs';
import { readPrefs, writePrefs, PREFS_EVENT, DESK_PREF_KEYS } from '../lyrics/lyric-prefs.mjs';
import { currentCabinPlayback } from '../scene/playback-listener.mjs';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusState } from '../focus/useFocus';
import { useSoundscape } from '../audio/useSoundscape';
import { useRecordLibrary } from '../RecordLibrary';
import { focusSnapshot } from '../focus/focus-model.mjs';
import { normalizePetId, getPet } from '../pet/pet-catalog.mjs';
import { selectedPack, PACK_CHANGED } from '../pet/imported-pack.mjs';
import { skySnapshot, subscribeSky } from '../sky-clock.mjs';
import { watchLocationRefresh } from '../location/location-client.mjs';
import { createSleepController } from '../home/sleep-controller.mjs';
import { readLights, setRoomLight } from '../home/recipes.mjs';
import { writeLife } from '../home/life-state.mjs';
import { createDeviceSession } from '../sync/device-session.mjs';
import { trackArtist } from '../track-meta.mjs';
import { importedAvatar } from '../pet/imported-avatar.mjs';

const RuntimeContext = createContext(null);
export const useCabinRuntime = () => useContext(RuntimeContext);
export function usePetIdentity() {
  const library = useRecordLibrary(), focus = useFocusState();
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId);
  const [pack, setPack] = useState(selectedPack);
  useEffect(() => { const update = () => { const next=selectedPack();setPack(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next); }; window.addEventListener(PACK_CHANGED, update); window.addEventListener('storage', update); return () => { window.removeEventListener(PACK_CHANGED, update); window.removeEventListener('storage', update); }; }, []);
  const accessory = focus ? focusSnapshot(focus.state, Date.now()).accessory || '' : '';
  return useMemo(() => ({ kind: pack ? 'imported' : 'builtin', id: pack?.id || petId, builtinId: petId,
    name: pack ? pack.name || '导入的伙伴' : getPet(petId).name, accessory, pack,
    revision: `${pack?.id || petId}:${accessory}:${pack ? JSON.stringify([pack.mirror,pack.baseline,pack.actionMap,pack.animations]) : ''}`,
    icons: pack ? {} : { avatar: `/pet-art/v21/${petId}/${accessory ? `equipped/${accessory}/` : ''}avatar-256.png`, dock: `/pet-art/v21/${petId}/${accessory ? `equipped/${accessory}/` : ''}dock-1024.png` },
  }), [petId, pack, accessory]);
}

// The runtime and its audio elements stay mounted above every room / tool surface.
// The focus second clock and beat clock have their own subscriptions; they do not
// make the house, collection or native identity re-render every frame.
export function CabinRuntimeProvider({ deck, items, look, onNavigate, onRoomChange, notify, children }) {
  const focus = useFocusState(), sound = useSoundscape(), identity = usePetIdentity();
  const capture = useRef(null);
  const sceneCapture = useMemo(() => ({ register(fn) { capture.current = fn; return () => { if (capture.current === fn) capture.current = null; }; }, async render() { if (!capture.current) throw Error('小屋画面还在加载，请稍后再试。'); return capture.current(); } }), []);
  useEffect(() => {
    if (!window.albumMobile?.setCompanion) return;
    let cancelled = false;
    (async () => {
      const avatar = identity.pack ? await importedAvatar(identity.pack) : '';
      if (!cancelled) await window.albumMobile.setCompanion({ pet: identity.builtinId, accessory: identity.accessory, avatar });
    })().catch(() => { if (!cancelled) notify('桌面组件的伙伴暂未更新。'); });
    if (identity.kind === 'builtin') window.albumMobile.setLauncherIcon?.(identity.builtinId).catch(() => notify('启动器图标暂未更新。'));
    return () => { cancelled = true; };
  }, [identity.revision]);
  const [sky, setSky] = useState(skySnapshot);
  useEffect(() => subscribeSky(setSky), []);
  useEffect(() => watchLocationRefresh(), []);
  const current = useRef(null); current.current = { deck, focus, sound, onNavigate, onRoomChange, notify, items, look, dim: readLights()[look] === true };
  const sleep = useMemo(() => createSleepController({ getRuntime: () => current.current, setLight: setRoomLight, setResting: resting => writeLife({ resting }) }), []);
  useEffect(() => () => sleep.dispose(), [sleep]);
  const commands = useMemo(() => ({
    open: (tool, options) => current.current.onNavigate(tool, options),
    play: options => { const { deck: d, onNavigate: open } = current.current; if (!d.deckItem) return open('library'); if (d.provider === 'visual') return open('music'); if (d.provider === 'system') return d.system.control('toggle'); return d.playback.toggle(options); },
    next: () => { const d = current.current.deck; return d.provider === 'system' ? d.system.control('next') : d.player?.next(true); },
    previous: () => { const d = current.current.deck; return d.provider === 'system' ? d.system.control('previous') : d.player?.previous(); },
    load: (item, index = 0) => current.current.deck.load(item, index),
    focus: () => current.current.focus.toggle(),
    task: (id, done) => current.current.focus.updateTask(id, { done }),
    theme: theme => current.current.onRoomChange({ look: theme }),
    pet: petId => current.current.onRoomChange({ petId }),
  }), []);
  const lyricsTrack = useMemo(() => ({ provider: deck.playback.resolvedProvider || deck.provider,
    id: deck.provider === 'system' ? '' : deck.playback.resolvedId || '',
    title: deck.actualTrack || deck.nowTrack || deck.deckItem?.title || '',
    artist: deck.system?.artist || deck.playback.resolvedArtist || trackArtist(deck.deckItem, deck.shownTrackIndex),
    album: deck.system?.album || deck.playback.resolvedAlbum || (deck.deckItem?.type === 'album' ? deck.deckItem.title : ''),
    duration: deck.provider === 'system' ? deck.system?.timeline?.getSnapshot().duration || 0 : deck.playback.duration || 0,
  }), [deck.provider, deck.actualTrack, deck.nowTrack, deck.deckItem, deck.shownTrackIndex, deck.playback.resolvedId, deck.playback.resolvedProvider, deck.playback.resolvedArtist, deck.playback.resolvedAlbum, deck.playback.duration, deck.system]);
  current.current = { ...current.current, commands, identity, lyricsTrack };
  // One lyric feed for the desktop lyric bar and other readers (src/lyrics/lyric-feed.mjs).
  const lyricFeed = useMemo(() => createLyricFeed(), []);
  current.current.lyricFeed = lyricFeed;
  useEffect(() => {
    lyricFeed.setSource(() => { const r = current.current, d = r.deck, system = d.provider === 'system' ? d.system : null, signal = currentCabinPlayback();
      return { position: playbackPosition(d.playback, system), playing: Boolean(system ? system.playing : d.audible), rate: d.playback.rate || 1, duration: (Number(r.lyricsTrack.duration) || 0) * 1000, energy: signal.energy, bpm: signal.bpm, beatAt: signal.beatAt }; });
    const readPrefsNow = () => lyricFeed.setPrefs(readPrefs());
    // The desktop lyric bar changes display preferences through the shell; the page owns them.
    const patch = event => { try { const value = event.detail && typeof event.detail === 'object' ? event.detail : {}; writePrefs(Object.fromEntries(Object.entries(value).filter(([key]) => DESK_PREF_KEYS.includes(key)))); } catch { /* storage full: keep the old look */ } };
    readPrefsNow(); window.addEventListener(PREFS_EVENT, readPrefsNow); window.addEventListener('storage', readPrefsNow); window.addEventListener('cabin:lyric-prefs-patch', patch);
    window.cabinLyricFeed = lyricFeed;
    return () => { if (window.cabinLyricFeed === lyricFeed) delete window.cabinLyricFeed; window.removeEventListener(PREFS_EVENT, readPrefsNow); window.removeEventListener('storage', readPrefsNow); window.removeEventListener('cabin:lyric-prefs-patch', patch); };
  }, [lyricFeed]);
  useEffect(() => { lyricFeed.setSkin(look); }, [lyricFeed, look]);
  useEffect(() => { lyricFeed.setPet({ id: identity.builtinId, accessory: identity.accessory }); }, [lyricFeed, identity.revision]);
  const lyricKey = lyricCacheKey(lyricsTrack);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (deck.provider === 'visual' || !lyricsTrack.title) { lyricFeed.setDoc(lyricKey, null, lyricsTrack); return; }
      loadLyrics(lyricsTrack).then(doc => { if (!alive) return; lyricFeed.setDoc(lyricKey, doc, lyricsTrack); lyricFeed.setOffset((doc.offset || 0) + (Number(readLyricSettings(lyricsTrack).offset) || 0)); }, () => { if (alive) lyricFeed.setDoc(lyricKey, null, lyricsTrack); });
    };
    load(); window.addEventListener(LYRIC_CHANGED, load);
    return () => { alive = false; window.removeEventListener(LYRIC_CHANGED, load); };
  }, [lyricFeed, lyricKey, deck.provider]);
  const devices = useMemo(() => createDeviceSession(() => current.current), []);
  useEffect(() => { if (window.albumMobile?.syncRequest || window.albumDesktopCapabilities?.lanSync) devices.start(); return () => devices.stop(); }, [devices]);
  useEffect(() => { if(!window.albumMobile?.consumeWidgetCommand)return;const run=async()=>{try{const {action}=await window.albumMobile.consumeWidgetCommand();if(action==='focus-toggle')current.current.focus.toggle();else if(['focus-break','focus-next','focus-skip','focus-extend','focus-end'].includes(action))window.dispatchEvent(new CustomEvent('album-companion-command',{detail:{command:action}}));}catch{}};run();window.addEventListener('cabin:widget-command',run);window.addEventListener('focus',run);return()=>{window.removeEventListener('cabin:widget-command',run);window.removeEventListener('focus',run);};},[]);
  const value = { devices, deck, items, look, focus, sound, identity, sky, commands, lyricsTrack, notify, sleep, sceneCapture };
  return <RuntimeContext.Provider value={value}>
    <div hidden aria-hidden="true" data-cabin-audio-host>{deck.playback.deckRefs.map((ref, index) => <audio key={index} ref={ref} {...deck.playback.events} preload="auto"/>)}</div>
    {children}
  </RuntimeContext.Provider>;
}
