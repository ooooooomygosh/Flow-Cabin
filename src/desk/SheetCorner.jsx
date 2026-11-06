import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playSfx } from '../props/sfx.mjs';
import { reducedMotion } from '../motion-preference.mjs';
import { CURL, CORNER_ACTS, curlTick, curlFrame, curlBox, cornerAt, newCurl } from './sheet-corner.mjs';
import { deskImage, whenDeskImages } from './images.mjs';

// The turned-down corner of a sheet, as on DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk
// authors; tryit.js curlTick / cornerAt / drawSheet, ported in ./sheet-corner.mjs). The corner is DEsk's
// own picture (public/desk/curl.webp), drawn in a small canvas at the sheet's top-right; the sheet itself
// is cut along the fold (--curl on the dialog, props.css). Rest the pointer on the fold for half a second
// and the corner turns up, printed on its back: 折起 · 展开 · 丢掉.
//
// Keyboard and screen readers: the fold is the real close button (关闭{title}; Enter throws the sheet
// away); while focus is on it or on one of the three printed words the corner stays up, and the three
// words are real buttons laid exactly over their print (always in the Tab order, right after the fold).
const CANVAS = 360; // px: room for the corner peeled right back (open * 1.9 -> a 343-px square)

export default function SheetCorner({ sheet, title, closeLabel, canFold, maxed, onAct }) {
  const canvas = useRef(null), curl = useRef(newCurl()), raf = useRef(0), last = useRef(0), focusIn = useRef(false);
  const [near, setNear] = useState(false), [hot, setHot] = useState(-1);
  const actRef = useRef(onAct); actRef.current = onAct;

  const draw = () => {
    const node = sheet.current, cv = canvas.current, c = curl.current;
    if (!node || !cv) return;
    const [cs, cr] = curlFrame(CURL, c.s, c.near ? c.hot : -1);
    node.style.setProperty('--curl', `${cs}px`);
    const g = cv.getContext('2d'), dpr = Math.min(2, globalThis.devicePixelRatio || 1), size = Math.round(CANVAS * dpr);
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
    const image = deskImage('curl.webp');
    if (!image || !cr) return;
    const B = curlBox(cs);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(image, cr[0], cr[1], cr[2], cr[3], CANVAS - B, 0, B, B);
  };
  const run = () => {
    if (raf.current) return;
    last.current = performance.now();
    const step = (ms) => {
      const c = curl.current, dt = Math.min(0.05, Math.max(0, (ms - last.current) / 1000)); last.current = ms;
      const wasNear = c.near;
      if (focusIn.current && c.act < 0) { c.near = true; c.hoverAt = 0; }
      const { busy, fire } = curlTick(c, dt, ms / 1000, CURL, reducedMotion());
      if (c.near !== wasNear) { setNear(c.near); if (c.near) playSfx('corner-lift'); }
      draw();
      if (fire >= 0) actRef.current?.(fire);
      if (busy || Math.abs(c.s - (c.near ? CURL.open : CURL.rest)) > 0.15) raf.current = requestAnimationFrame(step);
      else raf.current = 0;
    };
    raf.current = requestAnimationFrame(step);
  };
  useLayoutEffect(() => { draw(); whenDeskImages(['curl.webp']).then(draw); return () => cancelAnimationFrame(raf.current); }, []);
  // An opened-out sheet is a new rectangle: the corner starts again at rest.
  useEffect(() => { Object.assign(curl.current, newCurl()); setNear(false); setHot(-1); draw(); }, [maxed]);

  // The pointer anywhere over the sheet (or its backdrop): stir the fold, keep the flap up while near.
  useEffect(() => {
    const node = sheet.current;
    if (!node) return undefined;
    const move = (event) => {
      if (event.pointerType === 'touch') return;
      const c = curl.current, r = node.getBoundingClientRect();
      const at = cornerAt({ x: r.left, y: r.top, w: r.width }, c, event.clientX, event.clientY);
      const inside = event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom;
      const onCorner = c.near && at.near;
      if (c.near && !onCorner && !focusIn.current && c.act < 0) { c.near = false; c.hot = -1; setNear(false); setHot(-1); }
      if (inside && at.onFold && !c.near) { if (!c.hoverAt) c.hoverAt = performance.now() / 1000; }
      else c.hoverAt = 0;
      if (onCorner && c.act < 0 && c.hot !== at.hot) { c.hot = at.hot; setHot(at.hot); }
      run();
    };
    const leave = () => {
      const c = curl.current; c.hoverAt = 0;
      if (c.act < 0 && !focusIn.current) { c.near = false; c.hot = -1; setNear(false); setHot(-1); }
      run();
    };
    node.addEventListener('pointermove', move); node.addEventListener('pointerleave', leave);
    return () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerleave', leave); };
  }, []);

  const act = (i) => {
    const c = curl.current;
    if (c.act >= 0 || (i === 0 && !canFold)) return;
    playSfx(i === 2 ? 'paper-crumple' : 'corner-tap');
    Object.assign(c, { act: i, actAt: performance.now() / 1000, done: false, near: true, hot: i });
    run();
  };
  const focusOn = (i) => { focusIn.current = true; const c = curl.current; if (c.act < 0) { c.hot = i; setHot(i); } run(); };
  const focusOff = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    focusIn.current = false; const c = curl.current;
    if (c.act < 0) { c.near = false; c.hot = -1; setNear(false); setHot(-1); }
    run();
  };
  const names = [`折起${title ? `「${title}」` : ''}，放在桌上`, maxed ? `还原${title || '这张纸'}` : `展开${title || '这张纸'}`, `丢掉${title || '这张纸'}`];
  return <div className={`sheet-corner ${near ? 'is-up' : ''}`} onFocus={() => focusOn(curl.current.hot)} onBlur={focusOff}>
    <canvas ref={canvas} className="sheet-curl" aria-hidden="true"/>
    <button type="button" className="cabin-dialog-close" aria-label={closeLabel || `关闭${title}`} title="停一下翻起纸角：折起 · 展开 · 丢掉"
      onFocus={() => focusOn(-1)} onClick={() => { playSfx('paper-crumple'); actRef.current?.(2); }}/>
    <div className="sheet-corner-acts" role="group" aria-label="纸角">
      {CORNER_ACTS.map((a, i) => { const r = CURL.items[i]; return <button type="button" key={a.id} className={`sheet-corner-act ${hot === i ? 'is-hot' : ''}`}
        style={{ left: r[0], top: r[1], width: r[2], height: r[3] }} aria-label={names[i]} aria-disabled={i === 0 && !canFold ? 'true' : undefined}
        onFocus={() => focusOn(i)} onPointerEnter={() => { curl.current.hot = i; setHot(i); run(); }} onClick={() => act(i)}><span className="sr-only">{a.name}</span></button>; })}
    </div>
  </div>;
}
