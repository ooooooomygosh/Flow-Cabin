import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { recordEnd } from './session-log.mjs';
import * as model from './focus-model.mjs';
import { playChime, focusChime } from '../lib/chime.mjs';
import { focusHeld, transferTimer } from '../sync/focus-handoff.mjs';
import { noticeFor, showNotice } from './focus-notice.mjs';

// Two contexts: the record and its actions change only on commits; the clock
// ticks once per displayed second while a timer runs. Only the time displays
// (badge, ring, widgets) read the clock, so a running timer no longer
// re-renders the whole cabin twice a second.
const FocusContext = createContext(null), FocusClockContext = createContext(0);
// Next moment the shown remaining time (whole seconds, rounded up) changes.
export const nextSecondDelay = (endsAt, now) => { const left = endsAt - now; return left > 0 ? Math.max(40, left % 1000 || 1000) + 8 : 1000; };
// A phase that ended this long ago (settled after a wake-up) is not chimed any more.
const FRESH_MS = 90000;
// The desktop shell keeps timers running while hidden: a gap this long between two ticks means
// the computer slept (the lock / suspend event may not have reached the page in time).
const SLEEP_GAP_MS = 3 * 60000;
const isDesktop = () => document.documentElement.dataset.desktopClient === 'true';
const minutes = (ms) => Math.max(1, Math.round(ms / 60000));

