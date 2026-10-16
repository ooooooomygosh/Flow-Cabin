import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { faceModel, nextWake, modelKey } from './face-model.mjs';
import { getFace, previewModel } from './faces/index.mjs';
import { facePalette } from './face-palette.mjs';
import { toImageData } from './raster.mjs';
import { changedCards, FLIP_FRAMES, FLIP_FPS } from './flip-math.mjs';
import { frameClock, onBackgroundChange, onOcclusionChange } from '../frame-clock.mjs';
import { reducedMotion } from '../motion-preference.mjs';
import './focus-display.css';

// The focus record as a face reads it (the wallpaper passes its snapshot instead).
export const faceFocus = (state) => state && ({ phase: state.timer.phase, paused: state.timer.paused, endsAt: state.timer.endsAt, remaining: state.timer.remaining, duration: state.timer.duration, hideSeconds: state.settings.hideSeconds, round: state.timer.round, longEvery: state.settings.longEvery, focusMin: state.settings.focusMin, task: state.tasks.find((task) => task.id === state.timer.taskId)?.text || '' });

// Integer scale (in device pixels) that fits w×h into the box.
export function fitScale(box, w, h, dpr = 1, max = 64) {
  const kx = Math.floor(box.width * dpr / w), ky = box.height ? Math.floor(box.height * dpr / h) : kx;
  return Math.max(1, Math.min(max * dpr, kx, ky)) / dpr;
}

// One face on a <canvas>, scaled by whole pixels to fit its box. It sleeps on a
// single wall-clock-aligned setTimeout to the next visible change (minute,
// second or progress step), stops while the window is hidden or the room is
// covered, and only uses the shared frame clock for the 250 ms of a flip.
export default function FocusFace({ face: faceId, look = 'pixel', focus = null, show = 'auto', seconds = false, variant = 'dock', still = false, className = '', maxScale = 64, caption = false }) {
  const box = useRef(null), canvas = useRef(null), painted = useRef({ key: '', chars: '' }), anim = useRef(null);
  const [now, setNow] = useState(() => Date.now()), [scale, setScale] = useState(0);
  const face = getFace(faceId), pal = facePalette(look);
  const model = still ? previewModel(face.id) : faceModel({ now, focus, show, seconds });
  const { w, h } = face.size(model);
  const focusKey = focus ? [focus.phase, focus.paused, focus.endsAt, focus.remaining, focus.duration, focus.hideSeconds, focus.focusMin].join('|') : '';
  // Wake exactly when something drawn changes.
  useEffect(() => {
    if (still) return undefined;
    let timer = 0, hidden = false, covered = false;
    const schedule = () => {
      clearTimeout(timer); if (hidden || covered) return;
      const wait = nextWake(faceModel({ now: Date.now(), focus, show, seconds }), { steps: face.steps, wall: face.wall, seconds });
      if (wait !== Infinity) timer = setTimeout(() => { setNow(Date.now()); schedule(); }, wait);
    };
    const offBackground = onBackgroundChange((value) => { hidden = value; if (!value) setNow(Date.now()); schedule(); });
    const offCover = variant === 'full' ? () => {} : onOcclusionChange((value) => { covered = value; if (!value) setNow(Date.now()); schedule(); });
    setNow(Date.now()); schedule();
    return () => { clearTimeout(timer); offBackground(); offCover(); };
  }, [face.id, focusKey, show, seconds, still, variant]);
  // Fit by whole pixels.
  useLayoutEffect(() => {
    const el = box.current; if (!el) return undefined;
    const measure = () => setScale(fitScale({ width: el.clientWidth, height: el.clientHeight }, w, h, window.devicePixelRatio || 1, maxScale));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [w, h, maxScale]);
  useEffect(() => () => anim.current?.(), []);
  // Paint when what the face shows changes; flip the changed cards.
  const key = `${face.id}|${look}|${w}x${h}|${modelKey(model, face.steps)}`;
  useLayoutEffect(() => {
    const el = canvas.current, ctx = el?.getContext?.('2d'); if (!ctx) return;
    const chars = model.groups.join('') + model.small, prev = painted.current;
    if (prev.key === key) return;
    const draw = (frame) => { const raster = face.paint(model, pal, frame); if (el.width !== raster.w || el.height !== raster.h) { el.width = raster.w; el.height = raster.h; } ctx.putImageData(toImageData(raster), 0, 0); };
    anim.current?.(); anim.current = null;
    const sameFace = prev.key.split('|').slice(0, 3).join('|') === key.split('|').slice(0, 3).join('|');
    const cards = face.flips && sameFace && prev.chars.length === chars.length ? changedCards(prev.chars, chars) : [];
    painted.current = { key, chars };
    if (!cards.length || still || reducedMotion() || frameClock().paused) { draw(null); return; }
    let frame = 0;
    const stop = frameClock().subscribe(() => {
      if (frame >= FLIP_FRAMES) { stop(); anim.current = null; draw(null); return; }
      draw({ frame: frame++, from: prev.chars, cards });
    }, { fps: FLIP_FPS });
    anim.current = () => { stop(); draw(null); };
    draw({ frame: frame++, from: prev.chars, cards });
  });
  const style = scale ? { width: `${w * scale}px`, height: `${h * scale}px` } : { width: `${w}px`, height: `${h}px`, visibility: 'hidden' };
  return <div className={`focus-face is-${variant} ${className}`} data-face={face.id}>
    <div ref={box} className="focus-face-fit"><canvas ref={canvas} className="pixel-clock focus-face-canvas" width={w} height={h} style={style} role="img" aria-label={model.label}/></div>
    {caption && <p className="focus-face-caption">{model.caption}</p>}
  </div>;
}
