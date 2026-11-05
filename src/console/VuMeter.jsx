import React, { useEffect, useRef } from 'react';
import { PLAYBACK_EVENT, estimatedEnergy } from '../player/playback-signal.mjs';
import { onReducedMotionChange } from '../motion-preference.mjs';
import { inBackground } from '../frame-clock.mjs';
import { needleStep, needleSettled, peakStep, readingToAngle, meterTicks, targetFor } from './vu-model.mjs';
import { polar } from './knob-model.mjs';

// A cream-faced meter in a brass bezel. Its needle follows the real playback energy (the
// `cabin:playback` event, ~15 Hz, src/player/playback-signal.mjs) on a damped spring; `peak` holds
// loud moments and lets them go slowly. With the sound playing but no signal (a remote speaker),
// a gentle estimate drives it and the face says so; reduced motion makes the needle jump.
// Needle swing and scale after DEsk's cc_needle / cc_scale_arc (https://github.com/fyzugx/DEsk,
// MIT, (c) 2026 The DEsk authors). The needle is moved by an attribute write, never by React.
const PIVOT = { x: 100, y: 132 }, RADIUS = 104;
const TICKS = meterTicks(20, .8).map((t) => ({ ...t, a: polar(PIVOT.x, PIVOT.y, t.long ? RADIUS - 11 : RADIUS - 6, t.deg), b: polar(PIVOT.x, PIVOT.y, RADIUS, t.deg), n: polar(PIVOT.x, PIVOT.y, RADIUS - 24, t.deg) }));
const NUMBERS = TICKS.filter((t) => t.long && t.i % 10 === 0);
const arcPath = (from, to, r) => { const a = polar(PIVOT.x, PIVOT.y, r, readingToAngle(from)), b = polar(PIVOT.x, PIVOT.y, r, readingToAngle(to)); return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`; };

export default function VuMeter({ kind = 'level', title, subtitle, playing = false, estimateWhenSilent = true }) {
  const needle = useRef(null), face = useRef(null), wakeRef = useRef(null);
  const live = useRef({ playing, estimateWhenSilent }); live.current = { playing, estimateWhenSilent };
  useEffect(() => {
    let reduced = false, target = 0, peak = 0, state = { pos: 0, vel: 0 }, raf = 0, last = 0, lastEvent = 0, shown = NaN, estimated = false;
    const unreduce = onReducedMotionChange((value) => { reduced = value; });
    const paint = () => {
      const deg = readingToAngle(state.pos);
      if (Math.abs(deg - shown) > .04 || Number.isNaN(shown)) { shown = deg; needle.current?.setAttribute('transform', `rotate(${deg.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`); }
    };
    const frame = (now) => {
      raf = 0;
      const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60; last = now;
      const { playing: isPlaying, estimateWhenSilent: estimate } = live.current;
      // No signal for a while but the music is on: the estimate keeps the needle honest-looking, and marked.
      const silent = Date.now() - lastEvent > 1200;
      let energy = isPlaying ? (silent && estimate ? estimatedEnergy(Date.now()) : target) : 0;
      if (!isPlaying) peak = 0;
      if (estimated !== (isPlaying && silent && estimate)) { estimated = isPlaying && silent && estimate; face.current?.toggleAttribute('data-estimated', estimated); }
      const goal = kind === 'peak' ? targetFor((peak = peakStep(peak, energy, dt))) : targetFor(energy);
      state = needleStep(state, goal, dt, { reduced });
      paint();
      if (!needleSettled(state, goal) || (isPlaying && (!reduced || estimated))) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !document.hidden && !inBackground()) { last = 0; raf = requestAnimationFrame(frame); } };
    const receive = (event) => {
      const d = event?.detail || {}, energy = Number(d.energy);
      lastEvent = Date.now(); target = d.playing ? (Number.isFinite(energy) ? energy : .5) : 0;
      wake();
    };
    window.addEventListener(PLAYBACK_EVENT, receive);
    document.addEventListener('visibilitychange', wake);
    wakeRef.current = wake; wake();
    return () => { window.removeEventListener(PLAYBACK_EVENT, receive); document.removeEventListener('visibilitychange', wake); unreduce(); if (raf) cancelAnimationFrame(raf); };
  }, [kind]);
  // Playing / paused changes wake the loop too (the needle falls home on pause).
  useEffect(() => { wakeRef.current?.(); }, [playing]);
  return <figure className={`c-meter is-${kind}${playing ? ' is-playing' : ''}`} aria-hidden="true">
    <div className="c-meter-bezel">
      <svg ref={face} viewBox="0 0 200 150" focusable="false">
        <defs>
          <radialGradient id={`vu-${kind}-paper`} cx=".5" cy=".9" r="1"><stop offset="0" stopColor="#f6ecd0"/><stop offset=".7" stopColor="#ecdfbd"/><stop offset="1" stopColor="#d6c59b"/></radialGradient>
          <linearGradient id={`vu-${kind}-glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".34"/><stop offset=".42" stopColor="#fff" stopOpacity=".05"/><stop offset=".43" stopColor="#fff" stopOpacity="0"/></linearGradient>
        </defs>
        <rect className="c-meter-paper" x="0" y="0" width="200" height="150" fill={`url(#vu-${kind}-paper)`}/>
        <path className="c-meter-red" d={arcPath(.8, 1, RADIUS - 3)}/>
        <g className="c-meter-ticks">
          {TICKS.map((t) => <line key={t.i} className={`${t.long ? 'is-long' : ''}${t.red ? ' is-red' : ''}`} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y}/>)}
          {NUMBERS.map((t) => <text key={t.i} x={t.n.x} y={t.n.y + 4} textAnchor="middle">{t.i === 0 ? '0' : t.i === 10 ? '50' : '100'}</text>)}
        </g>
        <text className="c-meter-title" x="100" y="90" textAnchor="middle">{title}</text>
        <text className="c-meter-sub" x="100" y="108" textAnchor="middle">{subtitle}</text>
        <path className="c-meter-hub" d="M72 150 A28 28 0 0 1 128 150Z"/>
        <g ref={needle} transform={`rotate(${readingToAngle(0)} ${PIVOT.x} ${PIVOT.y})`}>
          <line className="c-needle-shadow" x1={PIVOT.x + 1.6} y1={PIVOT.y + 2} x2={PIVOT.x + 1.6} y2={PIVOT.y - 106 + 2}/>
          <line className="c-needle" x1={PIVOT.x} y1={PIVOT.y + 8} x2={PIVOT.x} y2={PIVOT.y - 106}/>
        </g>
        <circle className="c-meter-pivot" cx={PIVOT.x} cy={PIVOT.y} r="9"/>
        <rect x="0" y="0" width="200" height="150" fill={`url(#vu-${kind}-glass)`}/>
      </svg>
      <i className="c-meter-lamp"/>
    </div>
  </figure>;
}
