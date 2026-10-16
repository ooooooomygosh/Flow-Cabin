// Pomodoro, tasks, statistics and rewards. Pure functions only: every
// transition receives `now`, so hidden or throttled windows stay accurate.
export const FOCUS_PREFIX = 'album-circle-focus-v1:';
export const MAX_FOCUS_BYTES = 512000;
export const MAX_NOTE_LENGTH = 8000;
export const normalizeNotes = (value) => typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, MAX_NOTE_LENGTH) : '';
export const PHASES = ['idle', 'focus', 'shortBreak', 'longBreak'];
export const PHASE_LABELS = { idle: '准备开始', focus: '专注中', shortBreak: '短休息', longBreak: '长休息' };
const MINUTE = 60000;

export const DEFAULT_SETTINGS = Object.freeze({ focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoBreak: true, autoFocus: false, notify: true, chime: true, autoSound: false, hideSeconds: false, catSkin: 'orange', dailyGoal: 90 });
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
  { id: 'starry', kind: 'weather', level: 5, name: '星空窗景' }
]);

const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
const text = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';
const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function normalizeSettings(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    focusMin: clamp(v.focusMin, 1, 180, DEFAULT_SETTINGS.focusMin), shortMin: clamp(v.shortMin, 1, 60, DEFAULT_SETTINGS.shortMin),
    longMin: clamp(v.longMin, 1, 90, DEFAULT_SETTINGS.longMin), longEvery: clamp(v.longEvery, 2, 8, DEFAULT_SETTINGS.longEvery),
    autoBreak: v.autoBreak !== false, autoFocus: v.autoFocus === true, notify: v.notify !== false, chime: v.chime !== false, autoSound: v.autoSound === true, hideSeconds: v.hideSeconds === true, catSkin: v.catSkin === 'black' ? 'black' : 'orange', dailyGoal: clamp(v.dailyGoal, 0, 720, DEFAULT_SETTINGS.dailyGoal)
  };
}
function normalizeTimer(value = {}, settings = DEFAULT_SETTINGS) {
  const v = value && typeof value === 'object' ? value : {};
  const phase = PHASES.includes(v.phase) ? v.phase : 'idle';
  if (phase === 'idle') return { phase, endsAt: 0, remaining: 0, paused: false, startedAt: 0, round: clamp(v.round, 0, 1e6, 0), taskId: text(v.taskId, 40) };
  return { phase, duration: clamp(v.duration, 1, 180 * MINUTE, phaseDuration(settings, phase)), endsAt: clamp(v.endsAt, 0, 9e15, 0), remaining: clamp(v.remaining, 0, 180 * MINUTE, 0), paused: v.paused === true, startedAt: clamp(v.startedAt, 0, 9e15, 0), round: clamp(v.round, 0, 1e6, 0), taskId: text(v.taskId, 40) };
}
function normalizeTask(value) {
  if (!value || typeof value !== 'object' || !text(value.text, 120)) return null;
  return { id: text(value.id, 40) || id(), text: text(value.text, 120), done: value.done === true, pomodoros: clamp(value.pomodoros, 0, 999, 0), createdAt: clamp(value.createdAt, 0, 9e15, 0), doneAt: value.done === true ? clamp(value.doneAt, 0, 9e15, 0) : 0 };
}
function normalizeSession(value) {
  if (!value || typeof value !== 'object') return null;
  const start = clamp(value.start, 0, 9e15, 0), end = clamp(value.end, 0, 9e15, 0);
  if (!start || end <= start || end - start > 4 * 60 * MINUTE) return null;
  return { start, end, taskId: text(value.taskId, 40), completed: value.completed !== false };
}
export function normalizeFocus(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const rewards = v.rewards && typeof v.rewards === 'object' ? v.rewards : {};
  const equipped = rewards.equipped && typeof rewards.equipped === 'object' ? rewards.equipped : {};
  const xp = clamp(rewards.xp, 0, 1e9, 0), unlocked = unlockedIds(xp);
  const pick = (value, kind, fallback) => unlocked.has(value) && UNLOCKS.find((item) => item.id === value)?.kind === kind ? value : fallback;
  return {
    version: 1,
    notes: normalizeNotes(v.notes),
    settings: normalizeSettings(v.settings),
    timer: normalizeTimer(v.timer, normalizeSettings(v.settings)),
    tasks: (Array.isArray(v.tasks) ? v.tasks : []).map(normalizeTask).filter(Boolean).slice(0, 200),
    sessions: (Array.isArray(v.sessions) ? v.sessions : []).map(normalizeSession).filter(Boolean).slice(-2000),
    rewards: { fish: clamp(rewards.fish, 0, 1e9, 0), xp, equipped: { accessory: pick(equipped.accessory, 'accessory', ''), weather: pick(equipped.weather, 'weather', 'snow') } }
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
export function formatClock(ms, hideSeconds = false) {
  if (hideSeconds) return `${Math.max(0, Math.ceil(ms / MINUTE))} 分钟`;
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export function nextBreak(state) { return (state.timer.round + 1) % state.settings.longEvery === 0 ? 'longBreak' : 'shortBreak'; }

export function startPhase(state, phase, now, taskId = state.timer.taskId) {
  const duration = phaseDuration(state.settings, phase);
  if (!duration) return { ...state, timer: { ...state.timer, phase: 'idle', endsAt: 0, remaining: 0, paused: false, startedAt: 0 } };
  return { ...state, timer: { ...state.timer, phase, duration, endsAt: now + duration, remaining: duration, paused: false, startedAt: now, taskId: taskId || '' } };
}
export function pause(state, now) {
  if (state.timer.phase === 'idle' || state.timer.paused) return state;
  return { ...state, timer: { ...state.timer, paused: true, remaining: remainingMs(state.timer, now) } };
}
export function resume(state, now) {
  if (state.timer.phase === 'idle' || !state.timer.paused) return state;
  return { ...state, timer: { ...state.timer, paused: false, endsAt: now + state.timer.remaining } };
}
export function toggle(state, now) {
  if (state.timer.phase === 'idle') return startPhase(state, 'focus', now);
  return state.timer.paused ? resume(state, now) : pause(state, now);
}
export function reset(state) { return { ...state, timer: { ...normalizeTimer({ round: state.timer.round, taskId: state.timer.taskId }) } }; }

// Completes the active phase. `completed` is false when skipped by hand.
function finish(state, now, completed) {
  const { timer } = state; let next = { ...state };
  const event = { type: 'phase-end', phase: timer.phase, completed, reward: 0, at: now };
  if (timer.phase === 'focus') {
    const duration = timer.duration || phaseDuration(state.settings, 'focus');
    // Paused time is excluded: the session is the worked span ending now.
    const worked = completed ? duration : Math.max(0, duration - remainingMs(timer, now));
    if (worked >= MINUTE) next.sessions = [...state.sessions, { start: now - worked, end: now, taskId: timer.taskId, completed }].slice(-2000);
    if (completed) {
      const minutes = Math.round(duration / MINUTE), level = levelInfo(state.rewards.xp).level;
      next.rewards = { ...state.rewards, fish: state.rewards.fish + 1, xp: state.rewards.xp + minutes };
      next.tasks = state.tasks.map((task) => task.id === timer.taskId ? { ...task, pomodoros: task.pomodoros + 1 } : task);
      event.reward = 1; event.levelUp = levelInfo(next.rewards.xp).level > level;
      event.unlocked = UNLOCKS.filter((item) => item.level > level && item.level <= levelInfo(next.rewards.xp).level).map((item) => item.name);
    }
    const breakPhase = (timer.round + 1) % state.settings.longEvery === 0 ? 'longBreak' : 'shortBreak';
    next.timer = { ...timer, round: completed ? timer.round + 1 : timer.round };
    event.next = breakPhase;
    next = state.settings.autoBreak ? startPhase(next, breakPhase, now) : { ...next, timer: normalizeTimer({ round: next.timer.round, taskId: timer.taskId }) };
  } else {
    event.next = 'focus';
    next = state.settings.autoFocus ? startPhase(next, 'focus', now) : { ...next, timer: normalizeTimer({ round: timer.round, taskId: timer.taskId }) };
  }
  return { state: next, event };
}
// Advances an expired running phase. Long sleeps finish at most one phase so
// the user is never credited with focus they did not see start.
export function tick(state, now) {
  const { timer } = state;
  if (timer.phase === 'idle' || timer.paused || now < timer.endsAt) return { state, event: null };
  const result = finish(state, timer.endsAt, true);
  if (result.state.timer.phase !== 'idle' && now >= result.state.timer.endsAt) {
    // The machine slept through the following phase too; stop and wait.
    result.state = { ...result.state, timer: normalizeTimer({ round: result.state.timer.round, taskId: result.state.timer.taskId }) };
  }
  return result;
}
export function skip(state, now) {
  if (state.timer.phase === 'idle') return { state, event: null };
  return finish(state, now, false);
}

export function addTask(state, value, now) {
  const task = normalizeTask({ text: value, createdAt: now }); if (!task || state.tasks.length >= 200) return state;
  return { ...state, tasks: [...state.tasks, task] };
}
export function updateTask(state, taskId, change, now) {
  return { ...state, tasks: state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    const next = normalizeTask({ ...task, ...change }) || task;
    return next.done && !task.done ? { ...next, doneAt: now } : next.done ? next : { ...next, doneAt: 0 };
  }) };
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

export function dayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function startOfDay(time) { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime(); }
// Minutes are split at local midnight so a late session counts on both days.
export function minutesByDay(sessions) {
  const days = new Map();
  for (const session of sessions) {
    let cursor = session.start;
    while (cursor < session.end) {
      const tomorrow = new Date(startOfDay(cursor)); tomorrow.setDate(tomorrow.getDate() + 1);
      const until = Math.min(tomorrow.getTime(), session.end), key = dayKey(cursor);
      days.set(key, (days.get(key) || 0) + (until - cursor) / MINUTE);
      cursor = until;
    }
  }
  return days;
}
export function focusStats(sessions, now) {
  const days = minutesByDay(sessions), today = startOfDay(now), week = [];
  for (let i = 6; i >= 0; i--) {
    const time = new Date(today); time.setDate(time.getDate() - i);
    const key = dayKey(time.getTime());
    week.push({ key, label: i === 0 ? '今天' : '日一二三四五六'[time.getDay()], minutes: Math.round(days.get(key) || 0) });
  }
  let streak = 0; const cursor = new Date(today);
  if (!days.get(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1); // Today may still be empty.
  while ((days.get(dayKey(cursor.getTime())) || 0) >= 1) { streak++; cursor.setDate(cursor.getDate() - 1); }
  const total = [...days.values()].reduce((sum, value) => sum + value, 0);
  return { today: week[6].minutes, week, streak, totalMinutes: Math.round(total), sessions: sessions.filter((s) => s.completed).length, todaySessions: sessions.filter((s) => s.completed && dayKey(s.end) === dayKey(now)).length };
}

export function levelInfo(xp) {
  let level = 1, need = 50, rest = Math.max(0, xp);
  while (rest >= need) { rest -= need; level++; need = 50 + 25 * (level - 1); }
  return { level, into: rest, need };
}
export function unlockedIds(xp) { const { level } = levelInfo(xp); return new Set(UNLOCKS.filter((item) => item.level <= level).map((item) => item.id)); }
export function equip(state, kind, value) {
  const unlocked = unlockedIds(state.rewards.xp);
  if (value && (!unlocked.has(value) || UNLOCKS.find((item) => item.id === value)?.kind !== kind)) return state;
  return { ...state, rewards: { ...state.rewards, equipped: { ...state.rewards.equipped, [kind]: value || (kind === 'weather' ? 'snow' : '') } } };
}

// Compact read-only form shared with the wallpaper and desktop pet windows.
export function focusSnapshot(state, now) {
  const task = state.tasks.find((item) => item.id === state.timer.taskId);
  return { hideSeconds: state.settings.hideSeconds, catSkin: state.settings.catSkin, phase: state.timer.phase, paused: state.timer.paused, remaining: remainingMs(state.timer, now), endsAt: state.timer.paused ? 0 : state.timer.endsAt, round: state.timer.round, task: task?.text || '', fish: state.rewards.fish, level: levelInfo(state.rewards.xp).level, accessory: state.rewards.equipped.accessory, weather: state.rewards.equipped.weather };
}
