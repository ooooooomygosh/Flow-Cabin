import React, { useEffect, useState } from 'react';
import { LedGlass, LedDigits, LedDots, LedBlocks } from '../../props/Led';
import BrassPlate from '../../props/BrassPlate';
import useReducedMotion from '../../useReducedMotion';
import { faceFocus } from '../FocusFace';
import { ledFace, glassSize, LED_BLOCKS } from './clock-model.mjs';

// The focus clock close-up: a black housing, a red LED window with big digits, a dot-matrix word
// (FOCUS / BREAK / PAUSE …) and a block bar for how much of the round is spent. The keys sit in
// the same housing (children). The glass redraws once a second; nothing else on the panel does.
// Glass geometry follows DEsk's clock (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors).
const PITCH = 2.6, CAPTION_W = (5 * 6 - 1) * PITCH;

export function ClockGlass({ state, show = 'timer', seconds = false }) {
  const [now, setNow] = useState(Date.now), reduced = useReducedMotion();
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(id); }, []);
  const face = ledFace({ now, focus: faceFocus(state), show, seconds }), g = glassSize(face.text);
  const colon = !face.blink || reduced || Math.floor(now / 1000) % 2 === 0;
  const barX = g.pad + CAPTION_W + 18, barW = g.width - g.pad - barX;
  return <LedGlass className="desk-clock-glass pixel-clock" width={g.width} height={g.height} label={face.label}>
    {face.plus && <LedDots text="+" x={g.digitsX - 17} y={g.digitsY + g.h / 2 - 9} pitch={PITCH}/>}
    <LedDigits text={face.text} x={g.digitsX} y={g.digitsY} w={g.w} h={g.h} gap={g.gap} colonOn={colon}/>
    {face.unit && <LedDots text={face.unit} x={g.width - g.pad} y={g.digitsY + g.h - 7 * PITCH} pitch={PITCH} align={1}/>}
    <LedDots text={face.caption} x={g.pad} y={g.rowY} pitch={PITCH}/>
    {face.small
      ? <LedDigits text={face.small} x={g.width - g.pad - 25} y={g.rowY - 2} w={11} h={19} gap={3} colon={false}/>
      : <LedBlocks x={barX} y={g.rowY + 2} w={barW} h={14} n={LED_BLOCKS} v={face.progress}/>}
  </LedGlass>;
}

export default function ClockSet({ state, show, seconds, lamps = null, children }) {
  return <div className="desk-clock-set">
    <div className="desk-clock-top"><BrassPlate as="span" className="desk-clock-plate">心流 · 专注</BrassPlate>{lamps}</div>
    <div className="desk-clock-window"><ClockGlass state={state} show={show} seconds={seconds}/></div>
    {children}
  </div>;
}
