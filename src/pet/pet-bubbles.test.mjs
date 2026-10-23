// 2.2 companion: the bubble speaks at moments only; gentle requests respect 免打扰; mood shows in the pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleText, BUBBLE_MS, petRequest, REQUEST_GAP, moodPose } from './pet-model.mjs';

const MIN = 60000, T = 10 * 3600000;
const round = (elapsed, extra = {}) => bubbleText({ phase: 'focus', duration: 25 * MIN, remaining: 25 * MIN - elapsed, since: T, previous: 'idle', now: T + elapsed, ...extra });

test('a focus round speaks at the start, halfway, in the last minute — and is quiet in between', () => {
  assert.equal(round(1000), '开始专注啦，我陪着你');
  assert.equal(round(BUBBLE_MS + 1), '', 'the start line goes away after a few seconds');
  assert.equal(round(5 * MIN), '');
  assert.equal(round(12.5 * MIN + 1000), '过半啦 · 还剩 13 分钟');
  assert.equal(round(12.5 * MIN + BUBBLE_MS + 1), '');
  assert.equal(round(24 * MIN + 1000), '最后 1 分钟！');
  assert.equal(round(24 * MIN + BUBBLE_MS + 1000), '');
  assert.equal(round(1000, { previous: 'focus' }), '继续加油', 'resuming a paused round');
  assert.equal(bubbleText({ phase: 'focus', duration: 3 * MIN, remaining: 1.5 * MIN, since: T, now: T + 1.5 * MIN }), '', 'a very short round has no halfway line');
});

test('the end, a pause, a break and overtime each get one short line', () => {
  assert.equal(bubbleText({ phase: 'shortBreak', remaining: 5 * MIN, since: T, previous: 'focus', now: T + 500 }), '专注完成！休息 5 分钟吧');
  assert.equal(bubbleText({ phase: 'shortBreak', remaining: 4 * MIN, since: T, previous: 'focus', now: T + MIN }), '', 'not for the whole break');
  assert.equal(bubbleText({ phase: 'idle', since: T, previous: 'focus', now: T + 500 }), '这一轮结束啦');
  assert.equal(bubbleText({ phase: 'idle', since: T, previous: 'longBreak', now: T + 500 }), '休息好了吗？');
  assert.equal(bubbleText({ phase: 'focus', paused: true, since: T, now: T + 500 }), '专注暂停中，等你回来');
  assert.equal(bubbleText({ phase: 'focus', paused: true, since: T, now: T + MIN }), '');
  assert.equal(bubbleText({ phase: 'focus', due: true, remaining: 0, duration: 25 * MIN, since: T, previous: 'focus', now: T + 500 }), '时间到啦，我还陪着你');
});

test('bubbles off silences everything; 免打扰 keeps only the answer to a poke', () => {
  assert.equal(round(1000, { bubbles: false }), '');
  assert.equal(bubbleText({ poke: '喵～', pokedAt: T, now: T + 500, bubbles: false }), '');
  assert.equal(round(1000, { quiet: true }), '');
  assert.equal(bubbleText({ track: '晴天', trackChangedAt: T, now: T + 100, quiet: true }), '');
  assert.equal(bubbleText({ poke: '喵～', pokedAt: T, now: T + 500, quiet: true }), '喵～');
});

test('requests are occasional, need a reason and never come in 免打扰, during a round or at night', () => {
  const ask = (extra) => petRequest({ now: T, lastAt: T - REQUEST_GAP, tier: 'ok', feedsToday: 0, fish: 3, random: () => 0, hour: 15, ...extra });
  assert.equal(ask().kind, 'food');
  assert.equal(ask({ feedsToday: 2, tier: 'droopy' }).kind, 'attention');
  assert.equal(ask({ feedsToday: 2, tier: 'happy' }), null, 'a happy, fed pet asks for nothing');
  assert.equal(ask({ fish: 0, tier: 'happy' }), null, 'no fish, no begging');
  assert.equal(ask({ quiet: true }), null);
  assert.equal(ask({ phase: 'focus' }), null);
  assert.equal(ask({ hour: 2 }), null);
  assert.equal(ask({ lastAt: T - 10 * MIN }), null, 'at most once in a while');
  assert.equal(ask({ random: () => .9 }), null, 'and not every time it could');
});

test('a droopy pet dozes between moments; other moods and poses are left alone', () => {
  assert.equal(moodPose('idle', 'droopy', 25000), 'sleep');
  assert.equal(moodPose('idle', 'droopy', 5000), 'idle');
  assert.equal(moodPose('focus', 'droopy', 25000), 'focus');
  assert.equal(moodPose('idle', 'happy', 25000), 'idle');
});
