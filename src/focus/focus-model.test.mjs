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
