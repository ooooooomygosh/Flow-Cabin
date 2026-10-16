import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverCache } from './cover-cache.mjs';
import { downloadBlob } from './download.mjs';
import { formatDuration, formatSeconds } from './time-format.mjs';

test('track lengths round to the nearest second; live clocks floor', () => {
  assert.equal(formatDuration(119600), '2:00'); assert.equal(formatDuration(59600), '1:00'); assert.equal(formatDuration(269000), '4:29'); assert.equal(formatDuration(3723000), '1:02:03');
  assert.equal(formatSeconds(59.9), '0:59'); assert.equal(formatSeconds(-3), '0:00'); assert.equal(formatSeconds(3600), '1:00:00');
});

function timers() {
  const queue = [];
  return { queue, setTimer: (fn, ms) => { const t = { fn, ms }; queue.push(t); return t; }, clearTimer: (t) => { const i = queue.indexOf(t); if (i >= 0) queue.splice(i, 1); }, run: (ms) => { for (const t of queue.filter((entry) => entry.ms === ms)) { queue.splice(queue.indexOf(t), 1); t.fn(); } } };
}
const bitmap = (name) => ({ name, closed: false, close() { this.closed = true; } });

test('cover cache reuses entries, closes evicted bitmaps late and releases when idle', async () => {
  const t = timers(), made = {}, loads = [];
  const cache = createCoverCache({ load: async (key) => { loads.push(key); return (made[key] = bitmap(key)); }, capacity: 2, idleMs: 100, closeDelayMs: 10, setTimer: t.setTimer, clearTimer: t.clearTimer });
  assert.equal(await cache.get(''), null);
  const a = await cache.get('a'); await cache.get('b'); assert.equal(await cache.get('a'), a, 'hit returns the same bitmap');
  await cache.get('c'); // evicts b (least recently used), not a
  assert.deepEqual(loads, ['a', 'b', 'c']); assert.equal(cache.size, 2);
  assert.equal(made.b.closed, false, 'an evicted bitmap is not closed while a paint may still use it');
  t.run(10); await Promise.resolve(); await Promise.resolve();
  assert.equal(made.b.closed, true); assert.equal(made.a.closed, false);
  assert.equal(t.queue.filter((entry) => entry.ms === 100).length, 1, 'one idle timer');
  t.run(100); t.run(10); await Promise.resolve(); await Promise.resolve();
  assert.equal(cache.size, 0); assert.equal(made.a.closed, true); assert.equal(made.c.closed, true);
});

test('cover cache maps failed loads to null', async () => {
  const t = timers(), cache = createCoverCache({ load: async () => { throw new Error('offline'); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
  assert.equal(await cache.get('x'), null);
});

test('downloadBlob clicks an attached anchor and revokes the URL later', () => {
  const events = [], body = { append: (node) => { node.parent = body; events.push('append'); } };
  const anchor = { style: {}, click() { events.push(`click:${this.download}:${this.parent === body}`); }, remove() { events.push('remove'); } };
  const urls = { createObjectURL: () => 'blob:x', revokeObjectURL: (url) => events.push('revoke:' + url) };
  downloadBlob({}, '小屋词书模板.tsv', { document: { createElement: () => anchor, body }, url: urls, keepMs: 0 });
  assert.deepEqual(events, ['append', 'click:小屋词书模板.tsv:true', 'remove']); assert.equal(anchor.href, 'blob:x');
});
