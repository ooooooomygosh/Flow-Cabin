import React, { useEffect, useState } from 'react';
import { useFocus } from '../focus/useFocus';
import { formatClock } from '../focus/focus-model.mjs';
import { LedGlass, LedDigits, LedDots } from '../props/Led';

// The red LED clock on the back of the desk: the time of day while nothing runs, the time
// left while a round does. It is also the way into 专注 (it keeps the .focus-badge hook the
// dialogs return focus to), so it is a real button with a name a screen reader can use.
const PHASES = { idle: 'CLOCK', focus: 'FOCUS', break: 'BREAK', long: 'BREAK', rest: 'BREAK' };
const W = 160, H = 46;

export function clockFace({ phase, paused, remaining, now }) {
  if (phase === 'idle') {
    const time = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { text: time, caption: 'CLOCK', label: `专注 · 现在 ${time} · 开始一段专注` };
  }
  const text = formatClock(remaining), mode = phase === 'focus' ? '专注' : '休息';
  return { text, caption: paused ? 'PAUSE' : PHASES[phase] || 'FOCUS', label: `${paused ? `${mode}暂停` : `${mode}中`} · 还剩 ${text} · 打开专注` };
}

export default function DeskClock({ expanded = false, open }) {
  const focus = useFocus(), [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(id); }, []);
  if (!focus) return null;
  const timer = focus.state.timer, face = clockFace({ phase: timer.phase, paused: Boolean(timer.paused), remaining: focus.remaining, now });
  const colon = timer.paused ? true : Math.floor(now / 1000) % 2 === 0;
  return <button type="button" className={`focus-badge desk-clock ${timer.phase === 'idle' ? '' : 'is-running'}`} aria-expanded={expanded} aria-label={face.label} title="专注" onClick={open}>
    <LedGlass width={W} height={H}>
      <LedDigits text={face.text.length === 5 ? face.text : face.text.padStart(5, '0')} x={8} y={8} w={16} h={30} gap={4} colonOn={colon}/>
      <LedDots text={face.caption} x={W - 8} y={(H - 7 * 1.7) / 2} pitch={1.7} align={1}/>
    </LedGlass>
  </button>;
}
