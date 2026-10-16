import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RoomScene from './RoomScene';
import RoomTurntable from './RoomTurntable';
import RoomCat from './pet/RoomCat';
import FocusFace from './focus/FocusFace';
import { SCENE_FACES } from './focus/focus-display.mjs';
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

// The wallpaper keeps its own partition (no shared preferences), so it shows
// the scene's own face: the time, or the round while one runs. The snapshot has
// no phase length, so faces that draw progress fall back to their clock cousin.
const WALLPAPER_FACE = { ring: 'flip', growth: 'window', record: 'flip' };
function WallpaperTimer({ focus, look }) {
  const face = SCENE_FACES[look] || 'flip', running = focus && focus.phase !== 'idle';
  return <div className={`wallpaper-focus phase-${focus?.phase || 'idle'}`}>
    <FocusFace face={WALLPAPER_FACE[face] || face} look={look} focus={focus} variant="wallpaper"/>
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
    <WallpaperTimer focus={snapshot.focus} look={snapshot.look}/>
    <div className="wallpaper-caption">{snapshot.roomName} · {snapshot.statusText || '你的唱片收藏'}</div>
  </RoomScene></main>;
}
createRoot(document.getElementById('root')).render(<WallpaperRoom/>);
