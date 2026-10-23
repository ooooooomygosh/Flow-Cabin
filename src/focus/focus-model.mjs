// Pomodoro, tasks, statistics and rewards. Pure functions only: every
// transition receives `now`, so hidden or throttled windows stay accurate.
import { dayKey, startOfDay, addDays } from '../lib/local-calendar.mjs';
export { dayKey } from '../lib/local-calendar.mjs';
export const FOCUS_PREFIX = 'album-circle-focus-v1:';
export const MAX_FOCUS_BYTES = 512000;
export const MAX_NOTE_LENGTH = 8000;
export const normalizeNotes = (value) => typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, MAX_NOTE_LENGTH) : '';
export const PHASES = ['idle', 'focus', 'shortBreak', 'longBreak'];
export const PHASE_LABELS = { idle: '准备开始', focus: '专注中', shortBreak: '短休息', longBreak: '长休息' };
const MINUTE = 60000;
// A round may grow past its setting with +5 分钟 (and overtime keeps counting), but never beyond
// what a session record accepts (4 h).
const MAX_DURATION = 240 * MINUTE, MAX_OVER = 180 * MINUTE;
export const EXTEND_MIN = 5;
// 锁屏 / 休眠: 'ask' pauses and offers to count the time away, 'pause' only pauses, 'count' keeps the old behaviour.
export const SLEEP_POLICIES = Object.freeze([['ask', '回来时询问'], ['pause', '自动暂停'], ['count', '照常计时']]);
// Absences shorter than this (a quick screen lock) count without asking.
export const AWAY_GRACE = MINUTE;

export const DEFAULT_SETTINGS = Object.freeze({ focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoBreak: true, autoFocus: false, notify: true, chime: true, autoSound: false, hideSeconds: false, catSkin: 'orange', dailyGoal: 90, overtime: false, sleepPolicy: 'ask', chimeSound: 'bell', chimeVolume: 70, quietMode: false });
export const CHIME_SOUNDS = Object.freeze(['bell', 'wood', 'soft', 'digital']);
// One-tap rhythms. Values stay inside normalizeSettings() bounds.
export const FOCUS_PRESETS = Object.freeze([
  Object.freeze({ id: 'sprint', label: '冲刺', hint: '15 / 3', focusMin: 15, shortMin: 3, longMin: 10 }),
  Object.freeze({ id: 'classic', label: '经典', hint: '25 / 5', focusMin: 25, shortMin: 5, longMin: 15 }),
  Object.freeze({ id: 'deep', label: '深度', hint: '50 / 10', focusMin: 50, shortMin: 10, longMin: 20 }),
  Object.freeze({ id: 'flow', label: '心流', hint: '90 / 20', focusMin: 90, shortMin: 20, longMin: 30 })
]);
export function presetSettings(id) {
  const preset = FOCUS_PRESETS.find((item) => item.id === id);
  return preset ? { focusMin: preset.focusMin, shortMin: preset.shortMin, longMin: preset.longMin } : null;
}
export function activePreset(settings) {
  const s = normalizeSettings(settings);
  return FOCUS_PRESETS.find((item) => item.focusMin === s.focusMin && item.shortMin === s.shortMin && item.longMin === s.longMin)?.id || '';
}
// 0..1 progress of the visible phase; idle shows an empty ring.
export function phaseProgress(timer, settings, now) {
  if (!timer || timer.phase === 'idle') return 0;
  const total = timer.duration || phaseDuration(settings, timer.phase);
  return total ? Math.max(0, Math.min(1, 1 - remainingMs(timer, now) / total)) : 0;
}
export function renameTask(state, taskId, value) {
  const name = text(value, 120);
  if (!name) return state;
  return { ...state, tasks: state.tasks.map((task) => task.id === taskId ? { ...task, text: name } : task) };
}
export function taskProgress(tasks, now) {
  const today = dayKey(now), done = tasks.filter((task) => task.done).length;
  return { total: tasks.length, done, open: tasks.length - done, doneToday: tasks.filter((task) => task.done && task.doneAt && dayKey(task.doneAt) === today).length };
}

