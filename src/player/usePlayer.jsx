import { useEffect, useMemo, useRef, useState } from 'react';
import { QUEUE_KEY, normalizeQueue, queueAddition, dequeue, pruneQueue, cycleRepeat, nextStep, nextPlayableStep, previousStep } from './player-queue.mjs';
import { createPlaybackBroadcaster, rmsEnergy, smoothEnergy, estimatedEnergy, ENERGY_INTERVAL_MS } from './playback-signal.mjs';
import { analyserFor } from './audio-graph.mjs';
import { trackNames } from '../room-model.mjs';

const readQueue = () => { try { return normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY))); } catch { return normalizeQueue(null); } };

// Track order, the 待播 album queue, repeat and shuffle for the cabin deck.
export function usePlayerQueue({ items, record, trackIndex, setTrackIndex, loadAlbum, playback, provider }) {
  const [queue, setQueueState] = useState(readQueue), [queueError, setQueueError] = useState('');
  const currentQueue = useRef(queue);
  const setQueue = (change) => {
    const next = normalizeQueue(typeof change === 'function' ? change(currentQueue.current) : change);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch { setQueueError('无法保存待播，请检查存储空间后重试。'); return false; }
    currentQueue.current = next; setQueueState(next); setQueueError(''); return true;
  };
  const add = (id, first = false) => { const result = queueAddition(currentQueue.current, id, first); if (result.error) { setQueueError(result.error); return false; } return setQueue(result.queue); };
  const itemsSignature = items.map((item) => item.id).join('|');
  useEffect(() => { if (items.length) setQueue((old) => pruneQueue(old, items.map((item) => item.id))); }, [itemsSignature]);
  const trackCount = trackNames(record).length, audible = provider !== 'visual' && provider !== 'system';
  // What plays after this track is decided once (shuffle included), so the deck
  // can match that exact track early and the transition is instant.
  // Tracks whose early match failed are stepped over (see useRoomPlayback).
  const upcoming = useMemo(() => nextPlayableStep({ trackIndex, trackCount, queue, blocked: (index) => Boolean(playback?.isBlocked?.(record, index)) }), [record?.id, trackIndex, trackCount, queue.ids.join('|'), queue.repeat, queue.shuffle, playback?.blockedVersion]);
  const go = (step) => {
    if (step.type === 'track') setTrackIndex(step.index);
    else if (step.type === 'restart') { if (audible) playback?.restart(); }
    else if (step.type === 'album') { const item = items.find((entry) => entry.id === step.id); if (!setQueue((old) => dequeue(old, step.id))) return false; if (item) loadAlbum(item, 0); }
    return step.type !== 'stop';
  };
  const api = {
    queue, queueError,
    canNext: Boolean(record) && nextStep({ trackIndex, trackCount, queue, manual: true, random: () => 0 }).type !== 'stop',
    canPrevious: Boolean(record) && (trackIndex > 0 || (audible && (playback?.position || 0) > 0)),
    next: (manual = true) => record && go(manual && upcoming.type === 'restart' ? nextStep({ trackIndex, trackCount, queue, manual }) : upcoming),
    canAdvance: Boolean(record) && upcoming.type !== 'stop',
    peekNext: () => upcoming.type === 'track' ? { item: record, index: upcoming.index } : upcoming.type === 'album' ? { item: items.find((entry) => entry.id === upcoming.id), index: 0 } : null,
    previous: () => record && go(previousStep({ trackIndex, position: audible ? playback?.position || 0 : 0 })),
    enqueue: (id) => add(id),
    playNext: (id) => add(id, true),
    remove: (id) => setQueue((old) => dequeue(old, id)),
    cycleRepeat: () => setQueue((old) => cycleRepeat(old)),
    toggleShuffle: () => setQueue((old) => ({ ...old, shuffle: !old.shuffle }))
  };
  const ref = useRef(api); ref.current = api;
  return [api, ref];
}

