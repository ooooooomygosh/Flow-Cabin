// The desk calendar's arithmetic: the month page, what each day holds (focus minutes, finished and
// planned notes) and where a sticky note may be stuck. Plain functions, no DOM.
// The hand-drawn red ring is ported from DEsk (https://github.com/fyzugx/DEsk, MIT,
// (c) 2026 The DEsk authors, src/draw.c cal_ring).
import { dayKey } from '../../lib/local-calendar.mjs';
import { minutesByDay } from '../focus-model.mjs';

export const WEEK_HEAD = Object.freeze(['一', '二', '三', '四', '五', '六', '日']);   // Monday first, like 「本周」
export const MONTH_ZH = Object.freeze(['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']);
export const MONTH_EN = Object.freeze(['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']);
export const WEEKDAY_ZH = Object.freeze(['周日', '周一', '周二', '周三', '周四', '周五', '周六']);

// The six colours the sticky pads come in (DEsk): canary, rose, sky, lime, tangerine, lilac.
export const NOTE_COLORS = Object.freeze(['#FCE066', '#FAADBD', '#9ED1F5', '#BAE394', '#FCBD73', '#CCB8F0']);
export const NOTE_NAMES = Object.freeze(['黄', '粉', '蓝', '绿', '橙', '紫']);
// A note keeps its colour for life without the task record having to store one.
export function noteColor(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % NOTE_COLORS.length;
}
// The pad a note was torn from (picked on the planner's left leaf), else its own colour for life.
export const taskColor = (task) => Number.isInteger(task?.color) && task.color >= 0 && task.color < NOTE_COLORS.length ? task.color : noteColor(task?.id);

export const monthKey = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`;
export function shiftMonth({ year, month }, delta) {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

// Weeks (rows of 7) covering the month, Monday first, with the neighbours' days filling the ends.
export function monthGrid(year, month, now = Date.now(), weekStart = 1) {
  const first = new Date(year, month, 1), lead = (first.getDay() - weekStart + 7) % 7, days = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((lead + days) / 7), today = dayKey(now), weeks = [];
  for (let r = 0; r < rows; r++) {
    const week = [];
    for (let c = 0; c < 7; c++) {
      const date = new Date(year, month, 1 - lead + r * 7 + c), key = dayKey(date);
      week.push({ key, day: date.getDate(), month: date.getMonth(), year: date.getFullYear(), weekday: date.getDay(), inMonth: date.getMonth() === month, today: key === today, past: key < today });
    }
    weeks.push(week);
  }
  return weeks;
}

// 0 for none, then four steps of how much was focused that day.
export function heatLevel(minutes) {
  return !(minutes >= 1) ? 0 : minutes < 25 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4;
}

// Per day: minutes, finished rounds, notes finished that day, open notes planned for it.
export function dayStats(sessions, tasks) {
  const minutes = minutesByDay(sessions), days = new Map();
  const at = (key) => { let day = days.get(key); if (!day) days.set(key, day = { key, minutes: 0, rounds: 0, done: [], planned: [] }); return day; };
  for (const [key, value] of minutes) at(key).minutes = Math.round(value);
  for (const session of Array.isArray(sessions) ? sessions : []) if (session?.completed && Number.isFinite(Number(session.end))) at(dayKey(session.end)).rounds += 1;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (task.done && task.doneAt) at(dayKey(task.doneAt)).done.push(task);
    else if (!task.done && task.list === 'today' && task.plannedFor) at(task.plannedFor).planned.push(task);
  }
  const empty = (key) => ({ key, minutes: 0, rounds: 0, done: [], planned: [] });
  return { get: (key) => days.get(key) || empty(key), days };
}

export function monthTotals(stats, year, month) {
  const prefix = monthKey(year, month) + '-';
  let minutes = 0, daysFocused = 0;
  for (const [key, day] of stats.days) if (key.startsWith(prefix) && day.minutes >= 1) { minutes += day.minutes; daysFocused++; }
  return { minutes, daysFocused };
}
export const formatSpan = (minutes) => minutes >= 60 ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}` : `${minutes} 分钟`;