// Rewards follow the Chill Pulse idea of unlocking cosy extras by working.
export const UNLOCKS = Object.freeze([
  { id: 'snow', kind: 'weather', level: 1, name: '雪夜窗景' },
  { id: 'clear', kind: 'weather', level: 1, name: '晴朗窗景' },
  { id: 'headphones', kind: 'accessory', level: 2, name: '小猫耳机' },
  { id: 'rain', kind: 'weather', level: 2, name: '雨天窗景' },
  { id: 'scarf', kind: 'accessory', level: 3, name: '红色围巾' },
  { id: 'beanie', kind: 'accessory', level: 4, name: '毛线帽' },
  { id: 'bow', kind: 'accessory', level: 1, name: '鼠尾草领结' },
  { id: 'sprout', kind: 'accessory', level: 3, name: '小芽帽' },
  { id: 'starry', kind: 'weather', level: 5, name: '星空窗景' }
]);

// “没有这个值”和“这个值是 0”是两回事：null / '' / 布尔值都算缺失，
// 落回默认值，而不是被当成 0（那会把 25 分钟的专注变成 1 分钟）。
export const numeric = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
};
const clamp = (value, min, max, fallback) => { const n = numeric(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };
const text = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';
// 随机 id 的唯一来源。模型默认用它，调用方可以注入自己的实现（测试、确定性重建）。
export const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const makeId = (factory) => (typeof factory === 'function' ? String(factory()) : randomId());

export function normalizeSettings(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    focusMin: clamp(v.focusMin, 1, 180, DEFAULT_SETTINGS.focusMin), shortMin: clamp(v.shortMin, 1, 60, DEFAULT_SETTINGS.shortMin),
    longMin: clamp(v.longMin, 1, 90, DEFAULT_SETTINGS.longMin), longEvery: clamp(v.longEvery, 2, 8, DEFAULT_SETTINGS.longEvery),
    autoBreak: v.autoBreak !== false, autoFocus: v.autoFocus === true, notify: v.notify !== false, chime: v.chime !== false, autoSound: v.autoSound === true, hideSeconds: v.hideSeconds === true, catSkin: v.catSkin === 'black' ? 'black' : 'orange', dailyGoal: clamp(v.dailyGoal, 0, 720, DEFAULT_SETTINGS.dailyGoal),
    overtime: v.overtime === true, sleepPolicy: SLEEP_POLICIES.some(([id]) => id === v.sleepPolicy) ? v.sleepPolicy : DEFAULT_SETTINGS.sleepPolicy,
    chimeSound: CHIME_SOUNDS.includes(v.chimeSound) ? v.chimeSound : DEFAULT_SETTINGS.chimeSound, chimeVolume: clamp(v.chimeVolume, 0, 100, DEFAULT_SETTINGS.chimeVolume),
    // 免打扰: the companion stays calm (no dancing, no proactive bubbles or requests).
    quietMode: v.quietMode === true
  };
}
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
// roundDay: the local day of the last finished round, so the 第 n 轮 counter starts over on a new day.
const roundDay = (v) => typeof v.roundDay === 'string' && DAY_KEY.test(v.roundDay) ? { roundDay: v.roundDay } : {};
function normalizeTimer(value = {}, settings = DEFAULT_SETTINGS) {
  const v = value && typeof value === 'object' ? value : {};
  const phase = PHASES.includes(v.phase) ? v.phase : 'idle';
  if (phase === 'idle') return { phase, endsAt: 0, remaining: 0, paused: false, startedAt: 0, round: clamp(v.round, 0, 1e6, 0), taskId: text(v.taskId, 40), ...roundDay(v) };
  // due: a focus round in overtime (到点后继续计时); over: overtime already counted while paused.
  // awayAt: paused because the screen locked or the computer slept at that moment.
  const due = phase === 'focus' && v.due === true, awayAt = clamp(v.awayAt, 0, 9e15, 0);
  return { phase, duration: clamp(v.duration, 1, MAX_DURATION, phaseDuration(settings, phase)), endsAt: clamp(v.endsAt, 0, 9e15, 0), remaining: clamp(v.remaining, 0, MAX_DURATION, 0), paused: v.paused === true, startedAt: clamp(v.startedAt, 0, 9e15, 0), round: clamp(v.round, 0, 1e6, 0), taskId: text(v.taskId, 40), ...roundDay(v),
    ...(due ? { due, over: clamp(v.over, 0, MAX_OVER, 0) } : {}), ...(awayAt && v.paused === true ? { awayAt } : {}),
    ...(typeof v.sessionId==='string' && /^[\w-]{1,100}$/.test(v.sessionId) ? {sessionId:v.sessionId,ownerVersion:clamp(v.ownerVersion,0,1e9,0)} : {}) };
}
export const MAX_SUBTASKS = 20;
function normalizeSubtasks(value, factory) {
  return (Array.isArray(value) ? value : []).map((item) => item && typeof item === 'object' && text(item.text, 80) ? { id: text(item.id, 40) || makeId(factory), text: text(item.text, 80), done: item.done === true } : null).filter(Boolean).slice(0, MAX_SUBTASKS);
}
// Tasks saved before 2.2 have no list / estimate / subtasks: they load into 今天 with no estimate.
function normalizeTask(value, factory) {
  if (!value || typeof value !== 'object' || !text(value.text, 120)) return null;
  return { id: text(value.id, 40) || makeId(factory), text: text(value.text, 120), done: value.done === true, pomodoros: clamp(value.pomodoros, 0, 999, 0), createdAt: clamp(value.createdAt, 0, 9e15, 0), doneAt: value.done === true ? clamp(value.doneAt, 0, 9e15, 0) : 0,
    // 今天 / 之后; plannedFor: the day a 今天 task is planned for (`carried`: how often it rolled over).
    estimate: clamp(value.estimate, 0, 20, 0), list: value.list === 'later' ? 'later' : 'today', plannedFor: typeof value.plannedFor === 'string' && DAY_KEY.test(value.plannedFor) && value.list !== 'later' ? value.plannedFor : '',
    carried: clamp(value.carried, 0, 999, 0), subtasks: normalizeSubtasks(value.subtasks, factory) };
}
// One tap during a focus round: when, and on which task. Shown in the statistics.
function normalizeDistraction(value) {
  const at = clamp(value?.at, 0, 9e15, 0);
  return at ? { at, taskId: text(value.taskId, 40) } : null;
}
function normalizeSession(value) {
  if (!value || typeof value !== 'object') return null;
  const start = clamp(value.start, 0, 9e15, 0), end = clamp(value.end, 0, 9e15, 0);
  if (!start || end <= start || end - start > 4 * 60 * MINUTE) return null;
  return { start, end, taskId: text(value.taskId, 40), completed: value.completed !== false };
}
export function normalizeFocus(value = {}, { makeId: factory } = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const rewards = v.rewards && typeof v.rewards === 'object' ? v.rewards : {};
  const equipped = rewards.equipped && typeof rewards.equipped === 'object' ? rewards.equipped : {};
  const xp = clamp(rewards.xp, 0, 1e9, 0), bought = [...new Set((Array.isArray(rewards.bought) ? rewards.bought : []).filter((id) => UNLOCKS.some((item) => item.id === id)))], unlocked = unlockedIds(xp, bought);
  const pick = (value, kind, fallback) => unlocked.has(value) && UNLOCKS.find((item) => item.id === value)?.kind === kind ? value : fallback;
  return {
    version: 1,
    notes: normalizeNotes(v.notes),
    settings: normalizeSettings(v.settings),
    timer: normalizeTimer(v.timer, normalizeSettings(v.settings)),
    tasks: (Array.isArray(v.tasks) ? v.tasks : []).map((task) => normalizeTask(task, factory)).filter(Boolean).slice(0, 200),
    sessions: (Array.isArray(v.sessions) ? v.sessions : []).map(normalizeSession).filter(Boolean).slice(-2000),
    distractions: (Array.isArray(v.distractions) ? v.distractions : []).map(normalizeDistraction).filter(Boolean).slice(-1000),
    rewards: { fish: clamp(rewards.fish, 0, 1e9, 0), xp, bought, equipped: { accessory: pick(equipped.accessory, 'accessory', ''), weather: pick(equipped.weather, 'weather', 'snow') } }
  };
}
export function readFocus(storage, userId) {
  try { return normalizeFocus(JSON.parse(storage.getItem(FOCUS_PREFIX + userId) || '{}')); } catch { return normalizeFocus(); }
}

