import test from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, shiftMonth, heatLevel, dayStats, monthTotals, formatSpan, taskBucket, listOf, scheduleChange, noteColor, taskColor, NOTE_COLORS, shortDate, ringPath, dayPage, planLabel, weekOf, daySessions, clockTime } from './calendar-model.mjs';

const MIN = 60000, DAY = 24 * 60 * MIN, NOW = new Date(2026, 10, 5, 15).getTime();   // Thursday 5 November 2026

test('November 2026 starts on a Sunday: six Monday-first rows, six days of October ahead of it', () => {
  const weeks = monthGrid(2026, 10, NOW);
  assert.equal(weeks.length, 6);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks[0][0].key, '2026-10-26');
  assert.equal(weeks[0][0].inMonth, false);
  assert.equal(weeks[0][6].key, '2026-11-01', 'Sunday closes the first row');
  assert.equal(weeks[0][6].inMonth, true);
  assert.equal(weeks.at(-1)[0].key, '2026-11-30');
  assert.equal(weeks.at(-1).at(-1).key, '2026-12-06');
  assert.equal(weeks.flat().filter((cell) => cell.inMonth).length, 30);
  assert.deepEqual(weeks.flat().filter((cell) => cell.today).map((cell) => cell.key), ['2026-11-05']);
});

test('a month that fits four weeks, and one that needs six', () => {
  assert.equal(monthGrid(2027, 1, NOW).length, 4, 'February 2027 begins on a Monday and has 28 days');
  assert.equal(monthGrid(2026, 7, NOW).length, 6, 'August 2026: Saturday the 1st, 31 days');
});

test('months roll over the year in both directions', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 5 }, 14), { year: 2027, month: 7 });
});

