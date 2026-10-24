import { useEffect, useMemo, useRef, useState } from 'react';
import { QUEUE_KEY, normalizeQueue, queueAddition, dequeue, pruneQueue, cycleRepeat, nextStep, nextPlayableStep, previousStep, playedBag, queueId, trackEntry, parseEntry, moveEntry, clearQueue, contextAfter, pushHistory, rewindHistory, recordListen, normalizeListenHistory, LISTEN_HISTORY_KEY } from './player-queue.mjs';
import { createPlaybackBroadcaster, rmsEnergy, smoothEnergy, estimatedEnergy, ENERGY_INTERVAL_MS } from './playback-signal.mjs';
import { analyserFor } from './audio-graph.mjs';
import { createBeatTracker } from './beat-tracker.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist } from '../track-meta.mjs';
import { onBackgroundChange } from '../frame-clock.mjs';
import { positionState, sessionMetadata, artworkList, needsConversion, coverDataUrl, SEEK_STEP_S } from './media-session.mjs';
import { deckCapabilities } from './providers.mjs';
import { VOLUME_STEP } from './volume-curve.mjs';

const readQueue = () => { try { return normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY))); } catch { return normalizeQueue(null); } };
const readListens = () => { try { return normalizeListenHistory(JSON.parse(localStorage.getItem(LISTEN_HISTORY_KEY))); } catch { return []; } };
const sameSpot = (a, b) => Boolean(a && b) && a.id === b.id && a.index === b.index;
const spotIndex = (item, index) => { const count = trackNames(item).length; return count ? Math.max(0, Math.min(count - 1, Number(index) || 0)) : 0; };

