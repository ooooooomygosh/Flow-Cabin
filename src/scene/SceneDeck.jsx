import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useCoverColour from '../useCoverColour';
import { ARM_FRAMES, DECK_BODY, DECK_H, DECK_W, SHEEN_FRAMES, recordRuns } from './deck-sprite.mjs';
import { onCabinPlayback } from './playback-listener.mjs';
import './scene-deck.css';
import './room-console.css';

const Rects = ({ list, className }) => <g className={className}>{list.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill}/>)}</g>;
const darken = (hex, k = .35) => { const n = parseInt(String(hex).slice(1, 7), 16); if (!Number.isFinite(n)) return '#16110e'; const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k)); return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`; };

/**
 * The room's turntable, drawn into the scene itself (on the shelf top) so it
 * shares the artwork's perspective, light and pixel grid. The console with
 * transport controls stays in RoomTurntable; this is the physical deck.
 * Rendered through a portal into `.cabin-scene-canvas` so it scales with the art.
 */
export default function SceneDeck({ anchor, item, spinning = false, vinyl, readOnly = false, onActivate, onDropRecord, dragType }) {
  const [host, setHost] = useState(null), deck = useRef(null);
  useLayoutEffect(() => { setHost(anchor.current?.closest('.room-scene')?.querySelector('.cabin-scene-canvas') || null); }, [anchor]);
  // Tonearm swings over four frames whenever the deck starts or stops.
  const [arm, setArm] = useState(spinning && item ? 3 : 0);
  useEffect(() => {
    const target = spinning && item ? 3 : 0; if (arm === target) return;
    const timer = setTimeout(() => setArm((value) => value + Math.sign(target - value)), 90);
    return () => clearTimeout(timer);
  }, [arm, spinning, item]);
  // Player energy (0..1) from Grok Bot's `cabin:playback` event drives the
  // glow and note rate through CSS variables — no React re-render per tick.
  useEffect(() => onCabinPlayback((detail) => {
    const element = deck.current; if (!element) return;
    element.style.setProperty('--deck-energy', String(detail.playing ? detail.energy : 0));
  }), []);
  const label = useCoverColour(item?.cover);
  const [dropping, setDropping] = useState(false);
  if (!host) return null;
  const record = item ? recordRuns(darken(vinyl?.base || "#2a201a", .45), label) : null;
  const playing = Boolean(item && spinning && arm === 3);
  return createPortal(<div ref={deck} className={`scene-deck ${playing ? 'is-playing' : ''} ${dropping ? 'is-drop-target' : ''}`} data-loaded={item ? 'true' : 'false'} data-arm={arm}
    onDragOver={readOnly ? undefined : (event) => { if (event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropping(true); } }}
    onDragLeave={() => setDropping(false)}
    onDrop={readOnly ? undefined : (event) => { event.preventDefault(); setDropping(false); onDropRecord?.(event.dataTransfer.getData(dragType)); }}>
    <span className="scene-deck-glow" aria-hidden="true"/>
    <svg className="scene-deck-sprite" viewBox={`0 0 ${DECK_W} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <rect className="scene-deck-shadow" x="1" y={DECK_H - 3} width={DECK_W - 2} height="1" fill="#0d0805"/>
      <rect className="scene-deck-shadow" x="3" y={DECK_H - 2} width={DECK_W - 6} height="1" fill="#0d0805"/>
      <Rects list={DECK_BODY}/>
      {record && <g className="scene-deck-record" key={item.id}><Rects list={record}/></g>}
      <rect x="45" y="15" width="2" height="1" fill="#57352a"/>
    </svg>
    {/* Moving parts live outside the SVG: animations on SVG children can't be
        composited and forced a full style recalculation every frame. The eight
        sheen frames sit side by side in one strip that steps sideways. */}
    {record && <span className="scene-deck-sheen-window" key={`sheen-${item.id}`} aria-hidden="true"><span className="scene-deck-sheen-strip"><svg viewBox={`0 0 ${DECK_W * SHEEN_FRAMES.length} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges">
      {SHEEN_FRAMES.map((frame, i) => <g key={i} transform={`translate(${DECK_W * i} 0)`}><Rects list={frame}/></g>)}
    </svg></span></span>}
    <svg className="scene-deck-sprite scene-deck-arm-layer" viewBox={`0 0 ${DECK_W} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <Rects list={ARM_FRAMES[arm]} className="scene-deck-arm is-current"/>
    </svg>
    <span className="scene-deck-led" aria-hidden="true"/>
    <span className="scene-deck-notes" aria-hidden="true"><i/><i/><i/></span>
    {!readOnly && <button type="button" className="scene-deck-hit" aria-label={item ? (spinning ? `唱机：暂停《${item.title}》` : `唱机：播放《${item.title}》`) : '唱机：双击封面或把唱片拖到这里'} title={item ? '点一下播放 / 暂停' : '把唱片拖到唱机上'} onClick={onActivate}/>}
  </div>, host);
}
