import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GEOMETRY, RPM, createDeckPhysics, hitZone, labelFps, progressAngle, progressFromPoint, REST_ANGLE } from './turntable-physics.mjs';
import { createDeckArt, paintLabelFrames, paintRecord, drawFrame } from './turntable-render.mjs';
import { sleeveCanvas } from './sleeve-art.mjs';
import { playDeckSound } from './deck-sfx.mjs';
import { frameClock } from '../frame-clock.mjs';
import { frameBudget, performanceLevel, onPerformanceChange } from '../perf-profile.mjs';
import useReducedMotion from '../useReducedMotion';

// Close-up pixel turntable. `playing` drives the motor; `progress` (0…1 of the
// side) places the needle; `gaps` are the quiet rings between songs. Dragging
// the tonearm seeks, clicking the record / START / the cue lever plays or
// pauses, the 33 / 45 keys switch speed.
//
// Frame rate follows the platter: one frame per label step (17.8 fps at 33⅓,
// 24 at 45) while it turns steadily, up to 30 fps while the arm cues or the
// platter spins up / coasts, and no frames at all once everything is still.
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
const MOVING_FPS = 30;
let records = 0;

export default function PixelTurntable({ item, vinyl, playing = false, progress = 0, gaps = [], speed = 33, light = 'lamp', reduceMotion = false, onToggle, onSeek, onSpeed, label = '唱机', className = '' }) {
  // The OS preference counts as well as the desktop setting passed in.
  const systemReduced = useReducedMotion(); reduceMotion = Boolean(reduceMotion || systemReduced);
  const canvas = useRef(null), physics = useRef(null), drag = useRef(null), live = useRef({});
  physics.current ||= createDeckPhysics({ speed });
  const [cursor, setCursor] = useState('default');
  const cover = useImage(item?.cover);
  const browser = typeof document !== 'undefined';
  const art = useMemo(() => browser ? createDeckArt(light) : null, [light]);
  const record = useMemo(() => item && browser ? { ...paintRecord(undefined, { base: vinyl?.base, opacity: vinyl?.opacity ?? 100, splatter: vinyl?.splatter, splashes: vinyl?.splashes || [], gaps, seed: item.id, light }), id: `r${++records}` } : null,
    [item?.id, vinyl?.base, vinyl?.opacity, vinyl?.splatter, (vinyl?.splashes || []).join(), gaps.join(), light]);
  const labels = useMemo(() => item && browser ? paintLabelFrames(undefined, { art: cover || sleeveCanvas(item), paper: vinyl?.label || '#e9d9b8', light }) : null, [item?.id, cover, vinyl?.label, light]);
  live.current = { playing: Boolean(item && playing), progress, record, labels, speed, reduceMotion, art };
  useEffect(() => { physics.current.setSpeed(speed); }, [speed]);
  useEffect(() => {
    const element = canvas.current; if (!element || !art) return;
    const context = element.getContext('2d');
    let previousLift = physics.current.state.lift, visible = true, off = null, rate = 0;
    const sleep = () => { off?.(); off = null; rate = 0; };
    const render = (time, dt) => {
      const now = live.current, state = physics.current.state;
      const target = now.record ? (drag.current ? drag.current.angle : progressAngle(now.progress)) : null;
      if (now.reduceMotion) { state.arm = target ?? REST_ANGLE; state.lift = now.playing ? 0 : 1; state.omega = 0; state.swing = null; state.touch = 0; }
      else physics.current.step(dt, { motor: now.playing, armTarget: target, lowered: now.playing && !drag.current, dragging: Boolean(drag.current) });
      if (previousLift > .5 && state.lift <= .02 && now.playing) playDeckSound('drop');
      if (previousLift < .1 && state.lift > .3) playDeckSound('lift');
      previousLift = state.lift;
      drawFrame(context, { art: now.art, record: now.record, labels: now.labels, physics: state, speed: now.speed, motor: now.playing });
      // Still: sleep until props change. Turning steadily: one frame per label step. Otherwise: smooth cueing.
      const cueing = Boolean(state.swing || drag.current || state.touch || (state.lift > .01 && state.lift < .99));
      const nominal = RPM[now.speed] / 60 * Math.PI * 2, turning = !now.reduceMotion && now.playing;
      if (!visible || (!turning && state.omega === 0 && !cueing && Math.abs((target ?? REST_ANGLE) - state.arm) < .002)) { sleep(); return; }
      const steady = turning && !cueing && Math.abs(state.omega - nominal) < 1e-6;
      const want = Math.min(frameBudget(performanceLevel()).deck, steady ? labelFps(now.speed) : MOVING_FPS);
      if (want !== rate) { sleep(); subscribe(want); }
    };
    const subscribe = (fps) => { off = frameClock().subscribe(render, { fps }); rate = fps; };
    const wake = () => { if (!off) subscribe(MOVING_FPS); };
    const offPerformance = onPerformanceChange(() => { if (off) { sleep(); wake(); } });
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }) : null;
    observer?.observe(element);
    element.__wake = wake; wake();
    return () => { sleep(); observer?.disconnect(); offPerformance(); };
  }, [art]);
  useEffect(() => { canvas.current?.__wake?.(); }, [playing, progress, record, labels, speed, reduceMotion]);

  const point = (event) => { const rect = canvas.current.getBoundingClientRect(); return [(event.clientX - rect.left) * GEOMETRY.width / rect.width, (event.clientY - rect.top) * GEOMETRY.height / rect.height]; };
  const zone = (at) => hitZone(at, { arm: physics.current.state.arm, record: Boolean(item) });
  const down = (event) => {
    const hit = zone(point(event));
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
  return <canvas ref={canvas} className={`pixel-turntable ${className}`} width={GEOMETRY.width} height={GEOMETRY.height} role="img" aria-label={label} title="拖动唱臂换位置 · 点唱片或 START 暂停 · 33 / 45 转" style={{ cursor }}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setCursor('default'); }} onPointerLeave={() => !drag.current && setCursor('default')}/>;
}
