// 唱片日记 (3.0): pure views over the focus-session log and 手记 entries. No DOM, every
// function takes `now`. Sessions use the shape from session-source.mjs; text entries the
// shape from journal-entries.mjs. Interrupted or short rounds are never "pressed" and never
// shown as a failure: they only count towards minutes.
import { dayKey, startOfDay, addDays, startOfWeek } from '../../lib/local-calendar.mjs';
import { minutesByDay, daysThisWeek } from '../focus-model.mjs';
import { TIME_SLOTS, formatMinutes } from './stats-model.mjs';
const MINUTE = 60000, WEEKDAYS = '日一二三四五六';
export const PRESS_MIN_MS = 5 * MINUTE;
export const FREE_INTENT = '自由专注';

// A round becomes a record on the shelf only when it ran its course and lasted ≥ 5 minutes.
export const isPressed = (session) => Boolean(session?.completed) && Number(session?.durationMs) >= PRESS_MIN_MS;
export const sessionMinutes = (session) => Math.max(0, Math.round((Number(session?.durationMs) || 0) / MINUTE));
export function slotOf(time) {
  const hour = new Date(time).getHours();
  return TIME_SLOTS.find((slot) => hour >= slot.from && hour < slot.to) || TIME_SLOTS[0];
}
const md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const inWindow = (time, from, to) => time >= from && time < to;
const liveText = (entries) => (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.purgedAt == null && entry.deletedAt == null && typeof entry.body === 'string' && entry.body.trim() && Number.isFinite(entry.createdAt));

// What a session was for: the todo's current name, its saved text, or the typed intention.
export function intentOf(session, tasks = []) {
  return (session?.taskId && tasks.find((task) => task.id === session.taskId)?.text) || session?.taskText || '';
}
export function recordItem(session, tasks = []) {
  const slot = slotOf(session.start);
  return { kind: 'record', id: session.id, at: session.end, start: session.start, end: session.end, minutes: sessionMinutes(session), intent: intentOf(session, tasks),
    note: session.note || '', album: session.album || null, track: session.track || null, cover: session.album?.cover || '', slot: slot.label, time: `${hm(session.start)}–${hm(session.end)}` };
}
export function textItem(entry) {
  const body = entry.body.replace(/\s+/g, ' ').trim();
  return { kind: 'text', id: entry.id, at: entry.createdAt, body: entry.body, snippet: body.length > 80 ? `${body.slice(0, 80)}…` : body, origin: entry.origin === 'scratch' ? 'scratch' : 'entry', label: entry.origin === 'scratch' ? '随手记' : '手记', time: hm(entry.createdAt), tags: entry.tags || [] };
}

// The records that kept you company longest (by focus minutes, not listening time).
export function topRecords(sessions, limit = 3) {
  const albums = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (!session?.album?.title) continue;
    const key = session.album.key || `${session.album.title}\u0000${session.album.artist || ''}`.toLowerCase();
    const row = albums.get(key) || { key, title: session.album.title, artist: session.album.artist || '', cover: '', ms: 0, sessions: 0 };
    row.ms += Number(session.durationMs) || 0; row.sessions += 1; if (!row.cover && session.album.cover) row.cover = session.album.cover;
    albums.set(key, row);
  }
  return [...albums.values()].sort((a, b) => b.ms - a.ms || b.sessions - a.sessions || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit)).map(({ ms, ...row }) => ({ ...row, minutes: Math.round(ms / MINUTE) }));
}

// 这一周: Monday..Sunday, each with its pressed records and 文字 items in time order.
export function weekDiary(sessions = [], entries = [], now, { weekOffset = 0, tasks = [] } = {}) {
  const from = addDays(startOfWeek(now), weekOffset * 7), to = addDays(from, 7), today = dayKey(now), todayStart = startOfDay(now);
  const list = (Array.isArray(sessions) ? sessions : []).filter((s) => inWindow(s.end, from, to) || inWindow(s.start, from, to));
  const minutes = minutesByDay(list), texts = liveText(entries).filter((entry) => inWindow(entry.createdAt, from, to));
  const days = Array.from({ length: 7 }, (_, i) => {
    const t = addDays(from, i), key = dayKey(t), d = new Date(t);
    const items = [...list.filter((s) => isPressed(s) && dayKey(s.end) === key).map((s) => recordItem(s, tasks)), ...texts.filter((entry) => dayKey(entry.createdAt) === key).map(textItem)].sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
    return { key, label: `周${WEEKDAYS[d.getDay()]}`, date: `${d.getMonth() + 1}/${d.getDate()}`, isToday: key === today, future: t > todayStart, minutes: Math.round(minutes.get(key) || 0), items };
  });
  const records = days.flatMap((day) => day.items.filter((item) => item.kind === 'record'));
  return { from, to, label: `${md(from)} – ${md(addDays(to, -1))}`, days, records: records.length, texts: texts.length,
    totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0), weekDays: weekOffset === 0 ? daysThisWeek(minutesByDay(list), now) : days.filter((day) => day.minutes >= 1).length };
}

