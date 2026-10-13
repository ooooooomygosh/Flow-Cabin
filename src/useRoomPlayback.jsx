import { useEffect, useMemo, useRef, useState } from 'react';
import { findPlayableSource, musicRequest } from './room-playback.mjs';
import { createMatchMemory, matchKey } from './player/auto-match.mjs';
import { bindAppleHandoff, APPLE_HANDOFF_STATUS } from './player/apple-handoff.mjs';
import { REMOTE_PROVIDERS, remoteControlPath, localAppTarget } from './player/sources.mjs';
import { trackNames } from './room-model.mjs';
import { ensureAnalyser } from './player/audio-graph.mjs';
import { isSessionAlbum, sessionTrackUrl } from './player/session-files.mjs';
import { createResolutionCache, createFader, resolutionKey, shouldAutoSkip, playbackErrorMessage, PREFETCH_PROVIDERS, AUTO_SKIP_DELAY_MS } from './player/playback-cache.mjs';
import { crossfadeSeconds, crossfadeStartsAt, onCrossfadeChange } from './player/crossfade.mjs';
import { seekWhenReady } from './player/media-position.mjs';

const VOLUME_KEY = 'album-circle-player-volume-v1';
const readVolume = () => { try { const value = JSON.parse(localStorage.getItem(VOLUME_KEY)); return { volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : .65, muted: Boolean(value?.muted) }; } catch { return { volume: .65, muted: false }; } };
// Plain-language messages for media element failures (MediaError codes).
const MEDIA_ERRORS = { 1: '播放被中断，请重新播放。', 2: '网络中断，音频没有加载完。检查网络后点「重试」。', 3: '这个音频文件无法解码，可能已损坏或格式不受支持。', 4: '音源地址不可用或格式不受支持。可能需要重新登录平台，或换一个音源。' };
const FADE_IN_MS = 420, FADE_OUT_MS = 220, PREFETCH_DELAY_MS = 1500;
// The next song is buffered on the idle deck; a failed attempt marks that track
// so the queue steps over it, then the one after is tried (a few per song).
const BUFFER_TIMEOUT_MS = 20000, BLOCK_MS = 5 * 60 * 1000, PREFETCH_FAILURE_LIMIT = 3;
const clampVolume = (value) => Math.max(0, Math.min(1, value));
// One cache for the whole deck: the next track is matched while this one plays.
const resolutions = createResolutionCache();
// Which candidate really played for each track (survives restarts).
const matches = createMatchMemory(typeof localStorage === 'undefined' ? null : localStorage);

