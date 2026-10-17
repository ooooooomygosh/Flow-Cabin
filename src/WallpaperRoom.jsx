import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RoomScene from './RoomScene';
import RoomTurntable from './RoomTurntable';
import RoomCat from './pet/RoomCat';
import FocusFace from './focus/FocusFace';
import { faceFor } from './focus/focus-display.mjs';
import { PHASE_LABELS } from './focus/focus-model.mjs';
import './styles/tokens.css';
import './cabin-room.css';
import './record-library.css';
import './room-immersive.css';
import './companion-room.css';
import './wallpaper.css';
import './styles/pixel-ui.css';
import './styles/perf-low.css';
import { syncPerformance, applyPerformance } from './perf-profile.mjs';
syncPerformance();
applyPerformance(); // the wallpaper follows the main window's 流畅模式 (same profile storage)

// The wallpaper keeps its own partition (no shared preferences): the main
// window relays its 专注画面 choice and the round's length in the snapshot, so
// the wallpaper shows the same face, the time, or the round with its progress.
function WallpaperTimer({ focus, display, look }) {
  const running = focus && focus.phase !== 'idle';
  return <div className={`wallpaper-focus phase-${focus?.phase || 'idle'}`}>
    <FocusFace face={faceFor(display, look)} look={look} focus={focus} show={display?.show} seconds={display?.seconds === true} variant="wallpaper"/>
    {running && <small>{PHASE_LABELS[focus.phase]}{focus.paused ? ' · 暂停' : ''}{focus.task ? ` · ${focus.task}` : ''}</small>}
  </div>;
}
function WallpaperRoom() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    let alive = true;
    window.albumWallpaper?.getSnapshot().then((value) => { if (alive) setSnapshot(value); });
    const unsubscribe = window.albumWallpaper?.onSnapshot((value) => setSnapshot(value));
    return () => { alive = false; unsubscribe?.(); };
  }, []);
  useEffect(() => { document.documentElement.dataset.desktopReduceMotion = String(Boolean(snapshot?.reduceMotion)); }, [snapshot?.reduceMotion]);
  if (!snapshot) return null;
  const focus = snapshot.focus || {};
  return <main className={`wallpaper-room cabin-${snapshot.look}`}><RoomScene look={snapshot.look} items={snapshot.items} selectedId={snapshot.selectedId} startRow={snapshot.startRow} weather={snapshot.weather}
    cat={<RoomCat petId={snapshot.petId} focus={{ ...focus, accessory: snapshot.accessory }} playing={snapshot.grooving} track={snapshot.track} reduceMotion={snapshot.reduceMotion} interactive={false} hidden={snapshot.petOut}/>}>
    <RoomTurntable item={snapshot.record} spinning={snapshot.spinning} trackIndex={snapshot.trackIndex} style={snapshot.recordStyle} readOnly provider={snapshot.provider} statusText={snapshot.statusText} actualTrack={snapshot.actualTrack}/>
    <WallpaperTimer focus={snapshot.focus} display={snapshot.focusDisplay} look={snapshot.look}/>
    <div className="wallpaper-caption">{snapshot.roomName} · {snapshot.statusText || '你的唱片收藏'}</div>
  </RoomScene></main>;
}
createRoot(document.getElementById('root')).render(<WallpaperRoom/>);