// 本周合集: total focus, the three records that kept you company, the notes you wrote and
// how many days you came by (focus or a 文字 entry). Nothing here can "break".
export function weeklyCollection(sessions = [], entries = [], now, { weekOffset = 0, tasks = [] } = {}) {
  const diary = weekDiary(sessions, entries, now, { weekOffset, tasks });
  const week = (Array.isArray(sessions) ? sessions : []).filter((s) => inWindow(s.end, diary.from, diary.to));
  const notes = week.filter((s) => s.note).sort((a, b) => a.end - b.end).map((s) => ({ id: s.id, text: s.note, at: s.end, intent: intentOf(s, tasks), album: s.album?.title || '' }));
  const dots = diary.days.map((day) => ({ key: day.key, label: day.label.slice(1), future: day.future, isToday: day.isToday, visited: day.minutes >= 1 || day.items.some((item) => item.kind === 'text') }));
  const visited = dots.filter((dot) => dot.visited).length, top = topRecords(week, 3);
  return { from: diary.from, to: diary.to, label: diary.label, totalMinutes: diary.totalMinutes, records: diary.records, top, notes, texts: diary.days.flatMap((day) => day.items.filter((item) => item.kind === 'text')), days: dots, daysVisited: visited,
    line: collectionLine({ totalMinutes: diary.totalMinutes, top, visited }) };
}
export function collectionLine({ totalMinutes, top = [], visited = 0 }) {
  if (!totalMinutes && !visited) return '这周小屋很安静。唱片都在架上，等你想回来的时候。';
  if (!totalMinutes) return `这周来了 ${visited} 天，留下了几句话。`;
  return `这周来了 ${visited} 天，专注了 ${formatMinutes(totalMinutes)}${top[0] ? `，《${top[0].title}》陪你最久` : ''}。`;
}
export function collectionMarkdown(c) {
  return [`### 本周合集 · ${c.label}`, '', `> ${c.line}`, '',
    `- **本周来了**：${c.daysVisited} 天`, `- **本周专注**：${formatMinutes(c.totalMinutes)} · 压制 ${c.records} 张唱片`,
    '', '#### 陪你最久的唱片', ...(c.top.length ? c.top.map((r, i) => `${i + 1}. 《${r.title}》${r.artist ? ` · ${r.artist}` : ''} · ${formatMinutes(r.minutes)}`) : ['（这周还没有唱片陪着专注）']),
    '', '#### 你写下的话', ...(c.notes.length ? c.notes.map((n) => `- ${n.text}${n.intent ? `（${n.intent}）` : ''}`) : ['（这周没有留话，也没关系）'])].join('\n');
}

// 一年唱片墙: one cell per day (Monday columns, ~a year), tinted by that day's top record.
export function yearWall(sessions = [], now, weeks = 53) {
  const list = Array.isArray(sessions) ? sessions : [], days = minutesByDay(list), today = startOfDay(now), first = addDays(startOfWeek(now), -(weeks - 1) * 7);
  const perDay = new Map();
  for (const s of list) { if (!s.album?.title || s.end < first) continue; const key = dayKey(s.end); perDay.set(key, [...(perDay.get(key) || []), s]); }
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = addDays(first, w * 7 + d), key = dayKey(t), minutes = Math.round(days.get(key) || 0), future = t > today;
      col.push({ key, minutes, future, level: future || !minutes ? 0 : minutes < 25 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4, top: future ? null : topRecords(perDay.get(key) || [], 1)[0] || null });
    }
    cols.push(col);
  }
  return cols;
}
// The colour a wall cell is painted: its top record's cover colour when one was read, else null
// (the cell keeps the heat colour of its level). `failed` is the colour the reader returns on failure.
export function wallColour(cell, colours, failed = '') {
  const cover = cell?.top?.cover, colour = cover && colours?.get?.(cover);
  return typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour) && colour.toLowerCase() !== String(failed).toLowerCase() ? colour : null;
}
export function wallSummary(cols) {
  const cells = cols.flat().filter((cell) => !cell.future), active = cells.filter((cell) => cell.minutes > 0);
  return { days: active.length, withRecord: active.filter((cell) => cell.top).length, minutes: active.reduce((sum, cell) => sum + cell.minutes, 0) };
}
