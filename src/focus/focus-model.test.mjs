import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './focus-model.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const MIN = 60000, NOW = new Date(2026, 9, 9, 15).getTime();

test('presets apply valid settings and are detected back', () => {
  for (const preset of model.FOCUS_PRESETS) {
    const settings = model.normalizeSettings({ ...model.DEFAULT_SETTINGS, ...model.presetSettings(preset.id) });
    assert.equal(model.activePreset(settings), preset.id);
  }
  assert.equal(model.activePreset(model.DEFAULT_SETTINGS), 'classic');
  assert.equal(model.activePreset({ focusMin: 33 }), '');
  assert.equal(model.presetSettings('nope'), null);
});

test('phase progress follows the running and paused timer', () => {
  const state = model.normalizeFocus();
  assert.equal(model.phaseProgress(state.timer, state.settings, NOW), 0);
  const running = model.startPhase(state, 'focus', NOW);
  near(model.phaseProgress(running.timer, running.settings, NOW + 5 * MIN), .2);
  const paused = model.pause(running, NOW + 10 * MIN);
  near(model.phaseProgress(paused.timer, paused.settings, NOW + 20 * MIN), .4);
  assert.equal(model.phaseProgress(running.timer, running.settings, NOW + 99 * MIN), 1);
});

test('renaming a task trims text and ignores empty names', () => {
  let state = model.addTask(model.normalizeFocus(), 'Write README', NOW);
  const id = state.tasks[0].id;
  state = model.renameTask(state, id, '  Polish README\n');
  assert.equal(state.tasks[0].text, 'Polish README');
  assert.equal(model.renameTask(state, id, '   '), state);
});

test('task progress counts items finished today', () => {
  let state = model.normalizeFocus();
  for (const text of ['a', 'b', 'c']) state = model.addTask(state, text, NOW);
  state = model.updateTask(state, state.tasks[0].id, { done: true }, NOW);
  state = model.updateTask(state, state.tasks[1].id, { done: true }, NOW - 2 * 24 * 60 * MIN);
  assert.deepEqual(model.taskProgress(state.tasks, NOW), { total: 3, done: 2, open: 1, doneToday: 1 });
});

test('completed focus round earns a reward and starts a break', () => {
  const state = model.startPhase(model.normalizeFocus(), 'focus', NOW);
  const { state: next, event } = model.tick(state, NOW + 25 * MIN);
  assert.equal(event.completed, true);
  assert.equal(next.rewards.fish, 1);
  assert.equal(next.timer.phase, 'shortBreak');
});

test('long sleep credits one phase and repeated wake events cannot credit it twice', () => {
  for (const autoBreak of [false, true]) for (const autoFocus of [false, true]) {
    const state = model.startPhase(model.normalizeFocus({ settings: { focusMin: 1, shortMin: 1, autoBreak, autoFocus } }), 'focus', NOW);
    const result = model.tick(state, NOW + 20 * MIN);
    assert.equal(result.state.timer.phase, 'idle');
    assert.equal(result.state.sessions.length, 1);
    assert.equal(result.state.rewards.fish, 1);
    assert.equal(result.state.rewards.xp, 1);
    assert.equal(result.state.sessions[0].end, NOW + MIN);
    assert.equal(model.tick(result.state, NOW + 20 * MIN).event, null);
  }
});

test('pause, reload normalization, and resume preserve remaining work', () => {
  let state = model.startPhase(model.normalizeFocus({ settings: { focusMin: 2 } }), 'focus', NOW);
  state = model.pause(state, NOW + 30000);
  state = model.normalizeFocus(JSON.parse(JSON.stringify(state)));
  assert.equal(model.remainingMs(state.timer, NOW + 10 * MIN), 90000);
  state = model.resume(state, NOW + 10 * MIN);
  assert.equal(state.timer.endsAt, NOW + 10 * MIN + 90000);
  const result = model.tick(state, state.timer.endsAt);
  assert.equal(result.state.sessions.length, 1);
  assert.equal(result.state.sessions[0].end - result.state.sessions[0].start, 2 * MIN);
  assert.equal(result.state.rewards.xp, 2);
});

