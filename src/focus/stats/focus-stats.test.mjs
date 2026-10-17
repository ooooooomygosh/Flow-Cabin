import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSessionRecord, readSessionLog, fromLegacySessions, mergeSessions, loadSessions, subscribeSessions, SESSION_LOG_KEY, FOCUS_SESSION_EVENT } from './session-source.mjs';
import { graceStreak, minutesByDay, recentSummary, dailySeries, yearHeatmap, byTask, timeOfDay, weeklyReport, reportMarkdown, startOfWeek, isMonday, FREE_FOCUS } from './stats-model.mjs';
import { drawWeekCard, intScale, CARD_W, CARD_H } from './week-card.mjs';

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

test('journal art slots map to CSS variables, and empty slots keep the token baseline', async () => {
  const { JOURNAL_ART, journalArtStyle, hasArt } = await import('./journal-art.mjs');
  const none = Object.fromEntries(Object.keys(JOURNAL_ART).map((slot) => [slot, null]));
  assert.deepEqual(journalArtStyle(none), {}); assert.equal(hasArt('spine', none), false); assert.equal(hasArt('spine'), true);
  for (const url of Object.values(JOURNAL_ART).filter(Boolean)) assert.ok(existsSync(new URL(`../../../public${url}`, import.meta.url)), url);
  assert.deepEqual(journalArtStyle({ ...none, spine: '/journal/spine.png' }), { '--journal-spine-img': 'url("/journal/spine.png")' });
});

test('optional cover: sanitised, carried to the weekly album, CORS-safe export', async () => {
  const { normalizeCover } = await import('./session-source.mjs');
  const { canDrawCover } = await import('./week-card.mjs');
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(normalizeCover(png), png); assert.equal(normalizeCover('javascript:alert(1)'), ''); assert.equal(normalizeCover('/covers/a.png'), '/covers/a.png'); assert.equal(normalizeCover('//evil/a.png'), ''); assert.equal(normalizeCover(5), '');
  const r = normalizeSessionRecord({ start: at(2026, 10, 13), end: at(2026, 10, 13, 9, 30), album: { title: '夜航' }, cover: png });
  assert.equal(r.album.cover, png);
  assert.equal(normalizeSessionRecord({ start: at(2026, 10, 13), end: at(2026, 10, 13, 9, 30), album: { title: '夜航', cover: '/c.png' } }).album.cover, '/c.png');
  assert.equal(normalizeSessionRecord({ start: at(2026, 10, 13), end: at(2026, 10, 13, 9, 30), album: '夜航' }).album.cover, '');
  const week = weeklyReport([s(at(2026, 10, 13, 9), 25, { album: { title: '夜航' } }), s(at(2026, 10, 14, 9), 25, { album: { title: '夜航' }, cover: png })], [], at(2026, 10, 19, 10));
  assert.equal(week.album.cover, png, 'first record with a cover wins');
  assert.equal(weeklyReport([s(at(2026, 10, 13, 9), 25, { album: { title: '夜航' } })], [], at(2026, 10, 19, 10)).album.cover, '');
  const origin = 'http://127.0.0.1:4332';
  assert(canDrawCover(png, origin)); assert(canDrawCover('/c.png', origin)); assert(canDrawCover(origin + '/c.png', origin));
  assert(!canDrawCover('https://y.qq.com/c.png', origin)); assert(!canDrawCover('', origin));
  const calls = []; const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 14 }) }, { get: (o, k) => k in o ? o[k] : (...a) => calls.push([k, ...a]), set: () => true });
  drawWeekCard(ctx, { ...week, album: { ...week.album, cover: 'https://y.qq.com/c.png' } }); assert(!calls.some((c) => c[0] === 'drawImage'), 'cross-origin → placeholder');
  calls.length = 0; drawWeekCard(ctx, week, undefined, { cover: {} }); assert(calls.some((c) => c[0] === 'drawImage'));
});