export const PLAYER_COMMAND_EVENT = 'cabin:player-command';
export const PLAYER_COMMANDS = Object.freeze(['toggle', 'play', 'pause', 'next', 'previous']);
const typing = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
// Global keys (ignored while typing or with a dialog open):
//   Space play/pause · Shift+←/→ previous/next · ←/→ seek 5 s · M mute
//   - / = volume · R repeat · S shuffle. Also wires hardware media keys.
export function usePlayerShortcuts({ playback, player, provider, toggleVisual, record, trackIndex = 0, spinning = false }) {
  const latest = useRef(); latest.current = { playback, player, provider, toggleVisual, record, spinning };
  useEffect(() => {
    const keydown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || document.querySelector('dialog[open]')) return;
      const { playback: pb, player: pl, provider: source, toggleVisual: spin, record: current } = latest.current;
      if (!current) return;
      const audible = source !== 'visual' && source !== 'system', key = event.key;
      const act = (fn) => { event.preventDefault(); fn(); };
      if (key.startsWith('Arrow') && event.target?.closest?.('.room-turntable,[role=tablist],[role=listbox],[role=menu],[role=radiogroup],.focus-dock')) return; // arrows nudge the deck while its handle is focused
      if (key === ' ' || key === 'Spacebar') { if (event.target?.closest?.('button,a,[role=button],[role=slider]')) return; act(() => audible ? pb.toggle() : source === 'visual' && spin()); }
      else if (event.shiftKey && key === 'ArrowRight') act(() => pl.next());
      else if (event.shiftKey && key === 'ArrowLeft') act(() => pl.previous());
      else if (!event.shiftKey && audible && key === 'ArrowRight') act(() => pb.seekBy(5));
      else if (!event.shiftKey && audible && key === 'ArrowLeft') act(() => pb.seekBy(-5));
      else if (audible && (key === 'm' || key === 'M')) act(() => pb.setMuted(!pb.muted));
      else if (audible && (key === '-' || key === '_')) act(() => pb.setVolume(pb.volume - .05));
      else if (audible && (key === '=' || key === '+')) act(() => pb.setVolume(pb.volume + .05));
      else if (key === 'r' || key === 'R') act(() => pl.cycleRepeat());
      else if (key === 's' || key === 'S') act(() => pl.toggleShuffle());
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  // `cabin:player-command` (docs/events.md): other surfaces — the desktop-mode
  // mini turntable, or another window via main-process IPC — drive this deck.
  useEffect(() => {
    const command = (event) => {
      const action = event?.detail?.action, { playback: pb, player: pl, provider: source, toggleVisual: spin, record: current } = latest.current;
      if (!current || !PLAYER_COMMANDS.includes(action)) return;
      const audible = source !== 'visual' && source !== 'system';
      if (action === 'next') pl.next(); // same queue / repeat / shuffle rules as the ⏭ button
      else if (action === 'previous') pl.previous();
      else if (!audible) { if (source === 'visual' && (action === 'toggle' || (action === 'play') !== Boolean(latest.current.spinning))) spin?.(); }
      else {
        // The element is the truth while a track is still buffering; remote players report state.
        const element = pb.audio?.current, playing = !pb.remote && element?.getAttribute('src') ? !element.paused : Boolean(pb.playing);
        if (action === 'toggle' || (action === 'play' && !playing) || (action === 'pause' && playing)) pb.toggle();
      }
    };
    window.addEventListener(PLAYER_COMMAND_EVENT, command);
    return () => window.removeEventListener(PLAYER_COMMAND_EVENT, command);
  }, []);
  // Media Session: OS media keys, lock-screen / taskbar controls.
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  const audible = provider !== 'visual' && provider !== 'system';
  const title = record ? trackNames(record)[trackIndex] : '';
  useEffect(() => {
    if (!session) return;
    const handlers = { play: () => latest.current.playback?.playing || latest.current.playback?.toggle(), pause: () => latest.current.playback?.playing && latest.current.playback.toggle(), nexttrack: () => latest.current.player.next(), previoustrack: () => latest.current.player.previous(), seekto: (details) => latest.current.playback?.seek(details.seekTime) };
    for (const [action, handler] of Object.entries(handlers)) { try { session.setActionHandler(action, audible && record ? handler : null); } catch {} }
    return () => { for (const action of Object.keys(handlers)) { try { session.setActionHandler(action, null); } catch {} } };
  }, [audible, Boolean(record)]);
  useEffect(() => {
    if (!session || typeof MediaMetadata === 'undefined') return;
    try {
      session.metadata = audible && record ? new MediaMetadata({ title: playback?.actualTrack || title || record.title, artist: record.artist, album: record.title, artwork: record.cover && /^(https:|data:image\/)/.test(record.cover) ? [{ src: record.cover, sizes: '512x512' }] : [] }) : null;
      session.playbackState = audible && record ? playback?.playing ? 'playing' : 'paused' : 'none';
    } catch {}
  }, [audible, record?.id, title, playback?.actualTrack, playback?.playing]);
}

// Broadcasts `cabin:playback` on window (see docs/events.md).
export function usePlaybackBroadcast({ playing, provider, spinning, record, trackIndex, trackTitle, audio }) {
  const cast = useRef(null), energy = useRef(0);
  cast.current ||= createPlaybackBroadcaster({ target: window });
  const track = record ? { id: record.id, index: trackIndex, title: trackTitle || trackNames(record)[trackIndex] || record.title, artist: record.artist, album: record.title } : null;
  const state = { playing, provider, spinning, track };
  const latest = useRef(state); latest.current = state;
  const sample = () => {
    const now = latest.current, graph = analyserFor(audio?.current);
    let value = 0, estimated = false;
    if (now.playing) { if (graph && audio.current && !audio.current.paused) value = rmsEnergy(graph.read()); else { value = estimatedEnergy(performance.now()); estimated = true; } }
    energy.current = smoothEnergy(energy.current, value);
    cast.current.update({ ...now, energy: energy.current, estimated });
  };
  useEffect(() => { energy.current = 0; sample(); }, [playing, provider, spinning, track?.id, track?.index, track?.title]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(sample, ENERGY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => () => cast.current?.update({ playing: false, provider: '', track: null }), []);
}

// First-time listeners have not picked an audio source yet. When a record
// clearly carries one (scanned/imported files, QQ track ids) use it, so
// double-clicking a cover simply plays. An explicit choice always wins.
export function suggestProvider(item) {
  const details = Array.isArray(item?.trackDetails) ? item.trackDetails : [];
  if (item?.externalIds?.fileAlbum || details.some((track) => track?.source === 'local')) return 'local';
  if (details.some((track) => /^[a-z\d]{14}$/i.test(track?.providerId || '') && track?.source !== 'local') || /^[a-z\d]{14}$/i.test(item?.externalIds?.qqSongMid || '')) return 'auto'; // QQ ids first, then verified QQ / 网易云 matches
  if (item?.type === 'playlist') return 'auto'; // imported playlists: the source platform first, then version-safe matches
  return '';
}
