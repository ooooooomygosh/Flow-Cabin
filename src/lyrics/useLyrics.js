import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLyrics, readLyricSettings, lyricCacheKey, LYRIC_CHANGED } from './lyric-session.mjs';
import { readPrefs, writePrefs, PREFS_EVENT, PREFS_KEY } from './lyric-prefs.mjs';
import { onCabinPlayback } from '../scene/playback-listener.mjs';

// The lyrics of a track: { doc, error, busy, retry }. A changed setting (offset, an imported
// file, a chosen version) re-reads through the session cache, so only real changes refetch.
export function useLyricDoc(track) {
  const key = lyricCacheKey(track);
  const [state, setState] = useState({ key: '', doc: null, error: '', busy: true });
  const [revision, setRevision] = useState(0), force = useRef(false);
  useEffect(() => { const changed = () => setRevision(n => n + 1); window.addEventListener(LYRIC_CHANGED, changed); return () => window.removeEventListener(LYRIC_CHANGED, changed); }, []);
  useEffect(() => {
    let alive = true; const retry = force.current; force.current = false;
    setState(previous => ({ key, doc: previous.key === key && !retry ? previous.doc : null, error: '', busy: true }));
    loadLyrics(track, retry).then(doc => { if (alive) setState({ key, doc, error: '', busy: false }); }, error => { if (alive) setState({ key, doc: null, error: error.message, busy: false }); });
    return () => { alive = false; };
  }, [key, revision]);
  const retry = useCallback(() => { force.current = true; setRevision(n => n + 1); }, []);
  return { ...state, doc: state.key === key ? state.doc : null, retry };
}

// The person's per-song settings (offset, chosen version, imported text).
export function useLyricSettings(track) {
  const [settings, setSettings] = useState(() => readLyricSettings(track));
  const key = lyricCacheKey(track);
  useEffect(() => { const read = () => setSettings(readLyricSettings(track)); read(); window.addEventListener(LYRIC_CHANGED, read); return () => window.removeEventListener(LYRIC_CHANGED, read); }, [key, track.duration]);
  return settings;
}

// Display preferences, shared by every lyric surface and window.
export function useLyricPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    const read = event => { if (!event?.key || event.key === PREFS_KEY) setPrefs(readPrefs()); };
    window.addEventListener(PREFS_EVENT, read); window.addEventListener('storage', read);
    return () => { window.removeEventListener(PREFS_EVENT, read); window.removeEventListener('storage', read); };
  }, []);
  const update = useCallback(patch => { try { setPrefs(writePrefs(patch)); } catch { setPrefs(previous => ({ ...previous, ...patch })); } }, []);
  return [prefs, update];
}

// The latest playback signal without re-rendering: { playing, energy, bpm, beatAt }.
export function usePlaybackSignal() {
  const signal = useRef({ playing: false, energy: 0, bpm: 0, beatAt: 0 });
  useEffect(() => onCabinPlayback(detail => { signal.current = detail; }), []);
  return signal;
}
