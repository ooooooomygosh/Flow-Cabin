import React, { useEffect, useRef } from 'react';
import { PLATES, clockCells } from './layout.mjs';
import { dotMatrix } from '../props/led-segments.mjs';
import { deskImage } from './images.mjs';

// The red LED clock at the back of the desk: DEsk's clock (wm.c clock, tryit clockPicture), its face and
// its digits photographed one cell at a time; each digit's cell is replaced, not drawn over (the glass
// is in the cell). Where DEsk shows the volume, a line of dot-matrix print says what the clock is doing.
// Ported from https://github.com/fyzugx/DEsk (MIT, (c) 2026 The DEsk authors).
const C = PLATES.clock, [FX, , FW, FH] = C.faceAt;
const LIT = '#ff4b2f', GLOW = 'rgba(255, 64, 32, .85)', GHOST = 'rgba(255, 72, 48, .075)';
const WORD_X = 196, WORD_Y = 13, BAR_X = 196, BAR_Y = 41, BAR_W = 132;

export function paintClock(canvas, face, scale = 1) {
  const fimg = deskImage('clock-face.webp'), digits = deskImage('clock-digits.webp');
  if (!canvas || !fimg || !digits) return false;
  const dpr = Math.min(3, (globalThis.devicePixelRatio || 1) * scale);
  const w = Math.round(FW * dpr), h = Math.round(FH * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, FW, FH);
  g.drawImage(fimg, 0, 0, FW, FH);
  const cell = (name, from, v) => {
    const p = C.places[name], src = C.places[from], i = src.digits.indexOf(v);
    if (i < 0) return;
    g.clearRect(p.x - FX, 0, p.w, C.cellH);
    g.drawImage(digits, i * src.w, src.sy, src.w, C.cellH, p.x - FX, 0, p.w, C.cellH);
  };
  for (const c of clockCells(face.digits)) if (c.v >= 0) cell(c.name, c.from, c.v);
  cell('colon', 'colon', face.colon ? 1 : 0);
  // the print: a word, and a row of blocks for how far along
  const dots = dotMatrix(face.word || '', WORD_X, WORD_Y, 2.3).dots;
  for (const d of dots) {
    g.beginPath(); g.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
    if (d.on) { g.fillStyle = LIT; g.shadowColor = GLOW; g.shadowBlur = 3; } else { g.fillStyle = GHOST; g.shadowBlur = 0; }
    g.fill();
  }
  g.shadowBlur = 0;
  if (face.bar !== null && face.bar !== undefined) {
    const n = 12, gap = 2.4, bw = (BAR_W - gap * (n - 1)) / n, lit = Math.round(Math.max(0, Math.min(1, face.bar)) * n);
    for (let i = 0; i < n; i++) {
      const bh = 6 + 8 * (i + 1) / n;
      g.fillStyle = i < lit ? LIT : GHOST;
      if (i < lit) { g.shadowColor = GLOW; g.shadowBlur = 3; } else g.shadowBlur = 0;
      g.fillRect(BAR_X + i * (bw + gap), BAR_Y + 14 - bh, bw, bh);
    }
    g.shadowBlur = 0;
  }
  return true;
}

export default function ClockFace({ face, scale = 1 }) {
  const ref = useRef(null), key = `${face.digits}|${face.colon}|${face.word}|${face.bar}`;
  useEffect(() => {
    let alive = true;
    const draw = () => { if (alive && !paintClock(ref.current, face, scale)) setTimeout(draw, 120); };
    draw();
    return () => { alive = false; };
  }, [key, scale]);
  return <canvas ref={ref} className="desk-clock-glass" aria-hidden="true"/>;
}
