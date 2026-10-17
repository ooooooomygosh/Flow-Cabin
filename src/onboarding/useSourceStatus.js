import { useCallback, useEffect, useState } from 'react';
import { sourceOptions } from './onboarding-model.mjs';

// The music sources this cabin can use, each one's connection status and the
// audio-quality choice, kept fresh across logins and folder scans. Shared by
// Settings › 音源 and the first-run 音源 step.
export default function useSourceStatus(player, env) {
  const [sources, setSources] = useState(() => sourceOptions(env)), [status, setStatus] = useState({}), [quality, setQualityState] = useState(null);
  const refresh = useCallback(async (id) => { const next = await player.getSourceStatus(id); setStatus((old) => ({ ...old, [id]: next })); }, [player]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await player.listSources(); if (!alive) return; setSources(list);
      const entries = await Promise.all(list.map(async (item) => [item.id, await player.getSourceStatus(item.id)]));
      if (alive) setStatus(Object.fromEntries(entries));
    };
    load(); player.qualities().then((value) => alive && setQualityState(value));
    window.addEventListener('album-music-account', load); window.addEventListener('album-local-music', load);
    return () => { alive = false; window.removeEventListener('album-music-account', load); window.removeEventListener('album-local-music', load); };
  }, [player]);
  // The one way to change 音质: the deck hears `album-music-settings` and resumes where it was.
  const setQuality = useCallback(async (id) => { if (!await player.setQuality(id)) return false; setQualityState((old) => old && { ...old, current: id }); return true; }, [player]);
  return { sources, status, refresh, quality, setQuality };
}
