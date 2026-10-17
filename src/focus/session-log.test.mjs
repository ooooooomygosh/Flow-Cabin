import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './focus-model.mjs';
import { SESSION_LOG_KEY, SESSION_EVENT, readSessions, recordEnd, endedSession } from './session-log.mjs';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const target = () => { const events = []; return { events, dispatchEvent: (e) => events.push(e) }; };
globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };

test('a finished round is logged with its todo and the record on the deck, and announced', () => {
  const base = model.normalizeFocus({ tasks: [{ id: 't1', text: '写周报' }] }), t0 = 1_700_000_000_000;
  const running = model.startPhase({ ...base, timer: { ...base.timer, taskId: 't1' } }, 'focus', t0, 't1');
  const done = model.tick(running, t0 + running.timer.duration + 10);
  const storage = memory(), win = target();
  const rec = recordEnd(running, done.state || done, t0 + running.timer.duration + 10, { storage, target: win, album: { id: 'a1', title: '夜航', artist: '某乐队', cover: 'https://x/c.jpg', thumb: 'data:image/png;base64,AAAA' }, track: { title: '第一首', artist: '某乐队', album: '夜航' } });
  assert.equal(rec.completed, true); assert.equal(rec.taskId, 't1'); assert.equal(rec.taskText, '写周报');
  assert.deepEqual(rec.album, { id: 'a1', title: '夜航', artist: '某乐队' }); assert.equal(rec.track.title, '第一首'); assert.equal(rec.cover, 'data:image/png;base64,AAAA', 'the 32×32 data URL, not the remote URL');
  assert.equal(rec.durationMs, running.timer.duration); assert.equal(rec.end - rec.start, rec.durationMs);
  assert.deepEqual(Object.keys(rec).sort(), ['album', 'completed', 'cover', 'durationMs', 'end', 'id', 'start', 'taskId', 'taskText', 'track'], 'the 小屋日记 (#52) record, plus cover');
  assert.equal(readSessions(storage).length, 1); assert.ok(storage.getItem(SESSION_LOG_KEY));
  assert.equal(win.events[0].type, SESSION_EVENT); assert.deepEqual(win.events[0].detail, rec);
});
test('stopping a focus round after a minute is logged as abandoned; under a minute or a pause is not', () => {
  const t0 = 1_700_000_000_000, running = model.startPhase(model.normalizeFocus({}), 'focus', t0);
  const stopped = model.reset(running);
  assert.equal(endedSession(running, stopped, t0 + 30_000), null);
  const ended = endedSession(running, stopped, t0 + 5 * 60_000);
  assert.equal(ended.completed, false); assert.equal(ended.end - ended.start, 5 * 60_000);
  assert.equal(endedSession(running, model.pause(running, t0 + 60_000), t0 + 60_000), null);
});

test('only exportable covers are stored', async () => {
  const { storableCover } = await import('./session-log.mjs');
  assert.equal(storableCover('https://x/c.jpg'), ''); assert.equal(storableCover('/covers/a.png'), '', 'a same-origin path is downscaled first, never stored as is');
  assert.equal(storableCover('data:image/png;base64,' + 'A'.repeat(500 * 1024)), ''); assert.equal(storableCover('//evil/x.png'), '');
});

test('the record keeps only the 32×32 thumbnail: empty until it is ready, never the original cover', async () => {
  const { sessionRecord } = await import('./session-log.mjs');
  const base = { start: 0, end: 60_000, completed: true };
  assert.equal(sessionRecord({ ...base, album: { title: 'A', cover: '/covers/a.png' } }).cover, '');
  assert.equal(sessionRecord({ ...base, album: { title: 'A', cover: 'https://x/a.jpg' } }).cover, '');
  assert.equal(sessionRecord({ ...base, album: { title: 'A', cover: 'data:image/png;base64,BIG', thumb: '' } }).cover, '', 'the original data URL is not stored either');
  assert.equal(sessionRecord({ ...base, album: { title: 'A', cover: '/covers/a.png', thumb: 'data:image/png;base64,T' } }).cover, 'data:image/png;base64,T');
});
