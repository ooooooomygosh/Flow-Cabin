import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useCoverColour from '../useCoverColour';
import { sleeveTone } from '../player/pixel-cover.mjs';
import { DEFAULT_RECORD_STYLE } from '../record-library.mjs';
import { ARM_FRAMES, DECK_BODY, DECK_H, DECK_SHADOW, DECK_W, SHEEN_FRAMES, recordRuns } from './deck-sprite.mjs';
import { bindEnergyVar } from './playback-listener.mjs';
import useReducedMotion from '../useReducedMotion';
import './scene-deck.css';
import './room-console.css';

// The tonearm steps four frames in 360 ms, and every step redraws this portal.
// The heavy parts are memoised on stable references (the body and the record
// are module-level / useMemo'd, the sheen strip never changes while a record
// is loaded) so a swinging arm repaints four rects, not the whole deck.
const Rects = memo(({ list, className }) => <g className={className}>{list.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill}/>)}</g>);
const DeckSheen = memo(() => <span className="scene-deck-sheen-window" aria-hidden="true"><span className="scene-deck-sheen-strip"><svg viewBox={`0 0 ${DECK_W * SHEEN_FRAMES.length} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges">
  {SHEEN_FRAMES.map((frame, i) => <g key={i} transform={`translate(${DECK_W * i} 0)`}><Rects list={frame}/></g>)}
</svg></span></span>);
const DeckArm = memo(({ arm }) => <svg className="scene-deck-sprite scene-deck-arm-layer" viewBox={`0 0 ${DECK_W} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
  <Rects list={ARM_FRAMES[arm]} className="scene-deck-arm is-current"/>
</svg>);
const darken = (hex, k = .35) => { const n = parseInt(String(hex).slice(1, 7), 16); if (!Number.isFinite(n)) return '#16110e'; const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k)); return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`; };

/**
 * The room's turntable, drawn into the scene itself (on the shelf top) so it
 * shares the artwork's perspective, light and pixel grid. The console with
 * transport controls stays in RoomTurntable; this is the physical deck.
 * Rendered through a portal into `.cabin-scene-canvas` so it scales with the art.
 */
function SceneDeck({ anchor, item, spinning = false, vinyl, readOnly = false, onActivate, onDropRecord, dragType }) {
  const [host, setHost] = useState(null), deck = useRef(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => { setHost(anchor.current?.closest('.room-scene')?.querySelector('.cabin-scene-canvas') || null); }, [anchor]);
  // Tonearm swings over four frames whenever the deck starts or stops.
  // Reduced motion keeps the same four poses but skips the swing: the arm is
  // simply where it belongs, with no travel (the CSS side of the same switch
  // stops the record's slide-in and the sheen).
  const [arm, setArm] = useState(spinning && item ? 3 : 0);
  useEffect(() => {
    const target = spinning && item ? 3 : 0; if (arm === target) return;
    if (reduced) { setArm(target); return; }
    const timer = setTimeout(() => setArm((value) => value + Math.sign(target - value)), 90);
    return () => clearTimeout(timer);
  }, [arm, spinning, item, reduced]);
  // Player energy (0..1) from Grok Bot's `cabin:playback` event drives the
  // glow and note rate through CSS variables — no React re-render per tick.
  // Quantised to eighths and written only on change, so it restyles the deck ≤ 8 levels.
  useEffect(() => bindEnergyVar(() => deck.current, '--deck-energy'), []);
  // Label in the cover's own colour; a coverless record takes its generated sleeve's ink.
  // If the cover's pixels can't be read (useCoverColour falls back to the default base), the sleeve's ink is used too.
  const coverLabel = useCoverColour(item?.cover), sleeveLabel = useMemo(() => item ? sleeveTone(item) : null, [item?.title, item?.artist]);
  const label = item && (!item.cover || coverLabel === DEFAULT_RECORD_STYLE.base) ? sleeveLabel : coverLabel;
  const [dropping, setDropping] = useState(false);
  // The 22×56 record grid only changes with the record, its vinyl colour and label.
  const record = useMemo(() => item ? recordRuns(darken(vinyl?.base || "#2a201a", .45), label) : null, [item?.id, vinyl?.base, label]);
  if (!host) return null;
  const playing = Boolean(item && spinning && arm === 3);
  return createPortal(<div ref={deck} className={`scene-deck ${playing ? 'is-playing' : ''} ${dropping ? 'is-drop-target' : ''}`} data-loaded={item ? 'true' : 'false'} data-arm={arm}
    onDragOver={readOnly ? undefined : (event) => { if (event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropping(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropping(false); }}
    onDrop={readOnly ? undefined : (event) => { event.preventDefault(); setDropping(false); onDropRecord?.(event.dataTransfer.getData(dragType)); }}>
    <span className="scene-deck-glow" aria-hidden="true"/>
    <svg className="scene-deck-sprite" viewBox={`0 0 ${DECK_W} ${DECK_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <Rects list={DECK_SHADOW} className="scene-deck-shadow"/>
      <Rects list={DECK_BODY}/>
      {record && <g className="scene-deck-record" key={item.id}><Rects list={record}/></g>}
    </svg>
    {/* Moving parts live outside the SVG: animations on SVG children can't be
        composited and forced a full style recalculation every frame. The eight
        sheen frames sit side by side in one strip that steps sideways. */}
    {record && <DeckSheen key={`sheen-${item.id}`}/>}
    <DeckArm arm={arm}/>
    <span className="scene-deck-led" aria-hidden="true"/>
    <span className="scene-deck-notes" aria-hidden="true"><i/><i/><i/></span>
    {!readOnly && <button type="button" className="scene-deck-hit" aria-label={item ? `打开唱机特写：《${item.title}》${spinning ? '，正在播放' : ''}` : '打开唱机特写；也可以把唱片拖到这里'} title={item ? '唱机特写 · T（播放 / 暂停：空格）' : '唱机特写 · T；把唱片拖到唱机上即可放盘'} aria-keyshortcuts="T" onClick={onActivate}/>}
  </div>, host);
}
export default memo(SceneDeck);
