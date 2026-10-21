import { getRoomScene } from './scene-catalog.mjs';
import React, { memo, useLayoutEffect, useRef, useState } from 'react';
import CabinAtmosphere from './CabinAtmosphere';
import CabinAtmosphereSky, { useSky } from './CabinAtmosphereSky';
import AmbientLife from './scene/AmbientLife';
import { VinylDisc } from './RecordLibrary';
import { Disc3 } from './icons';
import { roomGeometryAroundPanel } from './room-model.mjs';
import { ShowroomArtwork } from './RoomArtwork';
import StudyWriting from './StudyWriting';
import { flyRecord } from './turntable/record-flight.mjs';
import './study-room.css';
import CabinDetails from './room/CabinDetails';
import ThemeInteractions from './scene/ThemeInteractions';

export const ROOM_DRAG_TYPE = 'application/x-album-circle-record';
// Put a shelf record on the deck: the sleeve flies to the scene deck first
// (unless that record is already loaded). Shared by double-click, Enter on a
// selected record and the footer's 「放上唱机」 button.
export function placeRecord(item, from, load) {
  const deck = document.querySelector('.scene-deck');
  if (load && deck && document.querySelector('.room-turntable')?.dataset.loadedId !== item.id) flyRecord({ from, to: deck.querySelector('.scene-deck-sprite') || deck, target: deck, cover: item.cover });
  load?.(item);
}
// The twelve sleeves re-render only when the shelf itself changes, not with
// every room render (deck state, focus, weather…).
const RoomRack = memo(function RoomRack({ items, selectedId, select, load, startRow, columns, rows, pixel }) {
  return <div className="room-rack cabin-rack"><div className="room-rack-grid" role="list" aria-label="木质唱片架" data-start-row={startRow}>
        {Array.from({ length: columns.length * rows.length }, (_, index) => {
          const column = index % columns.length, row = Math.floor(index / columns.length);
          const item = items[index], [x, width] = columns[column], [y, height] = rows[row];
          return <div className={`room-record-slot ${item ? '' : 'room-record-empty'}`} style={{ left: `${x / 1448 * 100}%`, top: `${y / 1086 * 100}%`, width: `${width / 1448 * 100}%`, height: `${height / 1086 * 100}%`, '--shelf-shade': .18 + column * .08 + row * .025 }} role={item ? 'listitem' : undefined} key={index} aria-hidden={item ? undefined : 'true'}>
            {item ? <button type="button" key={item.id} className={`room-record ${selectedId === item.id ? 'is-selected' : ''}`} aria-label={`选择 ${item.artist} 的 ${item.title}`} aria-current={selectedId === item.id ? 'true' : undefined} aria-pressed={selectedId === item.id} title={`${item.title} · ${item.artist}；双击或拖到唱机放盘`} draggable={Boolean(load)} onDragStart={(event) => { event.dataTransfer.setData(ROOM_DRAG_TYPE, item.id); event.dataTransfer.effectAllowed = 'copy'; const ghost = event.currentTarget.querySelector('.room-drag-record'); if (ghost) event.dataTransfer.setDragImage(ghost, 48, 48); }} onClick={() => select?.(item.id)} onDoubleClick={(event) => placeRecord(item, event.currentTarget, load)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.repeat && load) { event.preventDefault(); select?.(item.id); placeRecord(item, event.currentTarget, load); } }}><span className="room-record-sleeve"><ShowroomArtwork item={item} pixel={pixel}/>{item.type === 'playlist' && <span className="room-record-tag" aria-hidden="true">歌单</span>}</span>{load && <span className="room-drag-record" aria-hidden="true"><VinylDisc item={item}/><ShowroomArtwork item={item} className="room-drag-label"/></span>}</button> : <span className="cabin-empty-slot"><Disc3/><span>待收藏</span></span>}
          </div>;
        })}
      </div></div>;
});
function RoomScene({ look = 'warm', items = [], selectedId, select, load, startRow = 0, weather = 'snow', hour, cat = null, children }) {
  const scene = getRoomScene(look);
  // Sky variables (sun-altitude colours, once a minute) and the effective weather.
  const sky = useSky(weather, hour);
  const viewport = useRef(null), [geometry, setGeometry] = useState({});
  useLayoutEffect(() => {
    const room = viewport.current.closest('.cabin-room');
    const toolbar = room?.querySelector('.cabin-toolbar'), footer = room?.querySelector('.room-now-playing');
    const header = room ? document.querySelector('.app-titlebar') : null;
    const update = () => {
      const rect = viewport.current.getBoundingClientRect();
      // Hidden bars (Zen mode) report empty boxes and must not shrink the room.
      const box = (element) => element && element.getClientRects().length ? element.getBoundingClientRect() : null;
      const zen = (document.documentElement.classList.contains('room-zen') && !document.documentElement.classList.contains('room-zen-tools')) || document.documentElement.classList.contains('room-desktop'), bar = box(toolbar), top = box(header), foot = box(room?.querySelector('.room-now-playing'));
      const safeArea = room && !zen ? { top: Math.max(bar?.bottom || 0, top?.bottom || 0) - rect.top + 12, bottom: foot ? rect.bottom - foot.top + 12 : 12 } : undefined;
      // Narrow screens use an explicitly opened bottom sheet. Wide screens
      // avoid only the panel's rectangle; short tabs no longer reserve a rail.
      const panel = box(room?.querySelector('.focus-dock'));
      const sheet = window.matchMedia('(max-width: 900px)').matches;
      // The turntable console docked on the left edge is an obstruction too (it can be dragged elsewhere).
      const deck = safeArea && box(room.querySelector('.room-turntable'));
      if (deck && deck.right < rect.left + rect.width * .4) safeArea.left = deck.right - rect.left + 12;
      const obstacle = panel && !sheet ? { left: panel.left - rect.left, right: panel.right - rect.left, top: panel.top - rect.top, bottom: panel.bottom - rect.top } : null;
      const next = roomGeometryAroundPanel(rect.width, rect.height, safeArea || (obstacle ? { top: 12, bottom: 12 } : undefined), { ...scene.geometry, band: scene.band }, obstacle);
      // The information card uses the same art-space frame as the rack, while
      // its text and controls stay at their normal CSS-pixel size.
      if (room) {
        const scale = next.width / 1448;
        room.style.setProperty('--room-shelf-left', `${next.left + scene.shelfFrame.left * scale}px`);
        room.style.setProperty('--room-shelf-width', `${(scene.shelfFrame.right - scene.shelfFrame.left) * scale}px`);
        room.style.setProperty('--room-tools-right', `${deck ? deck.right - rect.left : 304}px`);
      }
      setGeometry(next);
    };
    let frame;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); });
    [viewport.current, toolbar, footer, header, room?.querySelector('.room-turntable')].filter(Boolean).forEach((element) => observer.observe(element)); update();
    // Footer and focus panel mount/unmount as direct children of the room.
    const mounts = new MutationObserver(() => { room.querySelectorAll(':scope > .room-now-playing, :scope > .focus-dock').forEach((element) => observer.observe(element)); cancelAnimationFrame(frame); frame = requestAnimationFrame(update); });
    if (room) mounts.observe(room, { childList: true });
    return () => { observer.disconnect(); mounts.disconnect(); cancelAnimationFrame(frame); };
  }, [scene, Boolean(selectedId)]); // the footer (.room-now-playing) only exists once a record is selected
  // Fallback for engines without overflow:clip: the stage never keeps a scroll offset.
  const pinStage = (event) => { const el = event.currentTarget; if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } };
  const { columns, rows } = scene.geometry;
  return <div ref={viewport} className="room-scene cabin-scene" onScroll={pinStage} style={{ background: scene.style.background, '--scene-x': `${geometry.left || 0}px`, '--scene-y': `${geometry.top || 0}px`, '--scene-k': (geometry.width || 1448) / 1448, '--scene-view': `url(${scene.view || scene.art})`, ...sky.vars }} aria-label={scene.label} data-scene-scale={(geometry.width || 1448) < 1448 ? 'down' : 'up'} data-room-look={look} data-weather={sky.weather.kind} data-time-of-day={sky.bucket} data-sky={sky.ready ? 'live' : undefined}>
    <div className="cabin-scene-canvas" style={geometry}>
      <CabinAtmosphereSky windows={scene.windows} art={scene.skyMask || scene.view || scene.art} weather={sky.weather} state={sky.state} colors={sky.colors} instant={!sky.ready}>
        <img key={scene.id} className="cabin-scene-art" src={scene.view || scene.art} style={scene.skyMask ? { maskImage: `url(${scene.skyMask})`, maskSize: '100% 100%' } : undefined} alt={scene.alt} width="1448" height="1086" draggable="false"/>
      </CabinAtmosphereSky>
      {scene.id === 'night-study' && <StudyWriting/>}
      <RoomRack items={items} selectedId={selectedId} select={select} load={load} startRow={startRow} columns={columns} rows={rows} pixel={scene.pixel}/>
      {['warm', 'pixel'].includes(scene.id) && <CabinAtmosphere look={scene.id}/>}
      <div className="cabin-daylight" aria-hidden="true"/>
      <div className="cabin-nightshade" aria-hidden="true"/>
      <AmbientLife look={scene.id} time={sky.bucket}/>
      {scene.id === 'pixel' && load && <CabinDetails/>}
      {load && <ThemeInteractions key={scene.id} look={scene.id}/>}
    </div>
    {cat}
    {children}
  </div>;
}
export default memo(RoomScene);