// Track order, the 待播 queue (whole records and single songs), repeat, shuffle
// and the heard-songs history for the cabin deck.
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
  const find = (id) => items.find((entry) => queueId(entry?.id) === queueId(id));
  const trackCount = trackNames(record).length, audible = provider !== 'visual' && provider !== 'system';
  // 歌单「随机播放」 shuffles that one record without switching the saved shuffle key on;
  // it ends when another record starts.
  const [oneShot, setOneShot] = useState(null), lastRecord = useRef(record?.id);
  useEffect(() => { if (oneShot && lastRecord.current === oneShot && record?.id !== oneShot) setOneShot(null); lastRecord.current = record?.id; }, [record?.id]);
  const effective = oneShot && oneShot === record?.id && !queue.shuffle ? { ...queue, shuffle: true } : queue;
  const bag = useRef(null); bag.current = playedBag(bag.current, record?.id, trackIndex, trackCount); const played = bag.current.played;
  // A song taken from 待播 (下一首播放 / 加入队列) plays "solo": afterwards the deck
  // returns to `context`, where the interrupted record would have gone next.
  const [solo, setSoloState] = useState(null), soloRef = useRef(null), expected = useRef(null);
  const setSolo = (value) => { soloRef.current = value; setSoloState(value); };
  // Heard songs, oldest first (上一首 in shuffle walks back through it) and 最近播放 (persisted).
  const trail = useRef([]), [listens, setListens] = useState(readListens), [, setTrailVersion] = useState(0);
  const here = record ? { id: queueId(record.id), index: trackIndex } : null;
  useEffect(() => {
    if (!here) return;
    // Anything that moved the deck except the queue itself ends a solo song.
    if (soloRef.current && !sameSpot(expected.current, here) && !sameSpot(soloRef.current, here)) setSolo(null);
    expected.current = null;
    const next = pushHistory(trail.current, here);
    if (next !== trail.current) { trail.current = next; setTrailVersion((value) => value + 1); }
  }, [here?.id, here?.index]);
  const playing = Boolean(audible && playback?.playing);
  useEffect(() => {
    if (!playing || !record) return;
    const entry = { id: queueId(record.id), index: trackIndex, title: playback?.actualTrack || trackNames(record)[trackIndex] || record.title, artist: trackArtist(record, trackIndex) || record.artist || '', at: Date.now() };
    setListens((old) => { if (sameSpot(old[0], entry)) return old; const next = recordListen(old, entry); try { localStorage.setItem(LISTEN_HISTORY_KEY, JSON.stringify(next)); } catch {} return next; });
  }, [playing, record?.id, trackIndex]);
  const stepArgs = { trackIndex, trackCount, queue: effective, played, solo: Boolean(solo), context: solo?.context || null };
  // What plays after this track is decided once (shuffle included), so the deck
  // can match that exact track early and the transition is instant.
  // Tracks whose early match failed are stepped over (see useRoomPlayback).
  const upcoming = useMemo(() => nextPlayableStep({ ...stepArgs, blocked: (index) => Boolean(playback?.isBlocked?.(record, index)) }), [record?.id, trackIndex, trackCount, queue.ids.join('|'), queue.repeat, effective.shuffle, played.join('|'), provider, playback?.blockedVersion, solo]);
  // The record and song a step leads to (a queued song, a resumed record, the next record).
  const target = (step) => {
    if (step.type === 'track') return record ? { item: record, index: step.index } : null;
    if (step.type !== 'album' && step.type !== 'resume' && step.type !== 'history') return null;
    const entry = step.type === 'album' ? parseEntry(step.id) : { id: step.id, index: step.index }, item = find(entry.id);
    return item ? { item, index: spotIndex(item, entry.index), track: step.type === 'album' && entry.track } : null;
  };
  const moveTo = (item, index, soloValue = null) => {
    const spot = { id: queueId(item.id), index };
    expected.current = spot; setSolo(soloValue ? { ...spot, context: soloValue.context } : null);
    if (record && queueId(record.id) === spot.id) setTrackIndex(index); else loadAlbum(item, index);
  };
  const go = (step) => {
    if (step.type === 'track') setTrackIndex(step.index);
    else if (step.type === 'restart') { if (audible) playback?.restart(); }
    else if (step.type === 'album') {
      const place = target(step);
      // Where the interrupted record carries on after a queued song (kept across several queued songs).
      const context = place?.track ? (soloRef.current ? soloRef.current.context : contextAfter({ recordId: record?.id, trackIndex, trackCount, queue: effective, played })) : null;
      if (!setQueue((old) => dequeue(old, step.id))) return false;
      if (place) { if (place.track) moveTo(place.item, place.index, { context }); else { setSolo(null); loadAlbum(place.item, place.index); } }
    }
    else if (step.type === 'resume') { const place = target(step); setSolo(null); if (place) moveTo(place.item, place.index); }
    return step.type !== 'stop';
  };
  const useHistory = Boolean(effective.shuffle || solo);
  const back = previousStep({ trackIndex, position: 0, history: trail.current, useHistory });
  // The upcoming list for the 待播 panel: the next song (decided, shuffle included), then 待播 itself.
  const upNext = useMemo(() => {
    const list = [], next = target(upcoming);
    if (next && upcoming.type !== 'album') list.push({ key: `next:${queueId(next.item.id)}:${next.index}`, kind: upcoming.type === 'resume' ? 'resume' : 'next', item: next.item, index: next.index });
    queue.ids.forEach((entry, position) => { const parsed = parseEntry(entry), item = find(parsed.id); if (item) list.push({ key: entry, entry, position, kind: parsed.track ? 'track' : 'album', item, index: parsed.track ? spotIndex(item, parsed.index) : 0 }); });
    return list;
  }, [upcoming, queue.ids.join('|'), itemsSignature, record?.id, trackIndex]);
  const api = {
    queue: effective, queueError, solo, upNext, listens,
    canNext: Boolean(record) && nextStep({ ...stepArgs, manual: true, random: () => 0 }).type !== 'stop',
    canPrevious: Boolean(record) && (trackIndex > 0 || (audible && (playback?.position || 0) > 0) || back.type === 'history'),
    next: (manual = true) => record && go(manual && upcoming.type === 'restart' ? nextStep({ ...stepArgs, manual }) : upcoming),
    peekNext: () => { const place = target(upcoming); return place ? { item: place.item, index: place.index } : null; },
    previous: () => {
      if (!record) return false;
      const step = previousStep({ trackIndex, position: audible ? playback?.position || 0 : 0, history: trail.current, useHistory });
      if (step.type !== 'history') return go(step);
      const place = target(step), rewound = rewindHistory(trail.current);
      trail.current = rewound.trail; setTrailVersion((value) => value + 1);
      if (!place) return go({ type: 'restart' });
      moveTo(place.item, place.index); return true;
    },
    enqueue: (id) => add(id),
    playNext: (id) => add(id, true),
    // Single songs: 加入队列 (after the songs already queued) / 下一首播放 (first).
    enqueueTrack: (id, index) => add(trackEntry(id, index)),
    playNextTrack: (id, index) => add(trackEntry(id, index), true),
    remove: (id) => setQueue((old) => dequeue(old, id)),
    move: (from, to) => setQueue((old) => moveEntry(old, from, to)),
    clear: () => setQueue((old) => clearQueue(old)),
    // 立即播放 from the 待播 panel: that entry starts now (a song returns to this record afterwards).
    playNow: (entry) => go({ type: 'album', id: queueId(entry) }),
    playListen: (entry) => { const item = find(entry?.id); if (!item) return false; moveTo(item, spotIndex(item, entry.index)); return true; },
    cycleRepeat: () => setQueue((old) => cycleRepeat(old)),
    toggleShuffle: () => { const once = effective.shuffle && !currentQueue.current.shuffle; setOneShot(null); return once || setQueue((old) => ({ ...old, shuffle: !old.shuffle })); },
    shuffleOnce: (id) => { bag.current = null; setOneShot(id); }
  };
  const ref = useRef(api); ref.current = api;
  return [api, ref];
}

