import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../focus-model.mjs';
import { NOTE_LIMIT, SESSION_LOG_KEY, SESSIONS_CHANGED, normalizeSessionNote, setSessionNote, appendSession, sessionRecord, endedSession, readSessions } from '../session-log.mjs';
import { normalizeSessionRecord, mergeSessions, readSessionLog } from './session-source.mjs';
import { isPressed, topRecords, weekDiary, weeklyCollection, yearWall, wallColour, wallSummary, collectionMarkdown, PRESS_MIN_MS } from './record-diary.mjs';
import { minutesByDay } from './stats-model.mjs';
import { startOfWeek, addDays } from '../../lib/local-calendar.mjs';

globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const MIN = 60000;
// Wednesday 2026-10-28 15:00 local.
const NOW = new Date(2026, 9, 28, 15, 0).getTime(), MONDAY = startOfWeek(NOW);
const at = (day, hour, minute = 0) => { const d = new Date(addDays(MONDAY, day)); d.setHours(hour, minute, 0, 0); return d.getTime(); };
const night = { key: 'a1', title: '夜航星', artist: '林间', cover: 'data:image/png;base64,AAA' }, rain = { key: 'a2', title: '雨天唱片', artist: 'Lo-fi Cat', cover: '' };
const session = (start, minutes, patch = {}) => normalizeSessionRecord({ id: `s${start}`, start, end: start + minutes * MIN, durationMs: minutes * MIN, completed: true, ...patch });

test('the end-of-round note is plain text, one line, capped at 140 characters', () => {
  assert.equal(NOTE_LIMIT, 140);
  assert.equal(normalizeSessionNote('  写完了\n第三章\t！ '), '写完了 第三章 ！');
  assert.equal(Array.from(normalizeSessionNote('字'.repeat(300))).length, 140);
  assert.equal(Array.from(normalizeSessionNote('🎵'.repeat(200))).length, 140, 'counts characters, never splits an emoji');
  for (const value of [null, undefined, 42, {}, '   ']) assert.equal(normalizeSessionNote(value), '');
});

test('session records are valid with or without a note; the reader caps it', () => {
  const plain = normalizeSessionRecord({ id: 's1', start: NOW - 25 * MIN, end: NOW, completed: true });
  assert.equal('note' in plain, false, 'no note key on old records');
  const noted = normalizeSessionRecord({ id: 's1', start: NOW - 25 * MIN, end: NOW, completed: true, note: `${'好'.repeat(200)}` });
  assert.equal(Array.from(noted.note).length, 140);
  assert.equal('note' in normalizeSessionRecord({ id: 's1', start: NOW - MIN, end: NOW, note: 7 }), false);
  // A record that gained a note wins over its legacy twin.
  const merged = mergeSessions([{ ...plain, id: 'legacy-1' }], [{ ...plain, note: '收好了' }]);
  assert.equal(merged.length, 1); assert.equal(merged[0].note, '收好了');
});

test('a note is added to the logged record in place, announced as a change, never as a new round', () => {
  const storage = memory(), events = [], target = { dispatchEvent: (e) => events.push(e) };
  const record = sessionRecord({ start: NOW - 25 * MIN, end: NOW, completed: true, todo: { id: '', text: '读论文' } });
  appendSession(record, storage);
  const saved = setSessionNote(record.id, ' 读完了引言 \n', { storage, target });
  assert.equal(saved.ok, true); assert.equal(readSessions(storage)[0].note, '读完了引言');
  assert.equal(readSessions(storage).length, 1); assert.equal(events.length, 1); assert.equal(events[0].type, SESSIONS_CHANGED);
  assert.equal(readSessionLog(storage)[0].note, '读完了引言');
  assert.equal(setSessionNote(record.id, '', { storage, target }).ok, true); assert.equal('note' in readSessions(storage)[0], false, 'clearing removes the field');
  assert.equal(setSessionNote('missing', 'x', { storage, target }).ok, false);
  const broken = memory(); appendSession(record, broken); broken.setItem = () => { throw new Error('quota'); };
  assert.match(setSessionNote(record.id, 'x', { storage: broken, target }).error, /没能保存/);
});

