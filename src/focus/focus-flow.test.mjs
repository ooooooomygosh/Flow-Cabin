// 2.2 focus flow: +5 分钟, 到点后继续计时, lock / sleep, round counter, tasks and distractions.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './focus-model.mjs';
import { noticeFor, showNotice } from './focus-notice.mjs';
import { distractionSummary } from './stats/stats-model.mjs';
import { addToast } from '../ui/toast-model.mjs';

test('「刚才在专注吗？」 stays up long enough to be answered', () => {
  assert.equal(addToast([], '刚才离开了 12 分钟', { action: { label: '算进专注', run() {} }, duration: 20000 })[0].duration, 20000);
  assert.equal(addToast([], 'x', { duration: 99999999 })[0].duration, 30000);
  assert.equal(addToast([], 'x', { duration: 'soon' })[0].duration, 3200, 'no usable duration: the usual one');
});

const MIN = 60000, NOW = new Date(2026, 9, 9, 15).getTime(), DAY = 24 * 60 * MIN;
const fresh = (settings = {}) => model.normalizeFocus({ settings });
const roundTrip = (state) => model.normalizeFocus(JSON.parse(JSON.stringify(state)));

test('+5 分钟 lengthens a running or paused phase and is capped at four hours', () => {
  let state = model.startPhase(fresh(), 'focus', NOW);
  state = model.extend(state, NOW + 10 * MIN);
  assert.equal(state.timer.endsAt, NOW + 30 * MIN);
  assert.equal(state.timer.duration, 30 * MIN);
  assert.equal(model.remainingMs(state.timer, NOW + 10 * MIN), 20 * MIN);
  state = model.pause(state, NOW + 20 * MIN);
  state = model.extend(state, NOW + 40 * MIN);
  assert.equal(model.remainingMs(state.timer, NOW + 99 * MIN), 15 * MIN, 'paused: the remaining time grows, the clock stays stopped');
  state = roundTrip(state);
  assert.equal(state.timer.duration, 35 * MIN, 'a stretched round survives a reload');
  let long = model.startPhase(fresh({ focusMin: 180 }), 'focus', NOW);
  for (let i = 0; i < 30; i++) long = model.extend(long, NOW);
  assert.equal(long.timer.duration, 240 * MIN);
  assert.equal(model.extend(model.normalizeFocus(), NOW).timer.phase, 'idle', 'nothing to extend while idle');
  const breakTime = model.extend(model.startPhase(fresh(), 'shortBreak', NOW), NOW + MIN);
  assert.equal(breakTime.timer.endsAt, NOW + 10 * MIN, 'a break can be extended too');
});