test('week card export draws journal-art slots with integer nearest scaling', async () => {
  const { JOURNAL_ART, journalArtStyle, CARD_EXPORT_SLOTS, cardArt } = await import('./journal-art.mjs');
  assert.deepEqual(CARD_EXPORT_SLOTS, ['paper', 'cardPaper', 'card', 'cardTape', 'doodle']);
  assert.deepEqual(journalArtStyle({ ...Object.fromEntries(Object.keys(JOURNAL_ART).map((slot) => [slot, null])), card: '/s.png', cardPaper: '/p.png' }), { '--journal-card-img': 'url("/s.png")', '--journal-card-paper-img': 'url("/p.png")' });
  assert.deepEqual(cardArt({ paper: 'P', card: 'S' }), { cardPaper: 'P', cardStamp: 'S', cardTape: null, doodle: null }, 'card.png = stamp, page paper tiles the card');
  assert.equal(cardArt({ paper: 'P', cardPaper: 'C' }).cardPaper, 'C');
  assert.equal(intScale({ width: 24, height: 20 }, 96, 96), 4); assert.equal(intScale({ width: 200, height: 50 }, 96, 96), 1); assert.equal(intScale(null, 9, 9), 0);
  const img = (name, width, height) => ({ name, width, height });
  const art = { cardPaper: img('paper', 128, 128), cardStamp: img('stamp', 24, 24), cardTape: img('tape', 32, 8), doodle: img('doodle', 16, 16) };
  const calls = [], smoothing = []; const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 14 }) }, { get: (o, k) => k in o ? o[k] : (...a) => calls.push([k, ...a]), set: (o, k, v) => { if (k === 'imageSmoothingEnabled') smoothing.push(v); return true; } });
  const r = weeklyReport([s(at(2026, 10, 13, 9), 50, { album: { title: '夜航' } })], [], at(2026, 10, 19, 10));
  drawWeekCard(ctx, r, undefined, { art });
  assert(smoothing.length && smoothing.every((v) => v === false), 'nearest-neighbour only');
  const draws = calls.filter((c) => c[0] === 'drawImage'), by = (n) => draws.filter((c) => c[1].name === n);
  assert.equal(by('stamp').length, 1, 'stamp drawn once'); const [, , sx, sy, sw, sh] = by('stamp')[0];
  assert.equal(sw, 96); assert.equal(sh, 96); assert(sx + sw <= CARD_W - 16 && sy < 40, 'stamp sits top-right');
  assert(by('paper').length >= 12, 'paper tiled'); for (const c of by('paper')) assert.equal(c[4], c[8], 'tiles 1:1');
  assert.equal(by('tape').length, 1); assert.equal(by('tape')[0][4], 128); assert.equal(by('doodle')[0][4], 128, 'doodle stands in for the cat pose at ≤128');
  for (const c of draws) { const [x, y, w, h] = c.length > 6 ? c.slice(6) : c.slice(2); assert(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h) && x >= 0 && y >= 0 && x + w <= CARD_W && y + h <= CARD_H, `${c[1].name} off-grid or out of bounds`); }
  calls.length = 0; drawWeekCard(ctx, r); assert(!calls.some((c) => c[0] === 'drawImage'), 'empty slots keep the baseline');
});

