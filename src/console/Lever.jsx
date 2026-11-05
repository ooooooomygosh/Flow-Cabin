import React from 'react';
import { playSfx } from '../props/sfx.mjs';

// A toggle lever in a dark plate with a lamp above it (the Wireless / Bluetooth switches of
// DEsk's control panel, https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors). Still one
// real <button>: pass aria-label and aria-pressed as before. `position` -1 down, 1 up (default
// from `on`); `state` is the small word engraved under the legend (顺序 / 整张 / 单曲).
export default function Lever({ on, position, legend, state, lamp = 'amber', onClick, className = '', ...rest }) {
  const place = position ?? (on ? 1 : -1);
  return <button type="button" className={`c-lever is-${lamp}${on ? ' is-on' : ''} ${className}`} data-position={place} {...rest}
    onClick={(event) => { playSfx('toggle'); onClick?.(event); }}>
    <i className="c-lever-lamp" aria-hidden="true"/>
    <span className="c-lever-plate" aria-hidden="true"><span className="c-lever-slot"/><span className="c-lever-stick"/></span>
    <span className="c-lever-legend" aria-hidden="true"><b>{legend}</b>{state && <small>{state}</small>}</span>
  </button>;
}
