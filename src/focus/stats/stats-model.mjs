// Pure focus statistics + weekly report. Every function takes `now`.
// Sessions use the shape from session-source.mjs.
import { dayKey, startOfDay, addDays, startOfWeek } from '../../lib/local-calendar.mjs';
import { currentStreak, minutesByDay } from '../focus-model.mjs';
export { minutesByDay } from '../focus-model.mjs';
export { dayKey, startOfDay, startOfWeek, isMonday } from '../../lib/local-calendar.mjs';
const MINUTE = 60000;
export const FREE_FOCUS = '自由专注';
export const TIME_SLOTS = Object.freeze([
  { id: 'night', label: '深夜', from: 0, to: 5 }, { id: 'dawn', label: '清晨', from: 5, to: 9 },
  { id: 'morning', label: '上午', from: 9, to: 12 }, { id: 'noon', label: '午后', from: 12, to: 14 },
  { id: 'afternoon', label: '下午', from: 14, to: 18 }, { id: 'evening', label: '傍晚', from: 18, to: 21 },
  { id: 'late', label: '夜里', from: 21, to: 24 }
]);
const WEEKDAYS = '日一二三四五六';

// Calls fn(dayStart, ms) for each local-day slice, and fn per hour when byHour.
function slices(session, fn, byHour = false) {
  let cursor = session.start;
  // Paused time: scale wall-clock span down to durationMs.
  const scale = session.durationMs / (session.end - session.start || 1);
  while (cursor < session.end) {
    const d = new Date(cursor); if (byHour) d.setMinutes(60, 0, 0);
    const until = Math.min(byHour ? d.getTime() : addDays(startOfDay(cursor), 1), session.end);
    fn(cursor, (until - cursor) * scale); cursor = until;
  }
}
const inRange = (sessions, from, to) => sessions.filter((s) => s.end > from && s.start < to).map((s) => {
  const start = Math.max(s.start, from), end = Math.min(s.end, to);
  return start === s.start && end === s.end ? s : { ...s, start, end, durationMs: Math.round(s.durationMs * (end - start) / (s.end - s.start)) };
});
const sumMinutes = (sessions) => sessions.reduce((n, s) => n + s.durationMs, 0) / MINUTE;

// Streak with a gentle rule: one missed day per Monday-week is forgiven.
// Today may still be empty. Forgiven days don't add to the count.
export function graceStreak(days, now, { gracePerWeek = 1 } = {}) {
  let cursor = startOfDay(now), count = 0; const used = new Map();
  if (!(days.get(dayKey(cursor)) >= 1)) cursor = addDays(cursor, -1);
  let pending = 0, forgiven = 0;
  for (let i = 0; i < 800; i++, cursor = addDays(cursor, -1)) {
    if (days.get(dayKey(cursor)) >= 1) { count++; forgiven += pending; pending = 0; continue; }
    const week = startOfWeek(cursor), n = used.get(week) || 0;
    if (n >= gracePerWeek) break;
    used.set(week, n + 1); pending++;
  }
  return { days: count, forgiven };
}

export function recentSummary(sessions, now, limit = 6) {
  const days = minutesByDay(sessions), today = dayKey(now);
  const todaySessions = sessions.filter((s) => dayKey(s.end) === today);
  const streak = graceStreak(days, now);
  return {
    todayMinutes: Math.round(days.get(today) || 0),
    todayPomodoros: todaySessions.filter((s) => s.completed).length,
    streak: currentStreak(days, now), graceStreak: streak.days, forgiven: streak.forgiven,
    totalMinutes: Math.round(sumMinutes(sessions)),
    recent: sessions.slice().sort((a, b) => b.end - a.end).slice(0, limit)
  };
}

export function dailySeries(sessions, now, count = 7) {
  const days = minutesByDay(sessions), today = startOfDay(now), out = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = addDays(today, -i), d = new Date(t);
    out.push({ key: dayKey(t), minutes: Math.round(days.get(dayKey(t)) || 0), label: i === 0 ? '今天' : count <= 7 ? WEEKDAYS[d.getDay()] : String(d.getDate()), isToday: i === 0 });
  }
  return out;
}

// Columns of 7 days (Mon..Sun) ending this week; ~1 year by default.
export function yearHeatmap(sessions, now, weeks = 53) {
  const days = minutesByDay(sessions), today = startOfDay(now), first = addDays(startOfWeek(now), -(weeks - 1) * 7), cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = addDays(first, w * 7 + d), minutes = Math.round(days.get(dayKey(t)) || 0), future = t > today;
      col.push({ key: dayKey(t), minutes, future, level: future || !minutes ? 0 : minutes < 25 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4 });
    }
    cols.push(col);
  }
  return cols;
}

export function byTask(sessions, tasks = []) {
  const names = new Map(tasks.map((t) => [t.id, t])), rows = new Map();
  for (const s of sessions) {
    const task = s.taskId && names.get(s.taskId), key = s.taskId && (task || s.taskText) ? s.taskId : '';
    const row = rows.get(key) || { id: key, name: key ? (task?.text || s.taskText) : FREE_FOCUS, free: !key, done: !!task?.done, minutes: 0, pomodoros: 0 };
    row.minutes += s.durationMs / MINUTE; if (s.completed) row.pomodoros++;
    rows.set(key, row);
  }
  return [...rows.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes) })).sort((a, b) => b.minutes - a.minutes || b.pomodoros - a.pomodoros);
}