test('heat has four steps', () => {
  assert.deepEqual([0, 0.5, 1, 24, 25, 59, 60, 119, 120, 600].map(heatLevel), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('days hold their minutes, rounds, finished notes and planned notes', () => {
  const start = new Date(2026, 10, 3, 9).getTime();
  const sessions = [{ start, end: start + 25 * MIN, completed: true }, { start: start + 3600000, end: start + 3600000 + 30 * MIN, completed: true }, { start: start + 7200000, end: start + 7200000 + 10 * MIN, completed: false }];
  const tasks = [
    { id: 'a', done: true, doneAt: new Date(2026, 10, 3, 17).getTime(), list: 'today', plannedFor: '2026-11-03' },
    { id: 'b', done: false, list: 'today', plannedFor: '2026-11-08' },
    { id: 'c', done: false, list: 'later', plannedFor: '' },
  ];
  const stats = dayStats(sessions, tasks), day = stats.get('2026-11-03');
  assert.equal(day.minutes, 65);
  assert.equal(day.rounds, 2, 'an interrupted round is not counted as finished');
  assert.deepEqual(day.done.map((task) => task.id), ['a']);
  assert.deepEqual(stats.get('2026-11-08').planned.map((task) => task.id), ['b']);
  assert.deepEqual(stats.get('2026-11-09'), { key: '2026-11-09', minutes: 0, rounds: 0, done: [], planned: [] });
  assert.deepEqual(monthTotals(stats, 2026, 10), { minutes: 65, daysFocused: 1 });
  assert.deepEqual(monthTotals(stats, 2026, 9), { minutes: 0, daysFocused: 0 });
});

test('a late session is split at midnight across both days', () => {
  const start = new Date(2026, 10, 3, 23, 40).getTime();
  const stats = dayStats([{ start, end: start + 50 * MIN, completed: true }], []);
  assert.equal(stats.get('2026-11-03').minutes, 20);
  assert.equal(stats.get('2026-11-04').minutes, 30);
});

test('spans read as minutes or hours', () => {
  assert.equal(formatSpan(45), '45 分钟');
  assert.equal(formatSpan(120), '2 小时');
  assert.equal(formatSpan(135), '2 小时 15 分');
});

test('a note planned for a later day waits with 之后; everything else of 今天 stays', () => {
  const today = '2026-11-05';
  assert.equal(taskBucket({ list: 'today', plannedFor: today, done: false }, today), 'today');
  assert.equal(taskBucket({ list: 'today', plannedFor: '2026-11-09', done: false }, today), 'scheduled');
  assert.equal(listOf({ list: 'today', plannedFor: '2026-11-09', done: false }, today), 'later');
  assert.equal(taskBucket({ list: 'today', plannedFor: '2026-11-09', done: true }, today), 'today', 'a finished note is history');
  assert.equal(taskBucket({ list: 'later', plannedFor: '', done: false }, today), 'later');
  assert.equal(taskBucket({ list: 'today', plannedFor: '', done: false }, today), 'today', 'notes from before 2.2 have no day and count as today');
});

test('sticking a note on a day: today or later plans it, past days and finished notes are refused', () => {
  const today = '2026-11-05', open = { id: 'x', list: 'later', plannedFor: '', done: false, carried: 2 };
  assert.deepEqual(scheduleChange(open, '2026-11-08', today), { ok: true, noop: false, change: { list: 'today', plannedFor: '2026-11-08', carried: 0 } });
  assert.deepEqual(scheduleChange(open, today, today).change, { list: 'today', plannedFor: today, carried: 0 }, 'today moves it onto today');
  assert.equal(scheduleChange(open, '2026-11-04', today).reason, 'past');
  assert.equal(scheduleChange({ ...open, done: true }, '2026-11-08', today).reason, 'done');
  assert.equal(scheduleChange(open, 'tomorrow', today).reason, 'bad');
  assert.equal(scheduleChange({ ...open, list: 'today', plannedFor: '2026-11-08' }, '2026-11-08', today).noop, true);
});

test('a note keeps one of the six pad colours, the same one every time', () => {
  assert.equal(noteColor('abc123'), noteColor('abc123'));
  const seen = new Set(Array.from({ length: 60 }, (_, i) => noteColor(`task-${i}`)));
  assert.ok(seen.size >= 5, 'colours spread across the pad');
  assert.ok([...seen].every((i) => i >= 0 && i < NOTE_COLORS.length));
});

test('plan stamps and the red pen ring', () => {
  assert.equal(shortDate('2026-11-08'), '11月8日');
  assert.equal(shortDate(''), '');
  const d = ringPath(20, 20, 16, 14);
  assert.match(d, /^M[\d. -]+(L[\d. -]+){64}$/);
  assert.equal(ringPath(20, 20, 16, 14), d, 'deterministic');
  const [x0, y0] = d.slice(1).split('L')[0].split(' ').map(Number), [x1, y1] = d.split('L').at(-1).split(' ').map(Number);
  assert.ok(Math.hypot(x1 - x0, y1 - y0) > 1, 'the pen ends a little past where it began');
});

test('the planner page of a day: plans by time, to-dos as they were written; a past page shows what was done', () => {
  const today = '2026-11-05', tasks = [
    { id: 'a', text: '买牛奶', list: 'today', plannedFor: today, done: false },
    { id: 'b', text: '看牙医', list: 'today', plannedFor: today, done: false, at: '10:00-11:00' },
    { id: 'c', text: '开会', list: 'today', plannedFor: today, done: false, at: '09:00' },
    { id: 'd', text: '下周的事', list: 'today', plannedFor: '2026-11-12', done: false },
    { id: 'e', text: '之后', list: 'later', plannedFor: '', done: false },
    { id: 'f', text: '前天做完', list: 'today', plannedFor: '2026-11-03', done: true, doneAt: new Date(2026, 10, 3, 20).getTime() }
  ];
  const page = dayPage(tasks, today, today);
  assert.deepEqual(page.plans.map((task) => task.id), ['c', 'b']);
  assert.deepEqual(page.todos.map((task) => task.id), ['a', 'f'], 'a finished note stays on today\'s page until it is cleared');
  assert.equal(page.today, true);
  assert.deepEqual(dayPage(tasks, '2026-11-12', today).todos.map((task) => task.id), ['d']);
  const past = dayPage(tasks, '2026-11-03', today);
  assert.equal(past.past, true); assert.deepEqual(past.todos.map((task) => task.id), ['f']);
  assert.equal(planLabel('10:00-11:00'), '10:00–11:00');
});

test('a picked pad colour wins over the colour for life', () => {
  assert.equal(taskColor({ id: 'x', color: 4 }), 4);
  assert.equal(taskColor({ id: 'x', color: 9 }), noteColor('x'));
  assert.equal(taskColor({ id: 'x' }), noteColor('x'));
});

test('the week of a day runs Monday to Sunday, across a month end', () => {
  const week = weekOf('2026-11-01', NOW);
  assert.deepEqual(week.map((day) => day.key), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(weekOf('2026-11-05', NOW).find((day) => day.today).key, '2026-11-05');
});

test('a day\'s rounds come in order with their minutes', () => {
  const at = (h, m) => new Date(2026, 10, 5, h, m).getTime();
  const rounds = daySessions([{ start: at(14, 0), end: at(14, 25), taskText: '写稿' }, { start: at(9, 0), end: at(9, 50), completed: false }, { start: new Date(2026, 10, 4, 9).getTime(), end: new Date(2026, 10, 4, 10).getTime() }], '2026-11-05');
  assert.deepEqual(rounds.map((round) => [clockTime(round.start), round.minutes, round.completed, round.text]), [['09:00', 50, false, ''], ['14:00', 25, true, '写稿']]);
});
