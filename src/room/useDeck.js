import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRoomPlayback from '../useRoomPlayback';
import useSystemNowPlaying from '../useSystemNowPlaying';
import { trackCover } from '../room-playback.mjs';
import { isDeckProvider, deckCapabilities } from '../player/providers.mjs';
import { usePlayerQueue, usePlayerShortcuts, usePlaybackBroadcast, suggestProvider, hasMusicBackend } from '../player/usePlayer';
import { queueId, sessionQueue } from '../player/player-queue.mjs';
import { readResume, writeResume, resumePoint, resumeChanged, restorePlan, takeResumeOnLoad } from '../player/deck-resume.mjs';
import { readLikes, writeLikes, toggleLike, isLiked, LIKES_EVENT } from '../player/likes.mjs';
import { coverDataUrl, needsConversion } from '../player/media-session.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist, trackAlbum } from '../track-meta.mjs';

const PROVIDER_KEY = 'album-circle-room-player-v1';
const readProvider = () => { try { const value = localStorage.getItem(PROVIDER_KEY); return isDeckProvider(value) ? value : 'visual'; } catch { return 'visual'; } };
// Collection ids are usually strings; numeric ids still name the same record.
const sameRecord = (left, right) => Boolean(queueId(left)) && queueId(left) === queueId(right);