export function timeOfDay(sessions) {
  const hours = new Array(24).fill(0);
  for (const s of sessions) slices(s, (t, ms) => { hours[new Date(t).getHours()] += ms / MINUTE; }, true);
  const slots = TIME_SLOTS.map((slot) => ({ ...slot, minutes: Math.round(hours.slice(slot.from, slot.to).reduce((a, b) => a + b, 0)) }));
  const best = slots.reduce((a, b) => b.minutes > a.minutes ? b : a, slots[0]);
  return { hours: hours.map(Math.round), slots, best: best.minutes ? best : null };
}

function longestRun(days, from, count) {
  let best = 0, run = 0;
  for (let i = 0; i < count; i++) { if (days.get(dayKey(addDays(from, i))) >= 1) best = Math.max(best, ++run); else run = 0; }
  return best;
}
export const formatMinutes = (m) => m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分钟`;
const md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };

export function gentleSummary({ totalMinutes, previousMinutes, topTask, completedCount }) {
  if (!totalMinutes) return '这周小屋很安静。休息也是在往前走，唱机随时等你回来。';
  const diff = totalMinutes - previousMinutes, task = topTask && !topTask.free ? `，最用心的是「${topTask.name}」` : '';
  if (!previousMinutes) return `这周你专注了 ${formatMinutes(totalMinutes)}${task}，好的开始。`;
  if (diff >= 10) return `比上周多陪自己 ${formatMinutes(diff)}${task}，稳稳地往前走。`;
  if (diff <= -10) return `这周节奏慢一些，也攒下了 ${formatMinutes(totalMinutes)}${completedCount ? `，还完成了 ${completedCount} 件事` : ''}，已经很好了。`;
  return `和上周差不多，${formatMinutes(totalMinutes)}${task}，节奏很稳。`;
}

// weekOffset: 0 = this week, -1 = last week (the default report).
export function weeklyReport(sessions, tasks, now, weekOffset = -1) {
  const from = addDays(startOfWeek(now), weekOffset * 7), to = addDays(from, 7), prevFrom = addDays(from, -7);
  const week = inRange(sessions, from, to), prev = inRange(sessions, prevFrom, from), days = minutesByDay(sessions);
  const totalMinutes = Math.round(sumMinutes(week)), previousMinutes = Math.round(sumMinutes(prev));
  const daily = Array.from({ length: 7 }, (_, i) => { const t = addDays(from, i); return { key: dayKey(t), label: `周${WEEKDAYS[new Date(t).getDay()]}`, minutes: Math.round(days.get(dayKey(t)) || 0) }; });
  const bestDay = daily.reduce((a, b) => b.minutes > a.minutes ? b : a, daily[0]);
  const albums = new Map();
  for (const s of week) if (s.album) { const a = albums.get(s.album.key) || { ...s.album, minutes: 0 }; a.minutes += s.durationMs / MINUTE; if (!a.cover && s.album.cover) a.cover = s.album.cover; albums.set(s.album.key, a); }
  const album = [...albums.values()].sort((a, b) => b.minutes - a.minutes)[0] || null;
  const topTasks = byTask(week, tasks).slice(0, 3), completed = tasks.filter((t) => t.done && t.doneAt >= from && t.doneAt < to);
  const report = {
    from, to, label: `${md(from)} – ${md(addDays(to, -1))}`, totalMinutes, previousMinutes, deltaMinutes: totalMinutes - previousMinutes,
    pomodoros: week.filter((s) => s.completed).length, daily, bestDay: bestDay.minutes ? bestDay : null, bestSlot: timeOfDay(week).best,
    topTasks, completed: completed.map((t) => t.text), longestStreak: longestRun(days, from, 7),
    album: album && { title: album.title, artist: album.artist, cover: album.cover || '', minutes: Math.round(album.minutes) }
  };
  report.summary = gentleSummary({ ...report, topTask: topTasks[0], completedCount: completed.length });
  return report;
}

export function reportMarkdown(r) {
  const delta = r.deltaMinutes === 0 ? '与上周持平' : `${r.deltaMinutes > 0 ? '比上周多' : '比上周少'} ${formatMinutes(Math.abs(r.deltaMinutes))}`;
  const lines = [`## 心流小屋周报 · ${r.label}`, '', `> ${r.summary}`, '',
    `- **本周专注**：${formatMinutes(r.totalMinutes)}（${delta}），完成 ${r.pomodoros} 个番茄`,
    `- **状态最好的一天**：${r.bestDay ? `${r.bestDay.label}（${formatMinutes(r.bestDay.minutes)}）` : '—'}`,
    `- **最专注的时段**：${r.bestSlot ? `${r.bestSlot.label}（${r.bestSlot.from}:00–${r.bestSlot.to}:00）` : '—'}`,
    `- **本周最长连续专注**：${r.longestStreak} 天（仅此周，每个本地日期至少 1 分钟，不含宽限）`,
    `- **专注时放在唱机上的唱片**：${r.album ? `《${r.album.title}》${r.album.artist ? ` · ${r.album.artist}` : ''}` : '—'}`, '',
    '### 时间花在哪里', ...(r.topTasks.length ? r.topTasks.map((t, i) => `${i + 1}. ${t.name} · ${formatMinutes(t.minutes)} · ${t.pomodoros} 个番茄`) : ['（这周还没有专注记录）']), '',
    '### 完成的待办', ...(r.completed.length ? r.completed.map((t) => `- [x] ${t}`) : ['（这周没有勾掉待办，也没关系）'])];
  return lines.join('\n');
}
