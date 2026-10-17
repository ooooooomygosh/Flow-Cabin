import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSessionRecord, readSessionLog, fromLegacySessions, mergeSessions, loadSessions, subscribeSessions, SESSION_LOG_KEY, FOCUS_SESSION_EVENT } from './session-source.mjs';
import { graceStreak, minutesByDay, recentSummary, dailySeries, yearHeatmap, byTask, timeOfDay, weeklyReport, reportMarkdown, startOfWeek, isMonday, FREE_FOCUS } from './stats-model.mjs';
import { drawWeekCard, CARD_W, CARD_H } from './week-card.mjs';

const M = 60000, at = (y, mo, d, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const s = (start, min, extra = {}) => normalizeSessionRecord({ start, end: start + min * M, completed: true, ...extra });
const storage = (value) => ({ getItem: (k) => k === SESSION_LOG_KEY ? value : null });

test('normalizes the assumed record schema and its aliases', () => {
  const r = normalizeSessionRecord({ startedAt: at(2026, 10, 12), durationMs: 25 * M, taskId: 't1', album: { id: 'a1', title: '夜航', artist: '某人' }, track: { title: '一' } });
  assert.equal(r.end - r.start, 25 * M); assert.equal(r.album.key, 'a1'); assert.equal(r.completed, true);
  assert.equal(normalizeSessionRecord({ start: 5, end: 4 }), null);
  assert.equal(normalizeSessionRecord({ start: 1, end: 1 + 5 * 3600000 }), null);
  assert.equal(normalizeSessionRecord({ start: at(2026, 1, 1), end: at(2026, 1, 1, 9, 30), album: '晨光' }).album.title, '晨光');
  assert.equal(normalizeSessionRecord({ start: at(2026, 1, 1), end: at(2026, 1, 1, 9, 30), track: { album: '雨天', artist: 'X' } }).album.title, '雨天');
  // paused time: durationMs shorter than wall clock
  assert.equal(normalizeSessionRecord({ start: at(2026, 1, 1), end: at(2026, 1, 1, 10), durationMs: 25 * M }).durationMs, 25 * M);
});

test('reads the log (array or wrapped) and survives garbage', () => {
  assert.equal(readSessionLog(storage(JSON.stringify([{ start: at(2026, 1, 1), end: at(2026, 1, 1, 9, 25) }, { bad: 1 }]))).length, 1);
  assert.equal(readSessionLog(storage(JSON.stringify({ version: 1, sessions: [{ start: at(2026, 1, 1), end: at(2026, 1, 1, 9, 25) }] }))).length, 1);
  assert.deepEqual(readSessionLog(storage('{nope')), []); assert.deepEqual(readSessionLog(undefined), []);
});

test('merges legacy pomodoro sessions with richer logged records', () => {
  const legacy = [{ start: at(2026, 10, 12), end: at(2026, 10, 12, 9, 25), taskId: 't1', completed: true }, { start: at(2026, 10, 13), end: at(2026, 10, 13, 9, 25), taskId: '', completed: false }];
  const log = JSON.stringify([{ start: at(2026, 10, 12) + 2000, end: at(2026, 10, 12, 9, 25) + 1500, durationMs: 25 * M, taskId: 't1', album: { title: '夜航' } }]);
  const merged = loadSessions({ storage: storage(log), legacy });
  assert.equal(merged.length, 2); assert.equal(merged[0].album.title, '夜航'); assert.equal(merged[1].completed, false);
  assert.equal(fromLegacySessions(null).length, 0);
  assert.equal(mergeSessions([s(at(2026, 1, 1), 25)], [s(at(2026, 1, 1, 12), 25)]).length, 2);
});

test('subscribes to cabin:focus-session and unsubscribes', () => {
  const target = new EventTarget(), got = [];
  const off = subscribeSessions(target, (r) => got.push(r));
  const fire = (detail) => { const e = new Event(FOCUS_SESSION_EVENT); e.detail = detail; target.dispatchEvent(e); };
  fire({ start: at(2026, 1, 1), end: at(2026, 1, 1, 9, 25) }); fire({ junk: true }); off(); fire({ start: at(2026, 1, 2), end: at(2026, 1, 2, 9, 25) });
  assert.equal(got.length, 1); assert.equal(subscribeSessions(null, () => {})(), undefined);
});

test('streak forgives one missed day per week, not two', () => {
  const now = at(2026, 10, 16, 20); // Fri
  const days = (list) => new Map(list.map((d) => [new Date(2026, 9, d).toLocaleDateString('sv-SE'), 30]));
  assert.equal(graceStreak(days([16, 15, 14]), now).days, 3);
  assert.equal(graceStreak(days([15, 14]), now).days, 2, 'today may be empty');
  const one = graceStreak(days([16, 15, 13, 12]), now); assert.equal(one.days, 4); assert.equal(one.forgiven, 1);
  assert.equal(graceStreak(days([16, 13, 12]), now).days, 1, 'two gaps in one week break it');
  // Gaps in two different weeks are each forgiven (Sun 11 is last week's).
  assert.equal(graceStreak(days([16, 15, 14, 13, 12, 10, 9]), now).days, 7);
  assert.equal(graceStreak(new Map(), now).days, 0);
});

test('recent, daily, year heatmap and midnight splitting', () => {
  const now = at(2026, 10, 16, 20);
  const list = [s(at(2026, 10, 16, 9), 25), s(at(2026, 10, 16, 14), 50, { completed: false }), s(at(2026, 10, 15, 23, 50), 20)];
  const r = recentSummary(list, now);
  assert.equal(r.todayMinutes, 85); assert.equal(r.todayPomodoros, 2, 'counted on the day it ends'); assert.equal(r.recent[0].start, at(2026, 10, 16, 14));
  assert.equal(minutesByDay(list).get('2026-10-15'), 10);
  const week = dailySeries(list, now, 7); assert.equal(week.length, 7); assert.equal(week[6].label, '今天'); assert.equal(week[6].minutes, 85);
  assert.equal(dailySeries(list, now, 30).length, 30);
  const year = yearHeatmap(list, now); assert.equal(year.length, 53); assert.equal(year[52][4].key, '2026-10-16'); assert.equal(year[52][4].level, 3); assert(year[52][6].future);
});

test('by task ranks minutes, keeps a free-focus bucket', () => {
  const tasks = [{ id: 'a', text: '写第三章', done: true }, { id: 'b', text: '复习' }];
  const rows = byTask([s(at(2026, 1, 1), 25, { taskId: 'a' }), s(at(2026, 1, 1, 11), 50, { taskId: 'a' }), s(at(2026, 1, 1, 14), 30), s(at(2026, 1, 2), 25, { taskId: 'gone' })], tasks);
  assert.deepEqual(rows.map((r) => r.name), ['写第三章', FREE_FOCUS]); assert.equal(rows[0].pomodoros, 2); assert.equal(rows[1].minutes, 55); assert(rows[0].done);
  assert.equal(byTask([s(at(2026, 1, 1), 25, { taskId: 'x', taskText: '旧任务' })], [])[0].name, '旧任务');
});

test('time of day buckets by hour', () => {
  const t = timeOfDay([s(at(2026, 1, 1, 8, 30), 60), s(at(2026, 1, 1, 22), 30)]);
  assert.equal(t.hours[8], 30); assert.equal(t.hours[9], 30); assert.equal(t.best.id, 'dawn');
  assert.equal(timeOfDay([]).best, null);
});

test('weekly report for last week with comparison, album and markdown', () => {
  const now = at(2026, 10, 19, 10); // Monday
  assert(isMonday(now)); assert.equal(new Date(startOfWeek(now)).getDate(), 19);
  const tasks = [{ id: 'a', text: '写第三章', done: true, doneAt: at(2026, 10, 14, 18) }, { id: 'b', text: '复习', done: false }];
  const list = [
    s(at(2026, 10, 5, 9), 30), // previous week
    s(at(2026, 10, 13, 9), 50, { taskId: 'a', album: { title: '夜航' } }), s(at(2026, 10, 14, 15), 25, { taskId: 'a', album: { title: '夜航' } }),
    s(at(2026, 10, 15, 15), 25, { taskId: 'b', album: { title: '晨光' } }), s(at(2026, 10, 18, 9), 25)
  ];
  const r = weeklyReport(list, tasks, now);
  assert.equal(r.label, '10月12日 – 10月18日'); assert.equal(r.totalMinutes, 125); assert.equal(r.previousMinutes, 30); assert.equal(r.deltaMinutes, 95);
  assert.equal(r.bestDay.label, '周二'); assert.equal(r.bestSlot.id, 'morning'); assert.equal(r.topTasks[0].name, '写第三章');
  assert.deepEqual(r.completed, ['写第三章']); assert.equal(r.longestStreak, 3); assert.equal(r.album.title, '夜航'); assert.match(r.summary, /比上周多/);
  const md = reportMarkdown(r); assert.match(md, /## 心流小屋周报 · 10月12日/); assert.match(md, /- \[x\] 写第三章/); assert.match(md, /《夜航》/);
  const empty = weeklyReport([], [], now); assert.equal(empty.totalMinutes, 0); assert.match(empty.summary, /安静/); assert.match(reportMarkdown(empty), /还没有专注记录/);
  assert.equal(weeklyReport(list, tasks, now, -2).totalMinutes, 30); assert.equal(weeklyReport(list, tasks, now, -3).totalMinutes, 0);
});

test('week card draws within the canvas', () => {
  const calls = []; const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 14 }) }, { get: (o, k) => k in o ? o[k] : (...a) => calls.push([k, ...a]), set: () => true });
  const r = weeklyReport([s(at(2026, 10, 13, 9), 50, { album: { title: '夜航' } })], [], at(2026, 10, 19, 10));
  assert.deepEqual(drawWeekCard(ctx, r), { width: CARD_W, height: CARD_H });
  for (const [k, x, y, w, h] of calls.filter((c) => c[0] === 'fillRect')) assert(x >= 0 && y >= 0 && x + w <= CARD_W && y + h <= CARD_H, `${k} out of bounds`);
  assert(calls.some((c) => c[0] === 'fillText' && /夜航/.test(c[1])));
});

test('journal events', async () => {
  const { openJournal, journalTab, isJournalKey, JOURNAL_EVENT } = await import('./journal-events.mjs');
  const t = new EventTarget(), seen = [];
  t.addEventListener(JOURNAL_EVENT, (e) => seen.push(e.detail.tab));
  openJournal('weekly', t); openJournal('bogus', t); openJournal(undefined, t);
  assert.deepEqual(seen, ['weekly', 'overview', undefined]); assert.equal(journalTab('tasks'), 'tasks');
  assert(isJournalKey({ key: 'l' })); assert(!isJournalKey({ key: 'L', ctrlKey: true })); assert(!isJournalKey({ key: 'k' }));
});
