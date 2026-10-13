import { useEffect, useRef, useState } from 'react';
import { findPlayableSource, musicRequest } from './room-playback.mjs';
import { createMatchMemory, matchKey } from './player/auto-match.mjs';
import { REMOTE_PROVIDERS, remoteControlPath, localAppTarget } from './player/sources.mjs';
import { trackNames } from './room-model.mjs';
import { ensureAnalyser } from './player/audio-graph.mjs';
import { isSessionAlbum, sessionTrackUrl } from './player/session-files.mjs';
import { createResolutionCache, createFader, resolutionKey, shouldAutoSkip, playbackErrorMessage, PREFETCH_PROVIDERS, AUTO_SKIP_DELAY_MS } from './player/playback-cache.mjs';

const VOLUME_KEY = 'album-circle-player-volume-v1';
const readVolume = () => { try { const value = JSON.parse(localStorage.getItem(VOLUME_KEY)); return { volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : .65, muted: Boolean(value?.muted) }; } catch { return { volume: .65, muted: false }; } };
// Plain-language messages for media element failures (MediaError codes).
const MEDIA_ERRORS = { 1: '播放被中断，请重新播放。', 2: '网络中断，音频没有加载完。检查网络后点「重试」。', 3: '这个音频文件无法解码，可能已损坏或格式不受支持。', 4: '音源地址不可用或格式不受支持。可能需要重新登录平台，或换一个音源。' };
const FADE_IN_MS = 420, FADE_OUT_MS = 220, PREFETCH_DELAY_MS = 1500;
// One cache for the whole deck: the next track is matched while this one plays.
const resolutions = createResolutionCache();
// Which candidate really played for each track (survives restarts).
const matches = createMatchMemory(typeof localStorage === 'undefined' ? null : localStorage);

