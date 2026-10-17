import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleSuspend } from './idle-suspend.mjs';

const fakeContext = () => ({ state: 'running', suspends: 0, resumes: 0, suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }, resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); } });
const clock = () => { const timers = new Map(); let id = 0; return { timers, schedule: (fn) => { timers.set(++id, fn); return id; }, cancel: (key) => timers.delete(key), run() { const due = [...timers.values()]; timers.clear(); due.forEach((fn) => fn()); } }; };

test('idle suspends after the grace period; wake resumes and cancels a pending suspend', () => {
  const context = fakeContext(), timers = clock(), idle = createIdleSuspend(context, timers);
  idle.idle(); assert.equal(timers.timers.size, 1); timers.run(); assert.equal(context.state, 'suspended');
  idle.wake(); assert.equal(context.state, 'running'); assert.equal(context.resumes, 1);
  idle.idle(); idle.wake(); assert.equal(timers.timers.size, 0); timers.run(); assert.equal(context.suspends, 1);
});

test('a busy context is never suspended; idle twice keeps one timer', () => {
  let busy = true; const context = fakeContext(), timers = clock(), idle = createIdleSuspend(context, { ...timers, busy: () => busy });
  idle.idle(); idle.idle(); assert.equal(timers.timers.size, 1); timers.run(); assert.equal(context.suspends, 0);
  busy = false; idle.idle(); timers.run(); assert.equal(context.suspends, 1);
  idle.idle(); idle.cancel(); assert.equal(timers.timers.size, 0);
});
