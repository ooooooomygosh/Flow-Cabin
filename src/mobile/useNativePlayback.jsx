import { useEffect, useMemo, useRef, useState } from 'react';
import { exactTrack, findPlayableSource, musicRequest } from '../room-playback.mjs';
import { trackNames } from '../room-model.mjs';
import { createPositionStore } from '../deck/position-store.mjs';
import { readVolume, writeVolume } from '../deck/deck-status.mjs';

// This hook has no HTML audio source. The service is the sole Android player.
export default function useNativePlayback(record, index, provider, onNext, options = {}) {
  const native = window.albumMobile.player;
  const clock = useMemo(() => createPositionStore({ minInterval: 0 }), []);
  const [state, setState] = useState({ playing: false, status: 'idle', candidates: [], error: '', actualTrack: '' });
  const [sound, setSound] = useState(readVolume), [epoch, setEpoch] = useState(0), [rate, rateState] = useState(1);
  const live = useRef({}); live.current = { record, index, provider, onNext, options };
  const owner = useRef(0), autoStart = useRef(true), resumeAt = useRef(0), chooseRef = useRef(null), nativeState = useRef(null);
  const queued = useRef(null), ended = useRef(''), ready = useRef(null), handledEpoch = useRef(0);
  const apply = value => {
    const context = queued.current;
    if (context && context.recordId === live.current.record?.id) {
      const trackIndex = context.indices[value.index];
      if (Number.isInteger(trackIndex) && value.mediaId === context.mediaIds[value.index] && trackIndex !== live.current.index && value.mediaId !== nativeState.current?.mediaId) live.current.options.onNativeTrackIndex?.(trackIndex);
      if (value.status === 'ended' && trackIndex === live.current.index && ended.current !== value.mediaId) { ended.current = value.mediaId; live.current.onNext?.(false); }
      else if (value.status !== 'ended') ended.current = '';
    }
    nativeState.current = value;
    const selected = context?.items[value.index];
    clock.set(value.position, value.duration, { force: true });
    setState(old => ({ ...old, ...value, ...(selected && value.mediaId === context.mediaIds[value.index] ? { resolvedProvider: selected.provider, resolvedId: selected.id, resolvedAlbum: selected.album, resolvedArtist: selected.artist } : {}), actualTrack: value.title || old.actualTrack }));
  };
  const command = async (action, value) => {
    try { const result = await native.command({ action, ...(value === undefined ? {} : { value }) }); apply(result); return result; }
    catch (error) { setState(old => ({ ...old, error: error.message, status: 'error' })); }
  };
  useEffect(() => {
    let disposed = false, listener;
    native.addListener('state', value => { if (!disposed) apply(value); }).then(value => { listener = value; if (disposed) value.remove(); }).catch(() => {});
    ready.current = native.state().then(value => { if (!disposed) apply(value); }, () => {});
    return () => { disposed = true; listener?.remove(); };
  }, []);
  useEffect(() => {
    const revision = ++owner.current, controller = new AbortController(), current = () => owner.current === revision;
    const start = async candidate => {
      await ready.current;
      if (!current()) return;
      const local = window.albumMobile.localTrack(record, index);
      const selected = local ? { ...local, provider: 'local', id: '', title: local.title || trackNames(record)[index] } : candidate;
      if (!selected || !['qq', 'netease', 'local'].includes(selected.provider)) throw Error('此音源暂不支持安卓原生播放。');
      const all = trackNames(record).slice(0, 500).map((title, i) => {
        const file = window.albumMobile.localTrack(record, i);
        return file ? { ...file, provider: 'local', title } : exactTrack(record, i, selected.provider);
      });
      const complete = all.length > index && all.every(Boolean), items = complete ? all : [selected];
      if (complete) items[index] = selected;
      const mediaId = selected.provider === 'local' ? selected.uri : `cabin://${selected.provider}/${selected.id}`;
      if (nativeState.current?.mediaId === mediaId && nativeState.current.status !== 'ended' && handledEpoch.current === epoch && queued.current?.recordId === record.id) return;
      queued.current = { recordId: record.id, items, indices: complete ? all.map((_, i) => i) : [index], mediaIds: items.map(item => item.provider === 'local' ? item.uri : `cabin://${item.provider}/${item.id}`) };
      ended.current = '';
      const value = await native.queue({ items, index: complete ? index : 0, position: resumeAt.current, play: autoStart.current }); resumeAt.current = 0; handledEpoch.current = epoch;
      if (current()) { apply(value); setState(old => ({ ...old, candidates: [], resolvedProvider: selected.provider, resolvedId: selected.id, resolvedAlbum: selected.album, resolvedArtist: selected.artist, native: true })); }
    };
    chooseRef.current = start;
    (async () => {
      if (!record || ['visual', 'system'].includes(provider)) { await command('stop'); return; }
      if (!autoStart.current) { await command('pause'); return; }
      setState(old => ({ ...old, status: 'searching', error: '' }));
      if (window.albumMobile.localTrack(record, index)) { await start(); return; }
      const result = await findPlayableSource({ record, index, provider, request: (path, value) => musicRequest(path, value, controller.signal), isCurrent: current, play: start });
      if (current() && result?.error) setState(old => ({ ...old, status: 'error', error: result.error, candidates: result.candidates || [] }));
    })().catch(error => { if (current()) setState(old => ({ ...old, status: 'error', error: error.message })); });
    return () => { owner.current++; controller.abort(); };
  }, [record?.id, index, provider, epoch]);
  useEffect(() => { native.command({ action: 'volume', value: sound.muted ? 0 : sound.volume }).catch(() => {}); }, [sound]);
  const changeSound = patch => setSound(old => { const value = { ...old, ...patch }; writeVolume(value); return value; });
  return { ...state, ...sound, rate, clock, audio: { current: null }, events: {}, deckRefs: [() => {}, () => {}], remote: false, moved: clock.position > 0,
    get position() { return clock.position; }, get duration() { return clock.duration; },
    statusText: state.error || (state.playing ? '原生后台播放' : state.status === 'searching' ? '正在查找歌曲…' : '原生播放器已暂停'),
    canControl: Boolean(record) && !['visual', 'system'].includes(provider), skipping: false, candidates: state.candidates || [],
    toggle: () => {
      if (!autoStart.current || state.status === 'error' || !nativeState.current?.mediaId) { autoStart.current = true; setEpoch(v => v + 1); return; }
      return command(state.playing ? 'pause' : 'play');
    }, seek: value => command('seek', value), seekBy: delta => command('seek', clock.position + delta), restart: () => command('seek', 0),
    setRate: value => { rateState(value); command('rate', value); }, setVolume: volume => changeSound({ volume }), setMuted: muted => changeSound({ muted }),
    choose: candidate => { autoStart.current = true; return chooseRef.current?.(candidate); }, retry: () => setEpoch(v => v + 1), hold: () => { autoStart.current = false; command('pause'); },
    startAt: value => { resumeAt.current = value; }, setAutoStart: value => { autoStart.current = value !== false; }, isBlocked: () => false, blockedVersion: 0,
  };
}