test('到点后继续计时: the end is announced once, the round counts up and ends complete with the extra minutes', () => {
  let state = model.startPhase(fresh({ overtime: true, focusMin: 25 }), 'focus', NOW);
  let result = model.tick(state, NOW + 25 * MIN);
  assert.equal(result.event.type, 'phase-due');
  assert.equal(result.event.completed, true);
  assert.equal(result.state.timer.phase, 'focus', 'still in the focus round');
  assert.equal(result.state.timer.due, true);
  assert.equal(result.state.rewards.fish, 0, 'no reward until the round actually ends');
  state = result.state;
  assert.equal(model.tick(state, NOW + 30 * MIN).event, null, 'announced only once');
  assert.equal(model.overtimeMs(state.timer, NOW + 32 * MIN), 7 * MIN);
  // Pausing in overtime keeps the counted overtime; the paused time is not added.
  state = model.pause(state, NOW + 32 * MIN);
  state = roundTrip(state);
  assert.equal(model.overtimeMs(state.timer, NOW + 50 * MIN), 7 * MIN);
  state = model.resume(state, NOW + 50 * MIN);
  assert.equal(model.overtimeMs(state.timer, NOW + 53 * MIN), 10 * MIN);
  const ended = model.endRound(state, NOW + 53 * MIN);
  assert.equal(ended.event.completed, true);
  assert.equal(ended.event.manual, true, 'ended by hand: no second chime');
  assert.equal(ended.state.timer.phase, 'idle');
  assert.equal(ended.state.rewards.fish, 1);
  assert.equal(ended.state.rewards.xp, 35);
  assert.equal(ended.state.sessions[0].end - ended.state.sessions[0].start, 35 * MIN);
  assert.equal(ended.state.sessions[0].completed, true);
  // Skipping out of overtime follows 自动开始休息.
  const skipped = model.skip(result.state, NOW + 26 * MIN);
  assert.equal(skipped.state.timer.phase, 'shortBreak');
  assert.equal(skipped.state.rewards.fish, 1);
  // +5 in overtime turns into a fresh countdown that ends normally.
  const extended = model.extend(result.state, NOW + 28 * MIN);
  assert.equal(extended.timer.due, undefined);
  assert.equal(model.remainingMs(extended.timer, NOW + 28 * MIN), 5 * MIN);
  const after = model.tick(extended, NOW + 33 * MIN);
  assert.equal(after.event.type, 'phase-due', 'with overtime on, the new end is announced again');
  // A forgotten overtime round stops at the 3-hour cap.
  const capped = model.tick(result.state, NOW + 25 * MIN + 5 * 60 * MIN);
  assert.equal(capped.event.type, 'phase-end');
  assert.equal(capped.state.sessions.at(-1).end - capped.state.sessions.at(-1).start, (25 + 180) * MIN);
});

test('without overtime, manual skips and early ends are marked manual and completed rounds are not', () => {
  const state = model.startPhase(fresh(), 'focus', NOW);
  assert.equal(model.tick(state, NOW + 25 * MIN).event.manual, undefined);
  assert.equal(model.skip(state, NOW + 5 * MIN).event.manual, true);
  assert.equal(model.endRound(state, NOW + 5 * MIN).event.manual, true);
});

test('locking the screen pauses at that moment; a long absence is only counted when the user says so', () => {
  let state = model.startPhase(fresh({ sleepPolicy: 'ask' }), 'focus', NOW);
  state = model.away(state, NOW + 10 * MIN);
  assert.equal(state.timer.paused, true);
  assert.equal(state.timer.awayAt, NOW + 10 * MIN);
  state = roundTrip(state);
  // Asleep well past the planned end: nothing is credited on wake.
  assert.equal(model.tick(state, NOW + 90 * MIN).event, null);
  const returned = model.back(state, NOW + 90 * MIN);
  assert.equal(returned.asked, true);
  assert.equal(returned.away, 80 * MIN);
  assert.equal(returned.state.timer.paused, true);
  // 「没有，接着计时」: a plain resume continues with the 15 minutes that were left.
  const resumed = model.resume(returned.state, NOW + 91 * MIN);
  assert.equal(resumed.timer.awayAt, undefined);
  assert.equal(model.remainingMs(resumed.timer, NOW + 91 * MIN), 15 * MIN);
  // 「在专注，算进去」: the clock ran on from the lock, so the round is complete.
  const credited = model.creditAway(returned.state);
  const settled = model.tick(credited, NOW + 90 * MIN);
  assert.equal(settled.event.completed, true);
  assert.equal(settled.state.sessions[0].end, NOW + 25 * MIN);
});

test('a short lock counts without asking; 照常计时 ignores locks; breaks keep running', () => {
  let state = model.away(model.startPhase(fresh(), 'focus', NOW), NOW + MIN);
  const quick = model.back(state, NOW + MIN + 20000);
  assert.equal(quick.asked, false);
  assert.equal(quick.state.timer.paused, false);
  assert.equal(model.remainingMs(quick.state.timer, NOW + MIN + 20000), 24 * MIN - 20000, 'the 20 s away counted');
  const counting = model.startPhase(fresh({ sleepPolicy: 'count' }), 'focus', NOW);
  assert.equal(model.away(counting, NOW + MIN), counting);
  const pausing = model.back(model.away(model.startPhase(fresh({ sleepPolicy: 'pause' }), 'focus', NOW), NOW + MIN), NOW + 30 * MIN);
  assert.equal(pausing.asked, false, '自动暂停 does not ask');
  assert.equal(pausing.state.timer.paused, true);
  const resting = model.startPhase(fresh(), 'shortBreak', NOW);
  assert.equal(model.away(resting, NOW + MIN), resting);
  const userPaused = model.pause(model.startPhase(fresh(), 'focus', NOW), NOW + MIN);
  assert.equal(model.away(userPaused, NOW + 2 * MIN), userPaused, 'a round the user paused is left alone');
  assert.equal(model.back(userPaused, NOW + 9 * MIN).asked, false);
});

