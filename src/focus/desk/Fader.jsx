import React from 'react';
import { playSfx } from '../../props/sfx.mjs';

// One channel of the mixer, printed on the sheet: the channel's name, an ink rule with a pencil mark
// for the level, and the level as a number. The control is the native range input, so it keeps
// role=slider, the arrow / Home / End / PageUp keys and touch dragging; each tenth clicks like a knob.
export const FADER_TICKS = 10;

export default function Fader({ label, name, value, onChange, tone = '' }) {
  const lastTick = React.useRef(-1);
  const change = (event) => {
    const next = Number(event.target.value), tick = Math.round(next * FADER_TICKS);
    if (tick !== lastTick.current) { lastTick.current = tick; playSfx('knob-tick'); }
    onChange(next);
  };
  return <label className={`sound-fader ${tone}`} style={{ '--level': value }}>
    <span className="fader-name">{label}</span>
    <input className="fader-input" type="range" min="0" max="1" step=".01" aria-label={name || `${label}音量`} aria-valuetext={`${Math.round(value * 100)}%`} value={value} onChange={change}/>
    <span className="fader-value" aria-hidden="true">{Math.round(value * 100)}</span>
  </label>;
}
