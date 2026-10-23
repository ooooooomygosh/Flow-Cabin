import { useEffect, useMemo, useRef, useState } from 'react';
import { musicRequest } from './room-playback.mjs';
import { onBackgroundChange } from './frame-clock.mjs';

import { systemPlaybackTimeline } from './runtime/playback-timeline.mjs';

// The native macOS adapter caches for 1500 ms. Re-anchoring that cached
// position faster would repeatedly rewind the interpolated lyric clock.
const POLL_MS = 1500;
// Only what the deck shows: an unchanged answer (the usual case) is no re-render.
export const nowPlayingKey = (value = {}) => ['available', 'active', 'app', 'title', 'artist', 'albumArtist', 'album', 'playing', 'duration', 'artwork', 'error'].map((key) => String(value?.[key] ?? '')).join('\u0001');

// Mirrors the operating system's current media session (Spotify, NetEase
// Cloud Music, Apple Music…) onto the turntable. Audio stays in that player.
// Polling pauses while the window is hidden or minimised and refreshes on return.
export default function useSystemNowPlaying(active) {
  const [state, setState] = useState({ available: true, active: false }), [error, setError] = useState('');
  const enabled = useRef(active); enabled.current = active;
  const busy = useRef(false), shown = useRef(nowPlayingKey(state));
  const refresh = async () => {
    if (busy.current) return; busy.current = true;
    try {
      const value = await musicRequest('/now-playing'), key = nowPlayingKey(value);
      if (!enabled.current) return;
      systemPlaybackTimeline.update({ trackId: value.active ? `${value.app}:${value.artist}:${value.title}` : '', source: 'system', playing: value.playing, position: value.active ? value.position : null, duration: value.duration, capabilities: { control: Boolean(value.active) } });
      if (key !== shown.current) { shown.current = key; setState(value); }
      setError(value.error || '');
    }
    catch (cause) { if (enabled.current) { systemPlaybackTimeline.update(); setError(cause.message); } }
    finally { busy.current = false; }
  };
  useEffect(() => {
    if (!active) { systemPlaybackTimeline.update(); return; }
    let timer = 0;
    const off = onBackgroundChange((background) => {
      clearInterval(timer); timer = 0;
      if (!background) { refresh(); timer = setInterval(refresh, POLL_MS); }
    });
    return () => { off(); clearInterval(timer); };
  }, [active]);
  const control = async (action) => {
    try { await musicRequest('/now-playing/control', { action }); setTimeout(refresh, 350); }
    catch (cause) { setError(cause.message); }
  };
  const item = useMemo(() => state.active ? { id: `system:${state.artist}:${state.album || state.title}`, type: 'album', title: state.album || state.title, artist: state.albumArtist || state.artist, cover: state.artwork || '', tracks: [state.title] } : null, [state]);
  const statusText = error || (!state.available ? '这台电脑暂不支持读取系统播放器。' : !state.active ? '打开 Spotify、网易云音乐等播放器开始播放，唱机会自动同步。' : `${state.app} · ${state.playing ? '正在播放' : '已暂停'}`);
  return { ...state, item, error, statusText, control, refresh, timeline: systemPlaybackTimeline };
}