// `options.peekNext()` names the track that will play after this one (same
// album, the next queued record, or nothing) so it can be matched early;
// `options.canNext` allows moving past a track that cannot be played.
export default function useRoomPlayback(record, trackIndex, provider, onNext, options = {}) {
  const audio = useRef(null), sequence = useRef(0), remote = useRef(false), next = useRef(onNext), resolveRef = useRef(null), controlling = useRef(false);
  const opts = useRef(options); opts.current = options;
  const canNext = () => Boolean(typeof opts.current.canNext === 'function' ? opts.current.canNext() : opts.current.canNext);
  next.current = onNext;
  const [state, setState] = useState({ status: 'idle', playing: false, candidates: [], position: 0, duration: 0, error: '', trial: false });
  const [{ volume, muted }, setVolumeState] = useState(readVolume);
  const sound = useRef({ volume, muted }); sound.current = { volume, muted };
  const setSound = (patch) => setVolumeState((old) => { const next = { ...old, ...patch }; next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0)); try { localStorage.setItem(VOLUME_KEY, JSON.stringify(next)); } catch {} return next; });
  const fader = useRef(null);
  fader.current ||= createFader({ apply: (gain) => { if (audio.current) audio.current.volume = Math.max(0, Math.min(1, sound.current.volume * gain)); } });
  const [accountEpoch, setAccountEpoch] = useState(0);
  const skips = useRef(0), resumeAt = useRef(0), recovered = useRef(''), prefetched = useRef('');
  const update = (value) => setState((old) => ({ ...old, ...value }));
  // 45 rpm on a 33 record: faster and higher, like the real thing. Resets per record.
  const rate = useRef(1);
  const applyRate = (element = audio.current) => { if (!element) return; element.preservesPitch = false; element.mozPreservesPitch = false; element.webkitPreservesPitch = false; element.playbackRate = rate.current; };
  useEffect(() => { rate.current = 1; applyRate(); }, [record?.id]);
  const resetAudio = (element = audio.current) => { fader.current.stop(); if (element) { element.pause(); element.removeAttribute('src'); element.load(); } };
  useEffect(() => {
    const current = ++sequence.current, controller = new AbortController(), element = audio.current; resetAudio(element);
    update({ status: 'idle', playing: false, candidates: [], position: 0, duration: 0, error: '', trial: false, actualTrack: '', remote: false, quality: '', notice: '' });
    const active = () => sequence.current === current && !controller.signal.aborted;
    let resolution = 0;
    const request = (path, value) => musicRequest(path, value, controller.signal);
    const key = resolutionKey(provider, record, trackIndex);
    async function play(candidate, result) {
      if (!active()) return;
      if (result.remote) { remote.current = candidate.provider; if (element.getAttribute('src')) resetAudio(element); update({ status: 'loading', remote: true, resolvedProvider: candidate.provider, notice: result.notice || '' }); }
      else {
        remote.current = false;
        update({ playing: false, status: 'loading', error: '', trial: result.trial, quality: result.quality, remote: false, resolvedProvider: candidate.provider, actualTrack: candidate.title });
        fader.current.set(0); // every start fades in: no click, no blast at full volume
        element.src = result.audioPath; element.load(); applyRate(element);
        if (resumeAt.current > 0) { const at = resumeAt.current; resumeAt.current = 0; element.addEventListener('loadedmetadata', () => { if (Number.isFinite(element.duration)) element.currentTime = Math.min(at, Math.max(0, element.duration - 1)); }, { once: true }); }
        await ensureAnalyser(element); // energy for cabin:playback; no-op for cross-origin audio
        let timer;
        try { await Promise.race([element.play(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('音频连接超时。')), 10000); })]); }
        catch (error) { if (active()) resetAudio(element); throw error; }
        finally { clearTimeout(timer); }
        if (active()) fader.current.to(1, FADE_IN_MS);
      }
    }
    async function resolve(candidate) {
      if (!active()) return;
      const request = ++resolution;
      const latest = () => active() && request === resolution;
      resetAudio(element); update({ status: 'loading', candidates: [], error: '' });
      try {
        const result = candidate.sessionUrl ? { audioPath: candidate.sessionUrl, trial: false, quality: '本次导入的文件' } : await musicRequest('/resolve', candidate, controller.signal); if (!latest()) return;
        await play(candidate, result);
        if (latest() && !result.remote && !candidate.sessionUrl) matches.put(matchKey(record, trackIndex), candidate);
      } catch (error) { if (latest()) update({ status: 'error', playing: false, error: playbackErrorMessage(error) || '音频加载失败。' }); }
    }
    resolveRef.current = resolve;
    (async () => {
      if (remote.current) { const was = remote.current; remote.current = false; await musicRequest(remoteControlPath(was), { action: was === 'appleMusic' ? 'pause' : 'stop' }).catch(() => {}); }
      if (!record || provider === 'visual' || provider === 'system' || !active()) return;
      const name = trackNames(record)[trackIndex]; if (!name) { update({ status: 'error', error: '原始资料没有曲目，无法定位音频。' }); return; }
      // Files picked in this session play directly, whichever audio source is selected.
      const sessionUrl = sessionTrackUrl(record, trackIndex); if (sessionUrl) { await resolve({ sessionUrl, provider: 'local', title: name }); return; }
      if (isSessionAlbum(record) && provider === 'local') { update({ status: 'error', error: '这张专辑是从文件临时导入的，重新打开小屋后需要再选一次文件：「添加专辑 › 本地音乐 › 选择音乐文件」。' }); return; }
      // Matched while the previous track played: start at once. A stale entry
      // simply falls through to a fresh match.
      const early = resolutions.take(key);
      if (early) {
        try { await play(early.candidate, early.result); return; }
        catch { if (!active()) return; }
      }
      update({ status: 'searching' });
      try {
        const result = await findPlayableSource({ record, index: trackIndex, provider, request, play, isCurrent: active, memory: matches });
        if (active() && result?.error) update({ status: 'error', playing: false, candidates: result.candidates, error: result.error });
      }
      catch (error) { if (active()) update({ status: 'error', playing: false, error: playbackErrorMessage(error) || '音频加载失败。' }); }
    })();
    return () => { controller.abort(); sequence.current++; resetAudio(element); };
  }, [record?.id, trackIndex, provider, accountEpoch]);

  // Prefetch: once this track is really playing, match the next one quietly.
  useEffect(() => {
    if (state.status !== 'playing' || state.remote || !PREFETCH_PROVIDERS.has(provider)) return;
    const upcoming = opts.current.peekNext?.();
    if (!upcoming?.item || sessionTrackUrl(upcoming.item, upcoming.index) || isSessionAlbum(upcoming.item)) return;
    const key = resolutionKey(provider, upcoming.item, upcoming.index);
    if (!key || prefetched.current === key || resolutions.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      prefetched.current = key;
      const request = (path, value) => musicRequest(path, value, controller.signal);
      try {
        await findPlayableSource({ record: upcoming.item, index: upcoming.index, provider, request, isCurrent: () => !controller.signal.aborted,
          play: async (candidate, result) => { if (!controller.signal.aborted) resolutions.put(key, candidate, result); } });
      } catch { /* The track will be matched normally when it starts. */ }
    }, PREFETCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state.status, record?.id, trackIndex, provider]);

  // Unplayable track inside an album or playlist: say so, then move on.
  useEffect(() => {
    if (state.status === 'playing') { skips.current = 0; return; }
    if (!record || !shouldAutoSkip({ error: state.error, status: state.status, consecutive: skips.current, canNext: canNext() })) return;
    const timer = setTimeout(() => { skips.current++; next.current?.(true); }, AUTO_SKIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.error, record?.id, trackIndex]);
  useEffect(() => { skips.current = 0; }, [record?.id, provider]);

  useEffect(() => { const changed = () => { resolutions.clear(); /* a new login or source setting can change which version is playable */ setAccountEpoch((value) => value + 1); }; window.addEventListener('album-music-account', changed); window.addEventListener('album-music-settings', changed); return () => { window.removeEventListener('album-music-account', changed); window.removeEventListener('album-music-settings', changed); }; }, []);
  useEffect(() => {
    if (!REMOTE_PROVIDERS.has(provider) || !record) return;
    let disposed = false, busy = false;
    const current = sequence.current;
    const poll = async () => {
      if (!remote.current || busy) return; busy = true;
      try { const result = await musicRequest(provider === 'appleMusic' ? '/apple/state' : '/ma/state'); if (!disposed && sequence.current === current) update({ playing: result.state === 'playing', status: result.state === 'playing' ? 'playing' : result.state === 'paused' ? 'paused' : 'waiting', position: result.elapsed, duration: result.duration, actualTrack: result.title }); }
      catch (error) { if (!disposed && sequence.current === current) update({ status: 'error', error: error.message, playing: false }); }
      finally { busy = false; }
    };
    const timer = setInterval(poll, 1500); return () => { disposed = true; clearInterval(timer); };
  }, [provider, record?.id, trackIndex, accountEpoch]);
  useEffect(() => { if (audio.current) { audio.current.volume = Math.max(0, Math.min(1, volume * fader.current.gain)); audio.current.muted = muted; } }, [volume, muted]);
  useEffect(() => () => { if (remote.current) musicRequest(remoteControlPath(remote.current), { action: remote.current === 'appleMusic' ? 'pause' : 'stop' }).catch(() => {}); }, []);
  const toggle = async () => {
    if (controlling.current || provider === 'system' || provider === 'visual') return;
    controlling.current = true;
    const current = sequence.current;
    try {
      if (remote.current) { await musicRequest(remoteControlPath(remote.current), { action: state.playing ? 'pause' : 'play' }); return; }
      const element = audio.current;
      if (element?.getAttribute('src')) {
        if (element.paused) { await ensureAnalyser(element); fader.current.set(0); await element.play(); fader.current.to(1, FADE_IN_MS); }
        else { await fader.current.to(0, FADE_OUT_MS); if (sequence.current === current) element.pause(); }
      }
      else { const sessionUrl = sessionTrackUrl(record, trackIndex); if (sessionUrl) await resolveRef.current?.({ sessionUrl, provider: 'local', title: trackNames(record)[trackIndex] }); else setAccountEpoch((value) => value + 1); }
    } catch (error) { if (sequence.current === current) update({ status: 'error', error: playbackErrorMessage(error) || '音频加载失败。' }); }
    finally { controlling.current = false; }
  };
  const events = {
    onPlay: () => { if (audio.current?.getAttribute('src')) update({ playing: false, status: 'loading', error: '' }); },
    onPlaying: () => { if (audio.current?.getAttribute('src')) update({ playing: true, status: 'playing', error: '' }); },
    onWaiting: () => { if (audio.current?.getAttribute('src') && !audio.current.paused) update({ playing: false, status: 'buffering' }); },
    onPause: () => { if (audio.current?.getAttribute('src')) update({ playing: false, status: 'paused' }); },
    onTimeUpdate: () => update({ position: audio.current.currentTime }), onDurationChange: () => update({ duration: Number.isFinite(audio.current.duration) ? audio.current.duration : 0 }),
    onEnded: () => { update({ playing: false, status: 'ended' }); next.current?.(); },
    onError: () => {
      const element = audio.current;
      if (!element?.getAttribute('src')) return;
      // A platform link that expires mid-song is matched again once and resumed where it stopped.
      const code = element.error?.code, at = element.currentTime || 0, key = `${record?.id}|${trackIndex}`;
      if ((code === 2 || code === 4) && at > 2 && recovered.current !== key && !sessionTrackUrl(record, trackIndex)) {
        recovered.current = key; resumeAt.current = at; resolutions.clear();
        update({ playing: false, status: 'buffering', error: '' }); setAccountEpoch((value) => value + 1); return;
      }
      update({ playing: false, status: 'error', error: MEDIA_ERRORS[code] || '音频加载失败。请重新播放，或检查平台权限与网络。' });
    }
  };
  const skipping = state.status === 'error' && shouldAutoSkip({ error: state.error, status: state.status, consecutive: skips.current, canNext: canNext() });
  const statusText = (state.error && (skipping ? `${state.error} 稍后自动播放下一首…` : state.error)) || ({ idle: '待播放', loading: '正在连接音源…', searching: '正在匹配原始曲目…', choose: '请选择对应的曲目版本', playing: `${provider === 'ma' ? '服务器播放器正在播放' : provider === 'appleMusic' ? '正在“音乐”App 中播放' : provider === 'local' ? '正在播放本地文件' : '正在播放'}${state.trial ? ' · 试听片段' : ''}${state.quality && !state.remote && provider !== 'local' ? ` · ${state.quality}` : ''}`, paused: '播放已暂停', ended: '本曲播放结束', waiting: provider === 'appleMusic' ? '等待“音乐”App' : '等待服务器播放器', buffering: '正在缓冲音频…' }[state.status] || '待播放');
  const seek = (value) => { if (audio.current && !remote.current && Number.isFinite(value) && Number.isFinite(audio.current.duration)) audio.current.currentTime = Math.max(0, Math.min(value, audio.current.duration)); };
  // Same track again ("repeat one", or "previous" after 3 s).
  const restart = async () => {
    if (remote.current || !audio.current?.getAttribute('src')) { setAccountEpoch((value) => value + 1); return; }
    audio.current.currentTime = 0;
    try { if (audio.current.paused) { fader.current.set(0); await audio.current.play(); fader.current.to(1, FADE_IN_MS); } } catch (error) { update({ status: 'error', error: playbackErrorMessage(error) || '音频加载失败。' }); }
  };
  return { ...state, statusText, skipping, rate: rate.current, setRate: (value) => { rate.current = Math.max(.5, Math.min(2, Number(value) || 1)); applyRate(); update({}); },
    // Seek into a track that is about to start (dragging the needle across songs).
    startAt: (seconds) => { resumeAt.current = Math.max(0, Number(seconds) || 0); }, audio, events, toggle, choose: (candidate) => resolveRef.current?.(candidate),
    // Labelled hand-off: opens the song in the QQ 音乐 / 网易云 app (or its web page).
    // The cabin does not play or track it afterwards; the result says so.
    localApp: localAppTarget({ record, index: trackIndex, provider, status: state.status, candidates: state.candidates, resolvedProvider: state.resolvedProvider }),
    openInLocalApp: async () => { const target = localAppTarget({ record, index: trackIndex, provider, status: state.status, candidates: state.candidates, resolvedProvider: state.resolvedProvider }); if (!target) return null; try { const result = await musicRequest('/open-local', target); update({ notice: `已在${result.via === 'app' ? ` ${result.app} App ` : ` ${result.app} 网页`}中打开，声音由它播放，小屋不显示进度。` }); return result; } catch (error) { update({ notice: error.message }); return null; } },
    rememberedMatches: matches, seek, seekBy: (delta) => seek((audio.current?.currentTime || 0) + delta), restart, retry: () => { skips.current = 0; setAccountEpoch((value) => value + 1); }, remote: Boolean(state.remote), volume, muted, setVolume: (value) => setSound({ volume: value, muted: false }), setMuted: (value) => setSound({ muted: Boolean(value) }), canControl: provider !== 'visual' && provider !== 'system' };
}
