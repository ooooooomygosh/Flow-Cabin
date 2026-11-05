import React from 'react';
import { digitRow, dotMatrix, letters, pointsAttr } from './led-segments.mjs';

// The red LED glass (DEsk's clock): every segment is always there, the lit ones glow
// and the rest show faintly behind the glass. Drawn as SVG so it scales with the clock.
// Segment shapes ported from https://github.com/fyzugx/DEsk (MIT, (c) 2026 The DEsk authors).

const Segments = ({ list }) => list.map((s, i) => <polygon key={i} className={s.on ? 'led-on' : 'led-ghost'} points={pointsAttr(s.points)}/>);

// A row of seven-segment digits with an optional blinking colon in the middle of "12:34".
export function LedDigits({ text, x = 0, y = 0, w = 23, h = 44, gap = 7, colon = true, colonOn = true }) {
  const [a, b] = text.includes(':') ? text.split(':') : [text, ''];
  const left = digitRow(a, x, y, w, h, gap);
  const colonGap = b ? 11 : 0, rightX = x + left.width + gap + colonGap;
  const right = b ? digitRow(b, rightX, y, w, h, gap) : null;
  const cx = x + left.width + (gap + colonGap) / 2;
  return <g className="led-digits">
    {left.digits.map((d, i) => <Segments key={`a${i}`} list={d.segments}/>)}
    {b && <>
      <circle className={colon && colonOn ? 'led-on' : 'led-ghost'} cx={cx} cy={y + h * 0.3} r={2.6}/>
      <circle className={colon && colonOn ? 'led-on' : 'led-ghost'} cx={cx} cy={y + h * 0.7} r={2.6}/>
      {right.digits.map((d, i) => <Segments key={`b${i}`} list={d.segments}/>)}
    </>}
  </g>;
}

export function LedLetters({ text, x = 0, y = 0, w = 10, h = 18, gap = 3 }) {
  return <g className="led-letters">{letters(text, x, y, w, h, gap).map((segs, i) => <Segments key={i} list={segs}/>)}</g>;
}

// Dot-matrix print for the small line under the digits (track title, mode).
export function LedDots({ text, x = 0, y = 0, pitch = 2.4, align = -1 }) {
  const { dots } = dotMatrix(text, x, y, pitch, align);
  return <g className="led-dots">{dots.map((d, i) => <circle key={i} className={d.on ? 'led-on' : 'led-ghost'} cx={d.cx} cy={d.cy} r={d.r}/>)}</g>;
}

// A bar of n blocks, lit up to v (0..1): a level, a progress.
export function LedBlocks({ x = 0, y = 0, w = 60, h = 10, n = 10, v = 0, grow = false }) {
  const gap = w / n * 0.28, bw = (w - gap * (n - 1)) / n, lit = Math.round(v * n);
  return <g className="led-blocks">{Array.from({ length: n }, (_, i) => {
    const bh = grow ? h * (0.34 + 0.66 * (i + 1) / n) : h;
    return <rect key={i} className={i < lit ? 'led-on' : 'led-ghost'} x={x + i * (bw + gap)} y={y + h - bh} width={bw} height={bh}/>;
  })}</g>;
}

// The glass itself: a dark window in a black bezel with a strip of gloss on top. `label` is what
// a screen reader hears (the SVG is decoration).
export function LedGlass({ width, height, label, className = '', children }) {
  return <svg className={`led-glass ${className}`} viewBox={`0 0 ${width} ${height}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })} preserveAspectRatio="xMidYMid meet">
    <rect className="led-window" x="0" y="0" width={width} height={height} rx="4"/>
    <g className="led-face">{children}</g>
    <rect className="led-gloss" x="1" y="1" width={width - 2} height={height * 0.52} rx="3"/>
  </svg>;
}
