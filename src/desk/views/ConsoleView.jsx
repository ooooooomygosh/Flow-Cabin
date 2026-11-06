import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCabinRuntime } from '../../runtime/CabinRuntime';
import useLabs from '../../product/useLabs';
import useBackLayer from '../../ui/useBackLayer';
import { playSfx } from '../../props/sfx.mjs';
import { QueuePanel, TrackPicker } from '../../player/PlayerControls';
import { deckCapabilities, providerLabel } from '../../player/providers.mjs';
import { volumePercent, wheelVolume } from '../../player/volume-curve.mjs';
import { PLAYBACK_EVENT, estimatedEnergy } from '../../player/playback-signal.mjs';
import { usePlaybackDuration, usePlaybackPosition } from '../../deck/usePlaybackClock';
import { trackNames } from '../../room-model.mjs';
import { trackArtist, trackAlbum } from '../../track-meta.mjs';
import { displayTitle } from '../../display-title.mjs';
import { formatSeconds } from '../../lib/time-format.mjs';
import { ariaKeys } from '../../shortcuts.mjs';
import { onReducedMotionChange } from '../../motion-preference.mjs';
import { inBackground } from '../../frame-clock.mjs';
import { useLyricLine } from '../../listen/listen-hooks';
import { needleStep, needleSettled, peakStep, targetFor } from '../../console/vu-model.mjs';
import { valueToAngle, pointerAngle, dragValue, crossedDetent, keyValue } from '../../console/knob-model.mjs';
import { sourceDial, nextSource } from '../../console/source-model.mjs';
import { detectEnv } from '../../onboarding/onboarding-model.mjs';
import { createPlayerAdapter } from '../../onboarding/onboarding-adapter.mjs';
import useSourceStatus from '../../onboarding/useSourceStatus';
import { desktopCommand } from '../../desktop-client';
import { musicRequest } from '../../room-playback.mjs';
import { deskUrl } from '../images.mjs';
import { CV, BUTTONS, FADERS, LEVERS, REPEAT_LABEL, REPEAT_SHORT, consoleState, crtLines, needleTip, meterScale, faderX, faderValue, faderKey, captionArc } from './console-model.mjs';
import useDeskLamp from '../useDeskLamp';
import './console-view.css';

// The record player's console is DEsk's Control Panel (https://github.com/fyzugx/DEsk, MIT, (c) 2026
// The DEsk authors): its picture with DEsk's printing and moving parts taken off
// (scripts/desk-plates.py › console-base.webp), and over it, drawn the way DEsk draws them
// (draw.c cc_face_crt, cc_needle, cc_face_knob, cc_face_switch, cc_face_fader, cc_lamp), the
// record player: the tube says what is playing, the meters read the music, the knob is its volume,
// the levers 随机 and 循环, the faders the desk lamp and the ambience, the four push buttons 待播 /
// 上一首 / 播放 / 下一首, the key the source, and the front plate takes you back down to the desk.
// Every control is a real button, switch or slider over the picture, named in Chinese.
const P = 1440, Q = 900;
const at = (x, y, w, h) => ({ left: `${x / P * 100}%`, top: `${y / Q * 100}%`, width: `${w / P * 100}%`, height: `${h / Q * 100}%` });
const two = (index) => String(index + 1).padStart(2, '0');
const QUALITY = /(\d{2,4}\s?k(?:bps)?(?:\s?(?:MP3|AAC|OGG))?|Hi-?Res|FLAC|无损)/i;
const statusNode = (text) => { const m = typeof text === 'string' && QUALITY.exec(text); return m ? <>{text.slice(0, m.index)}<b>{m[0]}</b>{text.slice(m.index + m[0].length)}</> : text; };
const openCorner = () => window.dispatchEvent(new Event('cabin-open-corner'));
const openMusicSettings = () => window.dispatchEvent(new Event('cabin-open-music-settings'));

// ----- the tube -----
const F = { x: CV.crt.cx - CV.crt.rx, y: CV.crt.cy - CV.crt.ry, w: CV.crt.rx * 2, h: CV.crt.ry * 2 };
const TRACE = { n: 48, x0: F.x + F.w * .12, x1: F.x + F.w * .88, base: F.y + F.h * .62, amp: F.h * .2 };
const tracePoints = (trace) => trace.map((v, i) => `${(TRACE.x0 + (TRACE.x1 - TRACE.x0) * i / (trace.length - 1)).toFixed(1)},${(TRACE.base - TRACE.amp * v).toFixed(1)}`).join(' ');
const BAR = { x0: CV.crt.cx - 80, x1: CV.crt.cx + 80, y: F.y + F.h * .795 };