// `options.peekNext()` names the track that will play after this one (same
// album, the next queued record, or nothing) so it can be matched early;
// `options.canNext` allows moving past a track that cannot be played.
//
// Two <audio> decks take turns. The live one plays; while it does, the next
// track is matched and buffered on the idle one, so the change is instant.
// With 歌曲过渡 on, the idle deck starts early and the two overlap, the old
// one fading out. `audio.current` is always the live deck.
export default function useRoomPlayback(record, trackIndex, provider, onNext, options = {}) {
  const decks = useRef([null, null]), live = useRef(0), standby = useRef(null), handover = useRef(0), releasing = useRef(Promise.resolve()), releaseTokens = useRef([null, null]);
  const audio = useMemo(() => ({ get current() { return decks.current[live.current]; } }), []);
  const markDecks = () => decks.current.forEach((element, index) => { if (element) element.dataset.deck = index === live.current ? 'active' : 'standby'; });
  const deckRefs = useMemo(() => [0, 1].map((index) => (element) => { const previous = decks.current[index]; if (previous && previous !== element) resetAudio(previous); decks.current[index] = element; markDecks(); }), []);
  const sequence = useRef(0), remote = useRef(false), next = useRef(onNext), resolveRef = useRef(null), controlling = useRef(false);
  const appleHandoff = useRef(null);
  const commandRemote = (source, action, handoff = appleHandoff.current) => {
    if (source === 'appleMusic' && handoff && !handoff.bound) return Promise.resolve();
    return musicRequest(remoteControlPath(source), { action, ...(source === 'appleMusic' && handoff ? { expectedTrack: handoff.bound } : {}) });
  };
  const opts = useRef(options); opts.current = options;
  const canNext = () => Boolean(typeof opts.current.canNext === 'function' ? opts.current.canNext() : opts.current.canNext);
  next.current = onNext;
  const [state, setState] = useState({ status: 'idle', playing: false, candidates: [], position: 0, duration: 0, error: '', trial: false });
  const [{ volume, muted }, setVolumeState] = useState(readVolume);
  const sound = useRef({ volume, muted }); sound.current = { volume, muted };
  const setSound = (patch) => setVolumeState((old) => { const next = { ...old, ...patch }; next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0)); try { localStorage.setItem(VOLUME_KEY, JSON.stringify(next)); } catch {} return next; });
  // One volume ramp per deck; the listener's volume multiplies both.
  const faders = useRef(null);
  faders.current ||= [0, 1].map((index) => createFader({ apply: (gain) => { const element = decks.current[index]; if (element) element.volume = clampVolume(sound.current.volume * gain); } }));
  const fader = useMemo(() => ({ get current() { return faders.current[live.current]; } }), []);
  const deckIndex = (element) => decks.current.indexOf(element);
  const crossfade = useRef(crossfadeSeconds());
  useEffect(() => onCrossfadeChange((seconds) => { crossfade.current = seconds; }), []);
  // Tracks whose early match failed: the queue steps over them for a while.
  const blocked = useRef(new Map()), [blockedVersion, setBlockedVersion] = useState(0), prefetchFailures = useRef(0);
  const isBlocked = (item, index) => { const key = resolutionKey(provider, item, index), at = key && blocked.current.get(key); return Boolean(at && Date.now() - at < BLOCK_MS); };
  // An expired entry counts as absent, so a track that fails again is blocked afresh.
  const setBlocked = (key, value) => {
    if (!key) return;
    const at = blocked.current.get(key), fresh = Boolean(at && Date.now() - at < BLOCK_MS);
    if (value === fresh) return;
    if (value) blocked.current.set(key, Date.now()); else blocked.current.delete(key);
    setBlockedVersion((count) => count + 1);
  };
  const [accountEpoch, setAccountEpoch] = useState(0);
  const skips = useRef(0), resumeAt = useRef(0), recovered = useRef('');
  const update = (value) => setState((old) => ({ ...old, ...value }));
  // 45 rpm on a 33 record: faster and higher, like the real thing. Resets per record.
  const rate = useRef(1);
  const applyRate = (only) => { for (const element of only ? [only] : decks.current) { if (!element) continue; element.preservesPitch = false; element.mozPreservesPitch = false; element.webkitPreservesPitch = false; element.playbackRate = rate.current; } };
  useEffect(() => { rate.current = 1; applyRate(); }, [record?.id]);
  const resetAudio = (element = audio.current) => { if (!element) return; const index = deckIndex(element); if (index < 0) return; faders.current[index].stop(); releaseTokens.current[index] = null; element.pause(); if (element.getAttribute('src')) { element.removeAttribute('src'); element.load(); } };
  // The deck that just stopped being live: fade it out (crossfade or a skip
  // mid-song), then empty it, unless it has become live again meanwhile.
  const release = (element, ms) => {
    const index = deckIndex(element); if (index < 0) return;
    if (!ms || element.paused || !element.getAttribute('src')) { resetAudio(element); return; }
    const token = {}; releaseTokens.current[index] = token;
    releasing.current = faders.current[index].to(0, ms).then(() => { if (releaseTokens.current[index] === token && live.current !== index) resetAudio(element); });
  };
  const silenceOutgoing = () => decks.current.forEach((element, index) => { if (element && index !== live.current && releaseTokens.current[index]) resetAudio(element); });
  const dropStandby = () => { const ready = standby.current; standby.current = null; if (ready && ready.deck !== live.current && !releaseTokens.current[ready.deck]) resetAudio(decks.current[ready.deck]); };
  useEffect(() => {
    const current = ++sequence.current, controller = new AbortController();
    // A second navigation interrupts any earlier crossfade immediately. Eject
    // and visual/system sources must never leave the old deck playing.
    silenceOutgoing();
    const key = resolutionKey(provider, record, trackIndex), blend = handover.current; handover.current = 0;
    const startPosition = resumeAt.current; resumeAt.current = 0;
    let cancelSeek = () => {};
    const outgoing = audio.current, ready = key && standby.current?.key === key && decks.current[standby.current.deck]?.getAttribute('src') ? standby.current : null;
    if (ready) {
      // The next track is already buffered on the idle deck: switch decks.
      standby.current = null; live.current = ready.deck; markDecks(); resolutions.take(key);
      release(outgoing, blend || FADE_OUT_MS);
    } else { dropStandby(); resetAudio(outgoing); }
    const element = audio.current; prefetchFailures.current = 0;
    update({ status: 'idle', playing: false, candidates: [], position: 0, duration: 0, error: '', trial: false, actualTrack: '', actualCover: '', remote: false, quality: '', notice: '', handoff: false });
    const active = () => sequence.current === current && !controller.signal.aborted;
    let resolution = 0;
    const request = (path, value) => musicRequest(path, value, controller.signal);
    async function play(candidate, result, owns = active) {
      if (!owns()) return;
      if (result.remote) {
        remote.current = candidate.provider;
        appleHandoff.current = candidate.provider === 'appleMusic' && result.catalog ? { target: candidate, bound: null } : null;
        if (element.getAttribute('src')) resetAudio(element);
        update({ status: appleHandoff.current ? 'handoff' : 'loading', handoff: Boolean(appleHandoff.current), playing: false, position: 0, duration: 0, actualTrack: '', remote: true, resolvedProvider: candidate.provider, notice: result.notice || '' });
      }
      else {
        remote.current = false;
        update({ playing: false, status: 'loading', error: '', trial: result.trial, quality: result.quality, remote: false, resolvedProvider: candidate.provider, actualTrack: candidate.title, actualCover: candidate.cover || '' });
        // A playlist song without saved art: ask the platform for its album cover.
        if (record?.type === 'playlist' && !candidate.cover && !record.trackDetails?.[trackIndex]?.cover && ['qq', 'netease'].includes(candidate.provider))
          musicRequest(`/track-cover?provider=${candidate.provider}&id=${encodeURIComponent(candidate.id)}`, undefined, controller.signal).then((found) => { if (owns() && found?.cover) update({ actualCover: found.cover }); }, () => {});
        const deckFader = faders.current[deckIndex(element)];
        deckFader.set(0); // every start fades in: no click, no blast at full volume
        if (element.getAttribute('src') !== result.audioPath) { element.src = result.audioPath; element.load(); }
        applyRate(element);
        cancelSeek();
        if (startPosition > 0) cancelSeek = seekWhenReady(element, startPosition, { signal: controller.signal, isCurrent: owns });
        // Standby metadata events were deliberately ignored. Transfer the
        // already-known duration with ownership instead of waiting for an
        // event which will not fire again on a buffered source.
        update({ position: element.currentTime || 0, duration: Number.isFinite(element.duration) ? element.duration : 0 });
        await ensureAnalyser(element); // energy for cabin:playback; no-op for cross-origin audio
        if (!owns()) return;
        let timer;
        try { await Promise.race([element.play(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('音频连接超时。')), 10000); })]); }
        catch (error) { if (owns()) resetAudio(element); throw error; }
        finally { clearTimeout(timer); }
        // A buffered next song starts almost at once; a fresh one fades in.
        if (owns()) deckFader.to(1, blend || (ready && candidate === ready.candidate ? 60 : FADE_IN_MS));
      }
    }
    async function resolve(candidate) {
      if (!active()) return;
      const request = ++resolution;
      const latest = () => active() && request === resolution;
      cancelSeek(); resetAudio(element); update({ status: 'loading', candidates: [], error: '' });
      try {
        const result = candidate.sessionUrl ? { audioPath: candidate.sessionUrl, trial: false, quality: '本次导入的文件' } : await musicRequest('/resolve', candidate, controller.signal); if (!latest()) return;
        await play(candidate, result, latest);
        if (latest() && !result.remote && !candidate.sessionUrl) matches.put(matchKey(record, trackIndex), candidate);
      } catch (error) { if (latest()) update({ status: 'error', playing: false, error: playbackErrorMessage(error) || '音频加载失败。' }); }
    }
    resolveRef.current = resolve;
    (async () => {
      if (remote.current) { const was = remote.current, handoff = appleHandoff.current; remote.current = false; appleHandoff.current = null; await commandRemote(was, was === 'appleMusic' ? 'pause' : 'stop', handoff).catch(() => {}); }
      if (!record || provider === 'visual' || provider === 'system' || !active()) return;
      const name = trackNames(record)[trackIndex]; if (!name) { update({ status: 'error', error: '原始资料没有曲目，无法定位音频。' }); return; }
      // Files picked in this session play directly, whichever audio source is selected.
      const sessionUrl = sessionTrackUrl(record, trackIndex); if (sessionUrl) { await resolve({ sessionUrl, provider: 'local', title: name }); return; }
      if (isSessionAlbum(record) && provider === 'local') { update({ status: 'error', error: '这张专辑是从文件临时导入的，重新打开小屋后需要再选一次文件：「添加专辑 › 本地音乐 › 选择音乐文件」。' }); return; }
      // Matched while the previous track played: start at once. A stale entry
      // simply falls through to a fresh match.
      if (ready) {
        try { await play(ready.candidate, ready.result); setBlocked(key, false); return; }
        catch { if (!active()) return; resetAudio(element); }
      }
      const early = resolutions.take(key);
      if (early) {
        try { await play(early.candidate, early.result); return; }
        catch { if (!active()) return; }
      }
      update({ status: 'searching' });
      try {
        const result = await findPlayableSource({ record, index: trackIndex, provider, request, play, isCurrent: active, memory: matches });
        if (active() && result?.error) { setBlocked(key, true); update({ status: 'error', playing: false, candidates: result.candidates, error: result.error }); }
        else if (active() && result?.candidate) setBlocked(key, false);
      }
      catch (error) { if (active()) update({ status: 'error', playing: false, error: playbackErrorMessage(error) || '音频加载失败。' }); }
    })();
    // The deck is emptied (or faded out) by the next run, which knows whether
    // the following track is already buffered.
    return () => { cancelSeek(); controller.abort(); sequence.current++; };
  }, [record?.id, trackIndex, provider, accountEpoch]);
  useEffect(() => () => { standby.current = null; decks.current.forEach((element) => resetAudio(element)); }, []);

  // Prefetch: once this track is really playing, match the next one quietly
  // and buffer it on the idle deck. If it cannot be played, the queue steps
  // over it and the track after it is tried instead.
  const settled = ['playing', 'buffering', 'paused'].includes(state.status) && !state.remote;
  const [upcoming, setUpcoming] = useState(null), upcomingKey = useRef('');
  // The queue hook updates its ref later in the same render. Read after commit,
  // so enqueue/reorder/repeat/shuffle are observed without a one-render delay.
  // Compare the exact recording identity rather than callback identity: normal
  // position updates must not repeatedly cancel a pending prefetch.
  useEffect(() => {
    const item = opts.current.peekNext?.(), key = item?.item ? resolutionKey(provider, item.item, item.index) : '';
    if (key === upcomingKey.current) return;
    upcomingKey.current = key;
    setUpcoming(key ? { ...item, key } : null);
  });
  useEffect(() => {
    // Also drop an obsolete, fully loaded standby when the queue becomes empty
    // or repeat-one means there is no next recording to buffer.
    if (standby.current && standby.current.key !== upcoming?.key) dropStandby();
    if (!settled || !PREFETCH_PROVIDERS.has(provider)) return;
    if (!upcoming?.item || sessionTrackUrl(upcoming.item, upcoming.index) || isSessionAlbum(upcoming.item)) return;
    const key = resolutionKey(provider, upcoming.item, upcoming.index);
    if (!key || standby.current?.key === key || isBlocked(upcoming.item, upcoming.index) || prefetchFailures.current >= PREFETCH_FAILURE_LIMIT) return;
    const controller = new AbortController(), owner = sequence.current;
    const current = () => !controller.signal.aborted && sequence.current === owner;
    const timer = setTimeout(async () => {
      dropStandby();
      const request = (path, value) => musicRequest(path, value, controller.signal);
      const buffer = async (candidate, result) => {
        if (!current() || result.remote) return;
        resolutions.put(key, candidate, result);
        await releasing.current; // the idle deck may still be fading out the previous song
        if (!current()) return;
        const index = 1 - live.current, element = decks.current[index];
        if (!element) return;
        resetAudio(element); faders.current[index].set(0);
        element.src = result.audioPath; applyRate(element); element.load();
        await new Promise((resolve, reject) => {
          const finish = (error) => { clearTimeout(timer); element.removeEventListener('canplay', ok); element.removeEventListener('error', failed); controller.signal.removeEventListener('abort', stop); error ? reject(error) : resolve(); };
          const ok = () => finish(), failed = () => finish(new Error('下一首的音频加载失败。')), stop = () => finish(new Error('已取消预载。'));
          const timer = setTimeout(() => finish(new Error('下一首的音频缓冲超时。')), BUFFER_TIMEOUT_MS);
          element.addEventListener('canplay', ok); element.addEventListener('error', failed); controller.signal.addEventListener('abort', stop);
          if (element.readyState >= 3) ok();
        }).catch((error) => { if (live.current !== index) resetAudio(element); throw error; });
        if (current()) standby.current = { key, candidate, result, deck: index };
      };
      try {
        await findPlayableSource({ record: upcoming.item, index: upcoming.index, provider, request, isCurrent: current, play: buffer });
      } catch { /* judged below */ }
      if (current() && standby.current?.key !== key) { prefetchFailures.current++; setBlocked(key, true); }
    }, PREFETCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [settled, record?.id, trackIndex, provider, blockedVersion, upcoming?.key]);

  // Unplayable track inside an album or playlist: say so, then move on.
  useEffect(() => {
    if (state.status === 'playing') { skips.current = 0; return; }
    if (!record || !shouldAutoSkip({ error: state.error, status: state.status, consecutive: skips.current, canNext: canNext() })) return;
    const timer = setTimeout(() => { skips.current++; next.current?.(true); }, AUTO_SKIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.error, record?.id, trackIndex]);
  useEffect(() => { skips.current = 0; }, [record?.id, provider]);

  useEffect(() => { const changed = () => { resolutions.clear(); blocked.current.clear(); /* a new login or source setting can change which version is playable */ setAccountEpoch((value) => value + 1); }; window.addEventListener('album-music-account', changed); window.addEventListener('album-music-settings', changed); return () => { window.removeEventListener('album-music-account', changed); window.removeEventListener('album-music-settings', changed); }; }, []);
  useEffect(() => {
    if (!REMOTE_PROVIDERS.has(provider) || !record) return;
    let disposed = false, busy = false;
    const current = sequence.current;
    const poll = async () => {
      if (!remote.current || busy) return; busy = true;
      try {
        const result = await musicRequest(provider === 'appleMusic' ? '/apple/state' : '/ma/state');
        if (!disposed && sequence.current === current) {
          const handoff = appleHandoff.current;
          if (provider === 'appleMusic' && handoff) {
            handoff.bound = bindAppleHandoff(handoff.target, result, handoff.identity);
            if (handoff.bound) handoff.identity ||= handoff.bound;
            if (!handoff.bound) { update({ playing: false, status: 'handoff', handoff: true, position: 0, duration: 0, actualTrack: '', error: '' }); return; }
          }
          update({ handoff: false, playing: result.state === 'playing', status: result.state === 'playing' ? 'playing' : result.state === 'paused' ? 'paused' : 'waiting', position: result.elapsed, duration: result.duration, actualTrack: result.title });
        }
      }
      catch (error) { if (!disposed && sequence.current === current) {
        if (appleHandoff.current) { appleHandoff.current.bound = null; update({ status: 'handoff', handoff: true, playing: false, position: 0, duration: 0, actualTrack: '', error: '', notice: error.message }); }
        else update({ status: 'error', error: error.message, playing: false });
      } }
      finally { busy = false; }
    };
    const timer = setInterval(poll, 1500); return () => { disposed = true; clearInterval(timer); };
  }, [provider, record?.id, trackIndex, accountEpoch]);
  useEffect(() => { decks.current.forEach((element, index) => { if (element) { element.volume = clampVolume(volume * faders.current[index].gain); element.muted = muted; } }); }, [volume, muted]);
  useEffect(() => () => { if (remote.current) commandRemote(remote.current, remote.current === 'appleMusic' ? 'pause' : 'stop').catch(() => {}); }, []);
  const toggle = async () => {
    if (controlling.current || provider === 'system' || provider === 'visual') return;
    controlling.current = true;
    const current = sequence.current;
    let owns = () => sequence.current === current;
    try {
      if (remote.current) { await commandRemote(remote.current, state.playing ? 'pause' : 'play'); return; }
      const element = audio.current;
      if (element?.getAttribute('src')) {
        const source = element.getAttribute('src'), ramp = fader.current;
        owns = () => sequence.current === current && audio.current === element && element.getAttribute('src') === source;
        if (element.paused) { await ensureAnalyser(element); if (!owns()) return; ramp.set(0); await element.play(); if (owns()) ramp.to(1, FADE_IN_MS); }
        else { silenceOutgoing(); await ramp.to(0, FADE_OUT_MS); if (owns()) element.pause(); }
      }
      else { const sessionUrl = sessionTrackUrl(record, trackIndex); if (sessionUrl) await resolveRef.current?.({ sessionUrl, provider: 'local', title: trackNames(record)[trackIndex] }); else setAccountEpoch((value) => value + 1); }
    } catch (error) { if (owns()) {
      if (appleHandoff.current) { appleHandoff.current.bound = null; update({ status: 'handoff', handoff: true, playing: false, position: 0, duration: 0, actualTrack: '', error: '', notice: error.message }); }
      else update({ status: 'error', error: playbackErrorMessage(error) || '音频加载失败。' });
    } }
    finally { controlling.current = false; }
  };
  // Both decks share these handlers; only the live deck's events count.
  const own = (handler) => (event) => { if (event.currentTarget === audio.current) handler(event); };
  const events = {
    onPlay: own(() => { if (audio.current?.getAttribute('src')) update({ playing: false, status: 'loading', error: '' }); }),
    onPlaying: own(() => { if (audio.current?.getAttribute('src')) update({ playing: true, status: 'playing', error: '' }); }),
    onWaiting: own(() => { if (audio.current?.getAttribute('src') && !audio.current.paused) update({ playing: false, status: 'buffering' }); }),
    onPause: own(() => { if (audio.current?.getAttribute('src')) update({ playing: false, status: 'paused' }); }),
    onTimeUpdate: own(() => {
      const element = audio.current; update({ position: element.currentTime });
      // 歌曲过渡: start the buffered next song early and overlap the two.
      const seconds = crossfade.current, ready = standby.current, upcoming = seconds && ready && !handover.current && !element.paused ? opts.current.peekNext?.() : null;
      if (upcoming?.item && element.currentTime >= crossfadeStartsAt(element.duration, seconds) && resolutionKey(provider, upcoming.item, upcoming.index) === ready.key) { handover.current = seconds * 1000; if (!next.current?.()) handover.current = 0; }
    }),
    onDurationChange: own(() => update({ duration: Number.isFinite(audio.current.duration) ? audio.current.duration : 0 })),
    onEnded: own(() => { update({ playing: false, status: 'ended' }); next.current?.(); }),
    onError: own(() => {
      const element = audio.current;
      if (!element?.getAttribute('src')) return;
      // A platform link that expires mid-song is matched again once and resumed where it stopped.
      const code = element.error?.code, at = element.currentTime || 0, key = `${record?.id}|${trackIndex}`;
      if ((code === 2 || code === 4) && at > 2 && recovered.current !== key && !sessionTrackUrl(record, trackIndex)) {
        recovered.current = key; resumeAt.current = at; resolutions.clear();
        update({ playing: false, status: 'buffering', error: '' }); setAccountEpoch((value) => value + 1); return;
      }
      update({ playing: false, status: 'error', error: MEDIA_ERRORS[code] || '音频加载失败。请重新播放，或检查平台权限与网络。' });
    })
  };
  const skipping = state.status === 'error' && shouldAutoSkip({ error: state.error, status: state.status, consecutive: skips.current, canNext: canNext() });
  const statusText = (state.error && (skipping ? `${state.error} 稍后自动播放下一首…` : state.error)) || ({ idle: '待播放', loading: '正在连接音源…', searching: '正在匹配原始曲目…', choose: '请选择对应的曲目版本', playing: `${provider === 'ma' ? '服务器播放器正在播放' : provider === 'appleMusic' ? '正在“音乐”App 中播放' : provider === 'local' ? '正在播放本地文件' : '正在播放'}${state.trial ? ' · 试听片段' : ''}${state.quality && !state.remote && provider !== 'local' ? ` · ${state.quality}` : ''}`, paused: '播放已暂停', ended: '本曲播放结束', waiting: provider === 'appleMusic' ? '等待“音乐”App' : '等待服务器播放器', buffering: '正在缓冲音频…' }[state.status] || '待播放');
  const seek = (value) => { if (audio.current && !remote.current && Number.isFinite(value) && Number.isFinite(audio.current.duration)) audio.current.currentTime = Math.max(0, Math.min(value, audio.current.duration)); };
  // Same track again ("repeat one", or "previous" after 3 s).
  const restart = async () => {
    if (remote.current || !audio.current?.getAttribute('src')) { setAccountEpoch((value) => value + 1); return; }
    const element = audio.current, ramp = fader.current, current = sequence.current, source = element.getAttribute('src');
    const owns = () => sequence.current === current && audio.current === element && element.getAttribute('src') === source;
    element.currentTime = 0;
    try { if (element.paused) { ramp.set(0); await element.play(); if (owns()) ramp.to(1, FADE_IN_MS); } } catch (error) { if (owns()) update({ status: 'error', error: playbackErrorMessage(error) || '音频加载失败。' }); }
  };
  return { ...state, statusText: state.handoff ? APPLE_HANDOFF_STATUS : statusText, skipping, rate: rate.current, setRate: (value) => { rate.current = Math.max(.5, Math.min(2, Number(value) || 1)); applyRate(); update({}); },
    // Seek into a track that is about to start (dragging the needle across songs).
    startAt: (seconds) => { resumeAt.current = Math.max(0, Number(seconds) || 0); }, audio, events, toggle, choose: (candidate) => resolveRef.current?.(candidate),
    // Labelled hand-off: opens the song in the QQ 音乐 / 网易云 app (or its web page).
    // The cabin does not play or track it afterwards; the result says so.
    localApp: localAppTarget({ record, index: trackIndex, provider, status: state.status, candidates: state.candidates, resolvedProvider: state.resolvedProvider }),
    openInLocalApp: async () => { const target = localAppTarget({ record, index: trackIndex, provider, status: state.status, candidates: state.candidates, resolvedProvider: state.resolvedProvider }); if (!target) return null; try { const result = await musicRequest('/open-local', target); update({ notice: `已在${result.via === 'app' ? ` ${result.app} App ` : ` ${result.app} 网页`}中打开，声音由它播放，小屋不显示进度。` }); return result; } catch (error) { update({ notice: error.message }); return null; } },
    rememberedMatches: matches, seek, seekBy: (delta) => seek((audio.current?.currentTime || 0) + delta), restart, retry: () => { skips.current = 0; setBlocked(resolutionKey(provider, record, trackIndex), false); setAccountEpoch((value) => value + 1); },
    deckRefs, isBlocked, blockedVersion, remote: Boolean(state.remote), volume, muted, setVolume: (value) => setSound({ volume: value, muted: false }), setMuted: (value) => setSound({ muted: Boolean(value) }), canControl: provider !== 'visual' && provider !== 'system' && !state.handoff };
}
