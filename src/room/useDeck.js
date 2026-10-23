import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRoomPlayback from '../useRoomPlayback';
import useSystemNowPlaying from '../useSystemNowPlaying';
import { trackCover } from '../room-playback.mjs';
import { isDeckProvider } from '../player/providers.mjs';
import { usePlayerQueue, usePlayerShortcuts, usePlaybackBroadcast, suggestProvider } from '../player/usePlayer';
import { queueId, sessionQueue } from '../player/player-queue.mjs';

const PROVIDER_KEY = 'album-circle-room-player-v1';
const readProvider = () => { try { const value = localStorage.getItem(PROVIDER_KEY); return isDeckProvider(value) ? value : 'visual'; } catch { return 'visual'; } };
// Collection ids are usually strings; numeric ids still name the same record.
const sameRecord = (left, right) => Boolean(queueId(left)) && queueId(left) === queueId(right);

// The cabin deck: which record / track is on it, the chosen audio source, the
// two-deck player, the 待播 queue, the system media mirror, keyboard + media
// keys and the `cabin:playback` broadcast. `onLoad(item)` lets the shelf follow.
export default function useDeck({ items, onLoad }) {
  const itemsRef = useRef(items); itemsRef.current = items;
  const [record, setRecord] = useState(null), [spinning, setSpinning] = useState(false), [trackIndex, setTrackIndex] = useState(0);
  const [provider, setProvider] = useState(readProvider);
  const chosenProvider = useRef((() => { try { return Boolean(localStorage.getItem(PROVIDER_KEY)); } catch { return true; } })());
  const chooseProvider = useCallback((value) => { chosenProvider.current = true; setProvider(value); try { localStorage.setItem(PROVIDER_KEY, value); } catch {} }, []);
  const queueRef = useRef(null);
  const playback = useRoomPlayback(record, trackIndex, provider, (manual = false) => queueRef.current?.current.next(manual), { onNativeTrackIndex: setTrackIndex, peekNext: () => queueRef.current?.current.peekNext(), canNext: () => Boolean(queueRef.current?.current.canNext) });
  const system = useSystemNowPlaying(provider === 'system');
  // A playlist shows the current song's own cover on the deck, widgets and media keys.
  const shownCover = provider === 'system' ? '' : trackCover(record, trackIndex, playback.actualCover);
  const deckItem = useMemo(() => provider === 'system' ? system.item : record && shownCover && shownCover !== record.cover ? { ...record, cover: shownCover } : record, [provider, system.item, record, shownCover]);
  const effectiveSpin = provider === 'visual' ? spinning : provider === 'system' ? Boolean(system.active && system.playing) : playback.playing;
  const load = (item, index = 0, options = {}) => {
    if (!item) return;
    const autoplay = options?.autoplay !== false;
    playback.setAutoStart(autoplay);
    if (autoplay && !chosenProvider.current && provider === 'visual') { const suggested = suggestProvider(item); if (suggested) chooseProvider(suggested); }
    if (autoplay && sameRecord(record?.id, item.id) && trackIndex === index && provider !== 'visual' && provider !== 'system') {
      if (playback.status === 'error') playback.retry();
      else if (!playback.playing) playback.toggle();
    }
    // Same record, but the session asked not to autoplay: stop what is live
    // and leave the loaded record waiting for a play press.
    else if (!autoplay && sameRecord(record?.id, item.id) && trackIndex === index && provider !== 'visual' && provider !== 'system') playback.hold();
    setRecord(item); onLoad?.(item); setTrackIndex(index); setSpinning(true);
  };
  const loadRef = useRef(load); loadRef.current = load;
  // Stable for memoised children (the shelf rack, the queue): always the latest load.
  const place = useCallback((item, index) => {
    if (!item) return;
    // The queue works with canonical string ids; load the shelf's own object
    // so every other surface keeps the collection's original id type.
    const original = itemsRef.current.find((entry) => sameRecord(entry?.id, item.id)) || item;
    loadRef.current(original, index);
  }, []);
  const toggleVisual = useCallback(() => setSpinning((value) => !value), []);
  const eject = useCallback(() => { setRecord(null); setSpinning(false); }, []);
  // The queue stores canonical string ids (numeric ids are supported too).
  // Resolve them back through `place` so records keep their original identity.
  const queueItems = useMemo(() => items.map((item) => {
    const id = queueId(item?.id);
    return id && id !== item?.id ? { ...item, id } : item;
  }), [items]);
  const [player, playerRef] = usePlayerQueue({ items: queueItems, record, trackIndex, setTrackIndex, loadAlbum: place, playback, provider });
  queueRef.current = playerRef;
  // Keep the hooks above on canonical ids, but map the queue back to the
  // collection's original id type for the existing UI components. They still
  // compare ids with ===; this keeps numeric shelves visible there too.
  const originalIds = useMemo(() => {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const id = queueId(item?.id);
      if (id && !map.has(id)) map.set(id, item.id);
    }
    return map;
  }, [items]);
  const playerForUi = player && {
    ...player,
    queue: { ...player.queue, ids: player.queue.ids.map((id) => originalIds.has(id) ? originalIds.get(id) : id) }
  };
  // Replace 待播 with this recommendation session. `currentId` is already on
  // the deck, so it must not be duplicated in the queue.
  const replaceQueue = useCallback((entries, currentId) => {
    const api = playerRef.current;
    if (!api) return false;
    const next = sessionQueue(api.queue, (Array.isArray(entries) ? entries : []).map((entry) => entry?.id ?? entry), currentId);
    // A recommendation list has a playback order; a leftover shuffle would
    // defeat it just like repeat-one would strand the new queue.
    if (api.queue.shuffle && !api.toggleShuffle()) return false;
    // Repeat cycles off → all → one. A new ordered session must end at off:
    // one step leaves repeat-one, two leave repeat-all.
    const repeats = api.queue.repeat === 'one' ? 1 : api.queue.repeat === 'all' ? 2 : 0;
    for (let index = 0; index < repeats; index++) if (!api.cycleRepeat()) return false;
    for (const id of api.queue.ids) if (!api.remove(id)) return false;
    for (const id of next.ids) if (!api.enqueue(id)) return false;
    return true;
  }, []);
  usePlayerShortcuts({ playback, player, provider, record: provider === 'system' ? record : deckItem, trackIndex, spinning, toggleVisual });
  usePlaybackBroadcast({ playing: provider === 'system' ? Boolean(system.active && system.playing) : provider === 'visual' ? false : playback.playing, provider, spinning: effectiveSpin, record: deckItem, trackIndex: provider === 'system' ? 0 : trackIndex, trackTitle: provider === 'system' ? system.title : playback.actualTrack, audio: playback.audio });
  useEffect(() => { if (record && !items.some((item) => sameRecord(item.id, record.id))) eject(); }, [items]);
  // The album card asks the deck to play an album, optionally from a track.
  useEffect(() => {
    // A playlist saved a moment ago may not be in `items` yet; the event carries it.
    const resolve = (detail) => items.find((entry) => sameRecord(entry.id, detail?.id)) || (sameRecord(detail?.item?.id, detail?.id) ? detail.item : null);
    const play = (event) => { const item = resolve(event.detail); if (!item) return; if (event.detail.shuffle) queueRef.current?.current?.shuffleOnce(item.id); loadRef.current(item, Math.max(0, Number(event.detail.track) || 0), { autoplay: event.detail.autoplay !== false }); };
    const enqueue = (event) => { const item = resolve(event.detail); if (event.detail) event.detail.accepted = Boolean(item && queueRef.current?.current?.enqueue(item.id)); };
    window.addEventListener('cabin-play', play); window.addEventListener('cabin-enqueue', enqueue);
    return () => { window.removeEventListener('cabin-play', play); window.removeEventListener('cabin-enqueue', enqueue); };
  }, [items]);
  const shownTrackIndex = provider === 'system' ? 0 : trackIndex;
  const nowTrack = provider === 'visual' ? '' : provider === 'system' ? (system.active ? system.title : '') : playback.actualTrack || (record && playback.playing ? record.tracks?.[trackIndex] || record.title : '');
  const statusText = provider === 'visual' ? (record ? spinning ? '展示中 · 无音频' : '旋转已暂停 · 无音频' : '等待放盘 · 无音频') : provider === 'system' ? system.statusText : playback.statusText;
  return { record, spinning, trackIndex, setTrackIndex, shownTrackIndex, provider, chooseProvider, playback, system, deckItem, effectiveSpin, load, place, toggleVisual, eject, player: playerForUi, replaceQueue, isQueued: (id) => player.queue.ids.includes(queueId(id)), nowTrack: typeof nowTrack === 'string' ? nowTrack : '', statusText,
    actualTrack: provider === 'system' ? system.title || '' : playback.actualTrack || '',
    audible: provider === 'system' ? Boolean(system.playing) : provider !== 'visual' && playback.playing };
}