test('weekly stamp renders once: own element, never a (tiling) card background', () => {
  const css = readFileSync(new URL('./journal-art.css', import.meta.url), 'utf8'), jsx = readFileSync(new URL('./CabinJournal.jsx', import.meta.url), 'utf8');
  const uses = css.split('\n').filter((l) => /var\(--journal-card-img\)/.test(l));
  assert.equal(uses.length, 1, 'card stamp slot is used by exactly one rule'); assert.match(uses[0], /^\s*\.fs-book \.fs-stamp \{/); assert.match(uses[0], /background-repeat: no-repeat/);
  assert.doesNotMatch(css, /\.fs-card[^{]*\{[^}]*background:[^;}]*--journal-card-img/, 'card background never references the stamp');
  assert.equal(jsx.match(/className="fs-stamp"/g)?.length, 1, 'one stamp element in the markup');
});

test('周报 defaults to the current week when it has data', async () => {
  const { defaultWeekOffset, weekName } = await import('./journal-layout.mjs');
  const now = at(2026, 10, 21, 20); // Wednesday
  assert.equal(defaultWeekOffset([s(at(2026, 10, 20, 9), 25), s(at(2026, 10, 14, 9), 50)], [], now), 0);
  assert.equal(defaultWeekOffset([s(at(2026, 10, 14, 9), 50)], [], now), -1, 'quiet week so far → last week');
  assert.equal(defaultWeekOffset([], [], now), 0);
  assert.equal(weekName(0), '本周'); assert.equal(weekName(-1), '上周'); assert.equal(weekName(-3), '3 周前');
});

test('journal layout: cat pose, stacked units, letter from real data', async () => {
  const { catPose, barUnits, cabinLetter, CAT_POSES } = await import('./journal-layout.mjs');
  assert.equal(catPose(0), 'cat-wait'); assert.equal(catPose(90), 'cat-desk'); assert.equal(catPose(400), 'cat-sleep-books');
  assert.equal(catPose(30, { tier: 'happy' }), 'cat-rub'); assert.equal(catPose(0, { tier: 'droopy' }), 'cat-droopy');
  for (const p of CAT_POSES) assert.ok(existsSync(new URL(`../../../public/cat/${p}.png`, import.meta.url)), p);
  const { JOURNAL_SPRITES } = await import('./journal-art.mjs'); for (const u of Object.values(JOURNAL_SPRITES).filter((u) => !/todo-empty|-sm\.png/.test(u))) assert.ok(existsSync(new URL(`../../../public${u}`, import.meta.url)), u);
  assert.equal(barUnits(0, 100), 0); assert.equal(barUnits(1, 100), 1); assert.equal(barUnits(100, 100), 10); assert.equal(barUnits(500, 100, 5), 5);
  const r = weeklyReport([s(at(2026, 10, 13, 9), 50, { taskId: 't1', album: { title: '夜航' } })], [{ id: 't1', text: '写第三章', done: true, doneAt: at(2026, 10, 14) }], at(2026, 10, 19, 10));
  const l = cabinLetter(r).join('');
  assert.match(l, /50 分钟/); assert.match(l, /写第三章/); assert.match(l, /《夜航》/); assert.doesNotMatch(l, /小猫/, 'no feed line without mood data');
  assert.match(cabinLetter(r, { feeds: 3, label: '心情很好' }).join(''), /喂了小猫 3 次/);
  assert.match(cabinLetter(weeklyReport([], [], at(2026, 10, 19))).join(''), /安静/);
});

test('cat mood: v1 store, weekly feed count from feeds[].at, tier drives pose', async () => {
  const { readCatMood, subscribeCatMood, CAT_MOOD_KEY, CAT_FED_EVENT, CAT_MOOD_EVENT } = await import('./cat-mood-source.mjs');
  const { catPose } = await import('./journal-layout.mjs');
  const st = (v) => ({ getItem: (k) => k === CAT_MOOD_KEY ? (typeof v === 'string' ? v : JSON.stringify(v)) : null }), from = at(2026, 10, 12), to = at(2026, 10, 19);
  const store = { v: 1, mood: 82, tier: 'happy', updatedAt: at(2026, 10, 15), feeds: [{ at: at(2026, 10, 13), fishLeft: 4 }, { at: at(2026, 10, 14), fishLeft: 3 }, { at: at(2026, 10, 6), fishLeft: 5 }], totalFeeds: 3, unlockedActions: [] };
  assert.deepEqual(readCatMood(st(store), from, to), { feeds: 2, tier: 'happy', mood: 82, label: '心情很好' });
  assert.equal(readCatMood(st(store), at(2026, 10, 5), from).feeds, 1, 'past weeks count their own feeds');
  assert.equal(readCatMood(st({ ...store, tier: 'droopy' }), from, to).label, '有点无精打采');
  assert.equal(readCatMood(st(null), from, to), null); assert.equal(readCatMood(st('{bad'), from, to), null); assert.equal(readCatMood(undefined, from, to), null);
  assert.equal(readCatMood(st({ ...store, v: 2 }), from, to), null, 'unknown version is ignored');
  assert.equal(readCatMood(st({ v: 1, tier: 'sleepy', feeds: [] }), from, to), null, 'no tier and no feeds → hidden');
  assert.equal(readCatMood(st({ v: 1, fedLog: [at(2026, 10, 13)], feeds: [{ time: at(2026, 10, 13) }] }), from, to), null, 'guessed aliases are not read');
  assert.equal(catPose(30, { tier: 'happy' }), 'cat-rub'); assert.equal(catPose(0, { tier: 'droopy' }), 'cat-droopy'); assert.equal(catPose(0, { tier: 'ok' }), 'cat-wait');
  const t = new EventTarget(); let n = 0; const off = subscribeCatMood(t, () => n++);
  t.dispatchEvent(new Event(CAT_FED_EVENT)); t.dispatchEvent(new Event(CAT_MOOD_EVENT)); off(); t.dispatchEvent(new Event(CAT_FED_EVENT)); assert.equal(n, 2);
});
