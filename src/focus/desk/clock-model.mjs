// What the red LED clock shows (the desk's clock, and 沉浸 enlarged): pure data from the same face model
// the pixel faces use, so the desk, 沉浸 and the wall clock always agree about the time.
import { faceModel } from '../face-model.mjs';

// Dot-matrix word under the digits.
export const LED_CAPTIONS = Object.freeze({ idle: 'READY', focus: 'FOCUS', shortBreak: 'BREAK', longBreak: 'BREAK', clock: 'CLOCK', pause: 'PAUSE', over: 'OVER' });
export const LED_BLOCKS = 20;

// input: { now, focus (faceFocus shape), show ('auto' | 'clock' | 'timer'), seconds }
// → { text: 'MM:SS' | 'MM' | 'HH:MM', plus, caption, small, progress, blink, label, mode, phase, paused, overtime }
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

// The same face on DEsk's red clock (src/desk/ClockFace.jsx paintClock): six digit cells, the colon, a
// dot-matrix word and a row of blocks. A round fills the cells as DEsk's focus clock does — minutes,
// seconds, and the rounds done today in the two small cells; the wall clock is HH MM SS. A cell with no
// digit (seconds hidden) stays dark.
export function deskFace(led, { now = Date.now(), rounds = 0 } = {}) {
  const two = (n) => String(Math.max(0, Math.min(99, Math.floor(Number(n) || 0)))).padStart(2, '0');
  const [a = '', b] = String(led.text).split(':');
  const small = led.mode === 'clock' ? (led.small ? two(led.small) : '--') : two(rounds);
  const digits = (a.length > 2 ? '99' : a.padStart(2, '0')) + (b === undefined ? '--' : a.length > 2 ? '59' : b.padStart(2, '0')) + small;
  const colon = led.blink ? Math.floor(now / 1000) % 2 === 0 : b !== undefined;
  const bar = led.mode === 'clock' || led.phase === 'idle' ? null : led.progress;
  return { digits, colon, word: led.caption, bar };
}

// 1..4 lamps for the rounds of a set: done, the running one, and those to come.
export function roundLamps({ round, longEvery, phase }) {
  return Array.from({ length: Math.max(1, longEvery) }, (_, index) => index < round ? 'done' : index === round && phase === 'focus' ? 'active' : 'rest');
}