export function FocusProvider({ userId, notify = () => {}, children }) {
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
  const say = useRef(notify); say.current = notify;
  // A phase that ran out on its own chimes and notifies. A skip, an early end or ending
  // overtime by hand is the user's own action: it stays quiet.
  const announce = (event) => {
    if (!event) return;
    const state = current.current, settings = state.settings;
    window.dispatchEvent(new CustomEvent('album-focus-phase', { detail: event }));
    if (!event.completed || event.manual) return;
    const fresh = Date.now() - (Number(event.at) || 0) < FRESH_MS;
    const chimed = Boolean(settings.chime && fresh && settings.chimeVolume > 0 && playChime(focusChime(settings.chimeSound), { volume: settings.chimeVolume / 100 }).ok);
    if (settings.notify) showNotice(noticeFor(event, state), { silent: chimed });
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
  const applyTimer = (change) => {
    if (focusHeld(current.current.timer)) { setError('这轮专注正在交接，先在设备联动中确认接收状态。'); return false; }
    return apply((state, time) => {
    const elapsed = model.tick(state, time);
    return elapsed.event ? elapsed : change(state, time);
    }, { volatile: true });
  };
  useEffect(() => {
    const running = state.timer.phase !== 'idle' && !state.timer.paused;
    if (!running) return;
    let last = Date.now();
    const advance = () => {
      const time = Date.now(), gap = time - last; last = time; setNow(time);
      // Woke from sleep without the shell's lock / suspend notice: settle as an absence first.
      if (gap > SLEEP_GAP_MS && isDesktop() && current.current.timer.phase === 'focus' && !current.current.timer.paused) { leave(time - gap); arrive(time); return; }
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
  // 锁屏 / 休眠 (desktop shell power events, or a long gap in the tick loop): a running focus
  // round pauses at the moment the user left. Back again, a short absence simply counts; a
  // longer one asks 「刚才在专注吗？」 (or, with 自动暂停, waits for 继续).
  const leave = (at) => apply((s) => model.away(s, at), { volatile: true });
  const arrive = (time) => {
    const result = model.back(current.current, time);
    if (result.state !== current.current) { apply(() => result.state, { volatile: true }); return; }
    if (!result.away) return;
    const gone = `刚才离开了 ${minutes(result.away)} 分钟，专注先暂停了。`;
    if (result.asked) say.current(`${gone}那段时间在专注吗？`, { action: { label: '算进专注', run: () => applyTimer((s, t) => model.tick(model.creditAway(s), t)) }, duration: 20000 });
    else say.current(gone, { action: { label: '继续', run: () => applyTimer(model.resume) }, duration: 12000 });
  };
  const power = useRef({ leave, arrive }); power.current = { leave, arrive };
  // 分心了: one tap, with 撤销.
  const distraction = () => {
    const at = Date.now();
    if (apply((s) => model.logDistraction(s, at))) say.current('记下了一次分心。深呼吸，回到手头的事。', { action: { label: '撤销', run: () => apply((s) => model.removeDistraction(s, at)) } });
    return current.current.distractions.some((item) => item.at === at);
  };
  useEffect(() => {
    const receive = (event) => {
      const detail = event.detail || {}, at = Number(detail.at) || Date.now();
      if (detail.state === 'away') power.current.leave(at);
      else if (detail.state === 'back') { const from = Number(detail.from); if (from > 0 && from < at) power.current.leave(from); power.current.arrive(at); }
    };
    window.addEventListener('album-power', receive);
    return () => window.removeEventListener('album-power', receive);
  }, []);
  // 顺延: unfinished 今天 tasks move to the new day (checked at start and every few minutes).
  useEffect(() => {
    const roll = () => apply((s, t) => model.rollOverTasks(s, t), { volatile: true });
    roll(); const timer = setInterval(roll, 5 * 60000);
    return () => clearInterval(timer);
  }, [key]);
  useEffect(() => {
    // Commands from the desktop pet, tray, notifications and global shortcuts arrive through the native shell.
    const receive = (event) => {
      const command = event.detail?.command;
      if (command === 'focus-start') applyTimer((s, t) => s.timer.phase === 'idle' ? model.startPhase(s, 'focus', t) : model.resume(s, t));
      else if (command === 'focus-pause') applyTimer((s, t) => model.pause(s, t));
      else if (command === 'focus-toggle') applyTimer((s, t) => model.toggle(s, t));
      else if (command === 'focus-skip') applyTimer((s, t) => s.timer.phase === 'focus' ? model.endRound(s, t) : model.skip(s, t));
      else if (command === 'focus-extend') applyTimer((s, t) => model.extend(s, t));
      else if (command === 'focus-break') applyTimer((s, t) => model.startBreak(s, t));
      else if (command === 'focus-next') applyTimer((s, t) => model.nextRound(s, t));
      else if (command === 'focus-end') applyTimer((s, t) => model.stop(s, t));
      else if (command === 'focus-distraction') distraction();
    };
    window.addEventListener('album-companion-command', receive);
    return () => window.removeEventListener('album-companion-command', receive);
  }, []);
  useEffect(() => {
    // The desktop pet's accessory chips are a fixed whitelist in the native
    // shell. Equip still checks level / bought unlocks in the focus model.
    const equipAccessory = (event) => {
      const value = event.detail?.accessory;
      if (typeof value === 'string' && ['', 'headphones', 'scarf', 'beanie', 'bow', 'sprout'].includes(value)) apply((s) => model.equip(s, 'accessory', value));
    };
    window.addEventListener('cabin:equip-accessory', equipAccessory);
    return () => window.removeEventListener('cabin:equip-accessory', equipAccessory);
  }, []);
  // Actions only use refs and state setters: built once per storage key.
  const actions = useMemo(() => ({
    prepareTransfer: () => { const time=Date.now(),data=transferTimer(current.current.timer,time); const next=model.pause(current.current,time); if(!commit({...next,timer:{...next.timer,sessionId:data.sessionId,ownerVersion:data.version}}).persisted)throw Error('暂停专注未能保存，未开始交接。');return data; },
    acceptTransfer: data => { if(current.current.timer.phase!=='idle')throw Error('这台设备已有计时，不能接收专注。');if(!data?.sessionId || !(data.remaining>0 && data.remaining<=data.duration && data.duration<=10800000))throw Error('专注交接时间无效。');const time=Date.now();if(!commit({...current.current,timer:{phase:data.phase,sessionId:data.sessionId,ownerVersion:data.version,duration:data.duration,remaining:data.remaining,endsAt:time+data.remaining,startedAt:time-(data.duration-data.remaining),paused:false,round:current.current.timer.round,taskId:''}}).persisted)throw Error('接收计时未能保存。');return true; },
    releaseTransfer: id => { if(current.current.timer.sessionId!==id)return false;return commit(model.reset(current.current)).persisted; },
    toggle: () => { if (!isDesktop() && current.current.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch?.(() => {}); return applyTimer(model.toggle); },
    start: (phase = 'focus', taskId) => applyTimer((s, t) => model.startPhase(s, phase, t, taskId)),
    skip: () => applyTimer(model.skip),
    endRound: () => applyTimer(model.endRound),
    extend: (minutes) => applyTimer((s, t) => model.extend(s, t, minutes)),
    startBreak: () => applyTimer(model.startBreak),
    nextRound: () => applyTimer(model.nextRound),
    creditAway: () => applyTimer((s, t) => model.tick(model.creditAway(s), t)),
    distraction: () => distraction(),
    completeCurrent: () => { const id = current.current.timer.taskId; return id ? apply((s, t) => model.updateTask(s, id, { done: true }, t)) : false; },
    moveTaskToList: (id, list) => apply((s, t) => model.moveTaskToList(s, id, list, t)),
    addSubtask: (id, text) => apply((s) => model.addSubtask(s, id, text)),
    toggleSubtask: (id, subId) => apply((s) => model.toggleSubtask(s, id, subId)),
    removeSubtask: (id, subId) => apply((s) => model.removeSubtask(s, id, subId)),
    reset: () => apply((s, t) => { const elapsed = model.tick(s, t); return { state: model.reset(elapsed.state), event: elapsed.event }; }, { volatile: true }),
    settings: (change) => apply((s) => ({ ...s, settings: model.normalizeSettings({ ...s.settings, ...change }) })),
    addTask: (text, options) => apply((s, t) => model.addTask(s, text, t, options)),
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