export const PLAYER_COMMAND_EVENT = 'cabin:player-command';
// `cabin:player-command` {action, value?}: the mini player, tray, menus, thumbnail
// buttons and global hotkeys drive the deck through these (docs/events.md).
export const PLAYER_COMMANDS = Object.freeze(['toggle', 'play', 'pause', 'stop', 'next', 'previous', 'volume-up', 'volume-down', 'set-volume', 'seek', 'seek-by']);
// Text fields own their keys; sliders and toggles do not (after dragging the
// progress bar, Space must still play / pause).
const typing = (target) => { const field = target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'); return Boolean(field) && !(field.tagName === 'INPUT' && ['range', 'checkbox', 'radio', 'button'].includes(field.type)); };
export const SEEK_KEY_STEP_S = 5;
// Global keys (ignored while typing or with a dialog open):
//   Space play/pause · Shift+←/→ previous/next · ←/→ seek 5 s · M mute
//   - / = volume · R repeat · S shuffle. Also wires hardware media keys.
// With 系统正在播放, Space and Shift+←/→ drive the system player.
export function usePlayerShortcuts({ playback, player, provider, toggleVisual, record, trackIndex = 0, spinning = false, system = null }) {
  const latest = useRef(); latest.current = { playback, player, provider, toggleVisual, record, spinning, system };
  useEffect(() => {
    const keydown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || document.querySelector('dialog[open]:not([data-deck-keys])')) return;
      const { playback: pb, player: pl, provider: source, toggleVisual: spin, record: current, system: sys } = latest.current;
      const followSystem = source === 'system';
      if (followSystem ? !sys?.active : !current) return;
      const audible = source !== 'visual' && !followSystem, key = event.key, caps = deckCapabilities(source, { remote: pb?.remote });
      const act = (fn) => { event.preventDefault(); fn(); };
      // Held keys repeat seek and volume, never the toggles (play, mute, repeat, shuffle, track skips).
      if (event.repeat && !['ArrowLeft', 'ArrowRight', '-', '_', '=', '+'].includes(key)) { if (key === ' ' || key === 'Spacebar') event.preventDefault(); return; }
      if (event.repeat && event.shiftKey) return;
      // A focused slider: the volume keeps its own arrow keys; the progress bar seeks in 5 s steps.
      const slider = event.target?.matches?.('input[type=range]') ? event.target : null;
      if (slider && key.startsWith('Arrow') && !slider.matches('[data-deck-seek]')) return;
      if (!slider && key.startsWith('Arrow') && event.target?.closest?.('.turntable-drag-handle,[role=tablist],[role=listbox],[role=menu],[role=radiogroup],.focus-dock')) return; // arrows nudge the deck while its handle is focused
      if (key === ' ' || key === 'Spacebar') { if (event.target?.closest?.('button,a,[role=button],[role=slider],[role=option]')) return; act(() => followSystem ? sys.control('toggle') : audible ? pb.toggle() : source === 'visual' && spin()); }
      else if (event.shiftKey && key === 'ArrowRight') act(() => followSystem ? sys.control('next') : pl.next());
      else if (event.shiftKey && key === 'ArrowLeft') act(() => followSystem ? sys.control('previous') : pl.previous());
      else if (followSystem) return;
      else if (!event.shiftKey && caps.seek && key === 'ArrowRight') act(() => pb.seekBy(SEEK_KEY_STEP_S));
      else if (!event.shiftKey && caps.seek && key === 'ArrowLeft') act(() => pb.seekBy(-SEEK_KEY_STEP_S));
      else if (slider && key.startsWith('Arrow')) act(() => {}); // the progress bar never takes a 0.1 s native step
      else if (caps.volume && (key === 'm' || key === 'M')) act(() => pb.setMuted(!pb.muted));
      else if (caps.volume && (key === '-' || key === '_')) act(() => pb.setVolume(pb.volume - VOLUME_STEP));
      else if (caps.volume && (key === '=' || key === '+')) act(() => pb.setVolume(pb.volume + VOLUME_STEP));
      else if (key === 'r' || key === 'R') act(() => pl.cycleRepeat());
      else if (key === 's' || key === 'S') act(() => pl.toggleShuffle());
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  // `cabin:player-command` (docs/events.md): other surfaces — the mini player,
  // the tray, global hotkeys, or another window via main-process IPC — drive this deck.
  useEffect(() => {
    const command = (event) => {
      const action = event?.detail?.action, value = Number(event?.detail?.value), { playback: pb, player: pl, provider: source, toggleVisual: spin, record: current, system: sys } = latest.current;
      if (!PLAYER_COMMANDS.includes(action)) return;
      if (source === 'system') { if (!sys?.active) return; if (['toggle', 'next', 'previous'].includes(action)) sys.control(action); else if ((action === 'play' && !sys.playing) || ((action === 'pause' || action === 'stop') && sys.playing)) sys.control('toggle'); return; }
      if (!current) return;
      const audible = source !== 'visual', caps = deckCapabilities(source, { remote: pb?.remote });
      if (action === 'next') pl.next(); // same queue / repeat / shuffle rules as the ⏭ button
      else if (action === 'previous') pl.previous();
      else if (['volume-up', 'volume-down', 'set-volume'].includes(action)) { if (caps.volume) pb.setVolume(action === 'set-volume' ? (Number.isFinite(value) ? value : pb.volume) : pb.volume + (action === 'volume-up' ? VOLUME_STEP : -VOLUME_STEP)); }
      else if (action === 'seek' || action === 'seek-by') { if (caps.seek && Number.isFinite(value)) action === 'seek' ? pb.seek(value) : pb.seekBy(value); }
      else if (!audible) { if (action === 'toggle' || (action === 'play') !== Boolean(latest.current.spinning)) spin?.(); }
      else {
        // The element is the truth while a track is still buffering; remote players report state.
        const element = pb.audio?.current, playing = !pb.remote && element?.getAttribute('src') ? !element.paused : Boolean(pb.playing);
        if (action === 'toggle' || (action === 'play' && !playing) || ((action === 'pause' || action === 'stop') && playing)) pb.toggle();
        if (action === 'stop' && caps.seek) pb.seek(0);
      }
    };
    window.addEventListener(PLAYER_COMMAND_EVENT, command);
    return () => window.removeEventListener(PLAYER_COMMAND_EVENT, command);
  }, []);
  // Media Session: OS media keys, lock-screen / taskbar controls, with position.
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  const audible = provider !== 'visual' && provider !== 'system';
  const caps = deckCapabilities(provider, { remote: playback?.remote });
  useEffect(() => {
    if (!session) return;
    const pb = () => latest.current.playback;
    const handlers = {
      play: () => pb()?.playing || pb()?.toggle(), pause: () => pb()?.playing && pb().toggle(),
      stop: () => { if (pb()?.playing) pb().toggle(); if (deckCapabilities(latest.current.provider, { remote: pb()?.remote }).seek) pb()?.seek(0); },
      nexttrack: () => latest.current.player.next(), previoustrack: () => latest.current.player.previous(),
      seekto: caps.seek ? (details) => pb()?.seek(details.seekTime) : null,
      seekbackward: caps.seek ? (details) => pb()?.seekBy(-(Number(details?.seekOffset) || SEEK_STEP_S)) : null,
      seekforward: caps.seek ? (details) => pb()?.seekBy(Number(details?.seekOffset) || SEEK_STEP_S) : null
    };
    for (const [action, handler] of Object.entries(handlers)) { try { session.setActionHandler(action, audible && record && handler ? handler : null); } catch {} }
    return () => { for (const action of Object.keys(handlers)) { try { session.setActionHandler(action, null); } catch {} } };
  }, [audible, Boolean(record), caps.seek]);
  const meta = audible && record ? sessionMetadata(record, trackIndex, playback?.actualTrack) : null;
  const [artwork, setArtwork] = useState({ src: '', data: '' });
  useEffect(() => {
    const cover = audible ? record?.cover || '' : '';
    if (!needsConversion(cover)) return;
    let live = true; coverDataUrl(cover).then((data) => { if (live) setArtwork({ src: cover, data }); });
    return () => { live = false; };
  }, [audible, record?.cover]);
  const cover = record?.cover || '', shownArt = needsConversion(cover) ? (artwork.src === cover ? artwork.data : '') : cover;
  useEffect(() => {
    if (!session || typeof MediaMetadata === 'undefined') return;
    try {
      session.metadata = meta ? new MediaMetadata({ ...meta, artwork: artworkList(shownArt) }) : null;
      session.playbackState = meta ? playback?.playing ? 'playing' : 'paused' : 'none';
    } catch {}
  }, [meta?.title, meta?.artist, meta?.album, shownArt, Boolean(meta), playback?.playing]);
  // The OS draws its own progress from the last position state: send it on play /
  // pause, track and rate changes and whenever the playhead jumps (a seek).
  useEffect(() => {
    if (!session?.setPositionState || !audible || !record || !playback?.clock) return;
    let last = null;
    const send = (force = false) => {
      const { position, duration } = playback.clock.get(), now = performance.now();
      const drift = last && playback.playing ? Math.abs(last.position + (now - last.at) / 1000 * (playback.rate || 1) - position) : last ? Math.abs(last.position - position) : Infinity;
      if (!force && last && last.duration === duration && drift < 1.5) return;
      const state = positionState({ duration, position, rate: playback.rate || 1 });
      try { if (state) session.setPositionState(state); else if (last?.state) session.setPositionState(); } catch {}
      last = { position, duration, at: now, state };
    };
    send(true);
    return playback.clock.subscribe(() => send());
  }, [audible, record?.id, trackIndex, playback?.playing, playback?.rate, playback?.clock]);
}

// Broadcasts `cabin:playback` on window (see docs/events.md).
// Measured with click tracks against the element's currentTime (docs/cat-care.md › 跟着节拍): the analyser
// read path reports kicks this much before the media clock has them.
export const MEDIA_OFFSET_MS = 0;
export function usePlaybackBroadcast({ playing, provider, spinning, record, trackIndex, trackTitle, audio }) {
  const cast = useRef(null), energy = useRef(0), tracker = useRef(null);
  cast.current ||= createPlaybackBroadcaster({ target: window });
  tracker.current ||= createBeatTracker();
  const lastAt = useRef(0);
  const track = record ? { id: record.id, index: trackIndex, title: trackTitle || trackNames(record)[trackIndex] || record.title, artist: record.artist, album: record.title } : null;
  const state = { playing, provider, spinning, track };
  const latest = useRef(state); latest.current = state;
  const sample = () => {
    const now = latest.current, graph = analyserFor(audio?.current);
    let value = 0, estimated = false;
    if (now.playing && window.albumMobile?.playbackEnergy) value = window.albumMobile.playbackEnergy();
    else if (now.playing) { if (graph && audio.current && !audio.current.paused) value = rmsEnergy(graph.read()); else { value = estimatedEnergy(performance.now()); estimated = true; } }
    energy.current = smoothEnergy(energy.current, value);
    // The beat, on the wall clock so other windows (the desktop pet) can share it.
    // Tracker times are performance.now() of the analyser reads (smooth; the element's currentTime is
    // too coarse to time beats). Moved to when the beat is heard: + output latency + the media → graph offset.
    const beat = estimated ? null : tracker.current.state();
    const beatAt = beat?.confident ? Date.now() - (performance.now() - beat.beatAt) + (graph?.latency?.() || 0) + MEDIA_OFFSET_MS : 0;
    cast.current.update({ ...now, energy: energy.current, estimated, bpm: beatAt ? beat.bpm : 0, beatAt });
  };
  useEffect(() => { energy.current = 0; tracker.current.reset(); sample(); }, [playing, provider, spinning, track?.id, track?.index, track?.title]);
  useEffect(() => {
    if (!playing) return;
    let timer = 0, listen = 0;
    const start = (background) => {
      clearInterval(timer); clearInterval(listen); listen = 0;
      // Hidden / minimised with no desktop pet or wallpaper watching: no beat
      // tracking, and the energy broadcast slows to 2 Hz (play state still flows).
      const idle = background && !window.albumPetState?.active && !document.documentElement.classList.contains('room-desktop');
      timer = setInterval(sample, idle ? 500 : ENERGY_INTERVAL_MS);
      // The bass band is read ~60 times a second for beat tracking (cheap: 2048-point FFT).
      if (!idle) listen = setInterval(() => { const graph = analyserFor(audio?.current), media = audio?.current; if (!graph?.bass || !media || media.paused) return; const at = media.currentTime * 1000;
        // A seek (or loop) jumps the media clock: start over, and the cat listens until the beat is found again.
        if (at < lastAt.current - 30 || at - lastAt.current > 600) tracker.current.reset(); lastAt.current = at;
        tracker.current.push(performance.now(), graph.bass()); }, Math.round(1000 / 60));
    };
    const off = onBackgroundChange(start);
    return () => { off(); clearInterval(timer); clearInterval(listen); };
  }, [playing]);
  useEffect(() => () => cast.current?.update({ playing: false, provider: '', track: null }), []);
}

// First-time listeners have not picked an audio source yet. When a record
// clearly carries one (scanned/imported files, QQ track ids) use it, so
// double-clicking a cover simply plays. An explicit choice always wins.
// Albums from the catalog search (iTunes / MusicBrainz) carry only titles: where a
// music backend exists (desktop, Android) 自动匹配 finds a playable version, so the
// first play is not silent.
const CATALOG_SOURCE = /itunes|musicbrainz/i;
export function suggestProvider(item, { backend = false } = {}) {
  const details = Array.isArray(item?.trackDetails) ? item.trackDetails : [];
  if (item?.externalIds?.fileAlbum || details.some((track) => track?.source === 'local')) return 'local';
  if (details.some((track) => /^[a-z\d]{14}$/i.test(track?.providerId || '') && track?.source !== 'local') || /^[a-z\d]{14}$/i.test(item?.externalIds?.qqSongMid || '')) return 'auto'; // QQ ids first, then verified QQ / 网易云 matches
  if (item?.type === 'playlist') return 'auto'; // imported playlists: the source platform first, then version-safe matches
  if (backend && ['album', 'song'].includes(item?.type || 'album') && trackNames(item).length && (CATALOG_SOURCE.test(item?.source || '') || item?.externalIds?.itunes || item?.externalIds?.musicbrainz || item?.externalIds?.appleMusic)) return 'auto';
  return '';
}
// A music backend answers /desktop-music (the desktop shell, or the Android app).
export const hasMusicBackend = (win = globalThis) => Boolean(win?.albumMobile || win?.document?.documentElement?.dataset?.desktopClient === 'true');
