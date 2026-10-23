export const HANDOFF_KEY = 'flow-cabin-focus-handoff-v1';
export function readHandoff(storage = globalThis.localStorage) { try { const v=JSON.parse(storage.getItem(HANDOFF_KEY));return v && ['source','prepared','owner','sent'].includes(v.role) && typeof v.sessionId==='string' ? v : null; } catch { return null; } }
export function writeHandoff(value, storage = globalThis.localStorage) { value ? storage.setItem(HANDOFF_KEY,JSON.stringify(value)) : storage.removeItem(HANDOFF_KEY);globalThis.dispatchEvent?.(new Event('cabin:handoff'));return value; }
export function focusHeld(timer, storage = globalThis.localStorage) { const h=readHandoff(storage);return h?.role==='source' && h.sessionId===timer.sessionId; }
export function transferTimer(timer, now = Date.now()) {
  const remaining=timer.paused?timer.remaining:timer.endsAt-now;
  if (!['focus','shortBreak','longBreak'].includes(timer.phase) || remaining <= 0 || remaining > 10800000) throw Error('当前没有可交接的专注或休息。');
  return { sessionId:timer.sessionId || crypto.randomUUID(), version:(timer.ownerVersion || 0)+1, phase:timer.phase, duration:timer.duration, remaining };
}