test('the round counter starts over on a new day and after a long break', () => {
  let state = fresh({ focusMin: 1, shortMin: 1, longMin: 1, longEvery: 4 });
  for (let i = 0; i < 2; i++) { state = model.startPhase(state, 'focus', NOW + i * 5 * MIN); state = model.tick(state, state.timer.endsAt).state; }
  assert.equal(state.timer.round, 2);
  assert.equal(model.currentRound(model.reset(state).timer, NOW + DAY), 0, 'shown as a fresh set tomorrow');
  assert.equal(model.currentRound(model.reset(state).timer, NOW + 20 * MIN), 2);
  const tomorrow = model.startPhase(model.reset(state), 'focus', NOW + DAY);
  assert.equal(tomorrow.timer.round, 0);
  assert.equal(model.startPhase(model.reset(state), 'focus', NOW + 30 * MIN).timer.round, 2, 'same day: the set continues');
  // Four rounds, then the long break ends: round 1 again.
  for (let i = 2; i < 4; i++) { state = model.startPhase(state, 'focus', NOW + i * 5 * MIN); state = model.tick(state, state.timer.endsAt).state; }
  assert.equal(state.timer.phase, 'longBreak');
  const rested = model.tick(state, state.timer.endsAt).state;
  assert.equal(rested.timer.round, 0);
  assert.equal(model.skip(state, state.timer.startedAt + 1000).state.timer.round, 0, 'skipping the long break also starts a new set');
});

test('tasks saved before 2.2 load into 今天 and unfinished ones roll over to the next day', () => {
  const old = { tasks: [{ id: 'a', text: '旧任务', done: false, pomodoros: 2, createdAt: NOW - 3 * DAY }, { id: 'b', text: '做完了', done: true, doneAt: NOW - DAY, createdAt: NOW - 3 * DAY }] };
  let state = model.normalizeFocus(old);
  assert.deepEqual(state.tasks.map(({ list, estimate, subtasks, carried }) => ({ list, estimate, subtasks, carried })), [{ list: 'today', estimate: 0, subtasks: [], carried: 0 }, { list: 'today', estimate: 0, subtasks: [], carried: 0 }]);
  assert.equal(state.tasks[0].pomodoros, 2);
  state = model.rollOverTasks(state, NOW);
  assert.equal(state.tasks[0].plannedFor, '2026-10-09');
  assert.equal(state.tasks[0].carried, 0, 'a legacy task without a plan is not counted as carried');
  assert.equal(state.tasks[1].plannedFor, '', 'finished tasks stay where they are');
  state = model.rollOverTasks(state, NOW + DAY);
  assert.equal(state.tasks[0].plannedFor, '2026-10-10');
  assert.equal(state.tasks[0].carried, 1);
  assert.equal(model.rollOverTasks(state, NOW + DAY), state, 'nothing to do twice on the same day');
  state = model.addTask(state, '以后再说', NOW, { list: 'later', makeId: () => 'c' });
  assert.equal(state.tasks[2].list, 'later');
  assert.equal(model.rollOverTasks(state, NOW + 3 * DAY).tasks[2].plannedFor, '', '之后 tasks are never rolled over');
  state = model.moveTaskToList(state, 'c', 'today', NOW + 2 * DAY);
  assert.equal(state.tasks[2].plannedFor, '2026-10-11');
});