test('a typed intention is kept as the session text with an empty taskId', () => {
  let state = model.normalizeFocus({ tasks: [{ id: 't1', text: '写周报' }] });
  state = model.setIntent(state, '  读论文第二节 ');
  assert.equal(state.timer.intent, '读论文第二节'); assert.equal(model.intentText(state), '读论文第二节');
  const running = model.startPhase(state, 'focus', NOW);
  assert.equal(running.timer.intent, '读论文第二节', 'starting keeps the intention');
  assert.equal(model.normalizeFocus(JSON.parse(JSON.stringify(running))).timer.intent, '读论文第二节', 'survives a reload');
  const done = model.tick(running, running.timer.endsAt).state;
  const ended = endedSession(running, done, running.timer.endsAt);
  assert.deepEqual(ended.todo, { id: '', text: '读论文第二节' });
  const record = sessionRecord(ended); assert.equal(record.taskId, ''); assert.equal(record.taskText, '读论文第二节');
  // Picking a todo replaces the typed text; typing again unpicks it.
  const picked = model.selectTask(state, 't1');
  assert.equal(picked.timer.taskId, 't1'); assert.equal('intent' in picked.timer, false); assert.equal(model.intentText(picked), '写周报');
  const retyped = model.setIntent(picked, '别的事');
  assert.equal(retyped.timer.taskId, ''); assert.equal(retyped.timer.intent, '别的事');
  assert.equal(model.setIntent(retyped, '别的事'), retyped, 'no-op when unchanged');
  assert.equal('intent' in model.setIntent(retyped, '').timer, false);
  assert.equal('intent' in model.normalizeFocus({}).timer, false, 'older records stay as they were');
});

test('本周来了 N 天 counts this Monday-week only and starts again on Monday', () => {
  const sessions = [session(at(-1, 9), 30), session(at(0, 9), 30), session(at(2, 9), 40), session(at(2, 20), 10)];
  const days = minutesByDay(sessions);
  assert.equal(model.daysThisWeek(days, NOW), 2, 'Sunday last week does not count');
  assert.equal(model.daysThisWeek(days, at(6, 23)), 2, 'later days of the same week keep the count');
  assert.equal(model.daysThisWeek(days, at(7, 8)), 0, 'a new week starts at zero, nothing "breaks"');
  assert.equal(model.daysThisWeek(new Map([['x', 1]]), NaN), 0);
  assert.equal(model.focusStats(sessions, NOW).weekDays, 2);
  assert.equal(model.focusStats(sessions, NOW).streak, 1, 'the streak model is untouched (Tuesday was empty)');
});

test('top records rank by focus minutes, ignore sessions without a record', () => {
  const list = [session(at(0, 9), 25, { album: night }), session(at(1, 9), 25, { album: rain }), session(at(1, 10), 50, { album: rain }), session(at(2, 9), 30), session(at(2, 11), 10, { album: { title: '第三张' } })];
  const top = topRecords(list, 3);
  assert.deepEqual(top.map((r) => [r.title, r.minutes]), [['雨天唱片', 75], ['夜航星', 25], ['第三张', 10]]);
  assert.equal(top[1].cover, night.cover);
  assert.deepEqual(topRecords([], 3), []);
});

test('这一周 lists pressed records and 文字 entries per day; short or interrupted rounds leave no trace', () => {
  const list = [session(at(0, 9), 25, { album: night, taskText: '写第三章', note: '顺利' }), session(at(0, 14), 4), session(at(1, 9), 30, { completed: false }), session(at(2, 8), 50, { album: rain }), session(at(-1, 9), 60)];
  const entries = [{ id: 'j1', body: '今天的灵感\n第二行', tags: [], createdAt: at(1, 21), updatedAt: at(1, 21), origin: 'scratch' }, { id: 'j2', body: '删掉的', createdAt: at(1, 22), deletedAt: at(1, 23) }];
  const week = weekDiary(list, entries, NOW);
  assert.equal(week.days.length, 7); assert.equal(week.days[0].label, '周一'); assert.equal(week.days[2].isToday, true); assert.equal(week.days[3].future, true);
  assert.deepEqual(week.days[0].items.map((i) => i.kind), ['record'], 'the 4-minute round is not pressed');
  assert.equal(week.days[0].items[0].intent, '写第三章'); assert.equal(week.days[0].items[0].note, '顺利'); assert.equal(week.days[0].items[0].minutes, 25); assert.equal(week.days[0].items[0].slot, '上午');
  assert.deepEqual(week.days[1].items.map((i) => [i.kind, i.label]), [['text', '随手记']], 'the interrupted round has no card, the note is a 文字 item');
  assert.equal(week.days[1].minutes, 30, 'its minutes still count');
  assert.equal(week.records, 2); assert.equal(week.texts, 1); assert.equal(week.weekDays, 3);
  assert.equal(isPressed({ completed: true, durationMs: PRESS_MIN_MS }), true); assert.equal(isPressed({ completed: true, durationMs: PRESS_MIN_MS - 1 }), false);
  const last = weekDiary(list, entries, NOW, { weekOffset: -1 });
  assert.equal(last.days[6].items.length, 1); assert.equal(last.weekDays, 1);
});