export function phaseDuration(settings, phase) {
  const s = normalizeSettings(settings);
  return ({ focus: s.focusMin, shortBreak: s.shortMin, longBreak: s.longMin }[phase] || 0) * MINUTE;
}
export function remainingMs(timer, now) {
  if (!timer || timer.phase === 'idle') return 0;
  return timer.paused ? timer.remaining : Math.max(0, timer.endsAt - now);
}
// Time counted past the planned end of an overtime round (0 otherwise).
export function overtimeMs(timer, now) {
  if (!timer?.due) return 0;
  return Math.min(MAX_OVER, timer.paused ? timer.over || 0 : Math.max(0, now - timer.endsAt));
}
// The 第 n 轮 counter as shown: a new local day starts a fresh set.
export function currentRound(timer, now) {
  return timer?.roundDay && timer.roundDay !== dayKey(now) && timer.phase === 'idle' ? 0 : timer?.round || 0;
}
export function formatClock(ms, hideSeconds = false) {
  if (hideSeconds) return `${Math.max(0, Math.ceil(ms / MINUTE))} 分钟`;
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function startPhase(state, phase, now, taskId = state.timer.taskId) {
  const duration = phaseDuration(state.settings, phase);
  const { sessionId: previousSession, ownerVersion: previousOwner, due, over, awayAt, ...timer } = state.timer;
  if (!duration) return { ...state, timer: { ...timer, phase: 'idle', endsAt: 0, remaining: 0, paused: false, startedAt: 0 } };
  // The first round of a new local day is round 1 again.
  const round = phase === 'focus' && timer.roundDay && timer.roundDay !== dayKey(now) ? 0 : timer.round;
  return { ...state, timer: { ...timer, round, phase, duration, endsAt: now + duration, remaining: duration, paused: false, startedAt: now, taskId: taskId || '' } };
}
export function pause(state, now) {
  if (state.timer.phase === 'idle' || state.timer.paused) return state;
  const timer = { ...state.timer, paused: true, remaining: remainingMs(state.timer, now) };
  if (timer.due) timer.over = overtimeMs(state.timer, now);
  return { ...state, timer };
}
// A plain resume never counts the time spent paused (also after a lock: see creditAway).
export function resume(state, now) {
  if (state.timer.phase === 'idle' || !state.timer.paused) return state;
  const { awayAt, over, ...timer } = state.timer;
  return { ...state, timer: { ...timer, paused: false, endsAt: timer.due ? now - (over || 0) : now + timer.remaining, ...(timer.due ? { over: 0 } : {}) } };
}
// +5 分钟: lengthens the running phase. In overtime it turns into a fresh 5-minute countdown.
export function extend(state, now, minutes = EXTEND_MIN) {
  const { timer } = state; if (timer.phase === 'idle') return state;
  const add = Math.max(1, Math.round(Number(minutes) || EXTEND_MIN)) * MINUTE, duration = timer.duration || phaseDuration(state.settings, timer.phase);
  if (timer.due) {
    const { due, over, ...rest } = timer;
    return { ...state, timer: { ...rest, duration: Math.min(MAX_DURATION, duration + overtimeMs(timer, now) + add), remaining: add, ...(timer.paused ? {} : { endsAt: now + add }) } };
  }
  const step = Math.min(add, MAX_DURATION - duration); if (step <= 0) return state;
  return { ...state, timer: { ...timer, duration: duration + step, ...(timer.paused ? { remaining: timer.remaining + step } : { endsAt: timer.endsAt + step }) } };
}
// The screen locked or the computer went to sleep at `at`: a running focus round pauses there.
export function away(state, at) {
  const { timer, settings } = state;
  if (settings.sleepPolicy === 'count' || timer.phase !== 'focus' || timer.paused || timer.awayAt || (!timer.due && at >= timer.endsAt)) return state;
  const paused = pause(state, at);
  return { ...paused, timer: { ...paused.timer, awayAt: at } };
}
// Back again. A short absence counts as focus; after a longer one the round stays paused and
// `asked` tells the caller to offer 「刚才在专注吗？」 (creditAway counts it, a plain resume does not).
export function back(state, now) {
  const { timer } = state;
  if (!timer.awayAt || !timer.paused) return { state, away: 0, asked: false };
  const gone = Math.max(0, now - timer.awayAt);
  if (gone < AWAY_GRACE) return { state: creditAway(state), away: gone, asked: false };
  return { state, away: gone, asked: state.settings.sleepPolicy === 'ask' };
}
// 「在专注，算进去」: resume as if the pause never happened, from the moment the user left.
export function creditAway(state) {
  const { timer } = state; if (!timer.awayAt || !timer.paused) return state;
  return resume(state, timer.awayAt);
}
export function toggle(state, now) {
  if (state.timer.phase === 'idle') return startPhase(state, 'focus', now);
  return state.timer.paused ? resume(state, now) : pause(state, now);
}
export function reset(state) { return { ...state, timer: { ...normalizeTimer({ round: state.timer.round, taskId: state.timer.taskId, roundDay: state.timer.roundDay }) } }; }

// Completes the active phase. `completed` is false when skipped by hand; an overtime round is
// always complete (its planned time is behind it) and counts the extra minutes too.
// `manual`: ended by the user, so no chime or notification announces it.
function finish(state, now, completed, manual = false) {
  const { timer } = state; let next = { ...state };
  if (timer.due) completed = true;
  const event = { type: 'phase-end', phase: timer.phase, completed, reward: 0, at: now, ...(manual ? { manual } : {}) };
  if (timer.phase === 'focus') {
    const duration = timer.duration || phaseDuration(state.settings, 'focus');
    // Paused time is excluded: the session is the worked span ending now.
    const worked = timer.due ? duration + overtimeMs(timer, now) : completed ? duration : Math.max(0, duration - remainingMs(timer, now));
    if (worked >= MINUTE) next.sessions = [...state.sessions, { start: now - worked, end: now, taskId: timer.taskId, completed }].slice(-2000);
    if (completed) {
      const minutes = Math.round(worked / MINUTE), level = levelInfo(state.rewards.xp).level;
      next.rewards = { ...state.rewards, fish: state.rewards.fish + 1, xp: state.rewards.xp + minutes };
      next.tasks = state.tasks.map((task) => task.id === timer.taskId ? { ...task, pomodoros: task.pomodoros + 1 } : task);
      event.reward = 1; event.levelUp = levelInfo(next.rewards.xp).level > level;
      event.unlocked = UNLOCKS.filter((item) => item.level > level && item.level <= levelInfo(next.rewards.xp).level).map((item) => item.name);
    }
    const breakPhase = (timer.round + 1) % state.settings.longEvery === 0 ? 'longBreak' : 'shortBreak';
    next.timer = { ...timer, round: completed ? timer.round + 1 : timer.round, ...(completed ? { roundDay: dayKey(now) } : {}) };
    event.next = breakPhase;
    next = state.settings.autoBreak ? startPhase(next, breakPhase, now) : { ...next, timer: normalizeTimer({ round: next.timer.round, taskId: timer.taskId, roundDay: next.timer.roundDay }) };
  } else {
    event.next = 'focus';
    // After a long break the next set starts again from round 1.
    const round = timer.phase === 'longBreak' ? 0 : timer.round;
    next = { ...next, timer: { ...timer, round } };
    next = state.settings.autoFocus ? startPhase(next, 'focus', now) : { ...next, timer: normalizeTimer({ round, taskId: timer.taskId, roundDay: timer.roundDay }) };
  }
  return { state: next, event };
}
// Advances an expired running phase. Long sleeps finish at most one phase so
// the user is never credited with focus they did not see start.
export function tick(state, now) {
  const { timer } = state;
  if (timer.phase === 'idle' || timer.paused || now < timer.endsAt) return { state, event: null };
  // 到点后继续计时: the planned end is announced once, then the round keeps counting up
  // until the user ends it (or the 3-hour cap does).
  if (timer.phase === 'focus' && (state.settings.overtime || timer.due)) {
    if (!timer.due) return { state: { ...state, timer: { ...timer, due: true, over: 0 } }, event: { type: 'phase-due', phase: 'focus', completed: true, reward: 0, at: timer.endsAt, next: 'overtime' } };
    if (now - timer.endsAt < MAX_OVER) return { state, event: null };
    return finish(state, timer.endsAt + MAX_OVER, true);
  }
  const result = finish(state, timer.endsAt, true);
  if (result.state.timer.phase !== 'idle' && now >= result.state.timer.endsAt) {
    // The machine slept through the following phase too; stop and wait.
    result.state = { ...result.state, timer: normalizeTimer({ round: result.state.timer.round, taskId: result.state.timer.taskId, roundDay: result.state.timer.roundDay }) };
  }
  return result;
}
export function skip(state, now) {
  if (state.timer.phase === 'idle') return { state, event: null };
  return finish(state, now, false, true);
}

// Ending work is an explicit stop, independent of automatic break preferences.
// Reuse settlement so paused time, sub-minute rounds and rewards stay consistent.
export function endRound(state, now) {
  if (state.timer.phase !== 'focus') return { state, event: null };
  const result = finish(state, now, false, true);
  return { state: reset(result.state), event: { ...result.event, next: 'idle' } };
}
// The break that follows the rounds finished so far (every longEvery-th one is long).
export const breakAfter = (state) => state.timer.round > 0 && state.timer.round % state.settings.longEvery === 0 ? 'longBreak' : 'shortBreak';
// 开始休息 (end-of-round actions, notification buttons): from a focus round or from idle.
export function startBreak(state, now) {
  if (state.timer.phase === 'shortBreak' || state.timer.phase === 'longBreak') return { state, event: null };
  const ended = state.timer.phase === 'focus' ? skip(state, now) : { state, event: null };
  if (ended.state.timer.phase !== 'idle') return ended;
  return { state: startPhase(ended.state, breakAfter(ended.state), now), event: ended.event };
}
// 再来一轮 / 跳过休息: ends a break (or idle) and starts the next focus round.
export function nextRound(state, now) {
  if (state.timer.phase === 'focus') return { state, event: null };
  const ended = state.timer.phase === 'idle' ? { state, event: null } : skip(state, now);
  return { state: ended.state.timer.phase === 'focus' ? ended.state : startPhase(ended.state, 'focus', now), event: ended.event };
}
// 结束: stops whatever runs. A focus round is settled (worked minutes kept), a break just ends.
export function stop(state, now) {
  if (state.timer.phase === 'focus') return endRound(state, now);
  return state.timer.phase === 'idle' ? { state, event: null } : { state: reset(state), event: null };
}
// 分心了: one tap during a focus round (undo removes exactly that entry).
export function logDistraction(state, now) {
  if (state.timer.phase !== 'focus') return state;
  return { ...state, distractions: [...state.distractions, { at: now, taskId: state.timer.taskId || '' }].slice(-1000) };
}
export function removeDistraction(state, at) {
  const distractions = state.distractions.filter((item) => item.at !== at);
  return distractions.length === state.distractions.length ? state : { ...state, distractions };
}

export function addTask(state, value, now, { makeId: factory, list = 'today', estimate = 0 } = {}) {
  const task = normalizeTask({ text: value, createdAt: now, list, estimate, plannedFor: list === 'later' ? '' : dayKey(now) }, factory); if (!task || state.tasks.length >= 200) return state;
  return { ...state, tasks: [...state.tasks, task] };
}
// The next open task after `taskId` in the same list (wrapping), or ''.
export function nextOpenTask(tasks, taskId) {
  const index = tasks.findIndex((task) => task.id === taskId), list = tasks[index]?.list || 'today';
  const order = [...tasks.slice(index + 1), ...tasks.slice(0, Math.max(0, index))];
  return order.find((task) => !task.done && task.list === list)?.id || '';
}
export function updateTask(state, taskId, change, now) {
  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    // 任务的编号是身份，不随一次修改而变。
    const next = normalizeTask({ ...task, ...change, id: task.id }) || task;
    return next.done && !task.done ? { ...next, doneAt: now } : next.done ? next : { ...next, doneAt: 0 };
  });
  // Finishing the current task moves the timer on to the next open one.
  const finished = change?.done === true && state.timer.taskId === taskId && state.tasks.some((task) => task.id === taskId && !task.done);
  return { ...state, tasks, ...(finished ? { timer: { ...state.timer, taskId: nextOpenTask(tasks, taskId) } } : {}) };
}
// 今天 / 之后. Moving into 今天 plans the task for today.
export function moveTaskToList(state, taskId, list, now) {
  const target = list === 'later' ? 'later' : 'today';
  return { ...state, tasks: state.tasks.map((task) => task.id === taskId && task.list !== target ? { ...task, list: target, plannedFor: target === 'today' ? dayKey(now) : '', carried: 0 } : task) };
}
// A new day: unfinished 今天 tasks from an earlier day roll over to today (顺延).
export function rollOverTasks(state, now) {
  const today = dayKey(now); let changed = false;
  const tasks = state.tasks.map((task) => {
    if (task.done || task.list !== 'today' || task.plannedFor >= today) return task;
    changed = true;
    return { ...task, plannedFor: today, carried: task.plannedFor ? task.carried + 1 : task.carried };
  });
  return changed ? { ...state, tasks } : state;
}
export function addSubtask(state, taskId, value, { makeId: factory } = {}) {
  const name = text(value, 80); if (!name) return state;
  let added = false;
  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId || task.subtasks.length >= MAX_SUBTASKS) return task;
    added = true; return { ...task, subtasks: [...task.subtasks, { id: makeId(factory), text: name, done: false }] };
  });
  return added ? { ...state, tasks } : state;
}
export function toggleSubtask(state, taskId, subtaskId) {
  return { ...state, tasks: state.tasks.map((task) => task.id === taskId ? { ...task, subtasks: task.subtasks.map((item) => item.id === subtaskId ? { ...item, done: !item.done } : item) } : task) };
}
export function removeSubtask(state, taskId, subtaskId) {
  return { ...state, tasks: state.tasks.map((task) => task.id === taskId ? { ...task, subtasks: task.subtasks.filter((item) => item.id !== subtaskId) } : task) };
}
export function removeTask(state, taskId) {
  return { ...state, tasks: state.tasks.filter((task) => task.id !== taskId), timer: state.timer.taskId === taskId ? { ...state.timer, taskId: '' } : state.timer };
}
// 撤销 after a delete: the same task (id, rounds, done) back at its old place.
export function restoreTask(state, task, index) {
  const value = normalizeTask(task); if (!value || state.tasks.length >= 200 || state.tasks.some((entry) => entry.id === value.id)) return state;
  const tasks = [...state.tasks]; tasks.splice(Math.max(0, Math.min(tasks.length, index)), 0, value);
  return { ...state, tasks };
}
export function moveTask(state, taskId, toIndex) {
  const from = state.tasks.findIndex((task) => task.id === taskId); if (from < 0) return state;
  const tasks = [...state.tasks], [task] = tasks.splice(from, 1); tasks.splice(Math.max(0, Math.min(tasks.length, toIndex)), 0, task);
  return { ...state, tasks };
}
export function selectTask(state, taskId, toggle = false) {
  const selected = state.tasks.some((task) => task.id === taskId) ? taskId : '';
  return { ...state, timer: { ...state.timer, taskId: toggle && state.timer.taskId === selected ? '' : selected } };
}
export function clearDone(state) {
  const tasks = state.tasks.filter((task) => !task.done);
  return { ...state, tasks, timer: tasks.some((task) => task.id === state.timer.taskId) ? state.timer : { ...state.timer, taskId: '' } };
}