test('estimates, subtasks and finishing the current task picks the next open one', () => {
  let n = 0; const makeId = () => `t${++n}`;
  let state = fresh();
  for (const text of ['一', '二', '三']) state = model.addTask(state, text, NOW, { makeId });
  state = model.addTask(state, '之后的', NOW, { makeId, list: 'later' });
  state = model.updateTask(state, 't1', { estimate: 3 }, NOW);
  assert.equal(state.tasks[0].estimate, 3);
  assert.equal(model.updateTask(state, 't1', { estimate: 99 }, NOW).tasks[0].estimate, 20);
  state = model.addSubtask(state, 't2', '  查资料 ', { makeId });
  state = model.addSubtask(state, 't2', '写草稿', { makeId });
  assert.deepEqual(state.tasks[1].subtasks.map((item) => item.text), ['查资料', '写草稿']);
  const sub = state.tasks[1].subtasks[0].id;
  state = model.toggleSubtask(state, 't2', sub);
  assert.equal(state.tasks[1].subtasks[0].done, true);
  assert.equal(roundTrip(state).tasks[1].subtasks[0].done, true);
  assert.equal(model.removeSubtask(state, 't2', sub).tasks[1].subtasks.length, 1);
  state = model.selectTask(state, 't2');
  state = model.updateTask(state, 't2', { done: true }, NOW);
  assert.equal(state.timer.taskId, 't3', 'the next open task in 今天');
  state = model.updateTask(state, 't3', { done: true }, NOW);
  assert.equal(state.timer.taskId, 't1', 'wraps around, skipping 之后 and finished tasks');
  state = model.updateTask(state, 't1', { done: true }, NOW);
  assert.equal(state.timer.taskId, '', '自由专注 when everything is done');
  const other = model.updateTask(model.selectTask(state, 't4'), 't2', { done: false }, NOW);
  assert.equal(other.timer.taskId, 't4', 'changing another task leaves the selection alone');
});

test('distractions are logged only during focus and can be undone', () => {
  let state = model.startPhase(fresh(), 'focus', NOW);
  state = model.logDistraction(state, NOW + MIN);
  state = model.logDistraction(state, NOW + 2 * MIN);
  assert.equal(state.distractions.length, 2);
  assert.equal(roundTrip(state).distractions.length, 2);
  assert.equal(model.removeDistraction(state, NOW + MIN).distractions.length, 1);
  const idle = fresh();
  assert.equal(model.logDistraction(idle, NOW), idle);
});

test('免打扰 and the new settings survive normalisation and reach the companion snapshot', () => {
  const settings = model.normalizeSettings({ quietMode: true, overtime: true, sleepPolicy: 'pause', chimeSound: 'wood', chimeVolume: 140 });
  assert.equal(settings.quietMode, true);
  assert.equal(settings.overtime, true);
  assert.equal(settings.sleepPolicy, 'pause');
  assert.equal(settings.chimeSound, 'wood');
  assert.equal(settings.chimeVolume, 100);
  const defaults = model.normalizeSettings({ sleepPolicy: 'nap', chimeSound: 'gong' });
  assert.equal(defaults.quietMode, false);
  assert.equal(defaults.sleepPolicy, 'ask');
  assert.equal(defaults.chimeSound, 'bell');
  const snapshot = model.focusSnapshot(model.normalizeFocus({ settings: { quietMode: true } }), NOW);
  assert.equal(snapshot.quietMode, true);
  assert.equal(snapshot.due, false);
});