test('four completed rounds start a long break; a manual skip earns no reward', () => {
  let state = model.normalizeFocus({ settings: { focusMin: 1, shortMin: 1, longMin: 2, longEvery: 4 } });
  for (let round = 1; round <= 4; round++) {
    state = model.startPhase(state, 'focus', NOW + (round - 1) * 10 * MIN);
    state = model.tick(state, state.timer.endsAt).state;
    assert.equal(state.timer.phase, round === 4 ? 'longBreak' : 'shortBreak');
    assert.equal(state.rewards.fish, round);
  }
  const working = model.startPhase(state, 'focus', NOW + 50 * MIN);
  const skipped = model.skip(working, NOW + 50 * MIN + 10000);
  assert.equal(skipped.event.completed, false);
  assert.equal(skipped.state.rewards.fish, 4);
  assert.equal(skipped.state.timer.round, 4);
});

test('completed sessions split across local midnight without losing minutes', () => {
  const start = new Date(2026, 9, 13, 23, 59).getTime();
  const end = new Date(2026, 9, 14, 0, 1).getTime();
  const days = model.minutesByDay([{ start, end, completed: true }]);
  assert.equal(days.get('2026-10-13'), 1);
  assert.equal(days.get('2026-10-14'), 1);
});

test('focus: 撤销 puts a deleted task back in place with its rounds', () => {
  let state = model.normalizeFocus({});
  for (const text of ['一', '二', '三']) state = model.addTask(state, text, 1);
  state = model.updateTask(state, state.tasks[1].id, { pomodoros: 3 }, 2);
  const task = state.tasks[1], without = model.removeTask(state, task.id);
  assert.deepEqual(model.restoreTask(without, task, 1).tasks, state.tasks);
  assert.equal(model.restoreTask(state, task, 1), state, 'never duplicates a task that is still there');
});

// 回归：null / '' / 布尔值不是 0。把它们当成 0 会把 25 分钟的专注变成 1 分钟。
test('missing settings fall back to the defaults instead of collapsing to zero', () => {
  const settings = model.normalizeSettings({ focusMin: null, shortMin: '', longMin: undefined, longEvery: false, dailyGoal: null });
  assert.equal(settings.focusMin, model.DEFAULT_SETTINGS.focusMin);
  assert.equal(settings.shortMin, model.DEFAULT_SETTINGS.shortMin);
  assert.equal(settings.longMin, model.DEFAULT_SETTINGS.longMin);
  assert.equal(settings.longEvery, model.DEFAULT_SETTINGS.longEvery);
  assert.equal(settings.dailyGoal, model.DEFAULT_SETTINGS.dailyGoal);
  // 真正的 0 依然是 0：每日目标允许为 0，其它时长不允许。
  assert.equal(model.normalizeSettings({ dailyGoal: 0 }).dailyGoal, 0);
  assert.equal(model.normalizeSettings({ focusMin: 0 }).focusMin, 1, 'a zero length is clamped, not replaced by the default');
  const timer = model.normalizeFocus({ timer: { phase: 'focus', endsAt: null, remaining: null, startedAt: null, round: null } }).timer;
  assert.equal(timer.endsAt, 0); assert.equal(timer.remaining, 0); assert.equal(timer.startedAt, 0); assert.equal(timer.round, 0);
});

// 回归：focusStats(undefined) 曾经直接抛错，整块统计面板会白屏。
test('focus statistics survive a missing session list', () => {
  const stats = model.focusStats(undefined, NOW);
  assert.equal(stats.today, 0); assert.equal(stats.streak, 0); assert.equal(stats.totalMinutes, 0);
  assert.equal(stats.sessions, 0); assert.equal(stats.todaySessions, 0);
  assert.equal(stats.week.length, 7);
  assert.ok(stats.week.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.key)), 'real day keys, not NaN');
  assert.deepEqual(model.focusStats(null, NOW).week.map((day) => day.key), stats.week.map((day) => day.key));
});