// The meters and the tube's trace move with the music (`cabin:playback`, ~15 Hz), on DEsk's spring,
// written straight to the SVG: React draws them once.
function useLiveLevels(playing, refs) {
  const live = useRef(playing); live.current = playing;
  const wakeRef = useRef(null);
  useEffect(() => {
    let reduced = false, target = 0, peak = 0, raf = 0, last = 0, lastEvent = 0, traceAt = 0;
    const needles = [{ pos: 0, vel: 0 }, { pos: 0, vel: 0 }], shown = [NaN, NaN];
    const trace = Array.from({ length: TRACE.n }, () => 0);
    const unreduce = onReducedMotionChange((v) => { reduced = v; });
    const frame = (now) => {
      raf = 0;
      const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60; last = now;
      const on = live.current, silent = Date.now() - lastEvent > 1200;
      const energy = on ? (silent ? estimatedEnergy(Date.now()) : target) : 0;
      if (!on) peak = 0;
      const goals = [targetFor(energy), targetFor((peak = peakStep(peak, energy, dt)))];
      let settled = true;
      for (let i = 0; i < 2; i++) {
        needles[i] = needleStep(needles[i], goals[i], dt, { reduced });
        settled &&= needleSettled(needles[i], goals[i]);
        const meter = i ? CV.meterR : CV.meterL, deg = needleTip(meter, needles[i].pos).deg;
        if (Math.abs(deg - shown[i]) > .04 || Number.isNaN(shown[i])) { shown[i] = deg; refs.needles[i].current?.setAttribute('transform', `rotate(${deg.toFixed(2)} ${meter.pivot[0]} ${meter.pivot[1]})`); }
      }
      if (now - traceAt > 90) {
        traceAt = now; trace.shift();
        trace.push(Math.max(0, Math.min(1, (on ? energy * .9 : 0) + (Math.random() - .5) * .02)));
        refs.trace.forEach((r) => r.current?.setAttribute('points', tracePoints(trace)));
        refs.spot.current?.setAttribute('cy', (TRACE.base - TRACE.amp * trace.at(-1)).toFixed(1));
      }
      if (!settled || (on && !reduced) || trace.some((v) => v > .015)) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !document.hidden && !inBackground()) { last = 0; raf = requestAnimationFrame(frame); } };
    const receive = (event) => { const d = event?.detail || {}, e = Number(d.energy); lastEvent = Date.now(); target = d.playing ? (Number.isFinite(e) ? e : .5) : 0; wake(); };
    window.addEventListener(PLAYBACK_EVENT, receive);
    document.addEventListener('visibilitychange', wake);
    wakeRef.current = wake; wake();
    return () => { window.removeEventListener(PLAYBACK_EVENT, receive); document.removeEventListener('visibilitychange', wake); unreduce(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { wakeRef.current?.(); }, [playing]);
}

function Tube({ lines, warm, refs, ids }) {
  const { cx, cy, rx, ry } = CV.crt;
  const flat = tracePoints(Array.from({ length: TRACE.n }, () => 0));
  return <g className={`console-crt-face${warm ? ' is-warm' : ''}`} clipPath={`url(#${ids}-tube)`}>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgb(3, 5, 4)"/>
    <g className="console-crt-phosphor">
      <ellipse cx={cx} cy={cy * 1.004} rx={rx} ry={ry} fill={`url(#${ids}-glow)`}/>
      <g className="console-crt-grat">
        {Array.from({ length: 7 }, (_, i) => <React.Fragment key={i}>
          <line x1={F.x + F.w * (i + 1) / 8} y1={F.y} x2={F.x + F.w * (i + 1) / 8} y2={F.y + F.h}/>
          <line x1={F.x} y1={F.y + F.h * (i + 1) / 8} x2={F.x + F.w} y2={F.y + F.h * (i + 1) / 8}/>
        </React.Fragment>)}
      </g>
      <polyline ref={refs.trace[0]} className="console-crt-trace is-halo" points={flat}/>
      <polyline ref={refs.trace[1]} className="console-crt-trace is-soft" points={flat}/>
      <polyline ref={refs.trace[2]} className="console-crt-trace is-core" points={flat}/>
      <circle ref={refs.spot} className="console-crt-spot" cx={TRACE.x1} cy={TRACE.base} r={F.h * .07} fill={`url(#${ids}-spot)`}/>
      <g filter={`url(#${ids}-bloom)`} className="console-crt-text">
        <text className="console-crt-head" x={cx} y={F.y + F.h * .235} textAnchor="middle">{lines.head}</text>
        <text className="console-crt-sub" x={cx} y={F.y + F.h * .335} textAnchor="middle">{lines.sub}</text>
        <text className="console-crt-line" x={cx} y={F.y + F.h * .735} textAnchor="middle">{lines.line}</text>
        <text className="console-crt-foot" x={cx} y={F.y + F.h * .875} textAnchor="middle">{lines.foot}</text>
        {lines.progress !== null && <>
          <line className="console-crt-bar" x1={BAR.x0} y1={BAR.y} x2={BAR.x1} y2={BAR.y}/>
          <line className="console-crt-bar is-lit" x1={BAR.x0} y1={BAR.y} x2={BAR.x0 + (BAR.x1 - BAR.x0) * lines.progress} y2={BAR.y}/>
          <circle className="console-crt-head-dot" cx={BAR.x0 + (BAR.x1 - BAR.x0) * lines.progress} cy={BAR.y} r="2.6"/>
        </>}
      </g>
    </g>
    <rect x={F.x} y={F.y} width={F.w} height={F.h} fill={`url(#${ids}-comb)`}/>
    <rect className="console-crt-hum" x={F.x} y={F.y} width={F.w} height={F.h * .36} fill={`url(#${ids}-hum)`}/>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${ids}-vig)`}/>
    <rect x={F.x} y={F.y} width={F.w} height={F.h} fill={`url(#${ids}-sheen)`}/>
  </g>;
}

function Defs({ ids }) {
  const { cx, cy, rx, ry } = CV.crt;
  return <defs>
    <clipPath id={`${ids}-tube`}><ellipse cx={cx} cy={cy} rx={rx + 1} ry={ry + 1}/></clipPath>
    <radialGradient id={`${ids}-glow`}><stop offset="0" stopColor="rgb(22, 77, 36)" stopOpacity=".62"/><stop offset=".55" stopColor="rgb(13, 46, 21)" stopOpacity=".34"/><stop offset="1" stopColor="rgb(5, 18, 9)" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${ids}-spot`}><stop offset="0" stopColor="rgb(240, 255, 240)" stopOpacity=".95"/><stop offset=".22" stopColor="rgb(117, 255, 133)" stopOpacity=".42"/><stop offset="1" stopColor="rgb(51, 219, 71)" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${ids}-vig`}><stop offset=".1" stopColor="#000" stopOpacity="0"/><stop offset=".62" stopColor="#000" stopOpacity=".22"/><stop offset="1" stopColor="#000" stopOpacity=".8"/></radialGradient>
    <linearGradient id={`${ids}-sheen`} x1="0" y1="0" x2=".62" y2=".86"><stop offset="0" stopColor="#fff" stopOpacity=".07"/><stop offset=".3" stopColor="#fff" stopOpacity=".018"/><stop offset=".62" stopColor="#fff" stopOpacity="0"/></linearGradient>
    <linearGradient id={`${ids}-hum`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(179, 255, 194)" stopOpacity="0"/><stop offset=".5" stopColor="rgb(179, 255, 194)" stopOpacity=".035"/><stop offset="1" stopColor="rgb(179, 255, 194)" stopOpacity="0"/></linearGradient>
    <pattern id={`${ids}-comb`} width="8" height="5.2" patternUnits="userSpaceOnUse"><rect width="8" height="2.5" fill="rgb(0, 3, 0)" fillOpacity=".36"/></pattern>
    <filter id={`${ids}-bloom`} x="-10%" y="-30%" width="120%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="halo"/>
      <feColorMatrix in="halo" type="matrix" values="0 0 0 0 .26  0 0 0 0 .92  0 0 0 0 .34  0 0 0 .8 0" result="green"/>
      <feMerge><feMergeNode in="green"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id={`${ids}-lamp-amber`}><stop offset="0" stopColor="rgb(255, 255, 245)" stopOpacity=".92"/><stop offset=".18" stopColor="rgb(255, 158, 46)" stopOpacity=".9"/><stop offset=".46" stopColor="rgb(255, 158, 46)" stopOpacity=".3"/><stop offset="1" stopColor="rgb(255, 158, 46)" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${ids}-lamp-blue`}><stop offset="0" stopColor="rgb(245, 250, 255)" stopOpacity=".92"/><stop offset=".18" stopColor="rgb(77, 122, 255)" stopOpacity=".9"/><stop offset=".46" stopColor="rgb(77, 122, 255)" stopOpacity=".3"/><stop offset="1" stopColor="rgb(77, 122, 255)" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${ids}-lamp-green`}><stop offset="0" stopColor="rgb(245, 255, 245)" stopOpacity=".92"/><stop offset=".18" stopColor="rgb(66, 255, 92)" stopOpacity=".9"/><stop offset=".46" stopColor="rgb(66, 255, 92)" stopOpacity=".3"/><stop offset="1" stopColor="rgb(66, 255, 92)" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${ids}-lamp-red`}><stop offset="0" stopColor="rgb(255, 245, 240)" stopOpacity=".92"/><stop offset=".18" stopColor="rgb(255, 56, 41)" stopOpacity=".9"/><stop offset=".46" stopColor="rgb(255, 56, 41)" stopOpacity=".3"/><stop offset="1" stopColor="rgb(255, 56, 41)" stopOpacity="0"/></radialGradient>
    <linearGradient id={`${ids}-index`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(237, 73, 46)"/><stop offset=".45" stopColor="rgb(194, 25, 16)"/><stop offset="1" stopColor="rgb(131, 12, 8)"/></linearGradient>
    {['meterL', 'meterR'].map((key) => { const [x, y, w, h] = CV[key].win; return <clipPath key={key} id={`${ids}-${key}`}><rect x={x} y={y} width={w} height={h}/></clipPath>; })}
  </defs>;
}

// A lamp: DEsk's cc_lamp, a bloom over the lens where the picture has it.
const Lamp = ({ x, y, r, tone, on, ids }) => <circle className={`console-lamp${on ? ' is-on' : ''}`} cx={x} cy={y} r={r * 2.8} fill={`url(#${ids}-lamp-${tone})`}/>;

function Meters({ refs, state, ids }) {
  const L = CV.meterL, R = CV.meterR;
  const card = (meter, legend, word, clip) => {
    const [fx, fy, fw, fh] = meter.face;
    return <g clipPath={`url(#${ids}-${clip})`}>
      <g className="console-meter-scale">{meterScale(meter, meter.len * (meter.kind === 'net' ? 1.1 : 1.02)).map((t) => <line key={t.i} className={t.long ? 'is-long' : ''} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y}/>)}</g>
      <text className="console-meter-legend" x={fx + fw / 2} y={fy + fh * (meter.kind === 'net' ? .26 : .3)} textAnchor="middle">{legend}</text>
      {word && <text className="console-meter-word" x={fx + fw / 2} y={fy + fh * .7} textAnchor="middle">{word}</text>}
    </g>;
  };
  const needle = (meter, ref, red, clip) => <g clipPath={`url(#${ids}-${clip})`}>
    <g ref={ref} transform={`rotate(${needleTip(meter, 0).deg} ${meter.pivot[0]} ${meter.pivot[1]})`}>
      <line className="console-needle-shadow" x1={meter.pivot[0] + 1.2} y1={meter.pivot[1] + 1.6} x2={meter.pivot[0] + 1.2} y2={meter.pivot[1] - meter.len + 1.6} strokeWidth={meter.len * .07}/>
      <line className={`console-needle${red ? ' is-red' : ''}`} x1={meter.pivot[0]} y1={meter.pivot[1]} x2={meter.pivot[0]} y2={meter.pivot[1] - meter.len} strokeWidth={meter.len * .055}/>
    </g>
    <circle className="console-needle-hub" cx={meter.pivot[0]} cy={meter.pivot[1]} r={meter.len * .1}/>
  </g>;
  const [g, r] = R.lamps;
  return <g className="console-meters">
    {card(L, '电平', 'VU', 'meterL')}
    {card(R, '峰值 PEAK', '', 'meterR')}
    <circle className="console-meter-socket" cx={g[0]} cy={g[1]} r={R.lampR}/><circle className="console-meter-socket" cx={r[0]} cy={r[1]} r={R.lampR}/>
    <Lamp x={g[0]} y={g[1]} r={R.lampR * .7} tone="green" on={state.playing && !state.visual && !state.failed} ids={ids}/>
    <Lamp x={r[0]} y={r[1]} r={R.lampR * .7} tone="red" on={Boolean(state.failed)} ids={ids}/>
    {needle(L, refs.needles[0], true, 'meterL')}
    {needle(R, refs.needles[1], false, 'meterR')}
  </g>;
}

// ----- the volume knob: a real slider over DEsk's knob; the pointer and the red index are drawn turned -----
function VolumeKnob({ value, disabled, muted, onChange, onMute, valueText }) {
  const node = useRef(null), grab = useRef(null), latest = useRef({ value, onChange }); latest.current = { value, onChange };
  const set = (next) => {
    const { value: now, onChange: change } = latest.current, rounded = Math.round(Math.max(0, Math.min(1, next)) * 100) / 100;
    if (rounded === Math.round(now * 100) / 100) return;
    if (crossedDetent(now, rounded)) playSfx('knob-tick');
    change?.(rounded);
  };
  useEffect(() => {
    const el = node.current; if (!el) return undefined;
    const wheel = (event) => { event.preventDefault(); if (!el.getAttribute('aria-disabled')) set(wheelVolume(latest.current.value, event.deltaY)); };
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
  const up = (event) => { const g = grab.current; grab.current = null; if (g && !g.moved && event.type === 'pointerup') onMute?.(); };
  const keys = (event) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onMute?.(); return; }
    const next = keyValue(latest.current.value, event.key, event.shiftKey ? .1 : undefined);
    if (next === null) return;
    event.preventDefault(); event.stopPropagation(); set(next);
  };
  const k = CV.knob, s = k.skirt;
  return <div ref={node} className={`console-hit console-knob${disabled ? ' is-disabled' : ''}${muted ? ' is-muted' : ''}`} style={{ ...at(k.cx - s, k.cy - s, s * 2, s * 2) }} role="slider" tabIndex={disabled ? -1 : 0}
    aria-label="音乐音量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={volumePercent(value)} aria-valuetext={valueText} aria-keyshortcuts={ariaKeys('mute')} aria-disabled={disabled || undefined}
    title={disabled ? valueText : '转动、滚轮或方向键调音量 · 按一下静音'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}/>;
}
function KnobPointer({ value, ids, warm }) {
  const k = CV.knob, sx = k.rad * 2, rad = k.rad, a = valueToAngle(value);
  const r0 = .52 * sx, r1 = .64 * sx, hw = .068 * sx;
  return <g className="console-knob-mark" transform={`rotate(${a.toFixed(2)} ${k.cx} ${k.cy})`}>
    <polygon points={`${k.cx + .015 * sx},${k.cy - r1 - .013 * sx} ${k.cx - hw + .015 * sx},${k.cy - r0 - .013 * sx} ${k.cx + hw + .015 * sx},${k.cy - r0 - .013 * sx}`} fill="rgb(20, 4, 3)" fillOpacity=".48"/>
    <polygon points={`${k.cx},${k.cy - r1} ${k.cx - hw},${k.cy - r0} ${k.cx + hw},${k.cy - r0}`} fill={`url(#${ids}-index)`} stroke="rgb(36, 5, 3)" strokeOpacity=".55" strokeWidth={.01 * sx}/>
    <rect x={k.cx - rad * .105} y={k.cy - rad * .92} width={rad * .21} height={rad * .86} fill="rgb(5, 5, 5)" fillOpacity=".85"/>
    <rect x={k.cx - rad * .08} y={k.cy - rad * .89} width={rad * .16} height={rad * .8} fill="rgb(245, 232, 189)" fillOpacity={.94 * (.35 + .65 * (warm ? 1 : .4))}/>
  </g>;
}

// ----- a lever: DEsk's two levers, cut from its picture, thrown one way or the other -----
function Lever({ lever, on, label, legend, title, disabled, onClick, keyshortcuts }) {
  const [x, y, w, h] = lever.plate;
  return <button type="button" role="switch" aria-checked={on} aria-label={label} title={title} aria-keyshortcuts={keyshortcuts} disabled={disabled} className={`console-hit console-lever${on ? ' is-on' : ''}`} style={at(x, y - 26, w, h + 26)}
    onClick={() => { playSfx('toggle'); onClick(); }}><span className="sr-only">{legend}</span></button>;
}
function LeverFace({ lever, on, onWord, offWord, legend, tone, ids, dim }) {
  const [tw, th] = CV.leverTile;
  return <g className={`console-lever-face${dim ? ' is-dim' : ''}`}>
    <image href={deskUrl('console-lever-off.webp')} x={lever.tile[0]} y={lever.tile[1]} width={tw} height={th} className={`console-lever-sprite${on ? '' : ' is-shown'}`}/>
    <image href={deskUrl('console-lever-on.webp')} x={lever.tile[0]} y={lever.tile[1]} width={tw} height={th} className={`console-lever-sprite${on ? ' is-shown' : ''}`}/>
    <text className={`console-legend is-small${on ? ' is-lit' : ''}`} x={lever.on[0]} y={lever.on[1] + 5} textAnchor="middle">{onWord}</text>
    <text className={`console-legend is-small${on ? '' : ' is-lit'}`} x={lever.off[0]} y={lever.off[1] + 5} textAnchor="middle">{offWord}</text>
    <text className="console-legend" x={lever.legend[0]} y={lever.legend[1] + 6} textAnchor="middle">{legend}</text>
    <Lamp x={lever.lamp[0]} y={lever.lamp[1]} r={lever.lampR} tone={tone} on={on && !dim} ids={ids}/>
  </g>;
}

// ----- a fader: the handle cut from DEsk's picture, slid along the slot -----
function Fader({ fader, value, label, valueText, onChange, disabled }) {
  const node = useRef(null), latest = useRef({ value, onChange }); latest.current = { value, onChange };
  const [x, y, w, h] = fader.plate;
  const toValue = (clientX) => { const r = node.current.getBoundingClientRect(); return faderValue(fader, x + (clientX - r.left) / r.width * w); };
  const set = (v) => { const r = Math.round(v * 100) / 100; if (r === Math.round(latest.current.value * 100) / 100) return; if (Math.round(r * 10) !== Math.round(latest.current.value * 10)) playSfx('knob-tick'); latest.current.onChange(r); };
  useEffect(() => {
    const el = node.current; if (!el) return undefined;
    const wheel = (event) => { event.preventDefault(); set(latest.current.value + (event.deltaY < 0 ? .05 : -.05)); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const drag = useRef(false);
  return <div ref={node} className="console-hit console-fader" style={at(x, y, w, h)} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={valueText} aria-orientation="horizontal" aria-disabled={disabled || undefined}
    onPointerDown={(event) => { if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return; drag.current = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not capturable */ } set(toValue(event.clientX)); }}
    onPointerMove={(event) => { if (drag.current) set(toValue(event.clientX)); }}
    onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
    onKeyDown={(event) => { const next = faderKey(latest.current.value, event.key, event.shiftKey ? .1 : .05); if (next === null || disabled) return; event.preventDefault(); event.stopPropagation(); set(next); }}/>;
}
function FaderFace({ fader, value, legend }) {
  const [hw, hh] = CV.handle, x = faderX(fader, value);
  return <g className="console-fader-face">
    <rect className="console-fader-shadow" x={x - hw / 2 - 27} y={fader.y - 1} width={27} height={hh - 6}/>
    <image href={deskUrl('console-handle.webp')} x={x - hw / 2} y={fader.y} width={hw} height={hh} className="console-fader-handle"/>
    <text className="console-legend" x={fader.legend[0]} y={fader.legend[1] + 6} textAnchor="middle">{legend}</text>
  </g>;
}

// ----- a push button: DEsk's, pressed in, its caption round the bottom of its ring -----
function ButtonFace({ button, pressed, lit, ids }) {
  const [cx, cy, r] = button.at;
  return <g className={`console-button-face${pressed ? ' is-pressed' : ''}${lit ? ' is-lit' : ''}`}>
    <circle className="console-button-press" cx={cx} cy={cy} r={r - 12}/>
    <path id={`${ids}-cap-${button.id}`} d={captionArc(cx, cy, r - 7, .9)} fill="none"/>
    <text className="console-caption is-lip"><textPath href={`#${ids}-cap-${button.id}`} startOffset="50%" textAnchor="middle">{button.caption}</textPath></text>
    <text className="console-caption"><textPath href={`#${ids}-cap-${button.id}`} startOffset="50%" textAnchor="middle">{button.caption}</textPath></text>
    <circle className="console-button-glow" cx={cx} cy={cy} r={r - 16}/>
  </g>;
}
function PushButton({ button, label, title, disabled, onClick, expanded, keyshortcuts, press, children }) {
  const [cx, cy, r] = button.at;
  return <button type="button" className={`console-hit console-button is-${button.id}`} style={at(cx - r, cy - r, r * 2, r * 2)} aria-label={label} title={title} disabled={disabled} aria-expanded={expanded} aria-keyshortcuts={keyshortcuts}
    onPointerDown={() => press(button.id, true)} onPointerUp={() => press(button.id, false)} onPointerLeave={() => press(button.id, false)}
    onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') press(button.id, true); }} onKeyUp={() => press(button.id, false)}
    onClick={() => { playSfx('power-press'); onClick(); }}>{children}</button>;
}

// ----- the key: 音源. Turning it opens a card of the sources, the same rows Settings › 音源 has -----
function SourceCard({ provider, choose, close }) {
  const env = useMemo(() => detectEnv(window), []);
  const adapter = useMemo(() => createPlayerAdapter({ env, command: desktopCommand, request: musicRequest }), [env]);
  const { status } = useSourceStatus(adapter, env);
  const rows = useMemo(() => sourceDial(env, provider, status), [env, provider, status]);
  const group = useRef(null);
  useBackLayer(true, close, 'console-source');
  useEffect(() => { group.current?.querySelector('[aria-checked=true]')?.focus({ preventScroll: true }); }, []);
  const turn = (id) => { if (!id || id === provider) return; playSfx('lock-clunk'); choose(id); };
  const keys = (event) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]; if (!dir) return;
    event.preventDefault(); event.stopPropagation();
    const id = nextSource(rows, provider, dir); turn(id);
    requestAnimationFrame(() => group.current?.querySelector(`[data-source="${id}"]`)?.focus());
  };
  const tabbable = rows.some((row) => row.on) ? provider : 'visual';
  return <div className="console-card console-source-card" role="group" aria-label="音源">
    <p className="console-card-title">音源 · 钥匙转到哪里，唱机就从哪里出声</p>
    <div ref={group} className="console-source-rows" role="radiogroup" aria-label="唱机音源" onKeyDown={keys}>
      {rows.map((row) => <button key={row.id} type="button" role="radio" data-source={row.id} aria-checked={row.on} tabIndex={row.id === tabbable ? 0 : -1} disabled={!row.available} aria-label={row.label} title={row.available ? row.hint : row.reason} className={row.on ? 'is-on' : ''} onClick={() => turn(row.id)}>
        <i className={`console-card-lamp${row.available && (row.on || row.connected) ? ' is-lit' : ''}`} aria-hidden="true"/><span aria-hidden="true">{row.short}</span>{!row.available && <small aria-hidden="true">{row.reason}</small>}
      </button>)}
    </div>
    <div className="console-card-foot">
      <button type="button" className="console-type-key" onClick={() => { close(); openMusicSettings(); }}>音源设置</button>
      <button type="button" className="console-type-key" onClick={close}>收起</button>
    </div>
  </div>;
}

// ----- the progress under the tube: a real control over the phosphor bar -----
function TubeSeek({ playback, seekable, onPosition }) {
  const duration = usePlaybackDuration(playback), playhead = usePlaybackPosition(playback, .25);
  const [scrub, setScrub] = useState(null), pending = useRef(null), input = useRef(null);
  const commit = () => { const value = pending.current; pending.current = null; setScrub(null); if (value !== null) playback?.seek(value); };
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => { const el = input.current, change = () => commitRef.current(); el?.addEventListener('change', change); return () => el?.removeEventListener('change', change); }, []);
  const position = Math.min(scrub ?? playhead, duration || 1);
  useEffect(() => { onPosition(position, duration); }, [position, duration]);
  const text = `${formatSeconds(position)} / ${formatSeconds(duration)}`;
  const box = at(BAR.x0 - 6, BAR.y - 9, BAR.x1 - BAR.x0 + 12, 18);
  return seekable
    ? <input ref={input} className="console-hit console-seek" style={box} type="range" data-deck-seek="" aria-label="音乐播放进度" aria-valuetext={text} min="0" max={duration || 1} step=".1" value={position} disabled={!duration}
        onChange={(event) => { pending.current = Number(event.target.value); setScrub(pending.current); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit}/>
    : <span className="console-hit console-seek" style={box} role="progressbar" aria-label="音乐播放进度" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={text} title="这个音源只显示进度，拖动请在它自己的播放器里进行"/>;
}
function SystemSeek({ timeline, onPosition }) {
  const subscribe = useCallback((fn) => { const off = timeline?.subscribe?.(fn) || (() => {}); const timer = setInterval(fn, 500); return () => { off(); clearInterval(timer); }; }, [timeline]);
  const position = useSyncExternalStore(subscribe, () => Math.floor(timeline?.position?.() || 0), () => 0);
  const duration = useSyncExternalStore(subscribe, () => timeline?.getSnapshot?.().duration || 0, () => 0);
  useEffect(() => { onPosition(Math.min(position, duration || position), duration); }, [position, duration]);
  if (!duration) return null;
  const shown = Math.min(position, duration);
  return <span className="console-hit console-seek" style={at(BAR.x0 - 6, BAR.y - 9, BAR.x1 - BAR.x0 + 12, 18)} role="progressbar" aria-label="系统播放进度" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={shown} aria-valuetext={`${formatSeconds(shown)} / ${formatSeconds(duration)}`}/>;
}

export default function ConsoleView({ back, layout, reduced = false }) {
  const phone = Boolean(layout?.phone);
  const { deck, commands, items, sound } = useCabinRuntime(), labs = useLabs();
  const { deckItem: item, provider, playback, player, system } = deck;
  const ids = useId().replace(/:/g, '');
  const state = consoleState({ item, provider, playback, system, spinning: deck.effectiveSpin });
  const caps = deckCapabilities(provider, { remote: playback?.remote });
  const names = trackNames(item), trackIndex = deck.shownTrackIndex;
  const lyric = useLyricLine(Boolean(item) && !state.visual);
  const [time, setTime] = useState({ position: 0, duration: 0 });
  const onPosition = useCallback((position, duration) => setTime((t) => (Math.floor(t.position) === Math.floor(position) && t.duration === duration ? t : { position, duration })), []);
  const trackName = state.follow ? system?.title || '' : playback?.actualTrack || names[trackIndex] || (item ? '暂无曲目信息' : '');
  const artist = state.follow ? system?.artist || '' : item?.type === 'playlist' ? `${trackArtist(item, trackIndex) || '歌单'} · 歌单` : trackArtist(item, trackIndex) || playback?.resolvedArtist || item?.artist || '';
  const album = state.follow ? system?.album || '' : item ? trackAlbum(item, trackIndex) || '' : '';
  const lines = crtLines({ state, item, trackName: displayTitle(trackName), trackIndex, trackCount: state.follow ? 0 : names.length, artist, album, lyric, status: deck.statusText, position: state.visual ? 0 : time.position, duration: state.visual ? 0 : time.duration, shelfEmpty: !items?.length });
  const [warm, setWarm] = useState(reduced);
  useEffect(() => { if (reduced) return undefined; const id = requestAnimationFrame(() => setWarm(true)); playSfx('power-press'); return () => cancelAnimationFrame(id); }, []);
  const refs = { needles: [useRef(null), useRef(null)], trace: [useRef(null), useRef(null), useRef(null)], spot: useRef(null) };
  useLiveLevels(state.playing && !state.visual, refs);
  const [pressed, setPressed] = useState(''), press = (id, down) => setPressed((p) => (down ? id : p === id ? '' : p));
  const [roll, setRoll] = useState(false), [card, setCard] = useState(false);
  useBackLayer(roll, () => setRoll(false), 'console-roll');
  const lamp = useDeskLamp();
  const root = useRef(null), queuePanel = useRef(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);

  // what the controls do
  const reasonFor = (index) => state.audible ? playback.blockedReason?.(item, index) || (index === trackIndex && state.failed ? playback.error : '') : '';
  const volume = playback?.muted ? 0 : playback?.volume ?? 0, canVolume = Boolean(caps.volume && state.audible && item);
  const play = () => {
    if (!item && !(state.follow && system?.active)) { commands.open('library'); return; }
    if (state.follow) { system.control('toggle'); return; }
    if (state.visual) { deck.toggleVisual(); return; }
    if (state.failed) { playback.retry(); return; }
    playback?.toggle();
  };
  const playLabel = !item && !(state.follow && system?.active) ? '播放 · 架子还空着，去唱片架挑一张'
    : state.follow ? (system?.playing ? '暂停系统播放器' : '继续系统播放器')
    : state.visual ? (deck.effectiveSpin ? '暂停唱片旋转' : '继续唱片旋转')
    : state.failed ? '重试这首' : state.playing ? '暂停音乐播放' : '播放音乐';
  const entries = (player?.upNext || []).filter((entry) => entry.kind === 'track' || entry.kind === 'album');
  const ambience = sound ? (sound.enabled ? sound.mix?.master ?? 0 : 0) : 0;
  const setAmbience = (v) => { if (!sound) return; if (v <= .01) { sound.turnOff?.(); return; } sound.setMaster?.(v); if (!sound.enabled) sound.turnOn?.(); };
  const repeat = player?.queue?.repeat || 'off', shuffle = Boolean(player?.queue?.shuffle), levers = Boolean(player && item && !state.follow);
  const k = CV.key;

  // A press on the desk or the wall around the panel looks back down, as on DEsk.
  const away = (event) => {
    const r = event.currentTarget.getBoundingClientRect(), x = (event.clientX - r.left) / r.width * P, y = (event.clientY - r.top) / r.height * Q;
    if (x < 200 || x > 1240 || y > 862 || y < 30 || (y > 800 && x > 570)) back();
  };
  const slip = <div className="console-slip" role="group" aria-label="唱机旁的纸条" style={phone ? undefined : { ...at(588, 812, 660, 0), height: undefined }}>
    {phone && <p className="console-slip-now" aria-hidden="true"><strong>{lines.head}</strong><small>{[lines.sub, lines.foot].filter(Boolean).join(' · ')}</small></p>}
    {player?.queueError && <p className="console-alert" role="alert">{player.queueError}</p>}
    {state.failed && <div className="console-alert" role="alert"><span>{playback.error || state.failed}</span><button type="button" className="console-type-key" onClick={playback.retry}>重试</button><button type="button" className="console-type-key" onClick={openMusicSettings}>音源设置</button></div>}
    {state.audible && playback.candidates?.length > 0 && <div className="console-matches" role="group" aria-label="选择曲目版本">{playback.candidates.map((c) => <button type="button" className="console-type-key" key={`${c.provider}:${c.id}`} onClick={() => playback.choose(c)}><strong>{c.title}</strong> · {c.artist} · {c.album || '专辑未知'}</button>)}</div>}
    {playback?.localApp && <p className="console-local-app"><button type="button" className="console-type-key" onClick={() => playback.openInLocalApp()} title="小屋内播放失败时的备用办法：在平台 App（未安装时为官方网页）中打开这首歌。声音由该 App 播放，小屋不会显示进度。">{playback.localApp.label}</button><small>交给平台 App 播放 · 小屋不显示进度</small></p>}
    {playback?.notice && <p className="console-notice" role="status">{playback.notice}</p>}
    <div className="console-slip-keys">
      {!!names.length && !state.follow && item && <span className="console-tracks"><TrackPicker item={item} names={names} trackIndex={trackIndex} track={deck.setTrackIndex} reasonFor={reasonFor}/></span>}
      {player?.toggleLiked && item && !state.follow && <button type="button" className="console-type-key" aria-pressed={Boolean(player.liked)} aria-label={player.liked ? '取消喜欢这首' : '喜欢这首'} onClick={() => { playSfx('toggle'); player.toggleLiked(); }}>{player.liked ? '♥ 喜欢' : '♡ 喜欢'}</button>}
      <button type="button" className="console-type-key" onClick={() => { playSfx('paper-press'); commands.open('library'); }}>打开唱片架</button>
      <button type="button" className="console-type-key" disabled={!item} onClick={openCorner}>唱机特写</button>
      <button type="button" className="console-type-key" disabled={!item} onClick={() => { playSfx('paper-press'); commands.open('lyrics'); }}>歌词册</button>
      {labs.smartTurntable && <button type="button" className="console-type-key" onClick={() => commands.open('smart')}>让小屋挑一张</button>}
      {state.follow && system?.active && <button type="button" className="console-type-key" title="在曲库中搜索这张专辑并收藏到唱片架" onClick={() => window.dispatchEvent(new CustomEvent('album-quick-search', { detail: { query: `${system.albumArtist || system.artist} ${system.album || system.title}` } }))}>收藏这张</button>}
      {item && !state.follow && <button type="button" className="console-type-key" aria-label="取下唱片" onClick={() => { playSfx('felt-pick'); deck.eject(); }}>取下唱片</button>}
    </div>
  </div>;

  return <div ref={root} tabIndex={-1} className={`console-view${phone ? ' is-phone' : ''}${reduced ? ' is-reduced' : ''}`} data-state={state.screen} data-provider={provider} style={{ '--desk-lamp': lamp.brightness }}>
    <div className="console-frame" style={phone ? { height: layout.frameH } : undefined}>
    <div className="console-picture" style={{ left: layout.ox, top: layout.oy, width: P * layout.s, height: Q * layout.s, '--console-s': layout.s }}>
      <img className="console-base" src={deskUrl('console-base.webp')} alt="" draggable="false" onClick={away}/>
      <svg className="console-live" viewBox={`0 0 ${P} ${Q}`} aria-hidden="true" focusable="false">
        <Defs ids={ids}/>
        <Tube lines={lines} warm={warm} refs={refs} ids={ids}/>
        <Meters refs={refs} state={state} ids={ids}/>
        <KnobPointer value={canVolume ? volume : 0} ids={ids} warm={warm && canVolume}/>
        <LeverFace lever={LEVERS[0]} on={shuffle} onWord="开" offWord="关" legend="随机" tone="amber" ids={ids} dim={!levers}/>
        <LeverFace lever={LEVERS[1]} on={repeat !== 'off'} onWord={repeat === 'one' ? '单曲' : '整张'} offWord="关" legend="循环" tone="blue" ids={ids} dim={!levers}/>
        <FaderFace fader={FADERS[0]} value={lamp.level} legend="台灯"/>
        <FaderFace fader={FADERS[1]} value={ambience} legend="环境音"/>
        {BUTTONS.map((b) => <ButtonFace key={b.id} button={b} ids={ids} pressed={pressed === b.id} lit={b.id === 'play' ? state.playing : b.id === 'queue' ? roll || entries.length > 0 : false}/>)}
        <text className="console-legend is-key" x={k.legend[0]} y={k.legend[1] + 5} textAnchor="middle">音源</text>
        <text className="console-key-tag" x={k.key[0] + k.key[2] / 2 + 6} y={k.key[1] + k.key[3] + 16} textAnchor="middle">{providerLabel(provider, 'short')}</text>
        <text className="console-plate-text is-lip" x={CV.plate[0] + CV.plate[2] / 2} y={CV.plate[1] + CV.plate[3] / 2 + 10} textAnchor="middle">唱机 ↑</text>
        <text className="console-plate-text" x={CV.plate[0] + CV.plate[2] / 2} y={CV.plate[1] + CV.plate[3] / 2 + 9} textAnchor="middle">唱机 ↑</text>
      </svg>

      <button type="button" className="console-hit console-crt" style={at(F.x, F.y, F.w, F.h)} aria-label={item ? `打开唱机特写：${item.title}` : '架子还空着 · 去唱片架挑一张'} title={item ? '唱机特写 · T' : '去唱片架'} onClick={() => { playSfx('key-press'); if (item) openCorner(); else commands.open('library'); }}/>
      {state.follow ? (system?.active && <SystemSeek timeline={system.timeline} onPosition={onPosition}/>)
        : caps.progress && playback && !state.visual && item ? <TubeSeek playback={playback} seekable={caps.seek} onPosition={onPosition}/> : null}
      <VolumeKnob value={canVolume ? volume : 0} disabled={!canVolume} muted={Boolean(playback?.muted)} valueText={!canVolume ? (state.visual ? '仅展示 · 这个音源没有声音' : '这个音源的音量请在它自己的播放器里调') : playback.muted ? '已静音' : `${volumePercent(volume)}%`}
        onChange={(next) => playback.setVolume(next)} onMute={() => { if (canVolume) { playSfx('toggle'); playback.setMuted(!playback.muted); } }}/>
      <Lever lever={LEVERS[0]} on={shuffle} label="随机播放本张" legend="随机" title="本张随机 · S" keyshortcuts={ariaKeys('shuffle')} disabled={!levers} onClick={() => player.toggleShuffle()}/>
      <Lever lever={LEVERS[1]} on={repeat !== 'off'} label={`播放模式：${REPEAT_LABEL[repeat]}`} legend={`循环 · ${REPEAT_SHORT[repeat]}`} title={`${REPEAT_LABEL[repeat]} · R`} keyshortcuts={ariaKeys('repeat')} disabled={!levers} onClick={() => player.cycleRepeat()}/>
      <Fader fader={FADERS[0]} value={lamp.level} label="台灯亮度" valueText={`${Math.round(lamp.level * 100)}%`} onChange={lamp.set}/>
      <Fader fader={FADERS[1]} value={ambience} label="环境音音量" valueText={sound?.enabled ? `${Math.round(ambience * 100)}%` : '关'} onChange={setAmbience} disabled={!sound}/>
      <PushButton button={BUTTONS[0]} press={press} label={entries.length ? `待播 ${entries.length} 项` : '待播与最近播放'} title="待播纸带" expanded={roll} disabled={!player || state.follow} onClick={() => setRoll((v) => !v)}/>
      {state.follow ? <>
        <PushButton button={BUTTONS[1]} press={press} label="系统播放器上一首" disabled={!system?.active} onClick={() => system.control('previous')}/>
        <PushButton button={BUTTONS[2]} press={press} label={playLabel} keyshortcuts="Space" disabled={!system?.active} onClick={play}/>
        <PushButton button={BUTTONS[3]} press={press} label="系统播放器下一首" disabled={!system?.active} onClick={() => system.control('next')}/>
      </> : <>
        <PushButton button={BUTTONS[1]} press={press} label="上一首展示曲目" title="上一首 · Shift+←" keyshortcuts="Shift+ArrowLeft" disabled={!player?.canPrevious} onClick={() => player?.previous()}/>
        <PushButton button={BUTTONS[2]} press={press} label={playLabel} title="播放 / 暂停 · 空格" keyshortcuts="Space" disabled={Boolean(item && !state.visual && playback?.handoff)} onClick={play}/>
        <PushButton button={BUTTONS[3]} press={press} label="下一首展示曲目" title="下一首 · Shift+→" keyshortcuts="Shift+ArrowRight" disabled={!player?.canNext} onClick={() => player?.next()}/>
      </>}
      <button type="button" className="console-hit console-key" style={at(k.lock[0] - k.lock[2], k.lock[1] - k.lock[2] - 4, k.key[0] + k.key[2] - k.lock[0] + k.lock[2], k.lock[2] * 2 + 8)} aria-label={`音源：${providerLabel(provider)}`} aria-haspopup="true" aria-expanded={card} title="转动钥匙，换一个音源"
        onClick={() => { playSfx(card ? 'key-release' : 'key-in'); setCard((v) => !v); }}/>
      <button type="button" className="console-hit console-plate" style={at(...CV.plate)} aria-label="唱机 ↑ · 回到书桌" title="回到书桌 · Esc" onClick={back}/>
      {card && <div className="console-card-place" style={at(k.lock[0] + 30, k.lock[1] - k.lock[2] - 10, 1, 1)}><SourceCard provider={provider} choose={deck.chooseProvider} close={() => setCard(false)}/></div>}
      {!phone && slip}
    </div>
    </div>

    <div className="console-screen-text sr-only" aria-label="唱机屏幕">
      <span className="console-title">{displayTitle(item?.title) || '架子还空着'}</span>
      <span className="console-artist">{[artist, album && album !== item?.title ? album : ''].filter(Boolean).join(' · ')}</span>
      <span className="console-track">{item ? `${names.length ? `${two(trackIndex)} · ` : ''}${displayTitle(trackName)}` : ''}</span>
      <span className="console-status" role="status">{statusNode(deck.statusText)}</span>
    </div>

    {phone && slip}

    {roll && player && <aside className="console-roll" aria-label="待播纸带">
      <div className="console-roll-slot" aria-hidden="true">待播{entries.length ? ` · ${entries.length}` : ''}</div>
      <div className="console-roll-paper"><QueuePanel embedded item={item} names={names} trackIndex={trackIndex} track={deck.setTrackIndex} player={player} panel={queuePanel} close={() => setRoll(false)} reasonFor={reasonFor}/></div>
    </aside>}
  </div>;
}