// Minutes are split at local midnight so a late session counts on both days.
export function minutesByDay(sessions) {
  const days = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const start = numeric(session?.start), end = numeric(session?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const raw = session?.durationMs;
    const duration = raw === null || raw === undefined ? end - start : numeric(raw);
    const scale = Number.isFinite(duration) ? duration / (end - start) : 1;
    let cursor = start;
    while (cursor < end) {
      const until = Math.min(addDays(startOfDay(cursor), 1), end), key = dayKey(cursor);
      days.set(key, (days.get(key) || 0) + (until - cursor) * scale / MINUTE);
      cursor = until;
    }
  }
  return days;
}
export const STREAK_HINT = '按本地日期，每天累计专注至少 1 分钟；今天未满 1 分钟时从昨天算起，中间缺一天即中断。';
export function currentStreak(days, now) {
  const map = days instanceof Map ? days : new Map();
  let cursor = startOfDay(now), count = 0;
  if (!(map.get(dayKey(cursor)) >= 1)) cursor = addDays(cursor, -1);
  while (map.get(dayKey(cursor)) >= 1) { count++; cursor = addDays(cursor, -1); }
  return count;
}
export function focusStats(sessions = [], now) {
  const list = Array.isArray(sessions) ? sessions : [];
  const days = minutesByDay(list);
  // 没有可用的时钟就不编日期：只给与时间无关的部分，星期栏留空，
  // 免得面板上出现 NaN-NaN-NaN 这样的假日期。
  if (!Number.isFinite(now)) {
    return { today: 0, week: Array.from({ length: 7 }, () => ({ key: '', label: '', minutes: 0 })), streak: 0,
      totalMinutes: Math.round([...days.values()].reduce((sum, value) => sum + value, 0)), sessions: list.filter((s) => s?.completed).length, todaySessions: 0 };
  }
  const today = startOfDay(now), week = [];
  for (let i = 6; i >= 0; i--) {
    const time = new Date(addDays(today, -i));
    const key = dayKey(time.getTime());
    week.push({ key, label: i === 0 ? '今天' : '日一二三四五六'[time.getDay()], minutes: Math.round(days.get(key) || 0) });
  }
  const streak = currentStreak(days, now);
  const total = [...days.values()].reduce((sum, value) => sum + value, 0);
  return { today: week[6].minutes, week, streak, totalMinutes: Math.round(total), sessions: list.filter((s) => s?.completed).length, todaySessions: list.filter((s) => s?.completed && dayKey(s.end) === dayKey(now)).length };
}