// 回归：没有 now 就不该编出 NaN-NaN-NaN 这样的日期。
test('focus statistics without a usable clock keep only the timeless parts', () => {
  for (const now of [undefined, null, NaN, 'later']) {
    const stats = model.focusStats([{ start: NOW - 30 * MIN, end: NOW, completed: true }], now);
    assert.equal(stats.today, 0);
    assert.equal(stats.streak, 0);
    assert.equal(stats.week.length, 7);
    assert.ok(stats.week.every((day) => day.key === '' && day.minutes === 0), 'no invented dates');
    assert.equal(stats.sessions, 1, 'the completed round is still counted');
    assert.equal(stats.totalMinutes, 30, 'the total does not need a clock');
  }
});

// 回归：随机 id 必须可注入，模型才是可测的。
test('task ids come from the injected factory, never from a random source', () => {
  const ids = ['t1', 't2', 't3'];
  let index = 0;
  const makeId = () => ids[index++];
  let state = model.normalizeFocus({}, { makeId });
  state = model.addTask(state, '写周报', NOW, { makeId });
  state = model.addTask(state, '读论文', NOW, { makeId });
  assert.deepEqual(state.tasks.map((task) => task.id), ['t1', 't2']);
  assert.equal(model.normalizeFocus({ tasks: [{ text: '没有编号' }] }, { makeId: () => 'fixed' }).tasks[0].id, 'fixed');
  // 没有注入时仍然要有编号，只是不能是空串。
  assert.ok(model.addTask(model.normalizeFocus(), 'x', NOW).tasks[0].id);
});

// 回归：夏令时切换那天，本地日只有 23 小时，分钟数不能算错。
test('a session across a daylight-saving switch keeps its minutes', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    // 2026-03-08 是春天：本地 02:00 直接跳到 03:00，这一天只有 23 小时。
    const start = new Date(2026, 2, 8, 1, 30).getTime();
    const end = new Date(2026, 2, 8, 4, 0).getTime();
    const days = model.minutesByDay([{ start, end, completed: true }]);
    assert.equal(days.get('2026-03-08'), 90, '真的过了 90 分钟：02:00 那一个小时不存在');
    assert.equal(days.size, 1, '整段都落在切换当天');
    // 本地一整天 = 23 小时 = 1380 分钟。
    const midnight = new Date(2026, 2, 8, 0, 0).getTime(), nextMidnight = new Date(2026, 2, 9, 0, 0).getTime();
    assert.equal((nextMidnight - midnight) / MIN, 1380);
    assert.equal(model.minutesByDay([{ start: midnight, end: nextMidnight, completed: true }]).get('2026-03-08'), 1380);
    const now = new Date(2026, 2, 8, 12, 0).getTime();
    const stats = model.focusStats([{ start, end, completed: true }], now);
    assert.equal(stats.today, 90);
    assert.equal(stats.streak, 1, 'a 23-hour day still counts as a day');
    assert.deepEqual(stats.week.map((day) => day.key), ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

// 回归：连续天数不能因为跨月、跨年或时区回拨而算错。
test('a streak survives month, year and clock changes', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
    // 12 月 30 日、31 日、1 月 1 日：跨月跨年仍然是连续三天。
    const days = new Map([['2025-12-30', 5], ['2025-12-31', 5], ['2026-01-01', 5]]);
    assert.equal(model.currentStreak(days, day(2026, 1, 1)), 3);
    assert.equal(model.currentStreak(days, day(2026, 1, 2)), 3, '今天还没开始时从昨天算起');
    assert.equal(model.currentStreak(days, day(2026, 1, 5)), 0, '断了就是断了');
    const gapped = new Map([['2025-12-30', 5], ['2026-01-01', 5]]);
    assert.equal(model.currentStreak(gapped, day(2026, 1, 1)), 1, '中间缺一天就中断');
    // 不足一分钟不算一天。
    assert.equal(model.currentStreak(new Map([['2026-01-01', 0.5]]), day(2026, 1, 1)), 0);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
