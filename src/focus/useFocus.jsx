import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { recordEnd } from './session-log.mjs';
import * as model from './focus-model.mjs';
import { playChime } from '../lib/chime.mjs';

// Two contexts: the record and its actions change only on commits; the clock
// ticks once per displayed second while a timer runs. Only the time displays
// (badge, ring, widgets) read the clock, so a running timer no longer
// re-renders the whole cabin twice a second.
const FocusContext = createContext(null), FocusClockContext = createContext(0);
// Next moment the shown remaining time (whole seconds, rounded up) changes.
export const nextSecondDelay = (endsAt, now) => { const left = endsAt - now; return left > 0 ? Math.max(40, left % 1000 || 1000) + 8 : 1000; };
const NOTICE = { focus: ['专注完成', '辛苦啦，起来伸个懒腰吧。+1 小鱼干'], shortBreak: ['休息结束', '准备好就开始下一轮专注。'], longBreak: ['长休息结束', '状态回来了吗？开始新一轮吧。'] };

export function FocusProvider({ userId, children }) {
  const key = model.FOCUS_PREFIX + userId;
  const [state, setState] = useState(() => model.readFocus(localStorage, userId));
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const current = useRef(state), dirty = useRef(false), conflicted = useRef(false);
  const conflictMessage = '另一窗口更新了专注记录；当前草稿已保留，重试将以本窗口内容保存。';
  // Notes and running timers may keep a recoverable working copy. Explicit
  // edits/imports are transactional: failed writes must not look committed.
  const commit = (next, { volatile = false, overwriteConflict = false } = {}) => {
    const value = model.normalizeFocus(next), raw = JSON.stringify(value);
    if (raw.length > model.MAX_FOCUS_BYTES) { setError('专注记录空间已满，请清理已完成的待办。'); return { applied: false, persisted: false }; }
    if (conflicted.current && !overwriteConflict) {
      setError(conflictMessage);
      if (!volatile) return { applied: false, persisted: false };
      // Keep typing and timer settlement available without overwriting the
      // other window. Only an explicit retry resolves this conflict.
      dirty.current = true; current.current = value; setState(value);
      return { applied: true, persisted: false };
    }
    let persisted = true;
    try { localStorage.setItem(key, raw); conflicted.current = false; setError(''); } catch {
      persisted = false; setError(conflicted.current ? `${conflictMessage} 本次保存仍失败，请检查存储空间。` : '无法保存专注记录，请检查存储空间。');
      if (!volatile) return { applied: false, persisted: false };
    }
    dirty.current = !persisted; current.current = value; setState(value);
    return { applied: true, persisted };
  };
  const announce = (event) => {
    if (!event) return;
    const settings = current.current.settings, [title, body] = NOTICE[event.phase] || [];
    window.dispatchEvent(new CustomEvent('album-focus-phase', { detail: event }));
    if (settings.chime) playChime('focus');
    if (settings.notify && title && event.completed && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: event.unlocked?.length ? `${body}\n解锁：${event.unlocked.join('、')}` : body, silent: true, tag: 'album-focus' }); } catch {}
    }
  };
  const apply = (change, options) => {
    const time = Date.now(), previous = current.current, result = change(previous, time);
    const next = result && result.state ? result.state : result;
    if (next === previous) return false;
    const resultCommit = commit(next, options);
    if (!resultCommit.applied) return false;
    setNow(time);
    if (next.timer.phase === 'focus' && (previous.timer.phase !== 'focus' || previous.timer.startedAt !== next.timer.startedAt)) window.dispatchEvent(new CustomEvent('album-focus-start', { detail: { phase: 'focus', autoSound: next.settings.autoSound } }));
    try { recordEnd(previous, next, time); } catch {}
    if (result?.event) announce(result.event);
    return resultCommit.persisted;
  };
  // A user can click immediately after wake, before the first interval fires.
  // Settle the expired phase first rather than pausing/skipping a finished round.
  const applyTimer = (change) => apply((state, time) => {
    const elapsed = model.tick(state, time);
    return elapsed.event ? elapsed : change(state, time);
  }, { volatile: true });
  useEffect(() => {
    const running = state.timer.phase !== 'idle' && !state.timer.paused;
    if (!running) return;
    const advance = () => {
      const time = Date.now(); setNow(time);
      const result = model.tick(current.current, time);
      const before = current.current;
      if (result.event && commit(result.state, { volatile: true }).applied) { try { recordEnd(before, result.state, time); } catch {} announce(result.event); }
    };
    let timer = 0;
    const loop = () => { advance(); clearTimeout(timer); timer = setTimeout(loop, nextSecondDelay(current.current.timer.endsAt, Date.now())); };
    loop();
    window.addEventListener('focus', loop);
    document.addEventListener('visibilitychange', loop);
    return () => { clearTimeout(timer); window.removeEventListener('focus', loop); document.removeEventListener('visibilitychange', loop); };
  }, [state.timer.phase, state.timer.paused, state.timer.endsAt]);
  useEffect(() => {
    const sync = (event) => { if (event.key !== key) return; if (dirty.current) { conflicted.current = true; setError(conflictMessage); return; } const next = model.readFocus(localStorage, userId); current.current = next; setState(next); setNow(Date.now()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  useEffect(() => {
    // Commands from the desktop pet and tray arrive through the native shell.
    const receive = (event) => {
      const command = event.detail?.command;
      if (command === 'focus-start') applyTimer((s, t) => s.timer.phase === 'idle' ? model.startPhase(s, 'focus', t) : model.resume(s, t));
      else if (command === 'focus-pause') applyTimer((s, t) => model.pause(s, t));
      else if (command === 'focus-toggle') applyTimer((s, t) => model.toggle(s, t));
      else if (command === 'focus-skip') applyTimer((s, t) => model.skip(s, t));
    };
    window.addEventListener('album-companion-command', receive);
    return () => window.removeEventListener('album-companion-command', receive);
  }, []);
  // Actions only use refs and state setters: built once per storage key.
  const actions = useMemo(() => ({
    toggle: () => { if (current.current.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch?.(() => {}); return applyTimer(model.toggle); },
    start: (phase = 'focus', taskId) => applyTimer((s, t) => model.startPhase(s, phase, t, taskId)),
    skip: () => applyTimer(model.skip),
    reset: () => apply((s, t) => { const elapsed = model.tick(s, t); return { state: model.reset(elapsed.state), event: elapsed.event }; }, { volatile: true }),
    settings: (change) => apply((s) => ({ ...s, settings: model.normalizeSettings({ ...s.settings, ...change }) })),
    addTask: (text) => apply((s, t) => model.addTask(s, text, t)),
    updateTask: (id, change) => apply((s, t) => model.updateTask(s, id, change, t)),
    removeTask: (id) => apply((s) => model.removeTask(s, id)),
    restoreTask: (task, index) => apply((s) => model.restoreTask(s, task, index)),
    moveTask: (id, index) => apply((s) => model.moveTask(s, id, index)),
    renameTask: (id, text) => apply((s) => model.renameTask(s, id, text)),
    preset: (id) => { const change = model.presetSettings(id); return change ? apply((s) => ({ ...s, settings: model.normalizeSettings({ ...s.settings, ...change }) })) : current.current; },
    clearDone: () => apply(model.clearDone),
    saveNotes: (notes) => apply((s) => ({ ...s, notes: model.normalizeNotes(notes) }), { volatile: true }),
    selectTask: (id, toggle = false) => apply((s) => model.selectTask(s, id, toggle)),
    equip: (kind, value) => apply((s) => model.equip(s, kind, value)),
    spendFish: (count = 1) => apply((s) => model.spendFish(s, count)),
    buyUnlock: (id) => apply((s) => model.buyUnlock(s, id)),
    retrySave: () => commit(current.current, { volatile: true, overwriteConflict: true }).persisted,
    replace: (value) => commit({ ...model.normalizeFocus(value), timer: current.current.timer }).persisted
  }), [key]);
  const unsaved = dirty.current;
  const value = useMemo(() => ({ state, error, hasUnsavedChanges: unsaved, snapshot: () => model.focusSnapshot(current.current, Date.now()), ...actions }), [state, error, unsaved, actions]);
  return <FocusContext.Provider value={value}><FocusClockContext.Provider value={now}>{children}</FocusClockContext.Provider></FocusContext.Provider>;
}
// Record + actions only: no re-render on clock ticks.
export function useFocusState() { return useContext(FocusContext); }
// The ticking time (ms) while a timer runs.
export function useFocusNow() { return useContext(FocusClockContext); }
// Compatibility shape: state, actions, `now` and `remaining`. Ticks with the clock.
export function useFocus() {
  const focus = useContext(FocusContext), now = useContext(FocusClockContext);
  return useMemo(() => focus && { ...focus, now, remaining: model.remainingMs(focus.state.timer, now) }, [focus, now]);
}