// Which pile a note is on. A 今天 note planned for a later day is 「已安排」: it waits on its day.
export function taskBucket(task, today) {
  if (task.list === 'later') return 'later';
  return !task.done && task.plannedFor && task.plannedFor > today ? 'scheduled' : 'today';
}
// 今天 / 之后: the two lists of the pad (a scheduled note sits with 之后, stamped with its day).
export const listOf = (task, today) => taskBucket(task, today) === 'today' ? 'today' : 'later';

// Sticking a note on a day. Past days and finished notes are refused; today or later plans the
// note for that day (the record's own plannedFor, which 顺延 already leaves alone while it is ahead).
export function scheduleChange(task, key, today) {
  if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return { ok: false, reason: 'bad' };
  if (task.done) return { ok: false, reason: 'done' };
  if (key < today) return { ok: false, reason: 'past' };
  if (task.list === 'today' && task.plannedFor === key) return { ok: true, noop: true, change: {} };
  return { ok: true, noop: false, change: { list: 'today', plannedFor: key, carried: 0 } };
}
export const SCHEDULE_REFUSALS = Object.freeze({ past: '过去的日子贴不上去。', done: '已经完成的便签不用再安排。', bad: '这一天贴不上去。' });

// "11月8日" for a plan stamp.
export function shortDate(key) {
  const [, month, day] = String(key).split('-').map(Number);
  return month && day ? `${month}月${day}日` : '';
}

// A ring drawn round something with a red pen: not quite an ellipse, and the end goes on a little
// past where it began. Returns an SVG path.
export function ringPath(cx, cy, rx, ry, steps = 64) {
  const a0 = -2.1, sweep = 2 * Math.PI + 0.55, points = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, a = a0 + sweep * u, k = 1 + 0.05 * Math.sin(3 * a + 1.3) + 0.07 * u;
    points.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k - 0.10 * ry * u]);
  }
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
}

// ── the planner's page for one day (DEsk's agenda: 计划 with a time, 待办 without) ──
// today: what is on today's page (今天, planned for today or earlier, done or not); a later day: the open
// notes stuck on it; an earlier day: what was finished that day (read only).
export function dayPage(tasks, key, today) {
  const list = Array.isArray(tasks) ? tasks : [];
  let notes;
  if (key === today) notes = list.filter((task) => listOf(task, today) === 'today');
  else if (key > today) notes = list.filter((task) => !task.done && task.list === 'today' && task.plannedFor === key);
  else notes = list.filter((task) => task.done && task.doneAt && dayKey(task.doneAt) === key);
  const plans = notes.filter((task) => task.at).sort((a, b) => a.at.localeCompare(b.at));
  return { plans, todos: notes.filter((task) => !task.at), past: key < today, today: key === today };
}
// 「10:00–11:00」 for a plan's time.
export const planLabel = (at) => String(at || '').replace('-', '–');

// The seven days of the week a day is in, Monday first.
export function weekOf(key, now = Date.now()) {
  const [y, m, d] = String(key).split('-').map(Number), date = new Date(y, m - 1, d), lead = (date.getDay() + 6) % 7, today = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(y, m - 1, d - lead + i), k = dayKey(day);
    return { key: k, day: day.getDate(), month: day.getMonth(), year: day.getFullYear(), weekday: day.getDay(), today: k === today, past: k < today };
  });
}
// A day's focus rounds, in order: when, how long, on what.
export function daySessions(sessions, key) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => Number.isFinite(Number(session?.start)) && Number(session.end) > Number(session.start) && dayKey(session.start) === key)
    .sort((a, b) => a.start - b.start)
    .map((session) => ({ start: session.start, end: session.end, minutes: Math.round((session.end - session.start) / 60000), completed: session.completed !== false, text: session.taskText || '' }));
}
export const clockTime = (time) => { const date = new Date(time); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