// The cabin deck: which record / track is on it, the chosen audio source, the
// two-deck player, the 待播 queue, the system media mirror, keyboard + media
// keys and the `cabin:playback` broadcast. `onLoad(item)` lets the shelf follow.
export default function useDeck({ items, onLoad, notify }) {
  const notifyRef = useRef(notify); notifyRef.current = notify;
  const itemsRef = useRef(items); itemsRef.current = items;
  const [record, setRecord] = useState(null), [spinning, setSpinning] = useState(false), [trackIndex, setTrackIndex] = useState(0);
  const [provider, setProvider] = useState(readProvider);
  const chosenProvider = useRef((() => { try { return Boolean(localStorage.getItem(PROVIDER_KEY)); } catch { return true; } })());
  const chooseProvider = useCallback((value) => { chosenProvider.current = true; setProvider(value); try { localStorage.setItem(PROVIDER_KEY, value); } catch {} }, []);
  const queueRef = useRef(null), nativeConsumed = useRef(false);
  const playback = useRoomPlayback(record, trackIndex, provider, (manual = false) => queueRef.current?.current.next(manual), { onNativeTrackIndex: setTrackIndex,
    getNativeQueue: () => (queueRef.current?.current.queue.ids || []).map(id => itemsRef.current.find(item => sameRecord(item.id, id))).filter(item => item && !sameRecord(item.id, record?.id)),
    // An unplayable song is skipped automatically: say so once per run of skips.
    onAutoSkip: ({ title }) => notifyRef.current?.(`《${title}》暂时放不了，已跳到下一首。`),
    onNativeSelection: (id, index) => { const item = itemsRef.current.find(entry => sameRecord(entry.id, id)); if (item) { setRecord(item); setTrackIndex(index); onLoad?.(item); const api = queueRef.current?.current; const last = api?.queue.ids.indexOf(String(id)); if (last >= 0) { nativeConsumed.current = true; for (const consumed of api.queue.ids.slice(0, last + 1)) api.remove(consumed); } } }, peekNext: () => queueRef.current?.current.peekNext(), canNext: () => Boolean(queueRef.current?.current.canNext) });
  const system = useSystemNowPlaying(provider === 'system');
  // A playlist shows the current song's own cover on the deck, widgets and media keys.
  const shownCover = provider === 'system' ? '' : trackCover(record, trackIndex, playback.actualCover);
  const deckItem = useMemo(() => provider === 'system' ? system.item : record && shownCover && shownCover !== record.cover ? { ...record, cover: shownCover } : record, [provider, system.item, record, shownCover]);
  const effectiveSpin = provider === 'visual' ? spinning : provider === 'system' ? Boolean(system.active && system.playing) : playback.playing;
  const load = (item, index = 0, options = {}) => {
    if (!item) return;
    const autoplay = options?.autoplay !== false;
    playback.setAutoStart(autoplay);
    if (autoplay && !chosenProvider.current && provider === 'visual') { const suggested = suggestProvider(item, { backend: hasMusicBackend() }); if (suggested) chooseProvider(suggested); }
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
  useEffect(() => { playback.setModes?.(player.queue); }, [player.queue.shuffle, player.queue.repeat]);
  const nativeQueueSignature = player.queue.ids.join('|');
  const priorNativeQueue = useRef(nativeQueueSignature);
  useEffect(() => { if (priorNativeQueue.current !== nativeQueueSignature) { priorNativeQueue.current = nativeQueueSignature; if (nativeConsumed.current) nativeConsumed.current = false; else playback.syncQueue?.(); } }, [nativeQueueSignature]);
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
  usePlayerShortcuts({ playback, player, provider, record: provider === 'system' ? record : deckItem, trackIndex, spinning, toggleVisual, system });
  // 重启后恢复上次播放 (player/deck-resume.mjs): once the shelf has loaded, the last
  // record and song come back paused at their spot; the app's own reload (切换首页)
  // resumes playing. Only identities are stored, never stream URLs.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !items.length) return;
    restored.current = true;
    if (record) return;
    const plan = restorePlan(readResume(), items, { resumeOnLoad: takeResumeOnLoad() });
    if (!plan) return;
    const audibleSource = provider !== 'visual' && provider !== 'system';
    playback.setAutoStart(plan.autoplay && audibleSource);
    if (audibleSource) playback.restoreAt?.(plan.item, plan.index, plan.position, plan.duration);
    setRecord(plan.item); setTrackIndex(plan.index); setSpinning(provider === 'visual' && plan.autoplay); onLoad?.(plan.item);
  }, [items]);
  const saved = useRef(undefined);
  const saveResume = (force = false) => {
    if (!restored.current || provider === 'system') return;
    const audibleSource = provider !== 'visual';
    const point = record ? resumePoint({ record, trackIndex, position: audibleSource ? playback.clock?.position || 0 : 0, duration: audibleSource ? playback.clock?.duration || 0 : 0, playing: audibleSource ? playback.playing : spinning }) : null;
    if (!force && saved.current !== undefined && !resumeChanged(saved.current, point)) return;
    saved.current = point; writeResume(point);
  };
  const saveRef = useRef(saveResume); saveRef.current = saveResume;
  useEffect(() => { saveRef.current(); }, [record?.id, trackIndex, playback.playing, spinning, provider]);
  useEffect(() => playback.clock?.subscribe?.(() => saveRef.current()), [playback.clock]);
  useEffect(() => { const flush = () => saveRef.current(true); window.addEventListener('pagehide', flush); return () => window.removeEventListener('pagehide', flush); }, []);
  // 喜欢 (local only) for the song on the deck.
  const [likes, setLikes] = useState(readLikes);
  useEffect(() => { const update = () => setLikes(readLikes()); window.addEventListener(LIKES_EVENT, update); window.addEventListener('storage', update); return () => { window.removeEventListener(LIKES_EVENT, update); window.removeEventListener('storage', update); }; }, []);
  const songTitle = record ? trackNames(record)[trackIndex] || record.title : '';
  const liked = provider !== 'system' && Boolean(record) && isLiked(likes, record.id, songTitle);
  const toggleLiked = useCallback(() => {
    if (!record || provider === 'system') return false;
    const next = toggleLike(readLikes(), { id: record.id, index: trackIndex, title: songTitle, artist: trackArtist(record, trackIndex) || record.artist || '' });
    if (!writeLikes(next)) { notifyRef.current?.('无法保存喜欢，请检查存储空间后重试。', { tone: 'error' }); return false; }
    setLikes(next); window.dispatchEvent(new Event(LIKES_EVENT)); return true;
  }, [record, trackIndex, songTitle, provider]);
  const playerForUi = player && {
    ...player, liked, toggleLiked,
    queue: { ...player.queue, ids: player.queue.ids.map((id) => originalIds.has(id) ? originalIds.get(id) : id) }
  };
  usePlaybackBroadcast({ playing: provider === 'system' ? Boolean(system.active && system.playing) : provider === 'visual' ? false : playback.playing, provider, spinning: effectiveSpin, record: deckItem, trackIndex: provider === 'system' ? 0 : trackIndex, trackTitle: provider === 'system' ? system.title : playback.actualTrack, audio: playback.audio });
  useEffect(() => { if (record && !items.some((item) => sameRecord(item.id, record.id))) eject(); }, [items]);
  // The album card asks the deck to play an album, optionally from a track.
  useEffect(() => {
    // A playlist saved a moment ago may not be in `items` yet; the event carries it.
    const resolve = (detail) => items.find((entry) => sameRecord(entry.id, detail?.id)) || (sameRecord(detail?.item?.id, detail?.id) ? detail.item : null);
    const play = (event) => { const item = resolve(event.detail); if (!item) return; if (event.detail.shuffle) queueRef.current?.current?.shuffleOnce(item.id); loadRef.current(item, Math.max(0, Number(event.detail.track) || 0), { autoplay: event.detail.autoplay !== false }); };
    // A single song (歌单里的「下一首播放 / 加入队列」) carries its track index; `next` puts it first.
    const enqueue = (event) => { const item = resolve(event.detail), api = queueRef.current?.current, track = event.detail?.track; if (!event.detail) return; event.detail.accepted = Boolean(item && api && (Number.isInteger(track) ? (event.detail.next ? api.playNextTrack(item.id, track) : api.enqueueTrack(item.id, track)) : api.enqueue(item.id))); };
    window.addEventListener('cabin-play', play); window.addEventListener('cabin-enqueue', enqueue);
    return () => { window.removeEventListener('cabin-play', play); window.removeEventListener('cabin-enqueue', enqueue); };
  }, [items]);
  const shownTrackIndex = provider === 'system' ? 0 : trackIndex;
  // What the mini player, tray and taskbar show (window.cabinNowPlaying, read by
  // CompanionBridge): display data only — local covers become small data URLs.
  const [coverData, setCoverData] = useState({ src: '', data: '' });
  const shownCoverSrc = deckItem?.cover || '';
  useEffect(() => { if (!needsConversion(shownCoverSrc)) return; let live = true; coverDataUrl(shownCoverSrc, { size: 128 }).then((data) => { if (live) setCoverData({ src: shownCoverSrc, data }); }); return () => { live = false; }; }, [shownCoverSrc]);
  const nowRef = useRef(null);
  nowRef.current = { provider, system, playback, record, deckItem, trackIndex, liked, cover: needsConversion(shownCoverSrc) ? (coverData.src === shownCoverSrc ? coverData.data : '') : shownCoverSrc };
  useEffect(() => {
    const getter = () => {
      const { provider: source, system: sys, playback: pb, record: rec, deckItem: shown, trackIndex: index, liked: heart, cover } = nowRef.current;
      if (source === 'visual' || (source === 'system' ? !sys?.active : !rec)) return null;
      const caps = deckCapabilities(source, { remote: pb?.remote });
      if (source === 'system') { const timeline = sys.timeline?.getSnapshot?.(); return { title: sys.title || '', artist: sys.artist || '', album: sys.album || '', cover: /^https:/.test(sys.artwork || '') ? sys.artwork : '', playing: Boolean(sys.playing), position: sys.timeline?.position?.() || 0, duration: timeline?.duration || 0, provider: source, canSeek: false, canVolume: false, volume: 0, muted: false, liked: false, at: Date.now() }; }
      return { title: pb.actualTrack || trackNames(rec)[index] || rec.title || '', artist: trackArtist(rec, index) || pb.resolvedArtist || '', album: trackAlbum(rec, index) || (rec.type === 'playlist' ? rec.title : ''), cover: cover || (shown?.cover && /^https:/.test(shown.cover) ? shown.cover : ''), playing: Boolean(pb.playing), position: pb.clock?.position || 0, duration: pb.clock?.duration || 0, provider: source, canSeek: caps.seek, canVolume: caps.volume, volume: pb.volume ?? 0, muted: Boolean(pb.muted), liked: heart, at: Date.now() };
    };
    window.cabinNowPlaying = getter;
    return () => { if (window.cabinNowPlaying === getter) delete window.cabinNowPlaying; };
  }, []);
  const nowTrack = provider === 'visual' ? '' : provider === 'system' ? (system.active ? system.title : '') : playback.actualTrack || (record && playback.playing ? record.tracks?.[trackIndex] || record.title : '');
  const statusText = provider === 'visual' ? (record ? spinning ? '展示中 · 无音频' : '旋转已暂停 · 无音频' : '等待放盘 · 无音频') : provider === 'system' ? system.statusText : playback.statusText;
  return { record, spinning, trackIndex, setTrackIndex, shownTrackIndex, provider, chooseProvider, playback, system, deckItem, effectiveSpin, load, place, toggleVisual, eject, player: playerForUi, replaceQueue, isQueued: (id) => player.queue.ids.includes(queueId(id)), nowTrack: typeof nowTrack === 'string' ? nowTrack : '', statusText, liked, toggleLiked,
    actualTrack: provider === 'system' ? system.title || '' : playback.actualTrack || '',
    audible: provider === 'system' ? Boolean(system.playing) : provider !== 'visual' && playback.playing };
}
