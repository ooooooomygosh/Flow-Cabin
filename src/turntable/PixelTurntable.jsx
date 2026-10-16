import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GEOMETRY, createDeckPhysics, progressAngle, progressFromPoint, stylusPoint, REST_ANGLE } from './turntable-physics.mjs';
import { paintDeck, paintRecord, paintSheen, drawFrame } from './turntable-render.mjs';
import { playDeckSound } from './deck-sfx.mjs';
import { frameClock } from '../frame-clock.mjs';
import { frameBudget, performanceLevel, onPerformanceChange } from '../perf-profile.mjs';
import useReducedMotion from '../useReducedMotion';

// Close-up pixel turntable. `playing` drives the motor; `progress` (0…1 of the
// side) places the needle; `gaps` are the quiet rings between songs. Dragging
// the tonearm seeks, clicking the record plays / pauses, 33 / 45 switch speed.
const useImage = (src) => {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) { setImage(null); return; }
    let alive = true; const value = new Image(); value.decoding = 'async'; value.referrerPolicy = 'no-referrer';
    value.onload = () => alive && setImage(value); value.onerror = () => alive && setImage(null); value.src = src;
    return () => { alive = false; };
  }, [src]);
  return image;
};

export default function PixelTurntable({ item, vinyl, playing = false, progress = 0, gaps = [], energy = 0, speed = 33, reduceMotion = false, onToggle, onSeek, onSpeed, label = '唱机', className = '' }) {
  // The OS preference counts as well as the desktop setting passed in.
  const systemReduced = useReducedMotion(); reduceMotion = Boolean(reduceMotion || systemReduced);
  const canvas = useRef(null), physics = useRef(null), drag = useRef(null), frame = useRef(0), last = useRef(0), live = useRef({});
  physics.current ||= createDeckPhysics({ speed });
  const [cursor, setCursor] = useState('default');
  const cover = useImage(item?.cover);
  const deck = useMemo(() => typeof document === 'undefined' ? null : paintDeck(), []);
  const sheen = useMemo(() => typeof document === 'undefined' ? null : paintSheen(), []);
  const record = useMemo(() => item && typeof document !== 'undefined' ? paintRecord(undefined, { base: vinyl?.base, opacity: vinyl?.opacity ?? 100, splatter: vinyl?.splatter, splashes: vinyl?.splashes || [], label: cover, gaps, seed: item.id }) : null, [item?.id, cover, vinyl?.base, vinyl?.opacity, vinyl?.splatter, (vinyl?.splashes || []).join(), gaps.join()]);
  live.current = { playing: Boolean(item && playing), progress, energy, record, speed, reduceMotion };
  useEffect(() => { physics.current.setSpeed(speed); }, [speed]);
  useEffect(() => {
    const element = canvas.current; if (!element || !deck) return;
    const context = element.getContext('2d');
    let previousLift = physics.current.state.lift, visible = true, off = null;
    const sleep = () => { off?.(); off = null; frame.current = 0; };
    // Shared 60 fps clock: capped on high-refresh screens, paused while hidden / in the background.
    const render = (time, dt) => {
      const now = live.current, state = physics.current.state;
      const target = now.record ? (drag.current ? drag.current.angle : progressAngle(now.progress)) : null;
      if (now.reduceMotion) { state.arm = target ?? REST_ANGLE; state.lift = now.playing ? 0 : 1; state.omega = 0; }
      else physics.current.step(dt, { motor: now.playing, armTarget: target, lowered: now.playing && !drag.current, dragging: Boolean(drag.current) });
      if (previousLift > .5 && state.lift <= .02 && now.playing) playDeckSound('drop');
      if (previousLift < .1 && state.lift > .3) playDeckSound('lift');
      previousLift = state.lift;
      drawFrame(context, { deck, record: now.record, sheen, physics: state, speed: now.speed, motor: now.playing, glow: now.energy });
      // Keep animating while anything moves; otherwise sleep until props change.
      // Reduced motion never spins, so a playing record settles too (one still frame).
      const settled = (now.reduceMotion || !now.playing) && state.omega === 0 && Math.abs((target ?? REST_ANGLE) - state.arm) < .002 && (state.lift > .99 || state.lift < .01) && !drag.current;
      if (!(visible && (!settled || !now.reduceMotion && now.playing))) sleep();
    };
    const wake = () => { if (!off) { off = frameClock().subscribe(render, { fps: frameBudget(performanceLevel()).deck }); frame.current = 1; } };
    const offPerformance = onPerformanceChange(() => { if (off) { sleep(); wake(); } });
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }) : null;
    observer?.observe(element);
    element.__wake = wake; wake();
    return () => { sleep(); observer?.disconnect(); offPerformance(); };
  }, [deck, sheen]);
  useEffect(() => { canvas.current?.__wake?.(); }, [playing, progress, record, speed, reduceMotion, energy > .05]);

  const point = (event) => { const rect = canvas.current.getBoundingClientRect(); return [(event.clientX - rect.left) * GEOMETRY.width / rect.width, (event.clientY - rect.top) * GEOMETRY.height / rect.height]; };
  const nearArm = ([x, y]) => {
    const [ax, ay] = GEOMETRY.pivot, [bx, by] = stylusPoint(physics.current.state.arm);
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)) < 6 && t > .35;
  };
  const zone = ([x, y]) => {
    if (item && nearArm([x, y])) return 'arm';
    if (y >= 128 && y <= 137 && x >= 23 && x <= 66) return x < 45 ? 'speed33' : 'speed45';
    if (Math.hypot(x - 207.5, y - 119.5) < 8 || (x >= 213 && x <= 221 && y >= 51 && y <= 66)) return 'start';
    if (item && Math.hypot(x - GEOMETRY.center[0], y - GEOMETRY.center[1]) < GEOMETRY.recordRadius) return 'record';
    return '';
  };
  const down = (event) => {
    const at = point(event), hit = zone(at);
    if (hit === 'arm' && onSeek) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { angle: physics.current.state.arm, moved: false }; setCursor('grabbing'); canvas.current.__wake?.(); event.preventDefault(); }
  };
  const move = (event) => {
    const at = point(event);
    if (!drag.current) { const hit = zone(at); setCursor(hit === 'arm' ? 'grab' : hit ? 'pointer' : 'default'); return; }
    drag.current.moved = true; drag.current.angle = progressAngle(progressFromPoint(at)); drag.current.inside = Math.hypot(at[0] - GEOMETRY.center[0], at[1] - GEOMETRY.center[1]) < GEOMETRY.outerGroove + 8;
  };
  const up = (event) => {
    if (drag.current) {
      const at = point(event), moved = drag.current.moved, inside = drag.current.inside !== false;
      drag.current = null; setCursor('grab'); canvas.current.__wake?.();
      if (moved && inside) onSeek?.(progressFromPoint(at)); else if (moved && !inside && playing) onToggle?.();
      return;
    }
    const hit = zone(point(event));
    if (hit === 'record' || hit === 'start') onToggle?.();
    else if (hit === 'speed33' || hit === 'speed45') onSpeed?.(hit === 'speed33' ? 33 : 45);
  };
  return <canvas ref={canvas} className={`pixel-turntable ${className}`} width={GEOMETRY.width} height={GEOMETRY.height} role="img" aria-label={label} style={{ cursor }}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setCursor('default'); }} onPointerLeave={() => !drag.current && setCursor('default')}/>;
}