test('开始休息 / 再来一轮 / 结束 move between phases from any state', () => {
  let state = model.startPhase(fresh({ autoBreak: false }), 'focus', NOW);
  state = model.tick(state, NOW + 25 * MIN).state;
  assert.equal(state.timer.phase, 'idle');
  const resting = model.startBreak(state, NOW + 26 * MIN).state;
  assert.equal(resting.timer.phase, 'shortBreak');
  const again = model.nextRound(resting, NOW + 27 * MIN);
  assert.equal(again.state.timer.phase, 'focus');
  assert.equal(again.event.manual, true, 'skipping the break is quiet');
  assert.equal(model.nextRound(state, NOW + 26 * MIN).state.timer.phase, 'focus', 'from idle too');
  const early = model.startBreak(model.startPhase(fresh({ autoBreak: false }), 'focus', NOW), NOW + 10 * MIN);
  assert.equal(early.state.timer.phase, 'shortBreak'); assert.equal(early.event.completed, false);
  assert.equal(model.stop(resting, NOW + 27 * MIN).state.timer.phase, 'idle');
  assert.equal(model.stop(again.state, NOW + 40 * MIN).state.sessions.at(-1).completed, false);
  let four = fresh({ autoBreak: false, focusMin: 1, longEvery: 2 });
  for (let i = 0; i < 2; i++) { four = model.startPhase(four, 'focus', NOW + i * 2 * MIN); four = model.tick(four, four.timer.endsAt).state; }
  assert.equal(model.startBreak(four, NOW + 10 * MIN).state.timer.phase, 'longBreak');
});

test('the end-of-round notification offers the next step as buttons', () => {
  const resting = model.startPhase(fresh(), 'shortBreak', NOW), idle = fresh();
  assert.deepEqual(noticeFor({ phase: 'focus', completed: true }, idle).actions.map((a) => a.command), ['focus-break', 'focus-next']);
  assert.deepEqual(noticeFor({ phase: 'focus', completed: true }, resting).actions.map((a) => a.command), ['focus-next', 'focus-extend']);
  assert.match(noticeFor({ phase: 'focus', completed: true, unlocked: ['雪夜窗景'] }, idle).body, /解锁：雪夜窗景/);
  assert.deepEqual(noticeFor({ type: 'phase-due', phase: 'focus' }, idle).actions.map((a) => a.command), ['focus-end', 'focus-extend']);
  assert.deepEqual(noticeFor({ phase: 'shortBreak', completed: true }, idle).actions.map((a) => a.command), ['focus-next']);
  assert.equal(noticeFor({ phase: 'longBreak', completed: true }, idle).title, '长休息结束');
  // Desktop: one shell command; browser: the Notification API only when allowed.
  const sent = [];
  showNotice(noticeFor({ phase: 'focus', completed: true }, idle), { silent: true, win: { document: { documentElement: { dataset: { desktopClient: 'true' } } } }, command: (name, params) => sent.push([name, params]) });
  assert.equal(sent[0][0], 'notify'); assert.equal(sent[0][1].silent, true); assert.equal(sent[0][1].actions, 'focus-break:开始休息|focus-next:跳过休息');
  const shown = [];
  class Notice { static permission = 'granted'; constructor(title, options) { shown.push([title, options.silent]); } }
  assert.equal(showNotice({ title: '专注完成', body: '' }, { silent: false, win: { document: { documentElement: { dataset: {} } }, Notification: Notice } }), true);
  assert.deepEqual(shown, [['专注完成', false]], 'not silent: the system sound plays when the cabin did not chime');
  Notice.permission = 'denied';
  assert.equal(showNotice({ title: 'x' }, { win: { document: { documentElement: { dataset: {} } }, Notification: Notice } }), false);
});

test('distractions show up in the statistics', () => {
  const at = (days, hour) => new Date(2026, 9, 9 - days, hour).getTime();
  const list = [{ at: at(0, 10), taskId: 'a' }, { at: at(0, 10), taskId: 'a' }, { at: at(1, 15), taskId: 'b' }, { at: at(9, 10), taskId: 'a' }];
  const summary = distractionSummary(list, NOW, { tasks: [{ id: 'a', text: '写周报' }], focusMinutes: 120 });
  assert.equal(summary.today, 2);
  assert.equal(summary.week, 3, 'only the last 7 days');
  assert.equal(summary.perHour, 1.5);
  assert.equal(summary.busiest.label, '上午');
  assert.deepEqual(summary.task, { name: '写周报', count: 2 });
  assert.deepEqual(distractionSummary([], NOW), { today: 0, week: 0, perHour: null, busiest: null, task: null });
});
