import React, { useEffect, useMemo, useRef } from 'react';
import { playSfx } from '../props/sfx.mjs';
import { detectEnv } from '../onboarding/onboarding-model.mjs';
import { createPlayerAdapter } from '../onboarding/onboarding-adapter.mjs';
import useSourceStatus from '../onboarding/useSourceStatus';
import { desktopCommand } from '../desktop-client';
import { musicRequest } from '../room-playback.mjs';
import { dialAngle, nextSource, sourceDial } from './source-model.mjs';

// The rotary source selector: a bakelite switch with a pointer, and the positions engraved beside
// it, each with its lamp. Only the sources that exist now have a position; the ones this device
// cannot use are there but dark, with the same reason Settings › 音源 gives. The engraved legends
// are the real radio group (arrow keys move round it, as in Settings); the knob is the same thing
// under the thumb: click or wheel to turn to the next position. The positions' status (connected,
// logged in) comes from the same adapter Settings reads.
export default function SourceDial({ provider, choose, openSettings }) {
  const env = useMemo(() => detectEnv(window), []);
  const adapter = useMemo(() => createPlayerAdapter({ env, command: desktopCommand, request: musicRequest }), [env]);
  const { status } = useSourceStatus(adapter, env);
  const rows = useMemo(() => sourceDial(env, provider, status), [env, provider, status]);
  const group = useRef(null), knob = useRef(null);
  const index = Math.max(0, rows.findIndex((row) => row.on)), angle = dialAngle(index, rows.length);
  const turn = (id) => { if (!id || id === provider) return; playSfx('toggle'); choose(id); };
  const go = (direction) => turn(nextSource(rows, provider, direction));
  useEffect(() => {
    const el = knob.current; if (!el) return;
    const wheel = (event) => { event.preventDefault(); go(event.deltaY > 0 ? 1 : -1); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  const keys = (event) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]; if (!dir) return;
    event.preventDefault(); event.stopPropagation();
    const id = nextSource(rows, provider, dir); turn(id);
    requestAnimationFrame(() => group.current?.querySelector(`[data-source="${id}"]`)?.focus());
  };
  const tabbable = rows.some((row) => row.on) ? provider : 'visual';
  return <div className="c-dial">
    <div ref={knob} className="c-dial-knob" aria-hidden="true" onClick={() => go(1)}>
      <svg viewBox="-58 -58 116 116" focusable="false">
        {rows.map((row, i) => { const a = dialAngle(i, rows.length) * Math.PI / 180; return <circle key={row.id} className={`c-dial-dot${row.available ? '' : ' is-dead'}${row.on ? ' is-on' : ''}`} cx={Math.sin(a) * 52} cy={-Math.cos(a) * 52} r={row.on ? 3.6 : 2.6}/>; })}
        <circle className="c-dial-base" r="43"/>
        <g className="c-dial-turn" style={{ transform: `rotate(${angle}deg)` }}>
          <circle className="c-dial-cap" r="36"/>
          {Array.from({ length: 20 }, (_, i) => <line key={i} className="c-dial-flute" x1="0" y1="-27" x2="0" y2="-35" transform={`rotate(${i * 18})`}/>)}
          <polygon className="c-dial-pointer" points="0,-34 -5,-12 5,-12"/>
        </g>
        <circle className="c-dial-shine" r="36"/>
      </svg>
    </div>
    <div ref={group} className="c-dial-legend" role="radiogroup" aria-label="唱机音源" onKeyDown={keys}>
      {rows.map((row) => <button key={row.id} type="button" role="radio" data-source={row.id} aria-checked={row.on} tabIndex={row.id === tabbable ? 0 : -1} disabled={!row.available} aria-label={row.label} title={row.available ? row.hint : row.reason} className={row.on ? 'is-on' : ''} onClick={() => turn(row.id)}>
        <i className={`c-dial-lamp${row.available && (row.on || row.connected) ? ' is-lit' : ''}`} aria-hidden="true"/><span aria-hidden="true">{row.short}</span>
      </button>)}
    </div>
    {openSettings && <button type="button" className="c-plate c-dial-settings" onClick={openSettings} title="登录账号、选择文件夹、更换音质">音源设置</button>}
  </div>;
}
