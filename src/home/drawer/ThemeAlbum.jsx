import React from 'react';
import { THEMES } from '../spatial-layout.mjs';
import { playSfx } from '../../props/sfx.mjs';
import './desk-tools.css';

// 选择小屋 as a swatch album: every room is a photograph held to its black leaf by four corners, its name
// written under it by hand. The picked room has a strip of tape across its photo. Each leaf is still a
// button with aria-pressed whose name is the room's name, so nothing about how it is used has changed.
//
//   <ThemeAlbum look={look} prefetch={prefetchRoomArt} onPick={(id) => { commands.theme(id); setDrawer(''); }}/>
//   look      the id of the room now in use
//   prefetch  (id) => void, called when a leaf is pointed at or focused (CabinHome's prefetchRoomArt)
//   onPick    (id) => void: what the old grid did on click
//   themes    optional list (defaults to THEMES)
// Lives inside the same <Dialog title="选择小屋" className="home-tool home-editor"> as before.
export default function ThemeAlbum({ look, prefetch, onPick, themes = THEMES }) {
  return <div className="theme-album">
    <div className="home-theme-grid">{themes.map((theme, index) => <button type="button" key={theme.id} className="album-leaf" style={{ '--turn': `${[-1.1, .8, -.5, 1.2][index % 4]}deg` }} aria-pressed={look === theme.id}
      onPointerEnter={() => prefetch?.(theme.id)} onFocus={() => prefetch?.(theme.id)} onPointerDown={() => playSfx('paper-press')} onClick={() => onPick?.(theme.id)}>
      <span className="album-photo"><img src={`/room-scenes/v21/${theme.id}/shell.webp`} alt="" loading="lazy" decoding="async"/></span>
      <span className="album-caption">{theme.name}</span>
    </button>)}</div>
  </div>;
}
