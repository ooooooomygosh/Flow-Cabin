import test from 'node:test';
import assert from 'node:assert/strict';
import { ledFace, deskFace, roundLamps, LED_BLOCKS } from './clock-model.mjs';

const MIN = 60000, NOW = new Date(2026, 10, 5, 9, 30, 15).getTime();
const running = { phase: 'focus', paused: false, endsAt: NOW + 10 * MIN, remaining: 0, duration: 25 * MIN, hideSeconds: false, due: false, over: 0, longEvery: 4, round: 1, focusMin: 25 };

test('an idle clock shows the planned round, READY, and an empty bar', () => {
  const face = ledFace({ now: NOW, focus: { phase: 'idle', focusMin: 25, hideSeconds: false }, show: 'timer' });
  assert.equal(face.text, '25:00');
  assert.equal(face.caption, 'READY');
  assert.equal(face.progress, 0);
  assert.equal(face.blink, false, 'nothing runs, the colon holds still');
});

test('a running round counts down, blinks, and lights the bar by how much is spent', () => {
  const face = ledFace({ now: NOW, focus: running, show: 'timer' });
  assert.equal(face.text, '10:00');
  assert.equal(face.caption, 'FOCUS');
  assert.equal(face.blink, true);
  assert.ok(Math.abs(face.progress - 0.6) < 1e-9);
  assert.equal(Math.round(face.progress * LED_BLOCKS), 12);
});

test('paused says PAUSE and stops blinking; a break says BREAK', () => {
  const paused = ledFace({ now: NOW, focus: { ...running, paused: true, remaining: 7 * MIN }, show: 'timer' });
  assert.equal(paused.caption, 'PAUSE');
  assert.equal(paused.text, '07:00');
  assert.equal(paused.blink, false);
  assert.match(paused.label, /已暂停/);
  const rest = ledFace({ now: NOW, focus: { ...running, phase: 'shortBreak', duration: 5 * MIN, endsAt: NOW + 2 * MIN }, show: 'timer' });
  assert.equal(rest.caption, 'BREAK');
});

test('overtime counts up with a plus sign and says OVER', () => {
  const face = ledFace({ now: NOW, focus: { ...running, due: true, endsAt: NOW - 90000 }, show: 'timer' });
  assert.equal(face.text, '01:30');
  assert.equal(face.plus, true);
  assert.equal(face.caption, 'OVER');
  assert.equal(face.progress, 1);
});

test('hidden seconds show whole minutes only', () => {
  const face = ledFace({ now: NOW, focus: { ...running, hideSeconds: true }, show: 'timer' });
  assert.equal(face.text, '10');
  assert.equal(face.unit, 'MIN');
});

test('the wall clock shows hours and minutes, CLOCK, and optional seconds', () => {
  const face = ledFace({ now: NOW, focus: running, show: 'clock', seconds: true });
  assert.equal(face.text, '09:30');
  assert.equal(face.caption, 'CLOCK');
  assert.equal(face.small, '15');
  assert.equal(face.progress, 0);
  assert.equal(ledFace({ now: NOW, focus: running, show: 'clock' }).small, '');
});

test('on the desk clock a round reads minutes, seconds and today\'s rounds; the wall clock HH MM SS', () => {
  const round = deskFace(ledFace({ now: NOW, focus: running, show: 'timer' }), { now: NOW, rounds: 3 });
  assert.deepEqual(round, { digits: '100003', colon: false, word: 'FOCUS', bar: round.bar });
  assert.ok(Math.abs(round.bar - 0.6) < 1e-9);
  assert.equal(deskFace(ledFace({ now: NOW, focus: running, show: 'timer' }), { now: NOW + 1000, rounds: 3 }).colon, true, 'the colon blinks while it runs');
  const idle = deskFace(ledFace({ now: NOW, focus: { phase: 'idle', focusMin: 25 }, show: 'timer' }), { now: NOW });
  assert.equal(idle.digits, '250000'); assert.equal(idle.word, 'READY'); assert.equal(idle.bar, null); assert.equal(idle.colon, true);
  const minutes = deskFace(ledFace({ now: NOW, focus: { ...running, hideSeconds: true }, show: 'timer' }), { now: NOW, rounds: 1 });
  assert.equal(minutes.digits, '10--01', 'hidden seconds leave their cells dark');
  const wall = deskFace(ledFace({ now: NOW, focus: running, show: 'clock', seconds: true }), { now: NOW });
  assert.equal(wall.digits, '093015'); assert.equal(wall.word, 'CLOCK'); assert.equal(wall.bar, null);
  assert.equal(deskFace(ledFace({ now: NOW, focus: running, show: 'clock' }), { now: NOW }).digits, '0930--');
  assert.equal(deskFace({ text: '120:00', caption: 'FOCUS', mode: 'timer', phase: 'focus', progress: 0.1, blink: false }).digits.slice(0, 4), '9959', 'a long round shows 99:59 until it fits');
});

test('round lamps: done, the one running, the ones to come', () => {
  assert.deepEqual(roundLamps({ round: 2, longEvery: 4, phase: 'focus' }), ['done', 'done', 'active', 'rest']);
  assert.deepEqual(roundLamps({ round: 1, longEvery: 3, phase: 'shortBreak' }), ['done', 'rest', 'rest']);
});
