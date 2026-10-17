import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRoomPlayback from '../useRoomPlayback';
import useSystemNowPlaying from '../useSystemNowPlaying';
import { trackCover } from '../room-playback.mjs';
import { isDeckProvider } from '../player/providers.mjs';
import { usePlayerQueue, usePlayerShortcuts, usePlaybackBroadcast, suggestProvider } from '../player/usePlayer';

const PROVIDER_KEY = 'album-circle-room-player-v1';
const readProvider = () => { try { const value = localStorage.getItem(PROVIDER_KEY); return isDeckProvider(value) ? value : 'visual'; } catch { return 'visual'; } };

// The cabin deck: which record / track is on it, the chosen audio source, the
// two-deck player, the 待播 queue, the system media mirror, keyboard + media
// keys and the `cabin:playback` broadcast. `onLoad(item)` lets the shelf follow.
export default function useDeck({ items, onLoad }) {
  const [record, setRecord] = useState(null), [spinning, setSpinning] = useState(false), [trackIndex, setTrackIndex] = useState(0);
  const [provider, setProvider] = useState(readProvider);
  const chosenProvider = useRef((() => { try { return Boolean(localStorage.getItem(PROVIDER_KEY)); } catch { return true; } })());
  const chooseProvider = useCallback((value) => { chosenProvider.current = true; setProvider(value); try { localStorage.setItem(PROVIDER_KEY, value); } catch {} }, []);
  const queueRef = useRef(null);
  const playback = useRoomPlayback(record, trackIndex, provider, (manual = false) => queueRef.current?.current.next(manual), { peekNext: () => queueRef.current?.current.peekNext(), canNext: () => Boolean(queueRef.current?.current.canNext) });
  const system = useSystemNowPlaying(provider === 'system');
  // A playlist shows the current song's own cover on the deck, widgets and media keys.
  const shownCover = provider === 'system' ? '' : trackCover(record, trackIndex, playback.actualCover);
  const deckItem = useMemo(() => provider === 'system' ? system.item : record && shownCover && shownCover !== record.cover ? { ...record, cover: shownCover } : record, [provider, system.item, record, shownCover]);
  const effectiveSpin = provider === 'visual' ? spinning : provider === 'system' ? Boolean(system.active && system.playing) : playback.playing;
  const load = (item, index = 0) => {
    if (!chosenProvider.current && provider === 'visual') { const suggested = suggestProvider(item); if (suggested) { setProvider(suggested); chosenProvider.current = true; } }
    if (record?.id === item.id && trackIndex === index && provider !== 'visual' && !playback.playing) playback.toggle();
    setRecord(item); onLoad?.(item); setTrackIndex(index); setSpinning(true);
  };
  const loadRef = useRef(load); loadRef.current = load;
  // Stable for memoised children (the shelf rack, the queue): always the latest load.
  const place = useCallback((item, index) => loadRef.current(item, index), []);
  const toggleVisual = useCallback(() => setSpinning((value) => !value), []);
  const eject = useCallback(() => { setRecord(null); setSpinning(false); }, []);
  const [player, playerRef] = usePlayerQueue({ items, record, trackIndex, setTrackIndex, loadAlbum: place, playback, provider });
  queueRef.current = playerRef;
  usePlayerShortcuts({ playback, player, provider, record: provider === 'system' ? record : deckItem, trackIndex, spinning, toggleVisual });
  usePlaybackBroadcast({ playing: provider === 'system' ? Boolean(system.active && system.playing) : provider === 'visual' ? false : playback.playing, provider, spinning: effectiveSpin, record: deckItem, trackIndex: provider === 'system' ? 0 : trackIndex, trackTitle: provider === 'system' ? system.title : playback.actualTrack, audio: playback.audio });
  useEffect(() => { if (record && !items.some((item) => item.id === record.id)) eject(); }, [items]);
  // The album card asks the deck to play an album, optionally from a track.
  useEffect(() => {
    // A playlist saved a moment ago may not be in `items` yet; the event carries it.
    const resolve = (detail) => items.find((entry) => entry.id === detail?.id) || (detail?.item?.id === detail?.id ? detail.item : null);
    const play = (event) => { const item = resolve(event.detail); if (!item) return; if (event.detail.shuffle) queueRef.current?.current?.shuffleOnce(item.id); loadRef.current(item, Math.max(0, Number(event.detail.track) || 0)); };
    const enqueue = (event) => { const item = resolve(event.detail); if (event.detail) event.detail.accepted = Boolean(item && queueRef.current?.current?.enqueue(item.id)); };
    window.addEventListener('cabin-play', play); window.addEventListener('cabin-enqueue', enqueue);
    return () => { window.removeEventListener('cabin-play', play); window.removeEventListener('cabin-enqueue', enqueue); };
  }, [items]);
  const shownTrackIndex = provider === 'system' ? 0 : trackIndex;
  const nowTrack = provider === 'visual' ? '' : provider === 'system' ? (system.active ? system.title : '') : playback.actualTrack || (record && playback.playing ? record.tracks?.[trackIndex] || record.title : '');
  const statusText = provider === 'visual' ? (record ? spinning ? '展示中 · 无音频' : '旋转已暂停 · 无音频' : '等待放盘 · 无音频') : provider === 'system' ? system.statusText : playback.statusText;
  return { record, spinning, trackIndex, setTrackIndex, shownTrackIndex, provider, chooseProvider, playback, system, deckItem, effectiveSpin, load, place, toggleVisual, eject, player, nowTrack: typeof nowTrack === 'string' ? nowTrack : '', statusText,
    actualTrack: provider === 'system' ? system.title || '' : playback.actualTrack || '',
    audible: provider === 'system' ? Boolean(system.playing) : provider !== 'visual' && playback.playing };
}
