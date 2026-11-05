import React from 'react';
import { LedGlass, LedDigits } from '../../props/Led';
import { playSfx } from '../../props/sfx.mjs';

// One channel strip of the mixing desk: a little red readout, a vertical fader in a brass slot with
// an engraved scale, and the channel's name. The fader is the native range input (turned upright),
// so it keeps role=slider, the arrow / Home / End / PageUp keys and touch dragging.
const readout = (value) => String(Math.round(value * 100)).padStart(3, ' ');
export const FADER_TICKS = 10;

export default function Fader({ label, name, value, onChange, tone = '' }) {
  const lastTick = React.useRef(-1);
  const change = (event) => {
    const next = Number(event.target.value), tick = Math.round(next * FADER_TICKS);
    if (tick !== lastTick.current) { lastTick.current = tick; playSfx('knob-tick'); }
    onChange(next);
  };
  return <label className={`sound-slider sound-fader ${tone}`} style={{ '--level': value }}>
    <LedGlass className="fader-led" width={52} height={28}><LedDigits text={readout(value)} x={4} y={4} w={12} h={20} gap={3} colon={false}/></LedGlass>
    <span className="fader-rail">
      <span className="fader-scale" aria-hidden="true"/>
      <input className="fader-input" type="range" min="0" max="1" step=".01" aria-label={name || `${label}音量`} aria-valuetext={`${Math.round(value * 100)}%`} value={value} onChange={change}/>
    </span>
    <span className="fader-name">{label}</span>
  </label>;
}
