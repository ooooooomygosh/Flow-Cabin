// What a focus face shows at `now`, and when it next has to look again.
// Pure: the face host (FocusFace.jsx) sleeps on one wall-clock-aligned
// setTimeout to that moment (Pomotroid's fixed timeline): no rAF, no polling.
import { PHASE_LABELS, formatClock } from './focus-model.mjs';

const MINUTE = 60000, pad = (n) => String(n).padStart(2, '0');
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const dateLine = (date) => `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 周${WEEK[date.getDay()]}`;

// focus: { phase, paused, endsAt, remaining, duration?, hideSeconds, task?, round?, longEvery?, focusMin? }
// show: 'auto' (the round while one runs, else the clock) | 'clock' | 'timer'.
export function faceModel({ now = Date.now(), focus = null, show = 'auto', seconds = false } = {}) {
  const f = focus || {}, phase = f.phase || 'idle', idle = phase === 'idle';
  const mode = show === 'clock' ? 'clock' : show === 'timer' ? 'timer' : idle ? 'clock' : 'timer';
  const duration = Number(f.duration) || 0;
  const remaining = idle ? (Number(f.focusMin) || 25) * MINUTE : f.paused ? Number(f.remaining) || 0 : Math.max(0, (Number(f.endsAt) || now) - now);
  const progress = idle ? 0 : duration ? Math.max(0, Math.min(1, 1 - remaining / duration)) : null;
  const date = new Date(now), base = { now, mode, phase, paused: Boolean(f.paused), running: !idle && !f.paused, progress, remaining, duration, task: f.task || '', round: Number(f.round) || 0, longEvery: Number(f.longEvery) || 4, hour: date.getHours() + date.getMinutes() / 60 };
  if (mode === 'clock') {
    const hh = pad(date.getHours()), mm = pad(date.getMinutes());
    return { ...base, groups: [hh, mm], small: seconds ? pad(date.getSeconds()) : '', unit: '', label: `现在 ${hh}:${mm}`, caption: dateLine(date), clockText: `${hh}:${mm}` };
  }
  const label = formatClock(remaining, f.hideSeconds);
  if (f.hideSeconds) { const minutes = String(Math.max(0, Math.ceil(remaining / MINUTE))).padStart(2, '0'); return { ...base, groups: [minutes], small: '', unit: '分', label, caption: PHASE_LABELS[phase] + (f.paused ? ' · 已暂停' : ''), clockText: minutes }; }
  const total = Math.max(0, Math.ceil(remaining / 1000)), mm = pad(Math.floor(total / 60)), ss = pad(total % 60);
  return { ...base, groups: [mm, ss], small: '', unit: '', label, caption: PHASE_LABELS[phase] + (f.paused ? ' · 已暂停' : ''), clockText: `${mm}:${ss}` };
}

// Milliseconds until anything a face draws can change. `steps`: the face draws
// progress in that many discrete steps; `wall`: it also follows the wall clock.
export function nextWake(model, { steps = 0, wall = false, seconds = false } = {}) {
  const { now } = model, waits = [];
  if (model.mode === 'clock' || wall) waits.push((model.mode === 'clock' && seconds ? 1000 - now % 1000 : MINUTE - now % MINUTE) + 4);
  if (model.mode === 'timer' && model.running) {
    const r = model.remaining, unit = model.unit ? MINUTE : 1000;
    waits.push((r % unit || unit) + 8);
    if (steps && model.duration && model.progress !== null) {
      const step = model.duration / steps, elapsed = model.duration - r;
      if (r > 0) waits.push(Math.ceil((Math.floor(elapsed / step) + 1) * step - elapsed) + 8);
    }
  }
  return waits.length ? Math.max(40, Math.min(...waits)) : Infinity;
}
// What a face draws, as a string: repaint only when it changes.
export const modelKey = (m, steps = 0) => [m.mode, m.groups.join(':'), m.small, m.unit, m.phase, m.paused, m.progress === null ? '-' : steps ? Math.floor(m.progress * steps) : '', Math.floor(m.hour * 60)].join('|');
