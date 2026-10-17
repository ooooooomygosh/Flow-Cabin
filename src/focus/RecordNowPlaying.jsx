import React, { useEffect, useState } from 'react';
import RecordSleeve from '../ui/RecordSleeve';
import { ChevronLeft, ChevronRight } from '../icons';

// 唱片计时 in the whole-window display plays the record that is on the deck:
// its cover is the label (a pixel sleeve when there is none), the label turns
// only while music plays, a click on the record plays / pauses the music and
// ‹ › beside it skip tracks. Everything goes through `cabin:player-command`;
// state comes from `cabin:playback` and `cabin:deck-item` (docs/events.md).
export const DECK_ITEM_EVENT = 'cabin:deck-item';
export const playerCommand = (action) => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action } }));
// Geometry of faces/record.mjs (108×76, record centre 37,36, playable radius 29, label 10), in % of the canvas.
const W = 108, H = 76, CX = 37, CY = 36, R = 29, LABEL = 10;
const pct = (v, of) => `${(v / of) * 100}%`;

// The last broadcasts, so a display opened mid-song starts in the right state.
if (typeof window !== 'undefined' && !window.__cabinNowPlayingWired) {
  window.__cabinNowPlayingWired = true;
  window.addEventListener('cabin:playback', (event) => { window.__cabinLastPlayback = event.detail; });
}
export function useNowPlaying() {
  const [item, setItem] = useState(() => window.__cabinDeckItem || null);
  const [play, setPlay] = useState(() => window.__cabinLastPlayback || { playing: false, track: null });
  useEffect(() => {
    const onItem = (event) => setItem(event.detail || null), onPlay = (event) => setPlay(event.detail || { playing: false, track: null });
    window.addEventListener(DECK_ITEM_EVENT, onItem); window.addEventListener('cabin:playback', onPlay);
    return () => { window.removeEventListener(DECK_ITEM_EVENT, onItem); window.removeEventListener('cabin:playback', onPlay); };
  }, []);
  const playing = Boolean(play.playing || play.spinning);
  return { item, playing, title: play.track?.title || item?.title || '', artist: play.track?.artist || item?.artist || '' };
}

export default function RecordNowPlaying({ now }) {
  const { item, playing, title, artist } = now;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item?.cover]);
  if (!item) return <div className="record-now is-empty"><p className="record-now-caption">唱机上还没有唱片</p></div>;
  const stop = (fn) => (event) => { event.stopPropagation(); fn(); };
  return <div className={`record-now${playing ? ' is-playing' : ''}`} onClick={(event) => event.stopPropagation()}>
    <button type="button" className="record-now-disc" aria-label={playing ? '暂停音乐' : '播放音乐'} aria-pressed={playing} title={`${playing ? '暂停' : '播放'}：${title} · 空格`}
      style={{ left: pct(CX - R, W), top: pct(CY - R, H), width: pct(R * 2, W), height: pct(R * 2, H) }} onClick={stop(() => playerCommand('toggle'))}>
      <span className="record-now-label" style={{ width: `${(LABEL / R) * 100}%`, height: `${(LABEL / R) * 100}%` }}>
        {item.cover && !broken ? <img src={item.cover} alt="" draggable="false" onError={() => setBroken(true)}/> : <RecordSleeve item={item} title={false}/>}
      </span>
    </button>
    <button type="button" className="record-now-skip is-prev" aria-label="上一首" title="上一首 · ←" style={{ left: pct(CX - R - 9, W), top: pct(CY - 6, H) }} onClick={stop(() => playerCommand('previous'))}><ChevronLeft size={20}/></button>
    <button type="button" className="record-now-skip is-next" aria-label="下一首" title="下一首 · →" style={{ left: pct(CX + R + 1, W), top: pct(CY - 6, H) }} onClick={stop(() => playerCommand('next'))}><ChevronRight size={20}/></button>
    <p className="record-now-caption" aria-live="polite"><strong>{title}</strong>{artist && <span> · {artist}</span>}</p>
  </div>;
}