test('本周合集 sums the week, its top 3 records, notes and days visited', () => {
  const list = [session(at(0, 9), 25, { album: night, note: '第一句' }), session(at(1, 9), 50, { album: rain, note: '第二句', taskText: '复习' }), session(at(1, 11), 25, { album: rain }), session(at(-2, 9), 90, { album: night })];
  const entries = [{ id: 'j1', body: '周三写的手记', tags: [], createdAt: at(2, 10), updatedAt: at(2, 10) }];
  const c = weeklyCollection(list, entries, NOW);
  assert.equal(c.totalMinutes, 100); assert.equal(c.records, 3);
  assert.deepEqual(c.top.map((r) => r.title), ['雨天唱片', '夜航星']);
  assert.deepEqual(c.notes.map((n) => n.text), ['第一句', '第二句']); assert.equal(c.notes[1].intent, '复习');
  assert.equal(c.daysVisited, 3, 'a day with only a 手记 counts as a visit');
  assert.deepEqual(c.days.map((d) => d.visited), [true, true, true, false, false, false, false]);
  assert.match(c.line, /来了 3 天/); assert.match(c.line, /《雨天唱片》/);
  const md = collectionMarkdown(c); assert.match(md, /本周合集/); assert.match(md, /1\. 《雨天唱片》/); assert.match(md, /- 第一句/);
  const empty = weeklyCollection([], [], NOW); assert.equal(empty.daysVisited, 0); assert.match(empty.line, /很安静/); assert.doesNotMatch(empty.line, /断|没来/);
});

test('一年唱片墙: each day knows its top record; colour comes from its cover, else the heat level', () => {
  const list = [session(at(0, 9), 25, { album: night }), session(at(0, 10), 30, { album: rain }), session(at(1, 9), 40), session(at(-30, 9), 60, { album: night })];
  const cols = yearWall(list, NOW);
  assert.equal(cols.length, 53); assert.equal(cols.flat().length, 53 * 7);
  const cell = (time) => cols.flat().find((c) => c.key === new Date(time).toLocaleDateString('sv-SE'));
  const monday = cell(at(0, 9)); assert.equal(monday.top.title, '雨天唱片', 'the day\'s longest companion'); assert.equal(monday.level, 2);
  assert.equal(cell(at(1, 9)).top, null, 'focus without a record has no cover, only heat');
  assert.equal(cell(at(-30, 9)).top.title, '夜航星');
  assert.equal(cols.flat().filter((c) => c.future).every((c) => c.top === null && c.level === 0), true);
  const colours = new Map([[night.cover, '#336699'], ['bad', 'red']]);
  assert.equal(wallColour(cell(at(-30, 9)), colours), '#336699');
  assert.equal(wallColour(monday, colours), null, 'no cover thumbnail: heat colour');
  assert.equal(wallColour({ top: { cover: night.cover } }, colours, '#336699'), null, 'the reader\'s failure colour is not a cover colour');
  assert.equal(wallColour({ top: { cover: 'bad' } }, new Map([['bad', 'red']])), null);
  assert.equal(wallColour(null, colours), null);
  assert.deepEqual(wallSummary(cols), { days: 3, withRecord: 2, minutes: 155 });
});