export function levelInfo(xp) {
  let level = 1, need = 50, rest = Math.max(0, xp);
  while (rest >= need) { rest -= need; level++; need = 50 + 25 * (level - 1); }
  return { level, into: rest, need };
}
export function unlockedIds(xp, bought = []) { const { level } = levelInfo(xp); return new Set([...UNLOCKS.filter((item) => item.level <= level).map((item) => item.id), ...bought]); }
// 小鱼干 are worth something: any extra can be bought early for 3 fish per level (src/cat/cat-care.mjs).
export const unlockPrice = (item) => Math.max(1, (item?.level || 1) * 3);
export function spendFish(state, count = 1) {
  const n = Math.max(1, Math.round(count)); if (state.rewards.fish < n) return state;
  return { ...state, rewards: { ...state.rewards, fish: state.rewards.fish - n } };
}
export function buyUnlock(state, id) {
  const item = UNLOCKS.find((entry) => entry.id === id), owned = unlockedIds(state.rewards.xp, state.rewards.bought);
  if (!item || owned.has(id) || state.rewards.fish < unlockPrice(item)) return state;
  return { ...state, rewards: { ...state.rewards, fish: state.rewards.fish - unlockPrice(item), bought: [...(state.rewards.bought || []), id] } };
}
export function equip(state, kind, value) {
  const unlocked = unlockedIds(state.rewards.xp, state.rewards.bought);
  if (value && (!unlocked.has(value) || UNLOCKS.find((item) => item.id === value)?.kind !== kind)) return state;
  return { ...state, rewards: { ...state.rewards, equipped: { ...state.rewards.equipped, [kind]: value || (kind === 'weather' ? 'snow' : '') } } };
}

// Compact read-only form shared with the wallpaper and desktop pet windows.
export function focusSnapshot(state, now) {
  const task = state.tasks.find((item) => item.id === state.timer.taskId);
  const unlocked = unlockedIds(state.rewards.xp, state.rewards.bought);
  return { hideSeconds: state.settings.hideSeconds, catSkin: state.settings.catSkin, quietMode: state.settings.quietMode, phase: state.timer.phase, paused: state.timer.paused, remaining: remainingMs(state.timer, now), endsAt: state.timer.paused ? 0 : state.timer.endsAt, round: currentRound(state.timer, now), due: Boolean(state.timer.due), over: overtimeMs(state.timer, now), startedAt: state.timer.phase === 'idle' ? 0 : state.timer.startedAt, duration: state.timer.phase === 'idle' ? 0 : state.timer.duration || phaseDuration(state.settings, state.timer.phase), longEvery: state.settings.longEvery, task: task?.text || '', fish: state.rewards.fish, level: levelInfo(state.rewards.xp).level, accessory: state.rewards.equipped.accessory, unlockedAccessories: UNLOCKS.filter((item) => item.kind === 'accessory' && unlocked.has(item.id)).map((item) => item.id), weather: state.rewards.equipped.weather };
}
