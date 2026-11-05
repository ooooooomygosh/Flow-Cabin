import React, { useEffect, useId, useRef } from 'react';
import { playSfx } from '../props/sfx.mjs';
import { wheelVolume, volumePercent } from '../player/volume-curve.mjs';
import { angleToValue, crossedDetent, dragValue, keyValue, pointerAngle, polar, scaleMarks, valueToAngle } from './knob-model.mjs';

// The volume knob: fluted bakelite on a brass skirt with the 0-10 scale engraved in it and a red
// index riding where it is set (DEsk's cc_face_knob, https://github.com/fyzugx/DEsk, MIT,
// (c) 2026 The DEsk authors). The element is a real slider: arrow keys (Shift / Page for bigger
// steps), Home / End, the mouse wheel, dragging round it, and a press that does not move mutes.
// `value` is the perceptual slider position the player already uses. A click is heard on each of
// the eleven marks, never on every frame.
const MARKS = scaleMarks();
const FLUTES = Array.from({ length: 28 }, (_, i) => i * 360 / 28);

export default function Knob({ value, onChange, onPress, label = '音乐音量', valueText, size = 'lg', legend = '', className = '', disabled = false, keyshortcuts }) {
  const id = useId().replace(/:/g, ''), node = useRef(null), latest = useRef({ value, onChange }); latest.current = { value, onChange };
  const grab = useRef(null);
  const percent = volumePercent(value), angle = valueToAngle(value);
  const set = (next) => {
    const { value: now, onChange: change } = latest.current;
    const rounded = Math.round(Math.max(0, Math.min(1, next)) * 100) / 100;
    if (rounded === Math.round(now * 100) / 100) return;
    if (crossedDetent(now, rounded)) playSfx('knob-tick');
    change?.(rounded);
  };
  // The wheel needs a non-passive listener, or the page scrolls under the knob.
  useEffect(() => {
    const el = node.current; if (!el) return;
    const wheel = (event) => { event.preventDefault(); set(wheelVolume(latest.current.value, event.deltaY)); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const centre = () => { const r = node.current.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const down = (event) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const c = centre(); grab.current = { angle: pointerAngle(c.x, c.y, event.clientX, event.clientY), x: event.clientX, y: event.clientY, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
  };
  const move = (event) => {
    const g = grab.current; if (!g) return;
    if (!g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 4) return;
    g.moved = true;
    const c = centre(), a = pointerAngle(c.x, c.y, event.clientX, event.clientY);
    set(dragValue(latest.current.value, g.angle, a)); g.angle = a;
  };
  const up = (event) => {
    const g = grab.current; grab.current = null; if (!g) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (!g.moved && event.type === 'pointerup') onPress?.();
  };
  const keys = (event) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.key === 'Enter' || event.key === ' ') && onPress) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onPress(); return; }
    const next = keyValue(latest.current.value, event.key, event.shiftKey ? .1 : undefined);
    if (next === null) return;
    // The player's own shortcuts seek with the arrow keys: a focused knob keeps them for itself.
    event.preventDefault(); event.stopPropagation(); set(next);
  };
  const ticks = MARKS.map((m) => { const a = polar(0, 0, m.major ? 64.5 : 67.2, m.deg), b = polar(0, 0, 72.2, m.deg), t = polar(0, 0, 82, m.deg); return { ...m, a, b, t }; });
  const hand = polar(0, 0, 50, 0);
  return <div ref={node} className={`c-knob is-${size}${disabled ? ' is-disabled' : ''} ${className}`} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={valueText || `${percent}%`} aria-orientation="horizontal" aria-keyshortcuts={keyshortcuts} aria-disabled={disabled || undefined}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys} onDoubleClick={(event) => event.preventDefault()}>
    <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-brass`} cx=".38" cy=".3" r=".9"><stop offset="0" stopColor="#e6d29a"/><stop offset=".45" stopColor="#b8924a"/><stop offset="1" stopColor="#6e5126"/></radialGradient>
        <radialGradient id={`${id}-bake`} cx=".4" cy=".32" r=".85"><stop offset="0" stopColor="#4a3f35"/><stop offset=".55" stopColor="#1c1612"/><stop offset="1" stopColor="#0b0806"/></radialGradient>
        <radialGradient id={`${id}-shine`} cx=".34" cy=".26" r=".55"><stop offset="0" stopColor="#fff" stopOpacity=".34"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
      </defs>
      <circle className="c-knob-well" r="98"/>
      <circle r="92" fill={`url(#${id}-brass)`}/>
      <circle className="c-knob-rim" r="92"/>
      <g className="c-knob-scale">
        {ticks.map((m) => <line key={m.i} className={m.major ? 'is-major' : ''} x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y}/>)}
        {ticks.filter((m) => m.label).map((m) => <text key={`n${m.i}`} className="c-knob-num" x={m.t.x} y={m.t.y + 4.4} textAnchor="middle">{m.label}</text>)}
      </g>
      <circle className="c-knob-cast" r="53"/>
      <g style={{ transform: `rotate(${angle}deg)` }} className="c-knob-turn">
        <circle r="52" fill={`url(#${id}-bake)`}/>
        {FLUTES.map((a) => <line key={a} className="c-knob-flute" x1="0" y1="-38" x2="0" y2="-51" transform={`rotate(${a})`}/>)}
        <circle className="c-knob-top" r="37"/>
        <line className="c-knob-pointer" x1="0" y1="-12" x2={hand.x} y2={hand.y + 2}/>
        <polygon className="c-knob-index" points="0,-65 -7,-54 7,-54"/>
      </g>
      <circle r="52" fill={`url(#${id}-shine)`} pointerEvents="none"/>
    </svg>
    {legend && <span className="c-knob-legend">{legend}</span>}
  </div>;
}
