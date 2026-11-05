// What the red LED glass of the focus clock shows: pure data from the same face model the
// pixel faces use, so the dock, 沉浸 and the wall clock always agree about the time.
import { faceModel } from '../face-model.mjs';

// Dot-matrix word under the digits.
export const LED_CAPTIONS = Object.freeze({ idle: 'READY', focus: 'FOCUS', shortBreak: 'BREAK', longBreak: 'BREAK', clock: 'CLOCK', pause: 'PAUSE', over: 'OVER' });
export const LED_BLOCKS = 20;

// input: { now, focus (faceFocus shape), show ('auto' | 'clock' | 'timer'), seconds }
// → { text: 'MM:SS' | 'MM' | 'HH:MM', plus, caption, small, progress, blink, label, mode, paused, overtime }
export function ledFace({ now = Date.now(), focus = null, show = 'timer', seconds = false } = {}) {
  const m = faceModel({ now, focus, show, seconds }), idle = m.phase === 'idle';
  const text = m.groups.join(':'), plus = Boolean(m.overtime);
  let caption;
  if (m.mode === 'clock') caption = LED_CAPTIONS.clock;
  else if (m.overtime) caption = LED_CAPTIONS.over;
  else if (m.paused && !idle) caption = LED_CAPTIONS.pause;
  else caption = LED_CAPTIONS[m.phase] || LED_CAPTIONS.focus;
  // The colon blinks while a round (or the wall clock) is running, and holds still while paused or idle.
  const blink = m.mode === 'clock' || (m.running && !m.paused);
  const progress = m.mode === 'timer' && m.progress ? Math.max(0, Math.min(1, m.progress)) : 0;
  const label = m.mode === 'clock' ? `现在 ${m.clockText}` : `${m.label}${idle ? '' : m.paused ? '，已暂停' : ''}`;
  return { text, plus, unit: m.unit ? 'MIN' : '', caption, small: m.small || '', progress, blink, label, mode: m.mode, phase: m.phase, paused: Boolean(m.paused), overtime: Boolean(m.overtime) };
}

// Geometry of the glass for a given text: digits are fixed-size, the window grows by a digit
// when a long session needs three of them ("120:00").
export function glassSize(text, { w = 44, h = 84, gap = 8, colonGap = 11, pad = 18, rowH = 40, minWidth = 250 } = {}) {
  const [a, b = ''] = String(text).split(':');
  const digits = a.length + b.length, inner = digits * (w + gap) - gap + (b ? colonGap : 0);
  const width = Math.max(minWidth, Math.ceil(inner + pad * 2));
  return { w, h, gap, colonGap, pad, inner, width, height: pad + h + rowH + 4, digitsX: Math.round((width - inner) / 2), digitsY: pad - 2, rowY: pad + h + 14 };
}

// 1..4 lamps for the rounds of a set: done, the running one, and those to come.
export function roundLamps({ round, longEvery, phase }) {
  return Array.from({ length: Math.max(1, longEvery) }, (_, index) => index < round ? 'done' : index === round && phase === 'focus' ? 'active' : 'rest');
}
